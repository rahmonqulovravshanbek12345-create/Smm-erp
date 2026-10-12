// Yagona haqiqiy holat: xotirada saqlanadi, har bir o'zgarish navbat bilan (bir vaqtda bittadan) qo'llanadi
// va darhol bazaga yoziladi. Xatolik bo'lsa — o'zgarish bekor (nusxa ustida ishlanadi).
import { makeCtx, withReplayIds, type Outgoing } from "../../src/lib/ctx";
import { nowHM, todayISO } from "../../src/lib/dates";
import { buildBlank } from "../../src/lib/blank";
import { normalizeState } from "../../src/lib/normalize";
import { apply, type ActionArgs, type ActionName, type ActionResult } from "../../src/lib/registry";
import { syncAll } from "../../src/lib/store-sync";
import type { ErpState, User } from "../../src/lib/types";
import type { Db } from "./db";

/** Foydalanuvchiga ko'rsatiladigan xato (amal qoidasi buzildi) — ichki xatolardan farqli. */
export class UserError extends Error {}

export interface Applied<T> {
  value: T;
  state: ErpState;
  version: number;
  outbox: Outgoing[];
}

export class StateStore {
  private state: ErpState | null = null;
  private version = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private db: Db) {}

  /** Bazadan o'qiydi (server ishga tushganda). Holat bo'lmasa — null (avval `init` buyrug'i kerak). */
  async load(): Promise<boolean> {
    const { rows } = await this.db.query<{ version: string; data: unknown }>("SELECT version, data FROM app_state WHERE id = 1");
    const row = rows[0];
    if (!row) {
      this.state = null;
      return false;
    }
    const s = normalizeState(row.data, buildBlank(todayISO()));
    if (!s) throw new Error("Bazadagi holat buzilgan — zaxiradan tiklang");
    this.state = s;
    this.version = Number(row.version);
    return true;
  }

  get ready() {
    return this.state !== null;
  }

  /** Joriy holat (faqat o'qish uchun — o'zgartirmang). */
  current(): { state: ErpState; version: number } {
    if (!this.state) throw new Error("Tizim hali sozlanmagan");
    return { state: this.state, version: this.version };
  }

  /** Navbat: o'zgarishlar bir-birining ustiga tushmaydi. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const job = this.queue.then(fn, fn);
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async persist(next: ErpState, prevVersion: number): Promise<number> {
    const version = prevVersion + 1;
    const r = await this.db.query("UPDATE app_state SET data = $1, version = $2, updated_at = now() WHERE id = 1 AND version = $3", [
      JSON.stringify(next),
      version,
      prevVersion,
    ]);
    if (r.rowCount !== 1) {
      // Boshqa jarayon (masalan, zaxiradan tiklash) holatni o'zgartirgan — qayta o'qiymiz
      await this.load();
      throw new UserError("Ma'lumot yangilandi — qayta urinib ko'ring");
    }
    this.state = next;
    this.version = version;
    return version;
  }

  /** Foydalanuvchi amali: huquq va argumentlar oldindan tekshirilgan bo'lishi kerak. */
  run<N extends ActionName>(
    name: N,
    args: ActionArgs<N>,
    userId: string,
    o: { ids?: unknown; check?: (me: User, s: ErpState) => string | null } = {},
  ): Promise<Applied<ActionResult<N>>> {
    return this.serial(async () => {
      const { state, version } = this.current();
      const s = structuredClone(state);
      const me = s.users.find((u) => u.id === userId);
      if (!me?.active) throw new UserError("Akkaunt faol emas");
      const denied = o.check?.(me, s);
      if (denied) throw new UserError(denied);
      const today = todayISO();
      const { ctx, outbox } = makeCtx(s, me, { today, now: nowHM() });
      let value: ActionResult<N>;
      try {
        value = withReplayIds(s, o.ids, () => apply(ctx, name, args));
      } catch (e) {
        // Amal qoidasi (oddiy Error) — foydalanuvchiga ko'rsatiladi; boshqa xatolar — ichki
        if (e instanceof Error && e.constructor === Error) throw new UserError(e.message);
        throw e;
      }
      syncAll(s, today);
      const v = await this.persist(s, version);
      return { value, state: s, version: v, outbox };
    });
  }

  /** Tizim ishi (jadval, integratsiya): holatni o'zgartiradi. `fn` false qaytarsa — saqlanmaydi. */
  system(fn: (s: ErpState) => boolean | void): Promise<{ changed: boolean; version: number }> {
    return this.serial(async () => {
      const { state, version } = this.current();
      const s = structuredClone(state);
      const before = JSON.stringify(s);
      const res = fn(s);
      if (res === false || JSON.stringify(s) === before) return { changed: false, version };
      return { changed: true, version: await this.persist(s, version) };
    });
  }

  /** Bir martalik: bo'sh holat yaratish (`init` buyrug'i). */
  async create(s: ErpState): Promise<void> {
    await this.db.query("INSERT INTO app_state (id, version, data) VALUES (1, 1, $1)", [JSON.stringify(s)]);
    this.state = s;
    this.version = 1;
  }

  /** Tizim nomidan amal (masalan, Meta'dan kelgan hisobotlarni yozish) — birinchi faol admin nomidan. */
  async runAsSystem<N extends ActionName>(name: N, args: ActionArgs<N>): Promise<Applied<ActionResult<N>>> {
    const admin = this.current().state.users.find((u) => u.role === "admin" && u.active) ?? this.current().state.users.find((u) => u.active);
    if (!admin) throw new Error("Faol foydalanuvchi yo'q");
    return this.run(name, args, admin.id);
  }
}
