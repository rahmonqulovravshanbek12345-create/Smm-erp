import { useState } from "react";
import * as act from "../lib/actions";
import { addDays, fmtDate, fmtDeadline } from "../lib/dates";
import { isAdType, typesFor } from "../lib/content";
import { PLATFORMS, PLATFORM_LABELS, PLATFORM_SHORT, POST_STATUSES, TASK_KIND_LABELS, postStatusMeta } from "../lib/labels";
import { hasAds, hasContent } from "../lib/services";
import { access, canEdit } from "../lib/permissions";
import { isPostLate, workBlockedReason } from "../lib/rules";
import { useErp, useLookup } from "../lib/store";
import type { Platform, Post, PostStatus, TaskKind } from "../lib/types";
import { PLATFORM_BG, PostBadge, TaskBadge } from "./bits";
import { PostJourney } from "./ProjectJourney";
import { Banner, Button, Field, Input, LinkOut, Modal, Select, Textarea, userOptions } from "./ui";

// ---------- Post kartasi ----------

const PRODUCTION: PostStatus[] = ["plan", "shoot", "editing", "design"];

/** Ro'yxatda faqat ruxsat etilgan qadamlar: ishlab chiqarish bosqichlari va tasdiq zinasining keyingi pog'onasi. */
function statusChoices(cur: PostStatus, approver: boolean): PostStatus[] {
  const next: PostStatus[] = PRODUCTION.includes(cur)
    ? ["internal"]
    : cur === "internal"
      ? approver
        ? ["client"]
        : []
      : cur === "client"
        ? ["approved"]
        : cur === "approved"
          ? ["published"]
          : [];
  return [...new Set<PostStatus>([...PRODUCTION, cur, ...next])];
}

