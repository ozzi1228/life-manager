// 오프라인이면서 아직 저장해 둔 화면도 없을 때 보이는 화면(서비스 워커가 미리 담아 둠)
import { EmptyState } from "@/components/app/states";

export const metadata = { title: "오프라인 · 우나" };

export default function Offline() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        title="지금은 우나에 연결할 수 없어요"
        description="휴대폰의 인터넷과 Tailscale이 켜져 있는지, 집 PC가 켜져 있는지 확인해 주세요."
        pet="pomong"
      />
    </main>
  );
}
