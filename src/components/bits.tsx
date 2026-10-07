import { fmtMoney } from "../lib/dates";
import { LATE, PAYMENT_STATUS, postStatusMeta, taskStatusMeta } from "../lib/labels";
import { isPostLate, isTaskLate, paymentStatus, type Debt } from "../lib/rules";
import type { Payment, Post, Task } from "../lib/types";
import { Badge } from "./ui";

export function PostBadge({ post, today }: { post: Post; today: string }) {
  const m = postStatusMeta(post.status);
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

export function PayBadge({ pay, today }: { pay: Payment; today: string }) {
  const m = PAYMENT_STATUS[paymentStatus(pay, today)];
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
