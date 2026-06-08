# Production Checklist

실제 서비스/제품으로 만들기 위해 필요한 작업 목록입니다.

---

## 우선순위 요약

| 순서 | 작업 | 이유 |
|---|---|---|
| 1 | Rate limiting | 서비스 오픈 즉시 봇/스캐너에 노출 |
| 2 | 이메일 인증 + 비밀번호 찾기 | 없으면 유저 이탈 |
| 3 | Sentry + 구조적 로깅 | 프로덕션 이슈 대응 불가 |
| 4 | CI/CD 파이프라인 | 배포 품질 보장 |
| 5 | DB 인덱스 + 문서 목록 페이지네이션 | 데이터 쌓이면 느려짐 |
| 6 | 계정 삭제 (자기 자신) | 법적 요건 (개인정보보호법) |
| 7 | Export 기능 | 핵심 사용 가치 |

---

## 1. 보안

### Rate Limiting
- 현재 모든 엔드포인트에 호출 횟수 제한 없음
- `/auth/login`, `/auth/signup`, `/translate` 등은 무제한 요청 가능
- `slowapi` 미들웨어로 IP/유저별 제한 적용 필요
```python
# 예시
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("10/minute")
async def login(...): ...
```

### JWT 토큰 무효화
- 로그아웃이 클라이언트에서 토큰을 삭제하는 것에 불과
- 탈취된 토큰을 서버에서 막을 방법이 없음
- Redis 블랙리스트 또는 refresh token DB 저장 방식으로 전환 필요

### 파일 검증 강화
- 현재 `content_type == "application/pdf"` 헤더만 체크
- 헤더는 클라이언트가 임의로 조작 가능
- 실제 파일 시그니처(`%PDF`) 바이트 검사 추가 필요
```python
if not file_bytes.startswith(b"%PDF"):
    raise HTTPException(status_code=400, detail="유효하지 않은 PDF 파일입니다")
```

### 비밀번호 정책
- `SignupRequest.password`에 최소 길이, 복잡도 조건 없음
- Pydantic validator로 최소 8자, 영문+숫자 조합 등 정책 추가 필요

### 이메일 인증
- 회원가입 시 이메일 소유 여부를 검증하지 않음
- 타인 이메일로 가입 가능한 상태
- 가입 후 인증 링크 발송 → 인증 전 기능 제한 플로우 필요

---

## 2. 필수 기능 누락

### 비밀번호 찾기 / 초기화
- email 회원이 비밀번호를 잊으면 계정 복구 방법이 없음
- 이메일로 임시 토큰 발송 → 비밀번호 재설정 플로우 구현 필요

### 계정 삭제 (자기 자신)
- 개인정보보호법 관점에서 유저가 직접 계정과 데이터를 삭제할 수 있어야 함
- 현재는 admin만 유저를 삭제할 수 있음
- `DELETE /auth/me` 엔드포인트 및 프론트엔드 설정 페이지 UI 추가 필요

### 문서 목록 페이지네이션
- 현재 `select(Document).where(...)` 로 전체 조회
- 문서가 많아지면 응답 크기와 DB 쿼리 비용이 무제한 증가
- `limit` / `offset` 또는 커서 기반 페이지네이션 적용 필요

### 하이라이트 / 노트 검색
- 특정 텍스트를 포함한 하이라이트나 노트를 찾는 방법이 없음
- PostgreSQL `full-text search` 또는 `ilike` 기반 검색 엔드포인트 추가 필요

### 이메일 발송 인프라
- 이메일 인증, 비밀번호 재설정, 가입 환영 메일 등을 보낼 수단이 없음
- Resend, SendGrid 등 트랜잭셔널 이메일 서비스 연동 필요

---

## 3. 인프라 / 운영

### CI/CD 파이프라인
- 현재 코드 푸시 시 자동 테스트 실행이나 배포 자동화가 없음
- GitHub Actions로 아래 파이프라인 구성 필요
  - PR: `pytest` 실행
  - main 머지: 테스트 통과 시 Render/Vercel 자동 배포

