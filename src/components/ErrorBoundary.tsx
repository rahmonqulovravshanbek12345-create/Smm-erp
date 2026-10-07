import { Component, type ReactNode } from "react";

const STORAGE_KEY = "smm-erp-demo";

/** Kutilmagan xato (masalan, brauzerdagi demo ma'lumot buzilgan) oq ekran o'rniga tushunarli oyna chiqaradi. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private reset = () => {
    try {
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
            Brauzerda saqlangan demo ma'lumotlari buzilgan bo'lishi mumkin. Demo'ni qayta tiklasangiz, namunaviy ma'lumotlar bilan qaytadan ochiladi.
          </p>
          <button type="button" onClick={this.reset} className="mt-4 h-10 rounded-full bg-accent px-5 text-[15px] font-semibold text-white">
            Demo'ni qayta tiklash
          </button>
          <p className="mt-3 break-words text-[12px] text-label3">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
