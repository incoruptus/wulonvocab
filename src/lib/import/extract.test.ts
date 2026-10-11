import { describe, expect, it } from "vitest";
import { looksHeic } from "./extract";
import { extractWordTokens } from "./ocr";
import { estimateVisionTokens } from "../ai/vision";

/** 构造带 ftyp box 的假图片（offset 4 起为 "ftyp" + brand） */
function ftypBlob(brand: string): Blob {
  const bytes = new Uint8Array(16);
  bytes.set([0, 0, 0, 0x18], 0);
  const brandBytes = "ftyp" + brand;
  for (let i = 0; i < brandBytes.length; i += 1) bytes[4 + i] = brandBytes.charCodeAt(i);
  return new Blob([bytes]);
}

describe("looksHeic", () => {
  it("ftyp 魔数识别 HEIC 系品牌", async () => {
    expect(await looksHeic(ftypBlob("heic"))).toBe(true);
    expect(await looksHeic(ftypBlob("heix"))).toBe(true);
    expect(await looksHeic(ftypBlob("mif1"))).toBe(true);
  });

  it("普通图片不误判", async () => {
    expect(await looksHeic(ftypBlob("isom"))).toBe(false);
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])], { type: "image/jpeg" });
    expect(await looksHeic(jpeg)).toBe(false);
    expect(await looksHeic(new Blob([]))).toBe(false); // 过小、无魔数
  });

  it("MIME 与扩展名提示", async () => {
    expect(await looksHeic(new Blob([], { type: "image/heic" }))).toBe(true);
    expect(await looksHeic(new Blob([], { type: "image/heif" }))).toBe(true);
    if (typeof File !== "undefined") {
      expect(await looksHeic(new File([], "IMG_0001.HEIC"))).toBe(true);
      expect(await looksHeic(new File([], "IMG_0002.jpg"))).toBe(false);
    }
  });
});

describe("estimateVisionTokens", () => {
  it("小图保底 258", () => {
    expect(estimateVisionTokens(100, 100)).toBe(258);
    expect(estimateVisionTokens(1, 1)).toBe(258);
  });

  it("大图按 28px 补丁网格", () => {
    expect(estimateVisionTokens(1600, 1200)).toBe(58 * 43);
    expect(estimateVisionTokens(896, 896)).toBe(32 * 32);
  });
});

describe("extractWordTokens（本机 OCR 产物清洗）", () => {
  it("清掉噪声与数字，小写化并按出现顺序去重", () => {
    const text = "Abandon 2024, abandon!\nability — Able\n\n3. ABILITY";
    expect(extractWordTokens(text)).toEqual(["abandon", "ability", "able"]);
  });

  it("允许连字符与撇号；单字母丢弃；封顶生效", () => {
    expect(extractWordTokens("well-known it's a x")).toEqual(["well-known", "it's"]);
    expect(extractWordTokens("aa bb cc dd", 3)).toEqual(["aa", "bb", "cc"]);
  });
});
