# Marginalia — PDF Reader Web Service Planning

## 1. 프로젝트 개요

**서비스명**: Marginalia  
**목적**: 회원별 PDF 열람 + 하이라이팅/메모 + 스킴패널(하이라이트 수집) + AI 번역을 지원하는 웹 기반 PDF 리더  

### 핵심 컨셉
- 책의 여백(marginalia)에 메모하듯, 디지털 PDF에 하이라이트와 노트를 남긴다
- 드래그한 문장들을 스킴패널에 모아 한꺼번에 정리/복사할 수 있다
- AI 번역으로 외국어 문서도 즉시 이해 가능

---

## 2. 핵심 기능

### 2.1 PDF 뷰어
- 회원별 PDF 업로드 및 관리
- 페이지 네비게이션, 줌 인/아웃
- 텍스트 레이어 위에 하이라이트 오버레이 렌더링

### 2.2 하이라이팅 & 메모
- 텍스트 드래그 → 컬러 팝업 → 하이라이트 저장
- 하이라이트별 메모(노트) 작성 및 수정
- 하이라이트 색상 구분 (yellow / green / blue / pink / purple)
- 하이라이트 삭제

### 2.3 스킴패널 (Scheme Panel)
- 드래그 선택 시 "스킴패널에 추가" 옵션 제공
- 문서별 스킴패널: 추가된 하이라이트 문장들을 순서대로 목록화
- 항목 순서 변경 (drag & drop)
- 전체 복사: 수집된 문장들을 줄바꿈 구분으로 클립보드 복사
- 항목별 삭제 / 패널 전체 초기화

### 2.4 AI 번역
- 드래그 선택 후 "번역" 버튼 클릭
- Claude API 스트리밍으로 번역 결과 실시간 표시
- 번역 결과를 메모로 저장 가능
- 지원 방향: 선택 텍스트 → 한국어 (기본), 사용자 설정으로 대상 언어 변경 가능

### 2.5 회원 시스템
- 이메일/비밀번호 가입 및 OAuth (Google)
- 회원별 독립 문서 스페이스 (다른 회원 문서 접근 불가)
- 문서 목록 / 최근 열람 문서

---

## 3. 기술 스택

### Frontend
| 역할 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) |
| PDF 렌더링 + 어노테이션 | `react-pdf-highlighter` |
| 전역 상태 (스킴패널) | Zustand |
| 스타일 | Tailwind CSS + shadcn/ui |
| 인증 | NextAuth.js v5 (Auth.js) |
| HTTP 클라이언트 | TanStack Query + axios |
| AI 스트리밍 | EventSource (SSE) |

### Backend
| 역할 | 기술 |
|------|------|
| 프레임워크 | FastAPI (Python 3.12) |
| ORM | SQLAlchemy 2.0 (async) |
| 마이그레이션 | Alembic |
| 인증 | JWT (python-jose) + bcrypt |
| 파일 업로드 | python-multipart + boto3 |
| AI 번역 | Anthropic Python SDK |
| 캐시 / 큐 | Redis (선택적 — AI 요청 제한용) |
| 유효성 검사 | Pydantic v2 |

### 인프라 / 배포
| 역할 | 기술                               |
|------|----------------------------------|
| DB | PostgreSQL 18 (Neon or Supabase) |
| 파일 스토리지 | Cloudflare R2 (S3 호환)            |
| Frontend 배포 | Vercel                           |
| Backend 배포 | Fly.io or Railway (Docker)       |
| CI/CD | GitHub Actions                   |

---

## 4. 시스템 아키텍처

```
Browser (Next.js)
    │
    ├── PDF 파일 요청 ──────────────────────→ Cloudflare R2 (Presigned URL)
    │
    ├── API 요청 (하이라이트/메모/패널) ──→ FastAPI
    │                                            ├── PostgreSQL
    │                                            └── Cloudflare R2 (업로드)
    │
    └── AI 번역 (SSE 스트리밍) ──────────→ FastAPI → Anthropic Claude API
```

> PDF 파일은 FastAPI를 거치지 않고 R2 Presigned URL로 직접 브라우저에 서빙 → 백엔드 부하 최소화

---

## 5. 데이터베이스 스키마

```sql
-- 회원
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    avatar_url  TEXT,
    provider    TEXT DEFAULT 'email',  -- 'email' | 'google'
    password_hash TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 문서
CREATE TABLE documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    file_key    TEXT NOT NULL,          -- R2 object key
    file_size   BIGINT,
    page_count  INT,
    last_opened TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 하이라이트
CREATE TABLE highlights (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- react-pdf-highlighter IHighlight 구조 그대로 저장
    position    JSONB NOT NULL,         -- { boundingRect, rects, pageNumber }
    content     JSONB NOT NULL,         -- { text, image? }
    color       TEXT DEFAULT 'yellow',  -- yellow|green|blue|pink|purple
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 메모 (하이라이트에 1:1 또는 독립 메모)
CREATE TABLE notes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    highlight_id UUID REFERENCES highlights(id) ON DELETE CASCADE,
    document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- 스킴패널 컬렉션
CREATE TABLE collections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT DEFAULT 'Default',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 스킴패널 항목
CREATE TABLE collection_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    highlight_id  UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    position      INT NOT NULL DEFAULT 0,  -- 순서
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(collection_id, highlight_id)
);
```

---

## 6. API 설계

### Auth
```
POST   /auth/signup              회원가입
POST   /auth/login               로그인 → JWT 발급
POST   /auth/refresh             토큰 갱신
DELETE /auth/logout              로그아웃
```