### 에러 추적 (Sentry)
- 500 에러가 발생해도 어디서 터졌는지 알기 어려움
- Sentry 연동으로 스택 트레이스, 유저 컨텍스트, 발생 빈도 추적 필요
```python
# main.py
import sentry_sdk
sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENVIRONMENT)
```

### 구조적 로깅
- 현재 uvicorn 기본 로그만 있음
- 요청 ID, 유저 ID, 처리 시간을 포함한 JSON 구조 로그 필요
- `structlog` 또는 `python-json-logger` 도입 권장

### DB 마이그레이션 안전성
- 현재 Dockerfile CMD에서 앱 시작과 함께 `alembic upgrade head` 실행
```dockerfile
# 현재 (위험)
CMD ["sh", "-c", "alembic upgrade head && uvicorn ..."]
```
- 멀티 인스턴스 환경에서 동시 실행 시 충돌 가능
- 마이그레이션을 별도 배포 단계(pre-deploy hook)로 분리 필요

### 데이터베이스 인덱스
- 자주 조회되는 컬럼에 인덱스가 없음
```python
# 추가 필요한 인덱스 예시 (migration으로 추가)
Index("ix_highlights_doc_user", Highlight.document_id, Highlight.user_id)
Index("ix_notes_doc_user", Note.document_id, Note.user_id)
Index("ix_bookmarks_doc_user", Bookmark.document_id, Bookmark.user_id)
Index("ix_collection_items_collection", CollectionItem.collection_id)
```

### 백업 전략
- Render PostgreSQL 자동 백업 설정 여부 확인
- 백업 주기, 보관 기간, 복구 절차 문서화 필요

---

## 4. 성능

### 캐싱
- presigned URL은 매 요청마다 R2 API를 새로 호출
- TTL이 1시간이므로 Redis에 캐시하면 R2 API 호출 횟수 대폭 감소
- `/settings` 응답도 캐시 후 설정 변경 시 무효화 가능

### 문서 업로드 비동기 처리
- 현재 업로드 흐름이 동기로 워커를 블로킹
```python
# 현재
file_bytes = await file.read()   # 메모리에 전체 로드
upload_file(file_bytes, file_key)  # boto3 동기 호출
```
- 대용량 파일(50MB) 업로드 시 다른 요청 처리가 지연됨
- `asyncio.to_thread(upload_file, ...)` 또는 백그라운드 태스크로 전환 필요

### LLM 번역 타임아웃 처리
- 번역 SSE 스트림에 타임아웃 설정 없음
- LLM API가 응답 없이 멈추면 커넥션이 계속 점유됨
- `asyncio.wait_for`로 타임아웃 및 클라이언트 재시도 로직 추가 필요

---

## 5. 프로덕트 완성도

### 온보딩
- 가입 직후 빈 대시보드만 보임
- PDF 업로드 유도, 기능 안내, 샘플 문서 제공 등 온보딩 플로우 필요

### Export 기능
- 하이라이트/노트/컬렉션을 외부로 내보낼 방법이 없음
- Markdown, JSON, PDF 어노테이션 등 형식으로 export 지원 필요

### 공유 기능
- 컬렉션이나 하이라이트를 다른 사람과 공유할 수 없음
- read-only 공유 링크 생성 기능 추가 고려

### PDF 썸네일
- 대시보드에서 문서 구분이 제목 텍스트뿐
- `pdf2image` 등으로 첫 페이지 썸네일을 R2에 저장하고 목록에 표시 필요

### 모바일 대응
- 리더 페이지가 `h-screen flex` 고정 레이아웃으로 모바일 사용성 불명확
- 최소한 대시보드와 설정 페이지는 모바일 반응형으로 수정 필요

### 법적 페이지
- 서비스 약관(Terms of Service), 개인정보처리방침(Privacy Policy) 페이지 없음
- 실제 서비스 오픈 전 필수 작성 항목
