// PostgreSQL: ulanish va jadvallar (migratsiyalar ishga tushganda avtomatik qo'llanadi).
import pg from "pg";

export type Db = pg.Pool;

export function createPool(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000, application_name: "smm-erp" });
}

/** Har bir migratsiya bir marta, tranzaksiya ichida qo'llanadi. Faqat oxiriga qo'shiladi, eskilari o'zgartirilmaydi. */
const MIGRATIONS: string[] = [
  `
  -- 1. Asosiy jadvallar
  CREATE TABLE app_state (
    id smallint PRIMARY KEY CHECK (id = 1),
    version bigint NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE credentials (
    user_id text PRIMARY KEY,
    login text NOT NULL UNIQUE CHECK (login = lower(login)),
    pass_hash text NOT NULL,
    must_change boolean NOT NULL DEFAULT true,
    totp_secret text,
    totp_pending text,
    totp_enabled boolean NOT NULL DEFAULT false,
    totp_last_step bigint NOT NULL DEFAULT 0,
    last_login_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  -- Noto'g'ri urinishlar login matni bo'yicha (mavjud bo'lmagan login uchun ham — kim borligini bilib bo'lmasin)
  CREATE TABLE login_attempts (
    login text PRIMARY KEY,
    failed int NOT NULL DEFAULT 0,
    locked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE sessions (
    id text PRIMARY KEY,            -- tokenning SHA-256 xeshi (token o'zi saqlanmaydi)
    user_id text NOT NULL,
    stage text NOT NULL CHECK (stage IN ('full', 'totp')),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    ip text,
    user_agent text
  );
  CREATE INDEX sessions_user ON sessions (user_id);

  CREATE TABLE known_devices (
    user_id text NOT NULL,
    device text NOT NULL,
    first_seen timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, device)
  );

  -- Audit jurnali: faqat qo'shiladi (o'zgartirish va o'chirish taqiqlangan)
  CREATE TABLE audit_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    user_id text,
    ip text,
    kind text NOT NULL,
    action text,
    ok boolean NOT NULL,
    detail jsonb,
    state_version bigint
  );
  CREATE INDEX audit_log_at ON audit_log (at);
  CREATE FUNCTION audit_log_readonly() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'audit_log faqat qo''shiladi';
  END $$;
  CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_readonly();
  `,
  `
  -- 2. Audit jurnali: TRUNCATE ham taqiqlanadi; 2 yildan eski yozuvlarni faqat saqlash muddati ishi o'chira oladi
  CREATE OR REPLACE FUNCTION audit_log_readonly() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'DELETE' AND current_setting('erp.audit_prune', true) = 'on' AND OLD.at < now() - interval '730 days' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_log faqat qo''shiladi';
  END $$;
  CREATE FUNCTION audit_log_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'audit_log faqat qo''shiladi';
  END $$;
  CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_no_truncate();

  -- 3. Sessiya: harakatsizlik muddati rolga qarab (rahbariyat va moliya — qisqaroq)
  ALTER TABLE sessions ADD COLUMN idle_minutes int NOT NULL DEFAULT 20160;
  `,
];

/** Audit jurnali 2 yil saqlanadi (eski yozuvlar disk to'lib qolmasligi uchun o'chiriladi). */
export async function pruneAudit(db: Db): Promise<number> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL erp.audit_prune = 'on'");
    const r = await c.query("DELETE FROM audit_log WHERE at < now() - interval '730 days'");
    await c.query("COMMIT");
    return r.rowCount ?? 0;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export async function migrate(db: Db): Promise<number> {
  const client = await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const { rows } = await client.query<{ v: number | null }>("SELECT max(version) AS v FROM schema_migrations");
    let applied = 0;
    for (let i = rows[0]?.v ?? 0; i < MIGRATIONS.length; i++) {
      await client.query("BEGIN");
      try {
        await client.query(MIGRATIONS[i]!);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [i + 1]);
        await client.query("COMMIT");
        applied++;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => undefined);
    client.release();
  }
}

export interface AuditEntry {
  userId?: string | null;
  ip?: string | null;
  kind: string;
  action?: string | null;
  ok: boolean;
  detail?: unknown;
  version?: number | null;
}

export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db.query("INSERT INTO audit_log (user_id, ip, kind, action, ok, detail, state_version) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    e.userId ?? null,
    e.ip ?? null,
    e.kind,
    e.action ?? null,
    e.ok,
    e.detail === undefined ? null : JSON.stringify(e.detail),
    e.version ?? null,
  ]);
}
