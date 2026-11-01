# 우나 앱 컨테이너 (docs/planning/16 §5.2). 리눅스 안에서 빌드해 standalone 서버만 담는다
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 브라우저 코드에 들어가는 공개 값만 빌드 때 받는다(비밀값은 실행 때 환경 변수로)
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S oona && adduser -S oona -G oona && apk add --no-cache libgcc libstdc++
COPY --from=build /app/public ./public
COPY --from=build --chown=oona:oona /app/.next/standalone ./
COPY --from=build --chown=oona:oona /app/.next/static ./.next/static
# AI 구독 연결(D-060): Claude Code(Agent SDK)·Codex 실행 파일은 코드가 직접 불러오지 않아 standalone에 안 들어가므로 따로 담음
COPY --from=deps /app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl ./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl
COPY --from=deps /app/node_modules/@openai/codex ./node_modules/@openai/codex
COPY --from=deps /app/node_modules/@openai/codex-linux-x64 ./node_modules/@openai/codex-linux-x64
USER oona
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
