// 구독 로그인 폴더와 실행 파일 (agent-company와 같은 방식: 플랫폼 전용 폴더 하나만 넘김)
// - Claude 구독: Agent SDK에 든 Claude Code를 CLAUDE_CONFIG_DIR=<로그인 폴더>/claude 로 실행
// - ChatGPT 구독: Codex CLI를 CODEX_HOME=<로그인 폴더>/codex 로 실행
// 사용자 개인 ~/.claude·~/.codex는 쓰지 않는다. 로그인은 scripts/ai-login.mts
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export type Plan = "claude" | "codex";

export const loginDir = (plan: Plan) => join(process.env.OONA_AI_LOGIN_DIR ?? "", plan);

const CREDENTIAL = { claude: ".credentials.json", codex: "auth.json" } as const;
export const loggedIn = (plan: Plan) => !!process.env.OONA_AI_LOGIN_DIR && existsSync(join(loginDir(plan), CREDENTIAL[plan]));

/** 자식 프로세스 환경: 로그인 폴더 변수와 API 키를 지우고 이 구독의 폴더 하나만 넣음(키로 몰래 과금되지 않게) */
export function planEnv(plan: Plan): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY"]) delete env[k];
  env[plan === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"] = loginDir(plan);
  return env;
}

const require = createRequire(import.meta.url);
const plat = `${process.platform}-${process.arch}`;

export function claudeBinary(): string | null {
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  for (const name of [`@anthropic-ai/claude-agent-sdk-${plat}-musl`, `@anthropic-ai/claude-agent-sdk-${plat}`]) {
    try {
      const bin = join(dirname(require.resolve(`${name}/package.json`)), exe);
      if (existsSync(bin)) return bin;
    } catch {
      // 이 플랫폼 패키지가 없음
    }
  }
  return null;
}

const TRIPLE: Record<string, string> = {
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-musl",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "darwin-arm64": "aarch64-apple-darwin",
};
export function codexBinary(): string | null {
  try {
    const pkg = createRequire(require.resolve("@openai/codex/package.json")).resolve(`@openai/codex-${plat}/package.json`);
    const bin = join(dirname(pkg), "vendor", TRIPLE[plat], "bin", process.platform === "win32" ? "codex.exe" : "codex");
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}
