# syntax=docker/dockerfile:1
# Bill Maker backend - FastAPI + WeasyPrint
# Multi-stage: builder compiles wheels into a venv, runtime copies the venv only.

############################
# Stage 1: builder
############################
FROM python:3.11-slim-bookworm AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build
COPY requirements.txt .
RUN pip install --upgrade pip wheel \
    && pip install -r requirements.txt

############################
# Stage 2: runtime
############################
FROM python:3.11-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    UPLOAD_DIR=/app/uploads \
    RUN_MIGRATIONS=false

# WeasyPrint runtime libraries (Pango/HarfBuzz; no Cairo needed for WeasyPrint >= 53),
# fonts for PDF rendering, and libpq for PostgreSQL drivers built from source.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz0b \
        libharfbuzz-subset0 \
        libffi8 \
        libpq5 \
        shared-mime-info \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system app && useradd --system --gid app --create-home --home-dir /home/app app

COPY --from=builder /opt/venv /opt/venv

# Entrypoint lives outside /app so a dev bind mount on /app does not hide it.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod 0755 /usr/local/bin/docker-entrypoint.sh

WORKDIR /app
COPY --chown=app:app . .

# Pre-create the uploads dir so a fresh named volume inherits app ownership.
RUN mkdir -p /app/uploads && chown -R app:app /app/uploads

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
