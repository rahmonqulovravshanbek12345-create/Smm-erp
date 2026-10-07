import { describe, expect, it } from "vitest";
import { isDemoLink, safeExternalUrl } from "./ui";

describe("Tashqi havolalar xavfsizligi", () => {
  it("faqat http(s) havola chiqadi", () => {
    expect(safeExternalUrl("https://drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(safeExternalUrl("instagram.com/brand")).toBe("https://instagram.com/brand");
    expect(safeExternalUrl("javascript:alert(1)")).toBe("https://alert(1)");
    expect(safeExternalUrl(" JavaScript://x ")).toBe("https://x");
    expect(safeExternalUrl("data:text/html,<b>")).toBe("https://text/html,<b>");
    for (const u of ["javascript:alert(1)", "data:text/html,x", "vbscript:x"]) expect(safeExternalUrl(u)).toMatch(/^https:\/\//);
  });
  it("namunaviy havolalar aniqlanadi", () => {
    expect(isDemoLink("https://drive.google.com/drive/folders/demo-sharq")).toBe(true);
    expect(isDemoLink("https://instagram.com/demo_brand")).toBe(true);
    expect(isDemoLink("https://instagram.com/realbrand")).toBe(false);
  });
});
