# Selenium + geckodriver only. The browser comes from the host's /nix (Zen) mounted read-only,
# so nothing browser-related is installed on the host and the image stays small.
FROM python:3.12-slim-bookworm
ARG GECKODRIVER=v0.37.1
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates fonts-dejavu-core fonts-noto-cjk \
 && curl -fsSL "https://github.com/mozilla/geckodriver/releases/download/${GECKODRIVER}/geckodriver-${GECKODRIVER}-linux64.tar.gz" | tar -xz -C /usr/local/bin \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir selenium==4.51.0
WORKDIR /app
