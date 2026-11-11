// 새 메모 쓰기. 처음 저장하면 그 메모 주소로 바뀜
import { MemoEditor } from "@/components/memos/memo-editor";

export const metadata = { title: "새 메모 · 우나" };

export default function NewMemoPage() {
  return <MemoEditor />;
}
