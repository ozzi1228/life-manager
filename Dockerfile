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
RUN addgroup -S oona && adduser -S oona -G oona
COPY --from=build /app/public ./public
COPY --from=build --chown=oona:oona /app/.next/standalone ./
COPY --from=build --chown=oona:oona /app/.next/static ./.next/static
USER oona
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
