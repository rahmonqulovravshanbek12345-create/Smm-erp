import { Component, type ReactNode } from "react";

const STORAGE_KEY = "smm-erp-demo";

/** Kutilmagan xato (masalan, brauzerdagi demo ma'lumot buzilgan) oq ekran o'rniga tushunarli oyna chiqaradi. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private reload = () => window.location.reload();

  private reset = () => {
    try {
      // O'chirishdan oldin zaxira nusxa (keyin qo'lda tiklash mumkin)
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) window.localStorage.setItem(`${STORAGE_KEY}-backup`, raw);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // saqlash imkoni bo'lmasa ham sahifa qayta yuklanadi
    }
    window.location.hash = "/";
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="glass-strong max-w-md rounded-[24px] p-6 text-center">
          <div className="text-[20px] font-bold text-label">Nimadir noto'g'ri ketdi</div>
          <p className="mt-2 text-[14px] text-label2">
            Avval sahifani qayta yuklab ko'ring. Yordam bermasa — demo'ni qayta tiklang (joriy ma'lumot zaxiraga olinadi).
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={this.reload} className="h-10 rounded-full bg-accent px-5 text-[15px] font-semibold text-white">
              Qayta yuklash
            </button>
            <button type="button" onClick={this.reset} className="h-10 rounded-full bg-fill px-5 text-[15px] font-semibold text-label">
              Demo'ni qayta tiklash
            </button>
          </div>
          <p className="mt-3 break-words text-[12px] text-label3">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