export function PostModal({ postId, newFor, onClose }: { postId?: string; newFor?: { projectId: string; date: string }; onClose: () => void }) {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const existing = state.posts.find((p) => p.id === postId);
  const projectId = existing?.projectId ?? newFor?.projectId ?? "";
  const project = look.project(projectId);
  const types = typesFor(state, project).filter((t) => t.active || t.id === existing?.typeId);
  const [form, setForm] = useState(() => ({
    projectId,
    date: existing?.date ?? newFor?.date ?? today,
    platforms: existing?.platforms ?? (["instagram"] as Platform[]),
    typeId: existing?.typeId ?? types[0]?.id ?? "ct_video",
    platformNotes: existing?.platformNotes ?? ({} as Partial<Record<Platform, string>>),
    topic: existing?.topic ?? "",
    script: existing?.script ?? "",
    forTarget: existing?.forTarget ?? false,
    assigneeId: existing?.assigneeId ?? project?.smmId ?? me.id,
  }));
  const [returnNote, setReturnNote] = useState("");
  const [notesOpen, setNotesOpen] = useState(() => Object.values(existing?.platformNotes ?? {}).some(Boolean));
  const format = types.find((t) => t.id === form.typeId)?.format ?? existing?.format ?? "video";
  const ad = isAdType(state, form.typeId);
  const needPlatforms = !ad && !form.platforms.length;
  const [sub, setSub] = useState<null | TaskKind | "shoot">(null);

  const editable = canEdit(me.role, "content");
  const isBoss = access(me.role, "content") === "approve" || access(me.role, "content") === "full";
  const blocked = project ? workBlockedReason(state, project) : null;
  const tasks = state.tasks.filter((t) => t.postId === postId);
  const shoot = state.shoots.find((s) => postId && s.postIds.includes(postId));
  const projects = state.projects.filter((p) => hasContent(p) && (me.role !== "smm" || p.smmId === me.id));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const togglePlatform = (pl: Platform) =>
    set("platforms", form.platforms.includes(pl) ? form.platforms.filter((x) => x !== pl) : PLATFORMS.filter((x) => x === pl || form.platforms.includes(x)));
  const save = () => {
    if (!form.topic.trim() || !form.projectId || needPlatforms) return;
    const platformNotes = Object.fromEntries(Object.entries(form.platformNotes).filter(([k, v]) => v?.trim() && form.platforms.includes(k as Platform)));
    const ok = run(
      (c) =>
        act.savePost(c, {
          ...form,
          format,
          platformNotes,
          publishedOn: existing?.publishedOn,
          publishedAt: existing?.publishedAt,
          id: existing?.id,
        }),
      existing ? "Saqlandi" : "Kontent rejaga qo'shildi",
    );
    if (ok) onClose();
  };
  const step = (fn: (c: Parameters<typeof act.sendToInternal>[0]) => void, msg: string, close = false) => {
    if (run(fn, msg) && close) onClose();
  };

  if (sub === "shoot" && existing) return <ShootModal projectId={projectId} postIds={[existing.id]} onClose={() => setSub(null)} />;
  if (sub && sub !== "shoot" && existing) return <TaskModal kind={sub} projectId={projectId} post={existing} onClose={() => setSub(null)} />;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={existing ? existing.topic : "Yangi post"}
      footer={
        editable ? (
          <>
            {existing && (
              <Button variant="danger" onClick={() => run((c) => act.deletePost(c, existing.id), "Post o'chirildi") && onClose()}>
                O'chirish
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button variant="primary" onClick={save} disabled={!form.topic.trim() || needPlatforms || (!existing && Boolean(blocked))}>
              Saqlash
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Yopish</Button>
        )
      }
    >
      {!existing && blocked && <Banner tone="red">{blocked}</Banner>}
      {existing && <PostJourney post={existing} today={today} />}
      {existing && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <PostBadge post={existing} today={today} />
          {isPostLate(existing, today) && <span className="text-xs text-red">Post sanasi o'tib ketgan</span>}
        </div>
      )}
      {existing?.reviewNote && <Banner tone="amber">Marketolog izohi: {existing.reviewNote}</Banner>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loyiha">
          <Select
            value={form.projectId}
            disabled={!editable || Boolean(existing)}
            onChange={(e) => set("projectId", e.target.value)}
            options={[{ value: "", label: "Tanlang…" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </Field>
        <Field label="Sana">
          <Input type="date" value={form.date} disabled={!editable} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Turi" hint="Oylik topshiriqda shu tur bo'yicha sanaladi">
          <Select
            value={form.typeId}
            disabled={!editable}
            onChange={(e) => set("typeId", e.target.value)}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        {ad ? (
          <div className="sm:col-span-2">
            <Banner tone="amber">
              Reklama uchun video: platformalarga joylanmaydi. Syomka, montaj va tasdiqdan keyin «Targetologga berish» bosiladi — targetologga TZ ketadi va
              rejada bajarilgan deb sanaladi.
            </Banner>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-[13px] font-medium text-label2" id="pl-label">
              Platformalar — bir nechtasini tanlash mumkin
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pl-label">
              {PLATFORMS.map((pl) => {
                const on = form.platforms.includes(pl);
                return (
                  <button
                    key={pl}
                    type="button"
                    disabled={!editable}
                    aria-pressed={on}
                    onClick={() => togglePlatform(pl)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                      on ? "bg-accent/12 text-accent ring-[1.5px] ring-accent/60" : "bg-fill text-label2"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-5 w-5 items-center justify-center rounded-[6px] text-[9px] font-bold text-white"
                      style={{ background: PLATFORM_BG[pl] }}
                    >
                      {PLATFORM_SHORT[pl]}
                    </span>
                    {PLATFORM_LABELS[pl]}
                    {on && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>
            {!form.platforms.length && <p className="mt-1 text-xs text-red">Kamida bitta platformani tanlang</p>}
            {form.platforms.length > 1 && (
              <p className="mt-1 text-xs text-label2">Rejada va oylik topshiriqda 1 ta post deb sanaladi — syomka, montaj va tasdiq bir marta.</p>
            )}
          </div>
        )}
        <Field label="Mavzu" className="sm:col-span-2">
          <Input value={form.topic} disabled={!editable} onChange={(e) => set("topic", e.target.value)} placeholder="Masalan: Yangi kolleksiya obzori" />
        </Field>
        <Field label={form.platforms.length > 1 ? "Ssenariy yoki matn (hamma platforma uchun umumiy)" : "Ssenariy yoki matn"} className="sm:col-span-2">
          <Textarea rows={4} value={form.script} disabled={!editable} onChange={(e) => set("script", e.target.value)} />
        </Field>
        {form.platforms.length > 1 && (
          <div className="sm:col-span-2">
            {!notesOpen ? (
              editable && (
                <Button size="sm" onClick={() => setNotesOpen(true)}>
                  + Platforma uchun alohida izoh
                </Button>
              )
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {form.platforms.map((pl) => (
                  <Field key={pl} label={`${PLATFORM_LABELS[pl]} uchun izoh`}>
                    <Input
                      value={form.platformNotes[pl] ?? ""}
                      disabled={!editable}
                      onChange={(e) => set("platformNotes", { ...form.platformNotes, [pl]: e.target.value })}
                      placeholder="Masalan: qisqa versiya, boshqa xeshteglar"
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>
        )}
        <Field label="Mas'ul">
          <Select
            value={form.assigneeId}
            disabled={!editable}
            onChange={(e) => set("assigneeId", e.target.value)}
            options={userOptions(look.usersByRole("smm"))}
          />
        </Field>
        {!ad && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-label/80">
            <input type="checkbox" checked={form.forTarget} disabled={!editable} onChange={(e) => set("forTarget", e.target.checked)} />
            Target reklama uchun ham
          </label>
        )}
      </div>

      {existing && (
        <>
          <div className="mt-5 rounded-[14px] bg-fill bg-fill p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-label2">Ish jarayoni</div>
            <div className="flex flex-wrap gap-2">
              {editable && ["plan", "shoot", "editing", "design"].includes(existing.status) && (
                <Button variant="primary" size="sm" onClick={() => step((c) => act.sendToInternal(c, existing.id), "Marketologga tasdiqqa yuborildi", true)}>
                  Ichki tasdiqqa yuborish →
                </Button>
              )}
              {isBoss && existing.status === "internal" && (
                <Button variant="primary" size="sm" onClick={() => step((c) => act.approveInternal(c, existing.id), "Tasdiqlandi", true)}>
                  ✓ Tasdiqlash
                </Button>
              )}
              {editable && existing.status === "client" && (
                <Button variant="primary" size="sm" onClick={() => step((c) => act.clientApproved(c, existing.id), "Mijoz tasdig'i belgilandi")}>
                  ✓ Mijoz tasdiqladi
                </Button>
              )}
              {editable && existing.status === "approved" && !existing.platforms.length && (
                <Button variant="primary" size="sm" onClick={() => step((c) => act.handToTarget(c, existing.id), "Targetologga berildi — TZ ketdi", true)}>
                  → Targetologga berish
                </Button>
              )}
              {editable && existing.status === "approved" && existing.platforms.length > 0 && (
                <Button variant="primary" size="sm" onClick={() => step((c) => act.publishPost(c, existing.id), "Hamma platformada joylandi", true)}>
                  ⬆ {existing.platforms.length > 1 ? "Hammasida joylandi" : "Joylandi"}
                </Button>
              )}
              {editable && (
                <Select
                  value={existing.status}
                  onChange={(e) => run((c) => act.setPostStatus(c, existing.id, e.target.value as PostStatus), "Status yangilandi")}
                  options={POST_STATUSES.filter((s) => statusChoices(existing.status, isBoss).includes(s.id)).map((s) => ({
                    value: s.id,
                    label: `Status: ${postStatusMeta(s.id, !existing.platforms.length).label}`,
                  }))}
                  className="!w-auto !py-1 !text-xs"
                />
              )}
            </div>
            {existing.platforms.length > 0 &&
              (existing.status === "approved" || existing.status === "published" || Object.keys(existing.publishedOn ?? {}).length > 0) && (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-label2">Joylash holati</div>
                  <ul className="divide-y divide-sep rounded-[12px] bg-elevated/70">
                    {existing.platforms.map((pl) => {
                      const at = existing.publishedOn?.[pl];
                      return (
                        <li key={pl} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="inline-flex h-5 w-5 items-center justify-center rounded-[6px] text-[9px] font-bold text-white"
                              style={{ background: PLATFORM_BG[pl] }}
                            >
                              {PLATFORM_SHORT[pl]}
                            </span>
                            {PLATFORM_LABELS[pl]}
                            {existing.platformNotes?.[pl] && <span className="text-xs text-label2">· {existing.platformNotes[pl]}</span>}
                          </span>
                          {at ? (
                            <span className="flex items-center gap-1.5">
                              <span className="rounded-full bg-green/15 px-2.5 py-0.5 text-xs font-semibold text-green">✓ Joylandi · {fmtDate(at)}</span>
                              {editable && (
                                <button
                                  type="button"
                                  className="text-xs text-label2 underline"
                                  onClick={() => run((c) => act.unpublishPlatform(c, existing.id, pl), "Belgi olib tashlandi")}
                                >
                                  bekor
                                </button>
                              )}
                            </span>
                          ) : editable && existing.status === "approved" && existing.platforms.length > 1 ? (
                            <Button size="sm" onClick={() => run((c) => act.publishPost(c, existing.id, pl), `${PLATFORM_LABELS[pl]}: joylandi`)}>
                              Joylandi
                            </Button>
                          ) : (
                            <span className="rounded-full bg-orange/15 px-2.5 py-0.5 text-xs font-semibold text-orange">Kutilmoqda</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            {isBoss && existing.status === "internal" && (
              <div className="mt-3 flex gap-2">
                <Input placeholder="Qaytarish izohi (nima tuzatilsin)" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
                <Button variant="danger" onClick={() => step((c) => act.returnPost(c, existing.id, returnNote), "Izoh bilan qaytarildi", true)}>
                  Qaytarish
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-label2">TZ va ishlab chiqarish</span>
              {editable && (
                <div className="flex flex-wrap gap-1.5">
                  {existing.format === "video" && !shoot && (
                    <Button size="sm" onClick={() => setSub("shoot")} disabled={Boolean(blocked)}>
                      + Syomka
                    </Button>
                  )}
                  {existing.format === "video" && (
                    <Button size="sm" onClick={() => setSub("montaj")} disabled={Boolean(blocked)}>
                      + Montaj TZ
                    </Button>
                  )}
                  {existing.format !== "text" && (
                    <Button size="sm" onClick={() => setSub("dizayn")} disabled={Boolean(blocked)}>
                      + Dizayn TZ
                    </Button>
                  )}
                  {existing.platforms.length > 0 && (
                    <Button size="sm" onClick={() => setSub("target")} disabled={Boolean(blocked)}>
                      + Targetga berish
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="divide-y divide-sep rounded-[14px] bg-fill">
              {shoot && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    Syomka: {fmtDate(shoot.date)} {shoot.time}, {shoot.location} · {look.userName(shoot.operatorId)}
                  </span>
                  {shoot.footageLink ? <LinkOut href={shoot.footageLink}>kadrlar</LinkOut> : <span className="text-xs text-orange">kutilmoqda</span>}
                </div>
              )}
              {tasks.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="text-label2">{TASK_KIND_LABELS[t.kind]}:</span> {t.title} · {look.userName(t.assigneeId)} · {fmtDeadline(t)}
                  </span>
                  <span className="flex items-center gap-2">
                    {t.resultLink && <LinkOut href={t.resultLink}>natija</LinkOut>}
                    <TaskBadge task={t} today={today} />
                  </span>
                </div>
              ))}
              {!shoot && tasks.length === 0 && <div className="px-3 py-3 text-sm text-label2">Hali TZ berilmagan</div>}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------- TZ berish ----------

const KIND_ROLE = { montaj: "montajyor", dizayn: "dizayner", target: "targetolog" } as const;

export function TaskModal({ kind, projectId, post, onClose }: { kind: TaskKind; projectId?: string; post?: Post; onClose: () => void }) {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const shoot = post ? state.shoots.find((s) => s.postIds.includes(post.id)) : undefined;
  const projects = state.projects.filter(
    (p) => p.status === "active" && (kind === "target" ? hasAds(p) : hasContent(p)) && (me.role !== "smm" || p.smmId === me.id),
  );
  const [f, setF] = useState(() => {
    const pid = projectId ?? projects[0]?.id ?? "";
    const prj = look.project(pid);
    return {
      projectId: pid,
      postId: post?.id ?? "",
      assigneeId:
        kind === "target"
          ? (look.usersByRole("targetolog").find((u) => u.id === prj?.targetologId)?.id ?? look.usersByRole("targetolog")[0]?.id ?? "")
          : (look.usersByRole(KIND_ROLE[kind])[0]?.id ?? ""),
      title: post ? `${post.topic}${kind === "dizayn" ? " — oblojka" : ""}` : "",
      brief: "",
      script: post?.script ?? "",
      footageLink: shoot?.footageLink ?? "",
      files: "",
      designType: (kind === "dizayn" && post?.format === "video" ? "cover" : "post") as "post" | "cover",
      deadline: addDays(today, kind === "target" ? 1 : 2),
      deadlineTime: "18:00",
    };
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const prj = look.project(f.projectId);
  const blocked = prj ? workBlockedReason(state, prj) : null;
  const projectPosts = state.posts.filter((p) => p.projectId === f.projectId && p.status !== "published");

  const save = () => {
    const ok = run(
      (c) =>
        act.createTask(c, {
          kind,
          projectId: f.projectId,
          postId: f.postId || undefined,
          shootId: shoot?.id,
          assigneeId: f.assigneeId,
          title: f.title.trim(),
          brief: f.brief.trim(),
          script: kind === "montaj" ? f.script : undefined,
          footageLink: kind === "montaj" ? f.footageLink || undefined : undefined,
          files: kind !== "montaj" ? f.files : undefined,
          designType: kind === "dizayn" ? f.designType : undefined,
          deadline: f.deadline,
          deadlineTime: f.deadlineTime || undefined,
        }),
      `TZ yuborildi: ${look.userName(f.assigneeId)}ga bildirishnoma ketdi`,
    );
    if (ok) onClose();
  };

  const title = kind === "montaj" ? "Montajyorga TZ" : kind === "dizayn" ? "Dizaynerga TZ" : "Targetologga material berish";
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.title.trim() || !f.assigneeId || !f.projectId || Boolean(blocked)}>
            TZ yuborish
          </Button>
        </>
      }
    >
      {blocked && <Banner tone="red">{blocked}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loyiha">
          <Select
            value={f.projectId}
            disabled={Boolean(post)}
            onChange={(e) => set("projectId", e.target.value)}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="Post (ixtiyoriy)">
          <Select
            value={f.postId}
            disabled={Boolean(post)}
            onChange={(e) => set("postId", e.target.value)}
            options={[{ value: "", label: "— bog'lanmagan —" }, ...projectPosts.map((p) => ({ value: p.id, label: `${fmtDate(p.date)} · ${p.topic}` }))]}
          />
        </Field>
        <Field label="Ijrochi">
          <Select
            value={f.assigneeId}
            onChange={(e) => set("assigneeId", e.target.value)}
            options={userOptions(look.usersByRole(KIND_ROLE[kind]), "Tanlang…")}
          />
        </Field>
        <Field label="Deadline (sana va soat)">
          <div className="flex gap-2">
            <Input type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} aria-label="Deadline sanasi" />
            <Input type="time" value={f.deadlineTime} onChange={(e) => set("deadlineTime", e.target.value)} aria-label="Deadline soati" className="!w-32" />
          </div>
        </Field>
        <Field label="Vazifa nomi" className="sm:col-span-2">
          <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        {kind === "dizayn" && (
          <Field label="Turi">
            <Select
              value={f.designType}
              onChange={(e) => set("designType", e.target.value as "post" | "cover")}
              options={[
                { value: "post", label: "Post dizayni" },
                { value: "cover", label: "Oblojka" },
              ]}
            />
          </Field>
        )}
        <Field label={kind === "target" ? "Reklama vazifasi (maqsad, geo, byudjet)" : "TZ"} className="sm:col-span-2">
          <Textarea rows={3} value={f.brief} onChange={(e) => set("brief", e.target.value)} />
        </Field>
        {kind === "montaj" && (
          <>
            <Field label="Ssenariy" className="sm:col-span-2">
              <Textarea rows={3} value={f.script} onChange={(e) => set("script", e.target.value)} />
            </Field>
            <Field label="Kadrlar havolasi (Google Drive)" className="sm:col-span-2" hint="Syomka operatori kadrlarni topshirganda avtomatik to'ldiriladi">
              <Input value={f.footageLink} onChange={(e) => set("footageLink", e.target.value)} placeholder="https://drive.google.com/…" />
            </Field>
          </>
        )}
        {kind !== "montaj" && (
          <Field label={kind === "target" ? "Target video va rasmlar (Google Drive)" : "Fayllar / referenslar (Google Drive)"} className="sm:col-span-2">
            <Input value={f.files} onChange={(e) => set("files", e.target.value)} placeholder="https://drive.google.com/…" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ---------- Syomka belgilash ----------

export function ShootModal({ projectId, postIds, onClose }: { projectId?: string; postIds?: string[]; onClose: () => void }) {
  const { state, me, run, today } = useErp();
  const look = useLookup();
  const projects = state.projects.filter((p) => p.status === "active" && hasContent(p) && (me.role !== "smm" || p.smmId === me.id));
  const [f, setF] = useState(() => ({
    projectId: projectId ?? projects[0]?.id ?? "",
    date: addDays(today, 2),
    time: "11:00",
    location: "",
    videoCount: Math.max(1, postIds?.length ?? 3),
    postIds: postIds ?? ([] as string[]),
    operatorId: look.usersByRole("syomka")[0]?.id ?? "",
    note: "",
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const prj = look.project(f.projectId);
  const blocked = prj ? workBlockedReason(state, prj) : null;
  const candidates = state.posts.filter((p) => p.projectId === f.projectId && p.format === "video" && p.status !== "published");

  const save = () => {
    if (run((c) => act.createShoot(c, f), "Syomka belgilandi — operatorga bildirishnoma ketdi")) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Syomka belgilash"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button variant="primary" onClick={save} disabled={!f.location.trim() || !f.operatorId || Boolean(blocked)}>
            Belgilash
          </Button>
        </>
      }
    >
      {blocked && <Banner tone="red">{blocked}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loyiha">
          <Select
            value={f.projectId}
            disabled={Boolean(projectId)}
            onChange={(e) => setF((x) => ({ ...x, projectId: e.target.value, postIds: [] }))}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="Syomka operatori">
          <Select value={f.operatorId} onChange={(e) => set("operatorId", e.target.value)} options={userOptions(look.usersByRole("syomka"))} />
        </Field>
        <Field label="Sana">
          <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Vaqt">
          <Input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} />
        </Field>
        <Field label="Joy" className="sm:col-span-2">
          <Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Manzil, mo'ljal" />
        </Field>
        <Field label="Nechta video olinadi">
          <Input type="number" min={1} value={f.videoCount} onChange={(e) => set("videoCount", Number(e.target.value) || 1)} />
        </Field>
        <Field label="Izoh">
          <Input value={f.note} onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium text-label2">Bog'langan postlar</div>
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-[14px] bg-fill p-2">
          {candidates.length === 0 && <div className="text-sm text-label2">Video postlar yo'q</div>}
          {candidates.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.postIds.includes(p.id)}
                onChange={(e) => set("postIds", e.target.checked ? [...f.postIds, p.id] : f.postIds.filter((x) => x !== p.id))}
              />
              {fmtDate(p.date)} · {p.topic}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-label2">Operatorga darhol va syomkadan 1 kun oldin eslatma ketadi.</p>
      </div>
    </Modal>
  );
}
