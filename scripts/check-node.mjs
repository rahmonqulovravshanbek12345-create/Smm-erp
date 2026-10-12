// Serverga o'rnatiladigan Node.js versiyasi xavfsizlik yangilanishlaridan orqada qolmaganini tekshiradi
// (deploy/install.sh dagi NODE_VER). Ishlatish: node scripts/check-node.mjs
import { readFileSync } from "node:fs";

const sh = readFileSync(new URL("../deploy/install.sh", import.meta.url), "utf8");
const pinned = sh.match(/^NODE_VER=(\d+\.\d+\.\d+)$/m)?.[1];
if (!pinned) throw new Error("install.sh: NODE_VER topilmadi");
const major = pinned.split(".")[0];
const cmp = (a, b) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

let index;
try {
  index = await (await fetch("https://nodejs.org/dist/index.json", { signal: AbortSignal.timeout(20_000) })).json();
} catch (e) {
  console.warn(`! nodejs.org ga ulanib bo'lmadi — tekshiruv o'tkazib yuborildi (${e.message})`);
  process.exit(0);
}
const line = index.filter((x) => x.version.startsWith(`v${major}.`)).map((x) => ({ v: x.version.slice(1), security: x.security }));
const missed = line.filter((x) => x.security && cmp(x.v, pinned) > 0).map((x) => x.v);
if (missed.length) {
  console.error(`✗ Node.js ${pinned} eskirgan: undan keyin xavfsizlik relizlari chiqqan — ${missed.join(", ")}.`);
  console.error(`  deploy/install.sh dagi NODE_VER va NODE_SHA256 ni ${line[0].v} ga yangilang.`);
  process.exit(1);
}
console.log(`✓ Node.js ${pinned}: o'tkazib yuborilgan xavfsizlik relizi yo'q (eng yangisi ${line[0].v})`);
