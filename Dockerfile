FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-slim AS runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg fonts-liberation libass9 curl fontconfig gosu \
      python3 python3-venv python3-pip \
      mesa-va-drivers vainfo libva2 && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /usr/share/fonts/truetype/montserrat && \
    curl -sL -o /usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf \
      "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf" && \
    fc-cache -f
WORKDIR /app

COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./

COPY scripts/ ./scripts/
RUN python3 -m venv /app/python-env && \
    /app/python-env/bin/pip install --no-cache-dir -r /app/scripts/requirements.txt

RUN mkdir -p /app/videos/minecraft/30 /app/videos/minecraft/60 /app/generated /app/yt_download_raw

RUN groupadd --system appuser && \
    useradd --system --gid appuser appuser && \
    chown -R appuser:appuser /app

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
