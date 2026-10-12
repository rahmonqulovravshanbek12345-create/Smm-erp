// Parol va ikki bosqichli kirish (2FA) formalari: kirish ekranida ham, akkaunt menyusida ham ishlatiladi.
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { Banner, Button, Field, Input } from "./ui";

export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent, fn: () => Promise<void>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

export function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="123456"
      className="text-center !text-[22px] tracking-[0.4em]"
      autoFocus
      aria-label="6 xonali kod"
    />
  );
}

const RULES = "Kamida 10 belgi, harf va raqam bo'lsin. Ism, login yoki «12345…» kabi oddiy parol bo'lmasin.";

/** Parolni almashtirish formasi (birinchi kirishda ham, akkaunt menyusidan ham). */
export function PasswordForm({ onDone, first }: { onDone: () => void; first?: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const { busy, error, submit } = useSubmit();
  const mismatch = again.length > 0 && next !== again;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) =>
        submit(e, async () => {
          if (next !== again) throw new Error("Yangi parollar bir xil emas");
          await api("/api/auth/password", { current, next });
          onDone();
        })
      }
    >
      {error && <Banner tone="red">{error}</Banner>}
      <Field label={first ? "Admin bergan vaqtinchalik parol" : "Joriy parol"}>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus />
      </Field>
      <Field label="Yangi parol" hint={RULES}>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field label="Yangi parol (qayta)">
        <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
      </Field>
      {mismatch && <p className="px-1 text-[13px] text-red">Parollar bir xil emas</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !current || next.length < 10 || next !== again}>
        {busy ? "Saqlanmoqda…" : "Parolni saqlash"}
      </Button>
    </form>
  );
}

/** Google Authenticator'ni ulash: QR kod (yoki kalitni qo'lda kiritish) va tekshiruv kodi. */
export function TwoFactorForm({ onDone }: { onDone: () => void }) {
  const [data, setData] = useState<{ secret: string; svg: string } | null>(null);
  const [code, setCode] = useState("");
  const { busy, error, submit } = useSubmit();
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    api<{ secret: string; svg: string }>("/api/auth/2fa/setup", {})
      .then(setData)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Xatolik"));
  }, []);
  if (loadError) return <Banner tone="red">{loadError}</Banner>;
  if (!data) return <p className="text-[14px] text-label2">Tayyorlanmoqda…</p>;
  return (
    <form className="space-y-3" onSubmit={(e) => submit(e, async () => (await api("/api/auth/2fa/enable", { code }), onDone()))}>
      <ol className="list-decimal space-y-1 pl-5 text-[14px] text-label2">
        <li>Telefoningizga «Google Authenticator» ilovasini o'rnating (Play Market yoki App Store).</li>
        <li>Ilovada «+» → «QR kodni skanerlash» ni bosing va quyidagi kodni skanerlang.</li>
        <li>Ilovada chiqqan 6 xonali kodni pastga yozing.</li>
      </ol>
      <div className="flex justify-center">
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(data.svg)}`}
          alt="2FA QR kodi"
          width={200}
          height={200}
          className="rounded-[12px] bg-white p-2"
        />
      </div>
      <details className="text-[13px] text-label2">
        <summary className="cursor-pointer">QR kod skanerlanmasa — kalitni qo'lda kiriting</summary>
        <code className="mt-1 block break-all rounded-[10px] bg-fill px-3 py-2 font-mono text-[13px] text-label">
          {data.secret.replace(/(.{4})/g, "$1 ").trim()}
        </code>
      </details>
      {error && <Banner tone="red">{error}</Banner>}
      <CodeInput value={code} onChange={setCode} />
      <Button type="submit" variant="primary" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? "Tekshirilmoqda…" : "Yoqish"}
      </Button>
    </form>
  );
}
