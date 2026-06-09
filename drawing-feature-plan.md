# 드로잉(자유 필기) 주석 기능 구현 계획

기존 sticky note / highlight 위에 PDF에 직접 자유 필기할 수 있는 레이어를 추가하는 작업의 설계 및 구현 순서.

---

## 1. 설계 개요

### 1.1 결정 사항

| 항목 | 선택 | 이유 |
|------|------|------|
| 저장 단위 | **Stroke per row** | undo/eraser가 DELETE 한 줄, 기존 annotation 패턴과 일치 |
| 좌표계 | **페이지 % 정규화** | 줌/리사이즈 자동 대응. 절대좌표면 매번 변환 필요 |
| 렌더링 | **Canvas(라이브) + SVG(커밋)** | 그리기 부드러움 + 줌 시 벡터 유지 |
| 지우개 | **Stroke 단위 hit-test 후 삭제** | 데이터가 깔끔, point splice 불필요 |
| 좌표 압축 | **Ramer-Douglas-Peucker on commit** | 점 수 50%+ 감소, 네트워크/DB 부하↓ |
| 페이지 경계 | **stroke는 단일 페이지에 고정** | 다른 페이지 진입 시 자동 stroke 종료 |

### 1.2 미러링할 기존 패턴

- **Backend**: `apps/api/app/models/sticky_note.py` → 모델, `apps/api/app/api/v1/endpoints/sticky_notes.py` → CRUD 엔드포인트, `share.py` → 공개 share 엔드포인트
- **Frontend**: `apps/web/components/reader/StickyNoteLayer.tsx` → portal + MutationObserver, `useHighlightStore` → Zustand 스토어 패턴, React Query key 패턴

### 1.3 레이어 구조

```
PDF page (pdf.js)
├─ HighlightLayer        (react-pdf-highlighter 내장)
├─ DrawingLayer          ← 신규
│   ├─ <svg>             (커밋된 stroke들 - 줌 시 벡터)
│   └─ <canvas>          (활성 stroke - 실시간)
└─ StickyNoteLayer       (기존, 가장 위)
```

z-index: highlight < drawing < sticky note
pointer-events: 활성 도구(`draw` | `eraser`)일 때만 DrawingLayer가 `auto`, 나머지는 `none`

---

## 2. 데이터 모델

### 2.1 DB 스키마 (PostgreSQL)

```python
# apps/api/app/models/drawing_stroke.py
class DrawingStroke(Base):
    __tablename__ = "drawing_strokes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    page: Mapped[int]
    points: Mapped[list] = mapped_column(JSONB)   # [[x_pct, y_pct, pressure], ...]
    color: Mapped[str]                             # "black" | "red" | "blue" | "yellow" | ...
    width: Mapped[float]                           # 기본 굵기 (실제 굵기 = width * pressure)
    created_at: Mapped[datetime]

    __table_args__ = (
        Index("ix_drawing_strokes_document_user", "document_id", "user_id"),
        Index("ix_drawing_strokes_document_page", "document_id", "page"),
    )
```

### 2.2 좌표/색상 정의

- `points`: `[[x, y, p], ...]` — x/y는 0~100 (페이지 정규화 %), p는 0~1 (압력, 미지원 시 0.5 기본)
- `color` enum: `black | red | blue | green | yellow` (sticky note 팔레트와 분리. 형광펜 톤은 width로 표현)
- `width`: 1.0 ~ 6.0 (px 기준, 실제 렌더 시 `width * pressure * zoom_scale`)

### 2.3 Migration

```bash
alembic revision --autogenerate -m "add drawing_strokes table"
```

---

## 3. API 엔드포인트

### 3.1 인증된 사용자

```
GET    /api/v1/documents/{doc_id}/drawings?page=N        # 페이지별 조회
POST   /api/v1/documents/{doc_id}/drawings               # stroke 생성
DELETE /api/v1/drawings/{stroke_id}                      # 개별 stroke 삭제
DELETE /api/v1/documents/{doc_id}/drawings?page=N        # 페이지 전체 삭제 (선택)
```

PATCH는 의도적으로 제외 — stroke는 immutable, 색상 바꾸려면 지우고 다시 그리는 모델.

### 3.2 공개 share

```
GET /api/v1/share/{token}/drawings?page=N
```

기존 `SharedStickyNoteResponse` 패턴: user_id / document_id 제외, rate limit 60/min.

### 3.3 요청/응답 스키마

```python
# apps/api/app/schemas/drawing.py
class DrawingStrokeCreate(BaseModel):
    page: int
    points: list[list[float]]   # [[x, y, p], ...]
    color: Literal["black", "red", "blue", "green", "yellow"]
    width: float = Field(ge=1.0, le=6.0)

class DrawingStrokeResponse(BaseModel):
    id: UUID
    page: int
    points: list[list[float]]
    color: str
    width: float
    created_at: datetime

class SharedDrawingStrokeResponse(BaseModel):
    id: UUID
    page: int
    points: list[list[float]]
    color: str
    width: float
```

### 3.4 검증

- `points` 길이 1000개 초과 시 reject (악성 페이로드 방지)
- `0 <= x, y <= 100`, `0 <= p <= 1`
- 문서 소유권 확인 (sticky_note 패턴 그대로)

---

## 4. 프론트엔드

### 4.1 컴포넌트 구조

```
apps/web/components/reader/
├─ DrawingLayer.tsx          # createPortal로 page div에 마운트
├─ DrawingCanvas.tsx          # 활성 stroke 캔버스 (포인터 이벤트)
├─ DrawingSvg.tsx             # 커밋된 stroke들 SVG
└─ DrawingToolbar.tsx         # 색/굵기/지우개 UI
```

