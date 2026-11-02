// 설정 > 휴지통 (SCR-SET-09)
import { Page } from "@/components/app/page-shell";
import { SettingsBack } from "@/components/settings/back";
import { TrashList } from "@/components/settings/trash";
import { pageCtx } from "@/server/session";
import { trashView } from "@/server/trash";

export default async function TrashPage() {
  const ctx = await pageCtx();
  return (
    <Page narrow>
      <SettingsBack title="휴지통" />
      <TrashList items={await trashView(ctx)} />
    </Page>
  );
}
