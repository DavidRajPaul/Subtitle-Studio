import { describe, expect, it } from "vitest";
import { graphemes, wordTimes, wrapText } from "./layout";

const mono = (t: string) => graphemes(t).length * 10; // every character 10 px wide

describe("wrapText", () => {
  it("keeps a short line whole and honours typed line breaks", () => {
    expect(wrapText("Hello world", 200, mono)).toEqual(["Hello world"]);
    expect(wrapText("One\nTwo", 200, mono)).toEqual(["One", "Two"]);
  });

  it("wraps at spaces without exceeding the width", () => {
    const lines = wrapText("the quick brown fox jumps over the lazy dog", 100, mono);
    expect(lines).toEqual(["the quick", "brown fox", "jumps over", "the lazy", "dog"]);
    for (const l of lines) expect(mono(l)).toBeLessThanOrEqual(100);
  });

  it("breaks a word longer than the line, and text without spaces", () => {
    expect(wrapText("abcdefghijkl", 50, mono)).toEqual(["abcde", "fghij", "kl"]);
    expect(wrapText("日本語のテキストです", 40, mono)).toEqual(["日本語の", "テキスト", "です"]);
  });

  it("never splits a Tamil letter from its vowel sign", () => {
    const lines = wrapText("வணக்கம்நண்பர்களே", 30, mono);
    expect(lines.join("")).toBe("வணக்கம்நண்பர்களே");
    for (const l of lines) expect(/^[ா-்ௗ]/.test(l)).toBe(false);
  });
});

describe("wordTimes", () => {
  it("spreads words over the subtitle in proportion to their length, ending exactly", () => {
    const t = wordTimes("a bbb", 1000, 2000);
    expect(t.map((w) => w.word)).toEqual(["a", "bbb"]);
    expect(t[0].start).toBe(1000);
    expect(t[0].end).toBeCloseTo(1333.33, 1);
    expect(t[1].end).toBe(2000);
  });

  it("handles empty text", () => {
    expect(wordTimes("   ", 0, 1000)).toEqual([]);
  });
});
