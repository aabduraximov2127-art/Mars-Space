# EduCentr backend — production image (Django + gunicorn)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Static files are collected at build time (dummy env: settings only need syntactically valid values).
RUN SECRET_KEY=build-only DATABASE_URL=sqlite:////tmp/build.sqlite3 DEBUG=False \
        python manage.py collectstatic --noinput \
    && useradd --system --uid 10001 --home-dir /app app \
    && mkdir -p /app/media /app/private_media \
    && chown -R app:app /app/media /app/private_media \
    && chmod +x /app/docker-entrypoint.sh

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4).status == 200 else 1)"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-", "--forwarded-allow-ips", "*"]
