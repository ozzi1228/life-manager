// 우나 전용 폴더에 AI 구독으로 로그인 (D-060). 사용자 개인 ~/.claude·~/.codex와는 별개 폴더
//   node --env-file=.env scripts/ai-login.mts claude   Claude Code가 열림 → 로그인 방법에서 Claude 구독 계정 → 끝나면 /exit
//   node --env-file=.env scripts/ai-login.mts codex    브라우저가 열림 → ChatGPT 계정으로 로그인
//   node --env-file=.env scripts/ai-login.mts status   두 구독의 로그인 상태
// 폴더: .env의 OONA_AI_LOGIN_DIR(운영 컨테이너도 같은 폴더를 /data/ai-login으로 씀)
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { claudeBinary, codexBinary, loggedIn, loginDir, planEnv, type Plan } from "../src/lib/ai/login.ts";

const what = process.argv[2];
if (!process.env.OONA_AI_LOGIN_DIR) {
  console.error(".env에 OONA_AI_LOGIN_DIR(로그인 폴더, 예: C:\\oona-data\\ai-login)을 넣어 주세요.");
  process.exit(1);
}
const show = (p: Plan) => console.log(`${p === "claude" ? "Claude 구독" : "ChatGPT 구독"}: ${loggedIn(p) ? "로그인됨" : "로그인 필요"} (${loginDir(p)})`);

if (what === "status") {
  show("claude");
  show("codex");
} else if (what === "claude" || what === "codex") {
  const bin = what === "claude" ? claudeBinary() : codexBinary();
  if (!bin) {
    console.error("실행 파일을 찾지 못했어요. npm install 뒤에 다시 실행해 주세요.");
    process.exit(1);
  }
  mkdirSync(loginDir(what), { recursive: true });
  const args = what === "claude" ? [] : ["login", "-c", 'forced_login_method="chatgpt"'];
  if (what === "claude") console.log("Claude Code가 열려요. 로그인 방법을 물으면 Claude 구독 계정으로 로그인하고, 끝나면 /exit 로 나오세요.");
  spawnSync(bin, args, { stdio: "inherit", env: planEnv(what) });
  show(what);
} else {
  console.log("사용법: node --env-file=.env scripts/ai-login.mts claude|codex|status");
}
