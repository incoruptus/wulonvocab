import { describe, expect, it } from "vitest";
import { normalizePublicQuizBankUrl } from "./quizBankUrl";

describe("公共题库地址规范化", () => {
  it("把固定 revision 的 Gist Raw 地址转为最新文件地址", () => {
    expect(normalizePublicQuizBankUrl("https://gist.githubusercontent.com/user/id/raw/revision/file.json")).toBe(
      "https://gist.githubusercontent.com/user/id/raw/file.json",
    );
  });

  it("保留最新 Raw 地址与普通 HTTPS 清单地址", () => {
    expect(normalizePublicQuizBankUrl("https://gist.githubusercontent.com/user/id/raw/file.json")).toBe(
      "https://gist.githubusercontent.com/user/id/raw/file.json",
    );
    expect(normalizePublicQuizBankUrl("https://example.com/manifest.json")).toBe("https://example.com/manifest.json");
  });

  it("把 Gist 页面 Raw 链接转为匿名内容域名", () => {
    expect(normalizePublicQuizBankUrl("https://gist.github.com/user/id/raw/file.json")).toBe(
      "https://gist.githubusercontent.com/user/id/raw/file.json",
    );
  });

  it("拒绝非 HTTPS 与畸形地址，空地址表示停用", () => {
    expect(normalizePublicQuizBankUrl("")).toBe("");
    expect(normalizePublicQuizBankUrl("http://example.com/bank.json")).toBeNull();
    expect(normalizePublicQuizBankUrl("not a url")).toBeNull();
  });
});
