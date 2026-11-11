"use client";

// 메모 내용 칸: 노션처럼 마크다운을 치는 대로 바로 바꿔 보여 줌. 저장은 마크다운 글자 그대로
// - 줄 맨 앞: "# "~"### " 제목, "- " 글머리, "1. " 번호, "[] " 할 일, "> " 인용, "```" 코드, "---" 구분선
// - 글 안: **굵게** *기울임* ~~취소선~~ `코드`, 주소는 자동 링크
// - 예전 메모(일반 글자)는 줄바꿈이 그대로 보이게(breaks)
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export function MemoBody({ initial, onChange }: { initial: string; onChange: (md: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false, // 서버 그리기와 어긋나지 않게
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "내용을 적어 보세요  ( # 제목 · - 목록 · [] 할 일 · **굵게** )" }),
      Markdown.configure({ markedOptions: { breaks: true } }),
    ],
    content: initial,
    contentType: "markdown",
    editorProps: { attributes: { class: "memo-doc min-h-[60vh] outline-none", "aria-label": "내용" } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getMarkdown()),
  });
  return <EditorContent editor={editor} />;
}
