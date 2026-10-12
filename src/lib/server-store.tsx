// Serverli tizim holati: amal avval brauzerda bajariladi (sahifa darhol yangilanadi), keyin serverga yuboriladi.
// Server tekshirib saqlaydi va haqiqiy holatni qaytaradi; rad etsa — o'zgarish bekor bo'ladi va sababi ko'rsatiladi.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api, type ActionResponse, type MeInfo, type StateResponse } from "./api";
import { collectIds, makeCtx } from "./ctx";
import { nowHM, todayISO } from "./dates";
import { apply, type ActionArgs, type ActionName, type ActionResult } from "./registry";
import { StoreContext, type Run, type Store } from "./store";
import type { ErpState } from "./types";

const POLL_MS = 15_000;

/** JSON massivida undefined → null bo'lib qoladi: oxiridagi bo'sh argumentlar olib tashlanadi. */
function trimArgs(args: readonly unknown[]): unknown[] {
  const out = [...args];
  while (out.length && out[out.length - 1] === undefined) out.pop();
  return out;
}

export function ServerStoreProvider({
  initial,
  me: meInfo,
  onSignedOut,
  children,
}: {
  initial: StateResponse;
  me: MeInfo;
  onSignedOut: () => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<ErpState>(initial.state);
  const stateRef = useRef(state);
  stateRef.current = state;
  const version = useRef(initial.version);
  const inflight = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const [now, setNow] = useState(nowHM);
  const today = todayISO();

  useEffect(() => {
    const id = window.setInterval(() => setNow(nowHM()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const showToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), t.startsWith("⚠") ? 6000 : 2600);
  }, []);

  const adopt = useCallback((r: { version: number; state: ErpState }) => {
    if (r.version < version.current) return;
    version.current = r.version;
    stateRef.current = r.state;
    setState(r.state);
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) return onSignedOut();
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      showToast(`⚠ ${e instanceof Error ? e.message : "Xatolik"}`);
    },
    [onSignedOut, showToast],
  );

  /** Serverdagi holatni olish (o'zgarmagan bo'lsa server bo'sh javob qaytaradi). */
  const refresh = useCallback(
    async (force = false) => {
      try {
        const r = await api<StateResponse | undefined>(`/api/state?v=${force ? -1 : version.current}`);
        setOffline(false);
        if (r && inflight.current === 0) adopt(r);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return onSignedOut();
        if (e instanceof ApiError && e.status === 0) setOffline(true);
      }
    },
    [adopt, onSignedOut],
  );

  // Boshqa xodimlarning o'zgarishlari: har 15 soniyada va oynaga qaytilganda
  useEffect(() => {
    const id = window.setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const run = useCallback(
    (<N extends ActionName>(name: N, args: ActionArgs<N>, toastText?: string) => {
      const s = structuredClone(stateRef.current);
      const me = s.users.find((u) => u.id === s.currentUserId)!;
      const { ctx } = makeCtx(s, me, { today: todayISO(), now: nowHM() });
      let value: ActionResult<N>;
      let ids: string[];
      try {
        ({ value, ids } = collectIds(() => apply(ctx, name, args)));
      } catch (e) {
        showToast(e instanceof Error ? `⚠ ${e.message}` : "Xatolik");
        return false;
      }
      stateRef.current = s;
      setState(s);
      if (toastText) showToast(toastText);
      // Amallar tartib bilan yuboriladi (keyingisi oldingisiga bog'liq bo'lishi mumkin)
      inflight.current++;
      const job = queue.current.then(async () => {
        try {
          const r = await api<ActionResponse>("/api/action", { name, args: trimArgs(args), ids });
          setOffline(false);
          inflight.current--;
          if (inflight.current === 0) adopt(r);
          else version.current = Math.max(version.current, r.version);
        } catch (e) {
          inflight.current--;
          fail(e);
          // Server qabul qilmadi — brauzerdagi o'zgarish bekor qilinadi
          if (inflight.current === 0) await refresh(true);
        }
      });
      queue.current = job;
      return { value };
    }) as Run,
    [adopt, fail, refresh, showToast],
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", {}).catch(() => undefined);
    onSignedOut();
  }, [onSignedOut]);

  const me = state.users.find((u) => u.id === state.currentUserId) ?? state.users[0]!;
  const session = useMemo(
    () => ({
      login: meInfo.login,
      has2fa: meInfo.has2fa,
      require2fa: meInfo.require2fa,
      logout,
      offline,
      refresh: () => refresh(true),
      adopt,
    }),
    [meInfo, logout, offline, refresh, adopt],
  );
  const value: Store = useMemo(
    () => ({
      state,
      me,
      today,
      now,
      run,
      reset: () => undefined,
      toast,
      showToast,
      saveError: false,
      session,
    }),
    [state, me, today, now, run, toast, showToast, session],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
