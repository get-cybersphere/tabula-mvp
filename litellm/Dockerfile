# Tabula LiteLLM proxy image for Render / Railway / Fly deployment.
#
# Why we wrap the official image instead of using it directly:
#   - Render's Docker runtime expects a Dockerfile at a path it can build
#   - We need to bake in our config.yaml so the container is self-contained
#   - We bind to the $PORT Render injects at runtime
FROM ghcr.io/berriai/litellm:main-stable

WORKDIR /app

# Copy the proxy config (model list, guardrails, callbacks) into the image.
COPY config.yaml /app/config.yaml

# Render (and most PaaS) inject a $PORT env var at runtime. Default to
# 4000 for local docker runs so nothing breaks if PORT is unset.
ENV PORT=4000
EXPOSE 4000

# Use a shell form so $PORT expands at runtime rather than image build time.
CMD litellm --config /app/config.yaml --port ${PORT} --num_workers 2