### 4.2 상태 관리

```typescript
// apps/web/store/readerStore.ts 확장
type Tool = "select" | "sticky-note" | "draw" | "eraser";

// apps/web/store/drawingStore.ts 신규
interface DrawingStore {
  strokes: Record<number, DrawingStroke[]>;  // page → strokes
  color: string;
  width: number;
  addStroke: (stroke: DrawingStroke) => void;
  removeStroke: (id: string) => void;
  setStrokes: (page: number, strokes: DrawingStroke[]) => void;
}
```

React Query key: `["drawings", documentId, page]`

### 4.3 그리기 플로우

1. **pointerdown**: 활성 도구가 `draw`일 때만 시작. canvas context 초기화, 첫 점 push.
2. **pointermove**: requestAnimationFrame으로 throttle. 점 push + canvas에 line segment 그림.
3. **pointerup**:
   - Ramer-Douglas-Peucker로 점 simplify (ε ≈ 0.3% of page)
   - `viewport → 정규화 %` 변환
   - Optimistic: drawingStore에 추가 + canvas clear, SVG로 즉시 렌더
   - `POST /drawings` 호출, 실패 시 rollback
4. **pointerleave / 페이지 이탈**: 강제 종료 (현재 stroke 커밋)

### 4.4 지우개 플로우

1. 활성 도구 `eraser`로 변경 시 DrawingLayer pointer-events on.
2. pointermove로 포인터 트레일 따라가며 SVG path 각각 `getPointAtLength` 또는 거리 계산으로 hit-test.
3. 히트된 stroke id 모음.
4. pointerup 시 `DELETE` 일괄 호출 + 로컬 상태에서 제거.

### 4.5 줌 대응

- SVG: viewBox를 `0 0 100 100` (또는 페이지 비율) 으로 두면 page div 크기 따라 자동 스케일.
- Canvas: 줌 변경 시 클리어 후 SVG가 즉시 받아 그림 (활성 stroke는 그릴 때만 존재하므로 줌 중 stroke 없음).

### 4.6 모바일 / 터치

- `touch-action: none` (single pointer) vs `pinch-zoom` (multi-touch) 분기.
- Pointer Events API의 `pointerType`으로 pen/touch/mouse 구분.
- 두 손가락 감지되면 즉시 stroke 취소하고 줌으로 양보.

### 4.7 공유 페이지

- `readOnly=true` prop으로 DrawingLayer 마운트 시 toolbar 숨김 + canvas pointer-events 끔.
- 데이터 fetch는 `publicApi.get('/share/${token}/drawings?page=${page}')`.

---

## 5. 구현 순서 (PR 단위)

### Phase 1 — Backend foundation
1. `drawing_strokes` 테이블 마이그레이션
2. 모델 + Pydantic 스키마
3. CRUD 엔드포인트 (소유자 검증 포함)
4. 단위 테스트 (sticky_note 테스트 패턴 복제)

### Phase 2 — Frontend MVP (그리기만)
5. `useDrawingStore` Zustand
6. `DrawingLayer` + `DrawingCanvas` (활성 stroke 라이브 렌더)
7. `DrawingSvg` (커밋된 stroke SVG 렌더)
8. ReaderStore에 `draw` tool 추가, toolbar 버튼
9. Optimistic create + React Query 연동

### Phase 3 — 지우개 & 도구 UI
10. Stroke hit-test 지우개
11. 색상/굵기 picker
12. Pointer 이벤트 멀티터치/모바일 처리

### Phase 4 — 공유
13. `/share/{token}/drawings` 엔드포인트
14. `DrawingLayer` readOnly prop 지원

### Phase 5 — 최적화 (선택)
15. Ramer-Douglas-Peucker 압축
16. 페이지 전체 지우기 기능
17. Undo 스택 (클라이언트 메모리)

---

## 6. 비기능 요구사항

| 항목 | 목표 |
|------|------|
| 그리기 latency | 16ms 이하 (60fps) |
| Stroke 저장 응답 | 200ms 이하 |
| Hit-test (지우개) | 페이지당 100 stroke에서 100ms 이내 |
| Stroke 최대 점 수 | 1000 (서버 검증) |
| 단일 문서 최대 stroke | 별도 제한 없음 (인덱스 의존) |

---

## 7. 미해결 / 추후 결정

1. **형광펜 모드 (반투명 + 굵은 width)** — 색 enum에 추가하거나 별도 도구로 분리?
2. **압력 미지원 디바이스 보정** — 속도 기반 가짜 압력 (느릴수록 굵게) 적용 여부
3. **Undo 범위** — 세션 기반(브라우저 메모리) vs 서버 기반(트랜잭션 로그)
4. **공유 페이지에서 stroke 색을 강제로 흑백 변환?** — 인쇄 친화 옵션
5. **Stroke 그룹화 (= "drawing 객체")** — 여러 stroke을 한 번에 이동/삭제하는 UX 필요해지면 도입

---

## 8. 참고 파일

- `apps/api/app/models/sticky_note.py` — 모델 템플릿
- `apps/api/app/models/highlight.py` — JSONB position 패턴
- `apps/api/app/api/v1/endpoints/sticky_notes.py` — CRUD 엔드포인트 템플릿
- `apps/api/app/api/v1/endpoints/share.py` — 공개 endpoint 토큰 인증
- `apps/web/components/reader/StickyNoteLayer.tsx` — Portal + MutationObserver
- `apps/web/store/readerStore.ts` — Tool enum
