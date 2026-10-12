// Serverli tizimga kirish: login + parol → (2FA kodi) → birinchi kirishda yangi parol → (majburiy rollar uchun) 2FA sozlash.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { App } from "../App";
import { Icon } from "../components/icons";
import { CodeInput, PasswordForm, TwoFactorForm, useSubmit } from "../components/Security";
import { Banner, Button, Field, Input } from "../components/ui";
import { ApiError, api, type MeInfo, type StateResponse } from "../lib/api";
import { ServerStoreProvider } from "../lib/server-store";

type Phase =
  | { k: "loading" }
  | { k: "login"; notice?: string }
  | { k: "totp" }
  | { k: "password"; me: MeInfo }
  | { k: "2fa"; me: MeInfo }
  | { k: "ready"; me: MeInfo; initial: StateResponse }
  | { k: "error"; text: string };

/** Ilovaning serverli kirish nuqtasi: sessiyani tekshiradi va kerakli ekranni ko'rsatadi. */
export function ServerGate() {
  const [phase, setPhase] = useState<Phase>({ k: "loading" });

  const check = useCallback(async (notice?: string) => {
    try {
      const me = await api<MeInfo | { user: null }>("/api/me");
      if (!me.user) return setPhase({ k: "login", notice });
      if (me.blocked === "password") return setPhase({ k: "password", me });
      if (me.blocked === "2fa") return setPhase({ k: "2fa", me });
      const initial = await api<StateResponse>("/api/state?v=-1");
      setPhase({ k: "ready", me, initial });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return setPhase({ k: "login", notice });
      setPhase({ k: "error", text: e instanceof Error ? e.message : "Xatolik" });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const signedOut = useCallback(() => setPhase({ k: "login", notice: "Sessiya tugadi — qaytadan kiring" }), []);

  switch (phase.k) {
    case "loading":
      return <Screen title="Yuklanmoqda…" />;
    case "error":
      return (
        <Screen title="Server bilan aloqa yo'q">
          <Banner tone="red">{phase.text}</Banner>
          <Button variant="primary" className="mt-4 w-full" onClick={() => void check()}>
            Qayta urinish
          </Button>
        </Screen>
      );
    case "login":
      return <Login notice={phase.notice} onDone={(need2fa) => (need2fa ? setPhase({ k: "totp" }) : void check())} />;
    case "totp":
      return <Totp onDone={() => void check()} onBack={() => setPhase({ k: "login" })} />;
    case "password":
      return <ChangePassword me={phase.me} onDone={() => void check()} />;
    case "2fa":
      return <TwoFactorSetup me={phase.me} onDone={() => void check()} />;
    case "ready":
      return (
        <ServerStoreProvider key={phase.me.user.id} initial={phase.initial} me={phase.me} onSignedOut={signedOut}>
          <App />
        </ServerStoreProvider>
      );
  }
}

function Screen({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="wallpaper" />
      <main className="glass-strong w-full max-w-[400px] animate-pop rounded-[28px] p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#5856D6] via-[#007AFF] to-[#5AC8FA] text-white">
            <Icon name="sparkle" size={22} strokeWidth={2} />
          </span>
          <span className="leading-tight">
            <span className="block text-[17px] font-bold tracking-tight text-label">SMM Studio</span>
            <span className="block text-[12px] font-medium text-label2">Agentlik ERP</span>
          </span>
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-label">{title}</h1>
        {sub && <p className="mt-1 text-[14px] text-label2">{sub}</p>}
        {children && <div className="mt-5">{children}</div>}
      </main>
    </div>
  );
}

function Login({ notice, onDone }: { notice?: string; onDone: (need2fa: boolean) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit();
  return (
    <Screen title="Tizimga kirish" sub="Login va parolni admin beradi">
      <form
        className="space-y-3"
        onSubmit={(e) =>
          submit(e, async () => {
            const r = await api<{ need2fa?: boolean }>("/api/auth/login", { login: login.trim(), password });
            setPassword("");
            onDone(Boolean(r.need2fa));
          })
        }
      >
        {notice && !error && <Banner tone="amber">{notice}</Banner>}
        {error && <Banner tone="red">{error}</Banner>}
        <Field label="Login">
          <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required />
        </Field>
        <Field label="Parol">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !login.trim() || !password}>
          {busy ? "Tekshirilmoqda…" : "Kirish"}
        </Button>
        <p className="pt-1 text-center text-[12px] text-label3">Parolni unutsangiz — adminga murojaat qiling</p>
      </form>
    </Screen>
  );
}

function Totp({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const { busy, error, submit } = useSubmit();
  return (
    <Screen title="Tasdiqlash kodi" sub="Telefoningizdagi Google Authenticator ilovasidagi 6 xonali kodni kiriting">
      <form
        className="space-y-3"
        onSubmit={(e) =>
          submit(e, async () => {
            try {
              await api("/api/auth/totp", { code });
              onDone();
            } catch (err) {
              setCode("");
              if (err instanceof ApiError && err.status === 401 && err.message.startsWith("Qaytadan")) onBack();
              throw err;
            }
          })
        }
      >
        {error && <Banner tone="red">{error}</Banner>}
        <CodeInput value={code} onChange={setCode} />
        <Button type="submit" variant="primary" className="w-full" disabled={busy || code.length !== 6}>
          {busy ? "Tekshirilmoqda…" : "Tasdiqlash"}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
          Orqaga
        </Button>
      </form>
    </Screen>
  );
}

function ChangePassword({ me, onDone }: { me: MeInfo; onDone: () => void }) {
  return (
    <Screen title="Yangi parol o'rnating" sub={`${me.user.name}, xavfsizlik uchun admin bergan vaqtinchalik parolni o'zingizning parolingizga almashtiring.`}>
      <PasswordForm first onDone={onDone} />
    </Screen>
  );
}

function TwoFactorSetup({ me, onDone }: { me: MeInfo; onDone: () => void }) {
  return (
    <Screen
      title="Ikki bosqichli kirish"
      sub={`${me.user.name}, sizning rolingizda kirishda telefondagi kod ham so'raladi — parol o'g'irlansa ham boshqa odam kira olmaydi.`}
    >
      <TwoFactorForm onDone={onDone} />
    </Screen>
  );
}
