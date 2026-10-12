/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" — serverli (haqiqiy) tizim; bo'sh — demo. */
  readonly VITE_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
