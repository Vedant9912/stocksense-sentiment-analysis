FROM python:3.11-slim

WORKDIR /app

# System deps needed by torch/transformers/lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install everything EXCEPT torch from requirements.txt first...
RUN grep -v "^torch" requirements.txt > requirements-no-torch.txt \
    && pip install --no-cache-dir -r requirements-no-torch.txt \
    # ...then install torch CPU-only build. The default PyPI torch wheel
    # bundles CUDA and is ~2GB+ heavier than this - Render has no GPU anyway.
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY app ./app

RUN useradd -ms /bin/bash appuser
USER appuser

# Pre-download FinBERT into the image at build time so the container
# doesn't need internet access on first request / cold start on Render.
RUN python -c "from transformers import AutoTokenizer, AutoModelForSequenceClassification; \
    AutoTokenizer.from_pretrained('ProsusAI/finbert'); \
    AutoModelForSequenceClassification.from_pretrained('ProsusAI/finbert')"

EXPOSE 8000

# Render sets $PORT - default to 8000 for local/docker-compose use.
ENV PORT=8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
