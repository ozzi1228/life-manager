"use client";

// 커리어 · 문서: 이력서·자기소개서·포트폴리오. 문서마다 버전, 버전마다 형식 여러 개(Notion 등 링크 · PDF·Word·PPT·한글 파일)
import { ChevronDown, ExternalLink, FileText, Link2, MoreHorizontal, Paperclip, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addDoc, deleteDoc, deleteDocVersion, editDoc, restoreDoc, restoreDocVersion, saveDocVersion } from "@/app/actions/career";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastUndo } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { DOC_KINDS, formatOf, type DocKind } from "@/lib/career";
import type { CareerDoc, VersionInput } from "@/server/career";

type Version = CareerDoc["versions"][number];
type Item = Version["items"][number];
const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.hwp,.hwpx";
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};
const hrefOf = (i: Item) => (i.type === "file" ? `/api/v1/files/${i.attachmentId}` : i.url!);
const nameOf = (i: Item) => i.name || (i.url ? i.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40) : "파일");

function ItemChip({ item }: { item: Item }) {
  const Icon = item.type === "file" ? FileText : Link2;
  return (
    <a href={hrefOf(item)} target="_blank" rel="noreferrer noopener" className="hover:bg-accent flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-sm" title={nameOf(item)}>
      <Icon className="text-muted-foreground size-3.5 shrink-0" />
      <Badge variant="secondary" className="shrink-0 px-1.5">
        {formatOf(item)}
      </Badge>
      <span className="min-w-0 truncate">{nameOf(item)}</span>
      <ExternalLink className="text-muted-foreground size-3 shrink-0" />
    </a>
  );
}

type DraftItem = { key: string; type: "link"; url: string; name: string } | { key: string; type: "file"; attachmentId: string; name: string };

function VersionForm({ doc, edit, close, done }: { doc: CareerDoc; edit?: Version; close: () => void; done: () => void }) {
  const [label, setLabel] = useState(edit?.label ?? `v${doc.versions.length + 1}`);
  const [note, setNote] = useState(edit?.note ?? "");
  const [items, setItems] = useState<DraftItem[]>(() =>
    (edit?.items ?? []).map((i) => (i.type === "link" ? { key: i.id, type: "link", url: i.url ?? "", name: i.name ?? "" } : { key: i.id, type: "file", attachmentId: i.attachmentId!, name: i.name ?? "파일" })),
  );
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    for (const f of [...(files ?? [])].slice(0, 10 - items.length)) {
      setUploading((n) => n + 1);
      const form = new FormData();
      form.set("file", f);
      form.set("purpose", "career_file");
      try {
        const r = await fetch("/api/v1/uploads", { method: "POST", body: form, headers: { "idempotency-key": crypto.randomUUID() } });
        const j = await r.json();
        if (!r.ok) toast(j.error?.message ?? "파일을 올리지 못했어요");
        else setItems((l) => [...l, { key: crypto.randomUUID(), type: "file", attachmentId: j.data.id, name: j.data.name }]);
      } catch {
        toast("파일을 올리지 못했어요. 연결을 확인해 주세요");
      }
      setUploading((n) => n - 1);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    const input: VersionInput = {
      label,
      note: note.trim() || null,
      items: items.flatMap((i): NonNullable<VersionInput["items"]> => (i.type === "link" ? (i.url.trim() ? [{ type: "link", url: i.url.trim(), name: i.name.trim() || null }] : []) : [{ type: "file", attachmentId: i.attachmentId }])),
    };
    const r = await saveDocVersion(doc.id, edit?.id ?? null, edit?.version ?? null, input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "버전을 고쳤어요" : "버전을 추가했어요");
    done();
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "버전 수정" : `${doc.title} · 새 버전`}
      footer={
        <Button className="w-full md:ml-auto md:w-auto" disabled={!label.trim() || busy || uploading > 0} onClick={save}>
          {busy && <Spinner />} 저장
        </Button>
      }
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="dv-label">버전 이름</FieldLabel>
          <Input id="dv-label" maxLength={60} placeholder="버전 이름을 입력하세요" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>형식</FieldLabel>
          <p className="text-muted-foreground text-caption">같은 버전을 Notion·PDF·Word처럼 여러 형식으로 함께 둘 수 있어요</p>
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-1.5">
                {i.type === "link" ? (
                  <>
                    <Link2 className="text-muted-foreground size-4 shrink-0" />
                    <Input aria-label="링크 주소" type="url" inputMode="url" placeholder="Notion·웹사이트 주소" className="min-w-0 flex-1" value={i.url} onChange={(e) => setItems((l) => l.map((x) => (x.key === i.key ? { ...i, url: e.target.value } : x)))} />
                    <Input aria-label="이름(선택)" placeholder="이름(선택)" maxLength={60} className="w-28" value={i.name} onChange={(e) => setItems((l) => l.map((x) => (x.key === i.key ? { ...i, name: e.target.value } : x)))} />
                  </>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <Badge variant="secondary">{formatOf({ type: "file", url: null, name: i.name })}</Badge>
                    <span className="truncate">{i.name}</span>
                  </span>
                )}
                <Button type="button" variant="ghost" size="icon" aria-label="빼기" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}>
                  <X />
                </Button>
              </li>
            ))}
            {Array.from({ length: uploading }, (_, k) => (
              <li key={`u${k}`} className="text-muted-foreground flex items-center gap-2 text-sm">
                <Spinner /> 올리는 중
              </li>
            ))}
          </ul>
          {items.length + uploading < 10 && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setItems((l) => [...l, { key: crypto.randomUUID(), type: "link", url: "", name: "" }])}>
                <Link2 /> 링크 추가
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}>
                <Paperclip /> 파일 올리기
              </Button>
              <input ref={file} type="file" accept={ACCEPT} multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
            </div>
          )}
          <p className="text-muted-foreground text-caption">파일: PDF·Word·PPT·한글, 30MB까지</p>
        </Field>
        <Field>
          <FieldLabel htmlFor="dv-note">메모</FieldLabel>
          <Textarea id="dv-note" maxLength={1000} placeholder="메모를 입력하세요" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

