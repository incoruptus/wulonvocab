/** 真实公共 Gist 读取验收：WV_PUBLIC_BANK_URL=https://... node scripts/e2e-public-bank.mjs */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = process.env.WV_BASE ?? "http://localhost:3000";
const PUBLIC_URL = process.env.WV_PUBLIC_BANK_URL?.trim();
if (!PUBLIC_URL) throw new Error("请通过 WV_PUBLIC_BANK_URL 提供公共题库 Raw 地址");
const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const cache = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const dir of readdirSync(cache)) {
    const file = join(dir, "node_modules", "playwright", "index.mjs");
    if (existsSync(file)) return import(pathToFileURL(file).href);
  }
  throw new Error("未找到 playwright");
}

const main = async () => {
  const normalizedUrl = new URL(PUBLIC_URL);
  const parts = normalizedUrl.pathname.split("/").filter(Boolean);
  if (normalizedUrl.hostname === "gist.githubusercontent.com" && parts[2] === "raw" && parts.length === 5) {
    parts.splice(3, 1);
    normalizedUrl.pathname = `/${parts.join("/")}`;
  }
  const bankResponse = await fetch(normalizedUrl);
  record("Node 可读取规范化后的地址", bankResponse.ok, `HTTP ${bankResponse.status}`);
  if (!bankResponse.ok) throw new Error("公共题库地址不可读取，请使用最新 Raw 地址");
  const bank = await bankResponse.json();
  const word2Def = bank.questions?.find((question) => question.kind === "word2def" && question.status === "approved");
  record("公共文件含已审核 word2def", Boolean(word2Def));

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const gistResponses = [];
  page.on("response", (response) => {
    if (response.url().includes("gist.githubusercontent.com")) gistResponses.push({ url: response.url(), status: response.status() });
  });
  try {
    await page.goto(`${BASE}/books`, { waitUntil: "networkidle" });
    await sleep(800);
    await page.getByRole("button", { name: "创建示例（10 词）" }).first().click();
    await page.waitForURL(/\/book\/?\?id=/);
    await page.getByRole("radio", { name: "题库", exact: true }).click();
    const input = page.getByLabel("公共题库地址");
    await input.fill(PUBLIC_URL);
    await page.getByRole("button", { name: "一键设置为公共题库", exact: true }).click();
    await sleep(800);
    const savedUrl = await input.inputValue();
    const originalParts = new URL(PUBLIC_URL).pathname.split("/").filter(Boolean);
    const revision = originalParts[2] === "raw" && originalParts.length === 5 ? originalParts[3] : null;
    record("固定 revision 地址保存时规范为最新 Raw", !revision || !savedUrl.includes(`/raw/${revision}/`), savedUrl);
    await page.getByRole("radio", { name: "公共题库", exact: true }).click();
    await page.getByRole("radio", { name: "复习参数", exact: true }).click();
    record("word2def 在四子型默认启用", await page.getByRole("switch", { name: "看词选英文释义", exact: true }).isChecked());
    await page.getByRole("radio", { name: "选择题", exact: true }).click();
    await page.getByRole("radio", { name: "词条编辑", exact: true }).click();
    await page.getByRole("button", { name: "筛选与视图", exact: true }).click();
    await page.getByRole("button", { name: "自由练习这批", exact: true }).click();
    await page.waitForURL(/\/study\/?\?id=/);
    await page.getByRole("button", { name: "自由练习这批", exact: true }).click();
    try {
      await page.getByText("选择对应的英文释义", { exact: true }).waitFor();
    } catch (error) {
      console.log("当前页面文本：", await page.locator("body").innerText());
      console.log("Gist 响应：", gistResponses);
      throw error;
    }
    record("自由练习实际出现 word2def", true);
    await page.locator(".wv-card button").filter({ has: page.locator("span", { hasText: /^A$/ }) }).first().click();
    await page.getByText("题目来源：公共题库", { exact: true }).waitFor();
    record("判定后确认题目来自公共题库", true);
    record("浏览器读取 Gist 返回 200", gistResponses.some((response) => response.status === 200), JSON.stringify(gistResponses));
  } finally {
    await browser.close();
  }
  const failed = results.filter((result) => !result.pass);
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
  process.exitCode = failed.length ? 1 : 0;
};
main().catch((error) => { console.error("E2E 失败：", error); process.exitCode = 1; });
