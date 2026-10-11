/**
 * 双设备同步 E2E（本地脚本，不进 CI）
 *   node scripts/e2e-sync.mjs            # 依赖本地 dev server（默认 http://localhost:3000）
 *   WV_BASE=http://localhost:4010/wulonvocab node scripts/e2e-sync.mjs
 *
 * 两个隔离浏览器上下文 = 两台设备；全程走真实 UI：
 * ① A 建书 → 导出同步包 → B 导入合并 → 断言词条/字段
 * ② B 星标 + 新书 → B 导出 → A 导入 → 断言星标与并集
 * ③ A 删除新书 → 导出 → B 导入 → 断言删除跨端
 * ④ 重复导入同一包 → 断言幂等（新增 0）
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = process.env.WV_BASE ?? "http://localhost:3000";
const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  ${detail}` : ""}`);
};

async function loadPlaywright() {
  try {
    const mod = await import("playwright");
    return mod;
  } catch {
    /* fallback：本机 npx 缓存 */
  }
  const cache = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const dir of readdirSync(cache)) {
    const p = join(cache, dir, "node_modules", "playwright", "index.mjs");
    if (existsSync(p)) return await import(pathToFileURL(p).href);
  }
  throw new Error("未找到 playwright（npm i -D playwright 或经 npx 缓存运行）");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createBook(page, words) {
  await page.goto(`${BASE}/import`, { waitUntil: "networkidle" });
  await sleep(1500);
  await page.getByPlaceholder("abandon, ability, abstract, academic, accompany, accurate, …").fill(words);
  await page.getByRole("button", { name: "直接导入（不匹配）" }).click();
  await page.getByRole("button", { name: /导入 \d+ 个词条/ }).click();
  await page.waitForURL(/\/book\?id=/, { timeout: 20000 });
  return new URL(page.url()).searchParams.get("id");
}

async function exportPack(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await sleep(2000);
  await page.evaluate(() => {
    if (window.__wvPatched) return;
    window.__wvPatched = true;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => {
      window.__lastBlob = b;
      return orig(b);
    };
  });
  await page.getByRole("button", { name: /^导出$/ }).click();
  await page.waitForFunction(() => Boolean(window.__lastBlob), { timeout: 20000 });
  return await page.evaluate(async () => {
    const text = await window.__lastBlob.text();
    window.__lastBlob = null;
    return text;
  });
}

async function importPack(page, text) {
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await sleep(2000);
  await page.evaluate((t) => {
    const input = document.querySelector('input[type="file"][accept*=".wulonsync"]');
    const dt = new DataTransfer();
    dt.items.add(new File([t], "fromPeer.wulonsync", { type: "application/json" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, text);
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await sleep(800);
  return await page.evaluate(() => document.querySelector('[role="dialog"]').innerText);
}

async function applyMerge(page) {
  await page.getByRole("button", { name: "应用合并" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("同步完成"), { timeout: 20000 });
  await sleep(600);
}

const main = async () => {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  try {
    // ---------- ① A 建书 → B 合并 ----------
    const idA = await createBook(A, "syncobserve, synctransmit");
    const packA = await exportPack(A);
    record("A 导出同步包", packA.length > 50 && packA.includes("wulonvocab-sync"), `${packA.length}B`);

    const dialogB = await importPack(B, packA);
    const addsB = Number(dialogB.match(/新增 (\d+)/)?.[1] ?? -1);
    record("B 合并预览计数正确（1 书 + 2 词）", addsB === 3, `新增 ${addsB}`);
    await applyMerge(B);
    await B.goto(`${BASE}/books`, { waitUntil: "networkidle" });
    await sleep(1500);
    const bBooks = await B.evaluate(() => document.body.innerText);
    record("B 出现 A 的词库(2 词)", bBooks.includes("粘贴导入") && bBooks.includes("2 个词"));
    // 直接按 id 打开工作区断言词条
    await B.goto(`${BASE}/book?id=${idA}`, { waitUntil: "networkidle" });
    await sleep(1800);
    const bEntries = await B.evaluate(() => document.body.innerText);
    record("B 词条齐全", bEntries.includes("syncobserve") && bEntries.includes("synctransmit"));

    // ---------- ② B 星标 + 新书 → A 合并 ----------
    await B.locator('button[aria-label="加星标"]').first().click();
    await sleep(600);
    const idB = await createBook(B, "bonly");
    const packB = await exportPack(B);
    const dialogA = await importPack(A, packB);
    record("A 合并预览出现（含新增）", /新增 \d+/.test(dialogA));
    await applyMerge(A);
    await A.goto(`${BASE}/books`, { waitUntil: "networkidle" });
    await sleep(1500);
    const aBooks = await A.evaluate(() => document.body.innerText);
    record("A 并集含 B 的新书(1 词)", aBooks.includes("1 个词"));
    // A 中打开 2 词书，断言星标已合并
    await A.goto(`${BASE}/book?id=${idA}`, { waitUntil: "networkidle" });
    await sleep(1800);
    const aStarred = await A.evaluate(() => document.querySelectorAll('button[aria-label="取消星标"]').length);
    record("A 的星标已合并", aStarred >= 1, `取消星标按钮×${aStarred}`);

    // ---------- ③ A 删除 B 的书 → 导出 → B 合并 → 删除跨端 ----------
    await A.goto(`${BASE}/book?id=${idB}`, { waitUntil: "networkidle" });
    await sleep(1800);
    await A.locator('button[aria-label="词库操作"]').first().click();
    await sleep(400);
    await A.getByRole("menuitem", { name: /删除词库/ }).click();
    await sleep(400);
    await A.getByRole("button", { name: "确认删除" }).click();
    await sleep(1000);
    const packA2 = await exportPack(A);
    const dialogB2 = await importPack(B, packA2);
    const delB2 = Number(dialogB2.match(/删除 (\d+)/)?.[1] ?? -1);
    record("B 预删除提示（书+词条）", delB2 >= 1, `删除 ${delB2}`);
    await applyMerge(B);
    await B.goto(`${BASE}/books`, { waitUntil: "networkidle" });
    await sleep(1500);
    const bAfterDelete = await B.evaluate(() => document.body.innerText);
    record("B 的 1 词书已被跨端删除", !bAfterDelete.includes("1 个词"));

    // ---------- ④ 幂等：B 再导一次同一包 ----------
    const dialogB3 = await importPack(B, packA2);
    const adds = Number(dialogB3.match(/新增 (\d+)/)?.[1] ?? -1);
    const updates = Number(dialogB3.match(/更新 (\d+)/)?.[1] ?? -1);
    const deletes = Number(dialogB3.match(/删除 (\d+)/)?.[1] ?? -1);
    record("重复导入幂等（新增/更新/删除均为 0）", adds === 0 && updates === 0 && deletes === 0, `新增${adds} 更新${updates} 删除${deletes}`);
    await B.getByRole("button", { name: "取消" }).click();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
  process.exitCode = failed.length ? 1 : 0;
};

main().catch((e) => {
  console.error("E2E 失败：", e);
  process.exitCode = 1;
});
