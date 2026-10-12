// Server kodini bitta faylga yig'adi (dist/server.mjs): serverda faqat Node.js kerak — npm install shart emas.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: "linked",
  legalComments: "linked",
  external: ["pg-native"],
  // CommonJS kutubxonalar uchun require
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
console.log("dist/server.mjs tayyor");
