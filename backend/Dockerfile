FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt && useradd --create-home --uid 10001 seekcost
COPY --chown=seekcost:seekcost app ./app
COPY --chown=seekcost:seekcost alembic ./alembic
COPY --chown=seekcost:seekcost alembic.ini ./
USER seekcost
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
