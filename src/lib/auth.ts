// 인증 설정 (0단계 V-11, docs/planning/13-auth-and-users.md)
// - 개인 아이디 + 비밀번호 가입(이메일 선택, D-010) / 카카오·네이버 간편 로그인(D-011)
// - Better Auth는 사용자마다 이메일을 필수로 요구한다 → 이메일이 없으면 내부용 주소(.invalid, 메일이 갈 수 없음)를 넣고 화면에는 보이지 않게
// - 이메일이 같아도 자동으로 계정을 합치지 않음(13 §4.2): 연결은 로그인한 상태에서 명시적으로만
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import { hash, verify } from "@node-rs/argon2";
import { audit } from "../server/audit.ts";
import { sendMail } from "./mail.ts";
import { pool } from "./db.ts"; // 확장자: scripts/*.mts(노드 직접 실행)도 이 파일을 불러옴
import { passwordProblem } from "./password.ts";

export const INTERNAL_EMAIL_DOMAIN = "users.oona.invalid";
export const internalEmail = (kind: "id" | "kakao" | "naver", id: string) => `${kind}.${id}@${INTERNAL_EMAIL_DOMAIN}`;
export const isInternalEmail = (email: string) => email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);

// 아이디 규칙(13 §3.1): 4~20자, 영문 소문자로 시작, 소문자·숫자·_·. , 기호 연속 금지, 예약어 금지
const RESERVED = new Set(["admin", "root", "system", "support", "oona", "help", "api", "null"]);
export const validUsername = (u: string) => /^[a-z][a-z0-9_.]{3,19}$/.test(u) && !/[._]{2}/.test(u) && !RESERVED.has(u);

// 카카오·네이버는 이메일을 요청하지 않는다(카카오 이메일은 비즈 앱 필요, 19 §3). 앱 키가 있을 때만 켬
const social = {
  ...(process.env.KAKAO_CLIENT_ID && {
    kakao: {
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
      disableDefaultScope: true,
      disableImplicitSignUp: true, // 처음 온 사람은 "처음 오셨나요?"에서 새로 시작(requestSignUp) 또는 기존 계정 연결을 고름(13 §2.3)
      scope: ["profile_nickname", "profile_image"],
      mapProfileToUser: (p: { id: number | string }) => ({ email: internalEmail("kakao", String(p.id)), emailVerified: false }),
    },
  }),
  ...(process.env.NAVER_CLIENT_ID && {
    naver: {
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET ?? "",
      disableDefaultScope: true,
      disableImplicitSignUp: true, // 처음 온 사람은 "처음 오셨나요?"에서 새로 시작(requestSignUp) 또는 기존 계정 연결을 고름(13 §2.3)
      scope: ["profile"],
      mapProfileToUser: (p: { response?: { id?: string } }) => ({
        email: internalEmail("naver", String(p.response?.id)),
        emailVerified: false,
      }),
    },
  }),
};

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // 운영 주소는 .env의 OONA_URL(저장소에 이 PC의 주소를 남기지 않음)
  trustedOrigins: ["http://localhost:3330", ...(process.env.OONA_URL ? [process.env.OONA_URL] : [])],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 64,
    // NFR-SEC-001: Argon2id(@node-rs/argon2 기본 알고리즘), OWASP 권장 최소값
    password: {
      hash: (password) => hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      verify: ({ hash: stored, password }) => verify(stored, password),
    },
    // 비밀번호 찾기: 등록한 진짜 이메일로 링크(1시간). 이메일 없는 계정(내부 주소)은 보내지 않음. 바꾸면 모든 기기 로그아웃
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      if (isInternalEmail(user.email)) return;
      const id = (user as { username?: string }).username;
      await sendMail(
        user.email,
        "[우나] 비밀번호 다시 정하기",
        `${id ? `아이디: ${id}

` : ""}아래 링크를 눌러 새 비밀번호를 정해 주세요. 링크는 1시간 동안만 쓸 수 있어요.

${url}

직접 요청하지 않았다면 이 메일은 무시해도 돼요.`,
      );
    },
  },
  plugins: [
    username({
      minUsernameLength: 4,
      maxUsernameLength: 20,
      usernameValidator: validUsername,
      displayUsername: false,
    }),
  ],
  socialProviders: social,
  account: { accountLinking: { enabled: true, disableImplicitLinking: true } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 }, // 로그인 유지 30일(FR-AUTH-006)
  advanced: {
    cookiePrefix: "oona",
    // Tailscale serve가 앞에 있어 실제 기기 주소는 X-Forwarded-For로 옴(요청 제한이 기기별로 걸리게)
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },
  // 로그인 시도 제한(13 §3.3): 5분에 10번. ponytail: 서버 메모리 기준(재시작하면 초기화)
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-in/username": { window: 300, max: 10 },
      "/sign-up/email": { window: 300, max: 10 },
      "/request-password-reset": { window: 300, max: 5 },
      "/reset-password": { window: 300, max: 10 },
    },
  },
  hooks: {
    // 비밀번호 규칙은 화면이 아니라 여기서 최종 확인(신뢰 경계)
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" || ctx.path === "/change-password" || ctx.path === "/reset-password") {
        const body = ctx.body as { password?: string; newPassword?: string; username?: string };
        const problem = passwordProblem(body.newPassword ?? body.password ?? "", body.username);
        if (problem) throw new APIError("BAD_REQUEST", { message: problem, code: "WEAK_PASSWORD" });
      }
    }),
    // 보안 기록(14 §1.5, 04 §8.9): 로그인·가입·로그아웃·비밀번호 변경·기기 로그아웃. 사용자 데이터 내용은 남기지 않음
    after: createAuthMiddleware(async (ctx) => {
      const event =
        ctx.path === "/sign-in/username"
          ? "login.password"
          : ctx.path.startsWith("/callback/")
            ? `login.${ctx.params?.id ?? "social"}`
            : (({ "/sign-up/email": "signup.password", "/sign-out": "logout", "/change-password": "password.change", "/reset-password": "password.reset", "/request-password-reset": "password.reset_request", "/revoke-session": "session.revoke", "/revoke-other-sessions": "session.revoke_others" }) as Record<string, string>)[ctx.path] ?? null;
      if (!event) return;
      const userId = ctx.context.newSession?.user.id ?? ctx.context.session?.user.id ?? null;
      const failed = ctx.context.returned instanceof Error;
      const anonymous = event === "logout" || event.startsWith("password.reset"); // 로그인 전에 하는 일
      await audit(failed || (!userId && !anonymous) ? `${event}.failed` : event, { userId, headers: ctx.request?.headers ?? (ctx.headers as Headers | undefined) });
    }),
  },
});

export const enabledSocialProviders = Object.keys(social);
