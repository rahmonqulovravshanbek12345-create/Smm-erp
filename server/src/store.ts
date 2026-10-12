// Yagona haqiqiy holat: xotirada saqlanadi, har bir o'zgarish navbat bilan (bir vaqtda bittadan) qo'llanadi
// va darhol bazaga yoziladi. Xatolik bo'lsa — o'zgarish bekor (nusxa ustida ishlanadi).
import { makeCtx, withReplayIds, type Outgoing } from "../../src/lib/ctx";
import { nowHM, todayISO } from "../../src/lib/dates";
import { buildBlank } from "../../src/lib/blank";
import { normalizeState } from "../../src/lib/normalize";
import { apply, type ActionArgs, type ActionName, type ActionResult } from "../../src/lib/registry";
import { syncAll } from "../../src/lib/store-sync";
import type { ErpState, User } from "../../src/lib/types";
import type { Sealer } from "./crypto";
import type { Db } from "./db";

/** Holatning eng katta hajmi (oddiy ishda yiliga ~20 MB o'sadi; eski yozuvlar jadval bo'yicha qisqartiriladi). */
export const MAX_STATE_BYTES = 150 * 1024 * 1024;

/** Foydalanuvchiga ko'rsatiladigan xato (amal qoidasi buzildi) — ichki xatolardan farqli. */
export class UserError extends Error {}
/** Xodimning bugungi ma'lumot kiritish chegarasi tugadi. */
export class QuotaError extends UserError {}

// ---------- Maxfiy kalitlar bazada shifrlangan ----------
// Telegram va Meta tokenlari xotirada ochiq (ishlatish uchun), bazada va zaxira nusxalarda esa SECRET_KEY bilan
// shifrlangan (AES-256-GCM) holda turadi: zaxira yoki baza sizib chiqsa ham tokenlar ochilmaydi.

const ENC = "enc:";
type Secrets = { telegram?: { botToken?: unknown }; integrations?: { meta?: { token?: unknown } } };

function mapSecrets<T>(data: T, fn: (v: string) => string): T {
  const st = (data as { settings?: Secrets }).settings;
  if (!st) return data;
  const tg = st.telegram;
  const meta = st.integrations?.meta;
  const conv = (v: unknown) => (typeof v === "string" && v ? fn(v) : v);
  return {
    ...data,
    settings: {
      ...st,
      ...(tg ? { telegram: { ...tg, botToken: conv(tg.botToken) } } : {}),
      ...(st.integrations && meta ? { integrations: { ...st.integrations, meta: { ...meta, token: conv(meta.token) } } } : {}),
    },
  };
}

export interface Applied<T> {
  value: T;
  state: ErpState;
  version: number;
  outbox: Outgoing[];
}

export interface StoreOptions {
  /** Tokenlarni bazada shifrlash uchun (serverda doim beriladi). */
  sealer?: Sealer;
  /** Shifrlangan token ochilmasa (masalan, SECRET_KEY boshqa) — ogohlantirish. */
  warn?: (msg: string) => void;
}

export class StateStore {
  private state: ErpState | null = null;
  private version = 0;
  private queue: Promise<unknown> = Promise.resolve();
  /** Bazadagi holatning hajmi (bayt). */
  private size = 0;
  /** Xodimlar bugun qo'shgan ma'lumot hajmi (bayt) — bir xodim tizimni to'ldirib tashlay olmasin. */
  private usage = new Map<string, { day: string; bytes: number }>();

  constructor(
    private db: Db,
    private o: StoreOptions = {},
  ) {}

  private seal(s: ErpState): ErpState {
    const sealer = this.o.sealer;
    return sealer ? mapSecrets(s, (v) => (v.startsWith(ENC) ? v : ENC + sealer.seal(v))) : s;
  }

