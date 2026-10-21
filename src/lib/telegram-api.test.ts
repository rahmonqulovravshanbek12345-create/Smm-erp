// Telegram bilan aloqa (soxta fetch bilan): yuborish natijasidan «bloklagan» ekanini bilish, tekshiruv, webhook.
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteTelegramWebhook, observeDelivery, probeChat, sendTelegram, setTelegramWebhook } from "./telegram";

const TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  observeDelivery(null);
  vi.unstubAllGlobals();
});

describe("Yuborish natijasi", () => {
  it("yetib borsa «ok», «bot bloklangan» desa «blocked»; boshqa xatolar hech narsa demaydi", async () => {
    const answers = [
      reply(200, { ok: true }),
      reply(403, { ok: false, description: "Forbidden: bot was blocked by the user" }),
      reply(403, { ok: false, description: "Forbidden: user is deactivated" }),
      reply(403, { ok: false, description: "Forbidden: bot can't initiate conversation with a user" }),
      reply(400, { ok: false, description: "Bad Request: chat not found" }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answers.shift()!),
    );
    const seen: string[] = [];
    observeDelivery((chat, d) => seen.push(`${chat}:${d}`));
    const results: boolean[] = [];
    for (const chat of ["1", "2", "3", "4", "5"]) results.push(await sendTelegram(TOKEN, chat, "salom"));
    expect(results).toEqual([true, false, false, false, false]);
    expect(seen).toEqual(["1:ok", "2:blocked", "3:blocked"]);
  }, 20_000);

  it("kuzatuvchi xato bersa ham xabar yuborish buzilmaydi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { ok: true })),
    );
    observeDelivery(() => {
      throw new Error("kuzatuv buzildi");
    });
    expect(await sendTelegram(TOKEN, "1", "salom")).toBe(true);
  });
});

describe("Tekshiruv (xabar yubormasdan)", () => {
  it("yoza olsa — ulangan; bloklagan — bloklagan; hali ishga tushirmagan yoki xato — noma'lum", async () => {
    const answers = [
      reply(200, { ok: true, result: true }),
      reply(403, { ok: false, description: "Forbidden: bot was blocked by the user" }),
      reply(400, { ok: false, description: "Bad Request: chat not found" }),
    ];
    const fetchMock = vi.fn(async () => answers.shift()!);
    vi.stubGlobal("fetch", fetchMock);
    const got: string[] = [];
    for (const chat of ["1", "2", "3"]) got.push(await probeChat(TOKEN, chat));
    expect(got).toEqual(["member", "blocked", "unknown"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain("/sendChatAction");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "1", action: "typing" });
  }, 20_000);

  it("tarmoq xatosi — noma'lum (holat o'zgarmaydi)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("tarmoq yo'q");
      }),
    );
    expect(await probeChat(TOKEN, "1")).toBe("unknown");
  });
});

describe("Webhook", () => {
  it("ulash: manzil, maxfiy so'z va kerakli yangilanishlar so'raladi", async () => {
    const fetchMock = vi.fn(async () => reply(200, { ok: true, result: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await setTelegramWebhook(TOKEN, "https://erp.test/api/webhooks/telegram", "sirli-so'z")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/setWebhook`);
    expect(JSON.parse(init.body)).toMatchObject({
      url: "https://erp.test/api/webhooks/telegram",
      secret_token: "sirli-so'z",
      allowed_updates: ["message", "my_chat_member"],
    });
  });

  it("Telegram rad etsa — uning xabari qaytadi; tarmoq xatosida token ko'rinmaydi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(400, { ok: false, description: "Bad Request: bad webhook: HTTPS url must be provided" })),
    );
    expect(await setTelegramWebhook(TOKEN, "http://x", "s")).toEqual({ ok: false, error: "Bad Request: bad webhook: HTTPS url must be provided" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(`connect failed https://api.telegram.org/bot${TOKEN}/deleteWebhook`);
      }),
    );
    const r = await deleteTelegramWebhook(TOKEN);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
});
