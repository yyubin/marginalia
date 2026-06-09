FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# SKIP_MIGRATIONS=1 to skip alembic (local dev where DB is already at head)
CMD ["sh", "-c", "if [ \"$SKIP_MIGRATIONS\" != \"1\" ]; then alembic upgrade head; fi && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
