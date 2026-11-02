// 서버 컴포넌트(화면)에서 지금 사용자로 서비스 호출할 때. (app) 레이아웃이 로그인을 이미 확인함
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../lib/auth.ts";
import { newRequestId } from "./api.ts";
import type { Ctx } from "./repo.ts";

export async function pageCtx(): Promise<Ctx> {
  return (await pageUser()).ctx;
}

/** 화면에 이름도 필요할 때(홈 인사말) */
export async function pageUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) redirect("/login");
  return { ctx: { userId: s.user.id, actor: "user", requestId: newRequestId() } as Ctx, name: s.user.name };
}
