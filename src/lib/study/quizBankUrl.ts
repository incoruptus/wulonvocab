/** 规范化公共题库地址：兼容 GitHub Raw 按钮给出的固定 revision 链接与 Gist 页面链接。 */
export function normalizePublicQuizBankUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname === "gist.github.com" && parts[2] === "raw" && parts.length >= 4) {
      url.hostname = "gist.githubusercontent.com";
      return url.toString();
    }
    // /user/gist-id/raw/revision/file → /user/gist-id/raw/file
    // 固定 revision 在部分 Gist Raw 链接中会返回 404；公共题库始终读取最新发布版本。
    if (url.hostname === "gist.githubusercontent.com" && parts[2] === "raw" && parts.length === 5) {
      parts.splice(3, 1);
      url.pathname = `/${parts.join("/")}`;
    }
    return url.toString();
  } catch {
    return null;
  }
}
