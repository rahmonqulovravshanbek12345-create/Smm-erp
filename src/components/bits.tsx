import { fmtMoney } from "../lib/dates";
import { LATE, PAYMENT_STATUS, PLATFORM_LABELS, PLATFORM_SHORT, postStatusMeta, taskStatusMeta } from "../lib/labels";
import type { PayStatus } from "../lib/finance";
import { isPostLate, isTaskLate, type Debt } from "../lib/rules";
import type { Platform, Post, Task } from "../lib/types";
import { Badge } from "./ui";

export function PostBadge({ post, today }: { post: Post; today: string }) {
  const m = postStatusMeta(post.status, !post.platforms.length);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {isPostLate(post, today) && <Badge tone={LATE.tone}>{LATE.label}</Badge>}
      <Badge tone={m.tone}>{m.label}</Badge>
    </span>
  );
}

export function TaskBadge({ task, today }: { task: Task; today: string }) {
  const late = isTaskLate(task, today);
  if (task.kind === "target") {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {late && <Badge tone={LATE.tone}>{LATE.label}</Badge>}
        {task.launchedAt ? <Badge tone="green">Reklama yoqildi</Badge> : <Badge tone="blue">Yangi</Badge>}
      </span>
    );
  }
  const m = taskStatusMeta(task.status);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {late && <Badge tone={LATE.tone}>{LATE.label}</Badge>}
      <Badge tone={m.tone}>{m.label}</Badge>
    </span>
  );
}

export function PayBadge({ status }: { status: PayStatus }) {
  const m = PAYMENT_STATUS[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function DebtBadge({ debt }: { debt: Debt }) {
  if (debt.amount <= 0) return null;
  return (
    <Badge tone="red">
      ● Qarz {fmtMoney(debt.amount)} · {debt.days} kun
    </Badge>
  );
}

/** Platforma ranglari (brend ranglariga yaqin). */
export const PLATFORM_BG: Record<Platform, string> = {
  instagram: "linear-gradient(135deg,#f58529,#dd2a7b 55%,#8134af)",
  telegram: "#229ED9",
  facebook: "#1877F2",
  tiktok: "#111111",
  youtube: "#E62117",
};

/** Kichik platforma belgilari: joylanmaganlari xira ko'rinadi (published berilsa). */
export function PlatformIcons({ platforms, published, size = 18 }: { platforms: Platform[]; published?: Partial<Record<Platform, string>>; size?: number }) {
  return (
    <span className="inline-flex gap-[3px] align-middle">
      {!platforms.length && (
        <span
          role="img"
          aria-label="Reklama uchun (target)"
          title="Reklama uchun (target)"
          className="inline-flex shrink-0 items-center justify-center rounded-[5px] bg-pink px-1 font-bold text-white"
          style={{ height: size, fontSize: Math.round(size * 0.45) }}
        >
          AD
        </span>
      )}
      {platforms.map((pl) => {
        const done = !published || Boolean(published[pl]);
        return (
          <span
            key={pl}
            role="img"
            aria-label={`${PLATFORM_LABELS[pl]}${published ? (done ? " — joylandi" : " — kutilmoqda") : ""}`}
            title={`${PLATFORM_LABELS[pl]}${published ? (done ? " — joylandi" : " — kutilmoqda") : ""}`}
            className={`inline-flex shrink-0 items-center justify-center rounded-[5px] font-bold text-white ${done ? "" : "opacity-40"}`}
            style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: PLATFORM_BG[pl] }}
          >
            {PLATFORM_SHORT[pl]}
          </span>
        );
      })}
    </span>
  );
}
