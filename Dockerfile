FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt requirements-ai.txt ./
RUN pip install --no-cache-dir 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements-ai.txt
COPY . .
RUN python -m ml.setup_pretrained
RUN useradd -m kaanam && mkdir -p /app/data && chown -R kaanam:kaanam /app
USER kaanam
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