  private unseal<T>(data: T): T {
    const sealer = this.o.sealer;
    return mapSecrets(data, (v) => {
      if (!v.startsWith(ENC)) return v;
      try {
        if (!sealer) throw new Error("kalit yo'q");
        return sealer.open(v.slice(ENC.length));
      } catch {
        this.o.warn?.("Shifrlangan token ochilmadi (SECRET_KEY o'zgarganmi?) — Integratsiyalar/Admin sahifasida qayta kiriting");
        return "";
      }
    });
  }

  /** Bazadan o'qiydi (server ishga tushganda). Holat bo'lmasa — null (avval `init` buyrug'i kerak). */
  async load(): Promise<boolean> {
    const { rows } = await this.db.query<{ version: string; data: unknown }>("SELECT version, data FROM app_state WHERE id = 1");
    const row = rows[0];
    if (!row) {
      this.state = null;
      return false;
    }
    const s = normalizeState(this.unseal(row.data), buildBlank(todayISO()));
    if (!s) throw new Error("Bazadagi holat buzilgan — zaxiradan tiklang");
    this.state = s;
    this.version = Number(row.version);
    this.size = Buffer.byteLength(JSON.stringify(row.data));
    return true;
  }

  /** Bazadagi holat hajmi (bayt) — admin ogohlantirishi uchun. */
  get bytes() {
    return this.size;
  }

  /** Xodim bugun qancha ma'lumot qo'shgani (bayt). */
  usedToday(userId: string): number {
    const u = this.usage.get(userId);
    return u && u.day === todayISO() ? u.bytes : 0;
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
    const json = JSON.stringify(this.seal(next));
    // Himoya: holat haddan tashqari kattalashsa (masalan, kimdir ulkan matnlar yuborsa) — saqlanmaydi
    if (json.length > MAX_STATE_BYTES) throw new UserError("Ma'lumot hajmi chegaradan oshdi — adminga murojaat qiling");
    const r = await this.db.query("UPDATE app_state SET data = $1, version = $2, updated_at = now() WHERE id = 1 AND version = $3", [
      json,
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
    this.size = Buffer.byteLength(json);
    return version;
  }

  /** Foydalanuvchi amali: huquq va argumentlar oldindan tekshirilgan bo'lishi kerak. */
  run<N extends ActionName>(
    name: N,
    args: ActionArgs<N>,
    userId: string,
    o: { ids?: unknown; check?: (me: User, s: ErpState) => string | null; quotaBytes?: number } = {},
  ): Promise<Applied<ActionResult<N>>> {
    return this.serial(async () => {
      const { state, version } = this.current();
      const s = structuredClone(state);
      const me = s.users.find((u) => u.id === userId);
      if (!me?.active) throw new UserError("Akkaunt faol emas");
      const denied = o.check?.(me, s);
      if (denied) throw new UserError(denied);
      if (o.quotaBytes !== undefined && this.usedToday(userId) >= o.quotaBytes)
        throw new QuotaError("Bugungi ma'lumot kiritish chegarasiga yetdingiz — ertaga davom eting yoki adminga murojaat qiling");
      const before = this.size;
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
      const grew = this.size - before;
      if (grew > 0) this.usage.set(userId, { day: today, bytes: this.usedToday(userId) + grew });
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
    const json = JSON.stringify(this.seal(s));
    await this.db.query("INSERT INTO app_state (id, version, data) VALUES (1, 1, $1)", [json]);
    this.state = s;
    this.version = 1;
    this.size = Buffer.byteLength(json);
  }

  /** Tizim nomidan amal (masalan, Meta'dan kelgan hisobotlarni yozish) — birinchi faol admin nomidan. */
  async runAsSystem<N extends ActionName>(name: N, args: ActionArgs<N>): Promise<Applied<ActionResult<N>>> {
    const admin = this.current().state.users.find((u) => u.role === "admin" && u.active) ?? this.current().state.users.find((u) => u.active);
    if (!admin) throw new Error("Faol foydalanuvchi yo'q");
    return this.run(name, args, admin.id);
  }
}
