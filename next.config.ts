import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 컨테이너 상시 실행용 최소 서버(.next/standalone) — Dockerfile 참고
  output: "standalone",
  cacheComponents: true,
  // 자식 프로세스로 Claude Code·Codex를 띄우는 패키지는 묶지 않고 node_modules에서 그대로 씀
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@openai/codex"],
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // 서비스 워커는 항상 최신본(업데이트가 웹 배포로 바로 반영되도록)
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
