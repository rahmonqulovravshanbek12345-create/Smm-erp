// Server kodini bitta faylga yig'adi (dist/server.mjs): serverda faqat Node.js kerak — npm install shart emas.
// `node build.mjs --e2e` — qo'shimcha ravishda brauzer testlari uchun sinov serveri (dist/e2e-server.mjs, paketga kirmaydi).
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["pg-native"],
  // CommonJS kutubxonalar uchun require
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
  // Server — haqiqiy tizim (agentlik nomi va h.k. brauzerdagi server versiyasi bilan bir xil)
  define: { "import.meta.env.VITE_SERVER": '"1"' },
};

await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/server.mjs", sourcemap: "linked", legalComments: "linked" });
console.log("dist/server.mjs tayyor");
if (process.argv.includes("--e2e")) {
  await build({ ...common, entryPoints: ["test/e2e-server.ts"], outfile: "dist/e2e-server.mjs" });
  console.log("dist/e2e-server.mjs tayyor");
}
