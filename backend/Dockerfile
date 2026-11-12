FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER nobody
EXPOSE 8000
# Migrations first, then one worker (the scheduler and the limiters live in the process).
# No access log: the privacy page promises no IP is kept.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log"]