### Documents
```
GET    /documents                내 문서 목록
POST   /documents                PDF 업로드 (multipart)
GET    /documents/{id}           문서 메타데이터
DELETE /documents/{id}           문서 삭제
GET    /documents/{id}/url       R2 Presigned URL 발급 (열람용)
```

### Highlights
```
GET    /documents/{id}/highlights         문서의 하이라이트 전체
POST   /documents/{id}/highlights         하이라이트 생성
PATCH  /highlights/{id}                   색상 변경
DELETE /highlights/{id}                   하이라이트 삭제
```

### Notes
```
POST   /highlights/{id}/note              메모 작성
PATCH  /notes/{id}                        메모 수정
DELETE /notes/{id}                        메모 삭제
```

### Collections (스킴패널)
```
GET    /documents/{id}/collection         스킴패널 항목 조회
POST   /documents/{id}/collection/items   항목 추가
PATCH  /documents/{id}/collection/items   순서 변경 (bulk)
DELETE /collection/items/{id}             항목 제거
```

### AI Translation
```
POST   /translate                         번역 요청 (SSE 스트리밍)
  body: { text: string, targetLang: string }
  response: text/event-stream
```

---

## 7. 주요 기능 구현 플로우

### 7.1 하이라이트 생성
```
1. 사용자가 PDF 텍스트 드래그
2. react-pdf-highlighter → onSelectionFinished 콜백 발생
3. 컬러/액션 팝업 표시 (색상 선택, 스킴패널 추가, 번역)
4. 색상 선택 → POST /documents/{id}/highlights
5. 서버 저장 후 로컬 상태 업데이트 (Zustand)
6. PDF 위에 하이라이트 오버레이 즉시 렌더링
```

### 7.2 스킴패널 흐름
```
1. 하이라이트 팝업에서 "패널에 추가" 클릭
2. POST /documents/{id}/collection/items
3. 우측 스킴패널에 문장 항목 추가 (실시간)
4. 전체 복사 버튼 → 항목들 text 줄바꿈 join → clipboard.writeText()
```

### 7.3 AI 번역 흐름
```
1. 텍스트 드래그 → "번역" 클릭
2. POST /translate → SSE 연결
3. FastAPI: Anthropic Claude API 스트리밍 호출
4. chunk 수신마다 SSE event 발송
5. 프론트: EventSource로 번역 결과 실시간 표시
6. "메모로 저장" → 번역 결과를 노트로 저장
```

### 7.4 PDF 서빙
```
1. 문서 열람 요청 → GET /documents/{id}/url
2. FastAPI: R2 Presigned URL 생성 (유효시간 1시간)
3. 프론트: 해당 URL로 react-pdf-highlighter 초기화
4. PDF 바이트는 브라우저 ↔ R2 직접 통신
```

---

## 8. 프론트엔드 UI 구조

```
/app
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── dashboard/page.tsx           문서 목록 + 업로드
└── reader/[documentId]/page.tsx PDF 뷰어 메인

Reader 레이아웃:
┌─────────────────────────────────────────────────┐
│  Header: 문서 제목 | 줌 | 페이지 | 설정          │
├──────────────────────────────┬──────────────────┤
│                              │  Scheme Panel    │
│   PDF Viewer                 │  ─────────────── │
│   (react-pdf-highlighter)    │  ① 문장 A        │
│                              │  ② 문장 B        │
│                              │  ③ 문장 C        │
│                              │  [전체 복사]      │
│                              ├──────────────────┤
│                              │  Notes Panel     │
│                              │  선택 하이라이트  │
│                              │  메모 표시/편집   │
└──────────────────────────────┴──────────────────┘
```

---

## 9. 개발 로드맵

### Phase 1 — MVP (4~6주)
- [ ] 프로젝트 셋업 (Next.js + FastAPI + PostgreSQL)
- [ ] 회원가입 / 로그인 (JWT)
- [ ] PDF 업로드 → R2 저장
- [ ] PDF 뷰어 (react-pdf-highlighter 기본 연동)
- [ ] 하이라이트 생성 / 조회 / 삭제
- [ ] 문서 목록 대시보드

### Phase 2 — 핵심 기능 (3~4주)
- [ ] 메모 작성 / 수정
- [ ] 스킴패널 (추가 / 순서 변경 / 전체 복사)
- [ ] 하이라이트 색상 구분 UI
- [ ] 반응형 레이아웃

### Phase 3 — AI 기능 (2~3주)
- [ ] Claude API 번역 (SSE 스트리밍)
- [ ] 번역 결과 메모 저장
- [ ] 대상 언어 설정

### Phase 4 — 개선 (지속)
- [ ] Google OAuth
- [ ] 문서 공유 (읽기 전용 링크)
- [ ] 하이라이트 검색
- [ ] 키보드 단축키
- [ ] 다크 모드

---

## 10. 환경변수

### Frontend (.env.local)
```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (.env)
```env
DATABASE_URL=postgresql+asyncpg://...
JWT_SECRET=...
JWT_EXPIRE_MINUTES=60

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=marginalia-docs
R2_PUBLIC_URL=...

ANTHROPIC_API_KEY=...
```

---

## 11. 모노레포 구조 (권장)

```
marginalia/
├── apps/
│   ├── web/          Next.js 프론트엔드
│   └── api/          FastAPI 백엔드
├── packages/
│   └── types/        공유 타입 (선택)
├── docker-compose.yml
└── README.md
```

---

*Last updated: 2026-06-06*