function DocForm({ edit, kind, close, done }: { edit?: CareerDoc; kind: DocKind; close: () => void; done: () => void }) {
  const [k, setK] = useState<DocKind>(edit?.kind ?? kind);
  const [title, setTitle] = useState(edit?.title ?? "");
  const [memo, setMemo] = useState(edit?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    const input = { kind: k, title, memo: memo.trim() || null };
    const r = edit ? await editDoc(edit.id, edit.version, input) : await addDoc(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.fields?.[0]?.message ?? r.error.message);
    done();
  }
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "문서 수정" : "새 문서"}
      size="sm"
      footer={
        <Button className="w-full md:ml-auto md:w-auto" disabled={!title.trim() || busy} onClick={save}>
          {busy && <Spinner />} 저장
        </Button>
      }
    >
      <FieldGroup className="gap-4">
        <ToggleGroup type="single" variant="outline" value={k} onValueChange={(x) => x && setK(x as DocKind)} aria-label="종류" className="w-full flex-wrap">
          {DOC_KINDS.map((d) => (
            <ToggleGroupItem key={d.value} value={d.value} className="flex-1">
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Field>
          <FieldLabel htmlFor="doc-title">이름</FieldLabel>
          <Input id="doc-title" autoFocus maxLength={60} placeholder="이름을 입력하세요" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="doc-memo">메모</FieldLabel>
          <Textarea id="doc-memo" maxLength={1000} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

function DocCard({ d, onVersion, onEdit }: { d: CareerDoc; onVersion: (v?: Version) => void; onEdit: () => void }) {
  const router = useRouter();
  const [latest, ...older] = d.versions;
  async function removeDocNow() {
    const r = await deleteDoc(d.id);
    if (!r.ok) return toast(r.error.message);
    router.refresh();
    toastUndo(`${d.title}을(를) 휴지통으로 옮겼어요`, async () => {
      await restoreDoc(d.id);
      router.refresh();
    });
  }
  async function removeVersion(v: Version) {
    const r = await deleteDocVersion(v.id);
    if (!r.ok) return toast(r.error.message);
    router.refresh();
    toastUndo(`${v.label}을(를) 휴지통으로 옮겼어요`, async () => {
      await restoreDocVersion(v.id);
      router.refresh();
    });
  }
  const versionRow = (v: Version, main: boolean) => (
    <div key={v.id} className={main ? "space-y-2" : "space-y-1.5 border-t pt-2"}>
      <div className="flex items-center gap-2">
        <span className={main ? "font-medium" : "text-sm"}>{v.label}</span>
        <span className="text-muted-foreground text-caption tabular-nums">{when(v.createdAt)}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto size-8 max-md:size-10" aria-label={`${v.label} 더 보기`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onVersion(v)}>수정</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive-text" onSelect={() => removeVersion(v)}>
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {v.items.length > 0 ? <div className="flex flex-wrap gap-1.5">{v.items.map((i) => <ItemChip key={i.id} item={i} />)}</div> : <p className="text-muted-foreground text-caption">링크·파일이 없어요</p>}
      {v.note && <p className="text-muted-foreground text-sm whitespace-pre-wrap">{v.note}</p>}
    </div>
  );
  return (
    <li className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold">{d.title}</h3>
        <Button variant="outline" size="sm" onClick={() => onVersion()}>
          <Plus /> 버전
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`${d.title} 더 보기`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>이름·메모 수정</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive-text" onSelect={removeDocNow}>
              문서 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {d.memo && <p className="text-muted-foreground text-sm">{d.memo}</p>}
      {latest ? versionRow(latest, true) : <p className="text-muted-foreground text-sm">아직 버전이 없어요. 링크나 파일을 넣어 첫 버전을 만들어 보세요</p>}
      {older.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2">
              <ChevronDown /> 이전 버전 {older.length}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">{older.map((v) => versionRow(v, false))}</CollapsibleContent>
        </Collapsible>
      )}
    </li>
  );
}

export function DocList({ docs }: { docs: CareerDoc[] }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [docForm, setDocForm] = useState<{ edit?: CareerDoc; kind: DocKind } | null>(null);
  const [verForm, setVerForm] = useState<{ doc: CareerDoc; edit?: Version } | null>(null);
  const refresh = () => router.refresh();

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <p className="text-muted-foreground text-sm">버전마다 Notion 링크와 PDF·Word·PPT 파일을 함께 둘 수 있어요</p>
        <Button className="ml-auto shrink-0" variant={mobile ? "outline" : "default"} onClick={() => setDocForm({ kind: "resume" })}>
          <Plus /> 새 문서
        </Button>
      </div>
      {docs.length === 0 ? (
        <EmptyState
          pet="komong"
          title="이력서·자소서·포트폴리오를 모아 두세요"
          description="문서마다 버전을 쌓고, 버전마다 링크와 파일을 함께 둘 수 있어요."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {DOC_KINDS.slice(0, 3).map((k) => (
                <Button key={k.value} variant="outline" className="rounded-full" onClick={() => setDocForm({ kind: k.value })}>
                  {k.label}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        DOC_KINDS.map((k) => {
          const list = docs.filter((d) => d.kind === k.value);
          if (!list.length) return null;
          return (
            <section key={k.value} className="space-y-2">
              <h2 className="text-muted-foreground text-sm font-semibold">
                {k.label} {list.length}
              </h2>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {list.map((d) => (
                  <DocCard key={d.id} d={d} onVersion={(v) => setVerForm({ doc: d, edit: v })} onEdit={() => setDocForm({ edit: d, kind: d.kind })} />
                ))}
              </ul>
            </section>
          );
        })
      )}
      {docForm && (
        <DocForm
          edit={docForm.edit}
          kind={docForm.kind}
          close={() => setDocForm(null)}
          done={() => {
            setDocForm(null);
            refresh();
          }}
        />
      )}
      {verForm && (
        <VersionForm
          key={verForm.edit?.id ?? verForm.doc.id}
          doc={verForm.doc}
          edit={verForm.edit}
          close={() => setVerForm(null)}
          done={() => {
            setVerForm(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
