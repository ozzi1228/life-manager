// 비밀번호 규칙 (docs/planning/13 §3.2, 04 §2.2). 가입 화면(실시간 체크)과 서버(최종 검사)가 함께 씀
// ponytail: 흔한 비밀번호는 짧은 목록만. 공개 단계(다중 사용자)에서 상위 10만 개 목록으로 교체
const COMMON = new Set(["password", "password1", "12345678", "123456789", "1234567890", "qwerty123", "qwer1234", "asdf1234", "abcd1234", "1q2w3e4r", "iloveyou1", "a1234567"]);

export const PASSWORD_RULES = [
  { id: "length", label: "8자 이상", problem: "비밀번호를 8자 이상 64자 이하로 만들어 주세요", ok: (pw: string) => pw.length >= 8 && pw.length <= 64 },
  { id: "mix", label: "영문과 숫자를 모두 포함", problem: "비밀번호에 영문과 숫자를 모두 넣어 주세요", ok: (pw: string) => /[a-zA-Z]/.test(pw) && /\d/.test(pw) },
] as const;

/** 문제가 있으면 화면에 보일 문구, 없으면 null */
export function passwordProblem(pw: string, username?: string | null) {
  for (const r of PASSWORD_RULES) if (!r.ok(pw)) return r.problem;
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return "비밀번호에 아이디를 넣을 수 없어요";
  if (COMMON.has(pw.toLowerCase())) return "너무 흔한 비밀번호예요. 다른 비밀번호를 써 주세요";
  return null;
}
