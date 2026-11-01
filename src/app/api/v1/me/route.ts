// 지금 로그인한 사용자와 설정 (앱 셸·온보딩이 씀)
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { api } from "@/server/api";

export const GET = api("/api/v1/me", async ({ ctx }) => {
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, ctx.userId));
  return { userId: ctx.userId, settings: settings ?? null };
});
