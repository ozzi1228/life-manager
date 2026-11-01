// 서버 컴포넌트(화면)에서 지금 사용자로 서비스 호출할 때. (app) 레이아웃이 로그인을 이미 확인함
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../lib/auth.ts";
import { newRequestId } from "./api.ts";
import type { Ctx } from "./repo.ts";

export async function pageCtx(): Promise<Ctx> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/login");
  return { userId: s.user.id, actor: "user", requestId: newRequestId() };
}
