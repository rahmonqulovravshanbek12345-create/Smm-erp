import { describe, expect, it } from "vitest";
import { moneyWords, numberToWords } from "./words";

describe("Summani so'z bilan yozish", () => {
  it.each([
    [0, "nol"],
    [7, "yetti"],
    [15, "o'n besh"],
    [100, "bir yuz"],
    [1000, "bir ming"],
    [2025, "ikki ming yigirma besh"],
    [15_000_000, "o'n besh million"],
    [12_345_678, "o'n ikki million uch yuz qirq besh ming olti yuz yetmish sakkiz"],
    [1_000_000_000, "bir milliard"],
    [-500, "minus besh yuz"],
  ])("%d → %s", (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it("hujjat shakli: bosh harf, so'm va tiyin", () => {
    expect(moneyWords(15_000_000)).toBe("O'n besh million so'm 00 tiyin");
    expect(moneyWords(1500.5)).toBe("Bir ming besh yuz so'm 50 tiyin");
    expect(moneyWords(0.07)).toBe("Nol so'm 07 tiyin");
    expect(moneyWords(99.999)).toBe("Bir yuz so'm 00 tiyin");
  });
});
