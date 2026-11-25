/** 词库复习参数页与旧深链兼容验收：node scripts/e2e-study-settings.mjs */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = process.env.WV_BASE ?? "http://localhost:3000";
const results = [];
const record = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* 使用本机 npx 缓存 */ }
  const cache = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  for (const dir of readdirSync(cache)) {
    const file = join(dir, "node_modules", "playwright", "index.mjs");
    if (existsSync(file)) return import(pathToFileURL(file).href);
  }
  throw new Error("未找到 playwright");
}

const main = async () => {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const shotDir = join(process.cwd(), "test-fixtures", "study-settings");
  mkdirSync(shotDir, { recursive: true });
  page.setDefaultTimeout(20000);
  try {
    await page.goto(`${BASE}/books`, { waitUntil: "networkidle" });
    await sleep(1000);
    await page.getByRole("button", { name: "创建示例（10 词）" }).first().click();
    await page.waitForURL(/\/book\/?\?id=/, { timeout: 20000 });
    const bookId = new URL(page.url()).searchParams.get("id");
    await sleep(1000);
    // 计时验收需要稳定期词条，def2word 按产品规则不在新词学习阶段出现。
    await page.evaluate((id) => new Promise((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("keyval", "readwrite");
        const getReq = tx.objectStore("keyval").get("wulonvocab-v1");
        getReq.onsuccess = () => {
          const persisted = JSON.parse(getReq.result);
          const book = persisted.state.books.find((item) => item.id === id);
          for (const entry of book.entries) {
            entry.srs = { due: 0, lastReview: Date.now(), stability: 30, difficulty: 5, elapsedDays: 30, scheduledDays: 30, reps: 5, lapses: 0, state: 2, learningSteps: 0 };
          }
          tx.objectStore("keyval").put(JSON.stringify(persisted), "wulonvocab-v1");
        };
        getReq.onerror = () => reject(getReq.error);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), bookId);
    await page.reload({ waitUntil: "networkidle" });

    await page.getByRole("radio", { name: "复习参数", exact: true }).click();
    await page.getByRole("heading", { name: "复习参数", exact: true }).waitFor();
    record("词库工作区出现复习参数 Tab", await page.getByText("每日新词上限", { exact: true }).isVisible());
    record("选择题与 Cloze 参数已迁入", await page.getByText("看词选英文释义", { exact: true }).isVisible()
      && await page.getByText("启用例句挖空", { exact: true }).isVisible());
    record("复习参数拆成独立视觉分组", await page.getByRole("heading", { name: "学习模式", exact: true }).isVisible()
      && await page.getByRole("heading", { name: "每日计划", exact: true }).isVisible()
      && await page.getByRole("heading", { name: "记忆与顺序", exact: true }).isVisible()
      && await page.getByRole("heading", { name: "选择题", exact: true }).isVisible()
      && await page.getByRole("heading", { name: "Cloze", exact: true }).isVisible()
      && await page.getByRole("heading", { name: "辅助规则", exact: true }).isVisible());
    const word2DefSwitch = page.getByRole("switch", { name: "看词选英文释义", exact: true });
    record("新词库默认启用 word2def", await word2DefSwitch.isChecked());
    await word2DefSwitch.click();
    await sleep(500);
    await page.getByRole("button", { name: "启用四子型", exact: true }).click();
    await sleep(500);
    record("一键启用四子型可恢复 word2def", await word2DefSwitch.isChecked());
    const defaultDurations = { word2def: 30, def2word: 20, zh2word: 15, word2zh: 15 };
    const durationLabels = {
      word2def: "看词选英文释义时限",
      def2word: "看英文释义选英文词时限",
      zh2word: "看中文释义选英文词时限",
      word2zh: "看词选中文释义时限",
    };
    for (const [kind, seconds] of Object.entries(defaultDurations)) {
      record(`${kind} 默认 ${seconds} 秒`, (await page.getByRole("combobox", { name: durationLabels[kind] }).textContent())?.includes(`${seconds} 秒`));
    }

    await page.getByRole("radio", { name: "Cloze", exact: true }).click();
    await sleep(700);
    const clozeMode = await page.evaluate((id) => new Promise((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const getReq = db.transaction("keyval", "readonly").objectStore("keyval").get("wulonvocab-v1");
        getReq.onsuccess = () => resolve(JSON.parse(getReq.result).state.books.find((book) => book.id === id)?.study?.config?.quizMode);
        getReq.onerror = () => reject(getReq.error);
      };
    }), bookId);
    record("Cloze 可作为独立模式保存", clozeMode === "cloze", `quizMode=${clozeMode}`);

    await page.getByRole("radio", { name: "混搭", exact: true }).click();
    record("混搭提供三类大题与四个子型滑杆", await page.getByRole("slider").count() === 7);

    await page.getByRole("radio", { name: "0.95 严格" }).click();
    await sleep(900);
    const retention = await page.evaluate((id) => new Promise((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("keyval", "readonly");
        const getReq = tx.objectStore("keyval").get("wulonvocab-v1");
        getReq.onsuccess = () => {
          const state = JSON.parse(getReq.result);
          resolve(state.state.books.find((book) => book.id === id)?.study?.config?.retention);
        };
        tx.oncomplete = () => db.close();
      };
    }), bookId);
    record("参数仍写入原词库学习配置", retention === 0.95, `retention=${retention}`);

    const setChoiceSwitch = async (name, checked) => {
      const control = page.getByRole("switch", { name, exact: true });
      if ((await control.isChecked()) !== checked) {
        await control.click();
        await sleep(400);
      }
      if ((await control.isChecked()) !== checked) throw new Error(`开关状态未保存：${name}`);
    };
    const timerCases = [
      { kind: "word2def", label: "看词选英文释义", seconds: 30 },
      { kind: "def2word", label: "看英文释义选英文词", seconds: 25 },
      { kind: "zh2word", label: "看中文释义选英文词", seconds: 20 },
      { kind: "word2zh", label: "看词选中文释义", seconds: 15 },
    ];
    await page.getByRole("radio", { name: "选择题", exact: true }).click();
    await sleep(400);
    for (const testCase of timerCases) {
      await setChoiceSwitch(testCase.label, true);
      for (const other of timerCases.filter((item) => item.kind !== testCase.kind)) {
        await setChoiceSwitch(other.label, false);
      }
      const durationSelect = page.getByRole("combobox", { name: durationLabels[testCase.kind] });
      await durationSelect.click();
      await page.getByRole("option", { name: `${testCase.seconds} 秒`, exact: true }).click();
      await sleep(400);

      await page.getByRole("radio", { name: "词条编辑", exact: true }).click();
      await page.getByRole("button", { name: "筛选与视图", exact: true }).click();
      await page.getByRole("button", { name: "自由练习这批", exact: true }).click();
      await page.waitForURL(/\/study\/?\?id=/);
      await sleep(300);
      const startPractice = page.getByRole("button", { name: "自由练习这批", exact: true });
      if (await startPractice.isVisible()) await startPractice.click();
      const timer = page.getByRole("timer");
      await timer.waitFor();
      await page.waitForFunction((seconds) => document.querySelector('[role="timer"]')?.textContent?.includes(`限时 ${seconds} 秒`), testCase.seconds);
      const secondsOf = async () => Number((await timer.getAttribute("aria-label"))?.match(/剩余 (\d+) 秒/)?.[1]);
      const initialSeconds = await secondsOf();
      const timerText = await timer.textContent();
      await sleep(1250);
      const laterSeconds = await secondsOf();
      record(`${testCase.kind} 实际使用 ${testCase.seconds} 秒倒计时`,
        timerText?.includes(`限时 ${testCase.seconds} 秒`) && initialSeconds <= testCase.seconds && laterSeconds < initialSeconds,
        `${initialSeconds} → ${laterSeconds}`);

      await page.getByRole("button", { name: "退出学习", exact: true }).click();
      await page.waitForURL(/\/book\/?\?id=/);
      await page.getByRole("radio", { name: "复习参数", exact: true }).click();
    }
    await page.getByRole("button", { name: "启用四子型", exact: true }).click();
    await page.getByRole("button", { name: "恢复默认时长", exact: true }).click();
    await sleep(500);
    await page.getByRole("radio", { name: "混搭", exact: true }).click();
    await sleep(400);

    await page.getByRole("button", { name: "学习引擎怎么安排？" }).click();
    record("原理问号在复习参数页可用", await page.getByText("学习引擎怎么安排？", { exact: true }).last().isVisible());
    await page.keyboard.press("Escape");

    await page.getByRole("radio", { name: "题库", exact: true }).click();
    await page.getByRole("heading", { name: "选择题题库", exact: true }).waitFor();
    await page.getByRole("button", { name: "新建题目", exact: true }).click();
    const questionDialog = page.getByRole("dialog");
    await questionDialog.getByRole("heading", { name: "新建个人题目", exact: true }).waitFor();
    const dialogRect = await questionDialog.boundingBox();
    record("新建题目立即打开可见编辑器", Boolean(dialogRect && dialogRect.y >= 0 && dialogRect.y + dialogRect.height <= 900), JSON.stringify(dialogRect));
    await page.screenshot({ path: join(shotDir, "new-question-desktop.png") });
    const optionInputs = questionDialog.getByPlaceholder("英文释义或单词");
    await optionInputs.nth(1).fill("to leave something behind");
    await optionInputs.nth(2).fill("to keep something safely");
    await optionInputs.nth(3).fill("to finish something early");
    await questionDialog.getByPlaceholder("与正确答案的关键差异").fill("抛弃强调主动放弃，保留强调继续持有");
    await questionDialog.getByRole("button", { name: "保存题目", exact: true }).click();
    await questionDialog.waitFor({ state: "hidden" });
    record("新建个人题目可校验并保存", (await page.getByText("1 道个人题。只显示当前词条中能用到的题目，保存前会再次校验。", { exact: true }).count()) === 1);
    await page.getByRole("button", { name: "编辑题目", exact: true }).click();
    await questionDialog.getByRole("heading", { name: "编辑个人题目", exact: true }).waitFor();
    await questionDialog.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "删除题目", exact: true }).click();
    await page.getByText("0 道个人题。只显示当前词条中能用到的题目，保存前会再次校验。", { exact: true }).waitFor();
    record("个人题目可打开编辑与删除", await page.getByRole("button", { name: "新建题目", exact: true }).isEnabled());

    await page.getByRole("button", { name: "导入示例题", exact: true }).click();
    await sleep(900);
    const bankState = await page.evaluate((id) => new Promise((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const getReq = db.transaction("keyval", "readonly").objectStore("keyval").get("wulonvocab-v1");
        getReq.onsuccess = () => {
          const book = JSON.parse(getReq.result).state.books.find((item) => item.id === id);
          resolve({ count: book.personalQuizBank?.length ?? 0, source: book.study?.config?.quizBankSource });
        };
        getReq.onerror = () => reject(getReq.error);
      };
    }), bookId);
    record("示例十词可导入 40 道个人题", bankState.count === 40, `count=${bankState.count}`);
    await page.getByRole("radio", { name: "个人题库", exact: true }).click();
    await sleep(700);
    record("公共与个人题库可分层选择", await page.getByRole("button", { name: "一键设置为公共题库", exact: true }).isVisible()
      && await page.getByRole("button", { name: "一键生成公共题库", exact: true }).isVisible());

    const longUrl = `https://gist.githubusercontent.com/example/${"a".repeat(180)}/raw/wulonvocab-public-bank.json`;
    await page.getByLabel("公共题库地址").fill(longUrl);
    await page.getByRole("button", { name: "一键设置为公共题库", exact: true }).click();
    await sleep(700);
    const address = page.getByText(longUrl, { exact: true });
    record("长公共地址在卡片内换行不溢出", await address.evaluate((node) => node.scrollWidth <= node.clientWidth + 1));

    await page.getByRole("radio", { name: "复习参数", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    record("390px 视口无横向溢出", !overflow);

    await page.getByRole("radio", { name: "题库", exact: true }).click();
    await page.getByRole("button", { name: "新建题目", exact: true }).click();
    const mobileDialog = page.getByRole("dialog");
    await mobileDialog.getByRole("heading", { name: "新建个人题目", exact: true }).waitFor();
    const mobileRect = await mobileDialog.boundingBox();
    record("390px 新建题目对话框完整可见", Boolean(
      mobileRect && mobileRect.x >= 0 && mobileRect.y >= 0
      && mobileRect.x + mobileRect.width <= 391 && mobileRect.y + mobileRect.height <= 845,
    ), JSON.stringify(mobileRect));
    await page.screenshot({ path: join(shotDir, "new-question-mobile.png") });
    await mobileDialog.getByRole("button", { name: "取消", exact: true }).click();

    await page.goto(`${BASE}/settings/study?book=${encodeURIComponent(bookId)}`, { waitUntil: "networkidle" });
    await page.waitForURL(new RegExp(`/book/?\\?id=${bookId}`), { timeout: 20000 });
    await page.getByRole("heading", { name: "复习参数", exact: true }).waitFor();
    record("旧 settings/study?book= 深链兼容", /\/book\/?$/.test(new URL(page.url()).pathname));

    await page.getByRole("radio", { name: "词条编辑", exact: true }).click();
    record("批量编辑入口位于列表主操作区", await page.getByRole("button", { name: "批量编辑", exact: true }).isVisible());
    await page.getByRole("button", { name: "筛选与视图", exact: true }).click();
    record("筛选弹层不再重复放置批量编辑", await page.getByRole("button", { name: "批量编辑", exact: true }).count() === 1);
    await page.keyboard.press("Escape");

    await page.goto(`${BASE}/settings/about`, { waitUntil: "domcontentloaded" });
    const details = page.locator("details[name='wulonvocab-principles']");
    await details.first().waitFor();
    record("关于页呈现四组原理手风琴", await details.count() === 4);
    await details.nth(1).locator("summary").click();
    record("手风琴可展开且互斥", await details.nth(1).evaluate((node) => node.open)
      && !(await details.nth(0).evaluate((node) => node.open))
      && await details.nth(1).getByText("新词三步流", { exact: true }).isVisible());
    const aboutOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    record("关于页 390px 视口无横向溢出", !aboutOverflow);
  } finally {
    await browser.close();
  }
  const failed = results.filter((result) => !result.pass);
  console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
  process.exitCode = failed.length ? 1 : 0;
};

main().catch((error) => { console.error("E2E 失败：", error); process.exitCode = 1; });
