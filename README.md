# Marginalia

PDF를 읽으면서 하이라이트, 메모, 북마크를 남기고 AI 번역까지 활용할 수 있는 PDF 리더 웹 서비스입니다.

## 주요 기능

- **PDF 뷰어**: 페이지 탐색, 확대/축소 등 기본적인 PDF 열람 기능
- **하이라이트 & 메모**: PDF 본문에 하이라이트를 긋고 메모를 남기며, 색상별로 구분 관리
- **북마크**: 원하는 페이지를 북마크로 저장하고 빠르게 이동
- **AI 번역**: Anthropic Claude / OpenAI / Google Gemini를 이용한 스트리밍 번역. 사용자가 직접 발급받은 API 키(BYOK)를 암호화하여 등록해두면 해당 키로 번역하며, 미등록 시 (허용된 경우) 서버 공용 키로 폴백
- **회원 시스템**: 이메일/비밀번호 가입·로그인 및 Google OAuth 2.0 로그인, JWT 기반 인증(액세스/리프레시 토큰)
- **업로드 한도 관리**: 사용자별 최대 문서 개수·파일 용량 제한(기본값: 문서 3개, 파일당 50MB)을 전역 설정 또는 사용자별 오버라이드로 관리
- **관리자 기능**: 관리자 권한(`is_admin`)을 가진 사용자가 회원 목록/상세 조회, 업로드 한도 조정, 번역 LLM 폴백 허용 여부 조정, 계정 정지·삭제, 시스템 통계 확인 가능

## 기술 스택

### Frontend (`apps/web`)
- Next.js 16 (App Router), React 19, TypeScript
- Zustand (클라이언트 상태 관리), TanStack Query (서버 상태 관리)
- Tailwind CSS, react-pdf-highlighter (PDF 하이라이트)
- axios (API 통신)

### Backend (`apps/api`)
- FastAPI, Python 3.12 (Poetry로 의존성 관리)
- SQLAlchemy 2.0 (async) + Alembic (마이그레이션) + asyncpg
- Pydantic v2 (요청/응답 스키마 검증)
- python-jose, bcrypt (JWT 인증, 비밀번호 해싱)
- boto3 (Cloudflare R2 연동, S3 호환 오브젝트 스토리지)
- Anthropic SDK (Claude 기반 AI 번역)

### Infra
- PostgreSQL (Supabase에서 호스팅)
- Cloudflare R2 (PDF 파일 스토리지)
- Docker / docker-compose (로컬 개발 환경)

## 프로젝트 구조

npm workspaces 기반 모노레포입니다.

```
marginalia/
├── apps/
│   ├── web/   # Next.js 프론트엔드
│   └── api/   # FastAPI 백엔드
├── docker-compose.yml
└── package.json
```

## 시작하기

### 사전 준비물

- Node.js (npm workspaces 사용)
- Python 3.12 + Poetry
- PostgreSQL (또는 docker-compose의 `db` 서비스)
- Docker / Docker Compose (선택)

### 환경 변수 설정

**`apps/api/.env`**

```
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>/<db>
JWT_SECRET=<jwt-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=<access-token-만료-분>
JWT_REFRESH_EXPIRE_DAYS=<refresh-token-만료-일>

R2_ACCOUNT_ID=<cloudflare-r2-account-id>
R2_ACCESS_KEY_ID=<r2-access-key>
R2_SECRET_ACCESS_KEY=<r2-secret-key>
R2_BUCKET_NAME=<r2-bucket-name>
R2_PUBLIC_URL=<r2-public-url>

GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
GOOGLE_REDIRECT_URI=<google-oauth-redirect-uri>
FRONTEND_URL=<frontend-url>

ANTHROPIC_API_KEY=<anthropic-api-key>

# 사용자가 등록한 LLM API 키를 암호화해서 저장하기 위한 비밀키 (JWT_SECRET과는 별도로 관리)
LLM_KEY_ENCRYPTION_SECRET=<random-secret-string>

# 선택 - 미설정 시 기본값 사용
MAX_DOCUMENTS_PER_USER=3
MAX_FILE_SIZE_MB=50
DEFAULT_LLM_FALLBACK_ALLOWED=true
```

**`apps/web/.env.local`**

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### Docker Compose로 실행하기

루트 디렉터리에서 아래 명령으로 DB, API, 웹을 한 번에 실행할 수 있습니다.

```bash
docker compose up
```

- DB: `localhost:5432`
- API: `http://localhost:8000` (API 문서: `/docs`, `/redoc`)
- Web: `http://localhost:3000`

### 로컬에서 직접 실행하기

**백엔드 (`apps/api`)**

```bash
cd apps/api
poetry install
poetry run alembic upgrade head        # DB 마이그레이션 적용
poetry run uvicorn app.main:app --reload
```

**프론트엔드 (루트 또는 `apps/web`)**

```bash
npm install
npm run dev:web      # 또는 cd apps/web && npm run dev
```

기타 워크스페이스 명령:

```bash
npm run build:web
npm run lint:web
```

## 테스트

백엔드 테스트는 pytest + pytest-asyncio로 작성되어 있으며, 트랜잭션 롤백 방식으로 실제 PostgreSQL에 대해 격리된 상태로 실행됩니다.

```bash
cd apps/api
poetry run pytest
```

## API 문서

서버 실행 후 아래 경로에서 자동 생성된 API 문서를 확인할 수 있습니다.

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
