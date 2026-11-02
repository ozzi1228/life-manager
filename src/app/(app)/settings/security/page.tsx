// 설정 > 보안 기록 (SCR-SET-10)
import { Page } from "@/components/app/page-shell";
import { SettingsBack } from "@/components/settings/back";
import { SecurityList } from "@/components/settings/security";
import { securityLog } from "@/server/security";
import { pageCtx } from "@/server/session";

export default async function SecurityPage() {
  const ctx = await pageCtx();
  return (
    <Page narrow>
      <SettingsBack title="보안 기록" />
      <SecurityList first={await securityLog(ctx)} />
    </Page>
  );
}
