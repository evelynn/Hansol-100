// Real-browser smoke test for the service UI. Runs only when Playwright is
// resolvable (globally installed or via NODE_PATH) and a Chromium is available;
// otherwise it is skipped so `npm test` stays dependency-free.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { createApp } from "../scripts/server/server.mjs";

const require = createRequire(import.meta.url);
let playwright = null;
try {
  playwright = require("playwright");
} catch {
  playwright = null;
}

const generic = JSON.parse(fs.readFileSync("fixtures/generic-sample.json", "utf8"));
const gov = JSON.parse(fs.readFileSync("fixtures/gov-sample.json", "utf8"));
const workflow = JSON.parse(fs.readFileSync("engines/archify/examples/agent-tool-call.workflow.json", "utf8"));
delete workflow.meta.output;

test("browser: library → search → viewer → editor → save", { skip: !playwright && "playwright not installed" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-ui-test-"));
  fs.writeFileSync(path.join(dir, "release.json"), JSON.stringify(generic));
  fs.writeFileSync(path.join(dir, "gov.json"), JSON.stringify(gov));
  fs.writeFileSync(path.join(dir, "wf.json"), JSON.stringify(workflow));
  const app = createApp({ libraryDir: dir });
  const { url } = await app.listen(0);
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });
  } catch (err) {
    await app.close();
    test.skip(`chromium unavailable: ${err.message}`);
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

    await page.goto(url);
    await page.waitForSelector(".card");
    assert.equal(await page.locator(".card").count(), 3);

    await page.fill("input[type=search]", "심판");
    await page.waitForFunction(() => document.querySelectorAll(".card").length === 1);
    assert.match(await page.locator(".card .title a").first().textContent(), /행정심판/);

    await page.click(".card .title a");
    await page.waitForSelector(".viewer .sheet svg");
    assert.ok((await page.locator(".viewer .metrics .metric").count()) >= 5, "quality metrics rendered");

    await page.click(".viewer-head a.btn.primary");
    await page.waitForSelector(".editor .sheet svg");
    const titleInput = page.locator(".editor input[aria-label='제목'], .editor input[aria-label='Title']").first();
    await titleInput.fill("행정심판 (편집됨)");
    await page.waitForFunction(() => document.querySelector(".editor .sheet svg")?.textContent.includes("편집됨"), null, { timeout: 10_000 });
    await page.keyboard.press("Control+s");
    await page.waitForFunction(() => document.querySelector(".editor .status")?.textContent?.match(/저장됨|Saved/));
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "gov.json"), "utf8"));
    assert.equal(saved.title, "행정심판 (편집됨)");

    await page.goto(`${url}#/view/wf`);
    await page.waitForSelector(".viewer iframe.frame");
    const frame = page.frameLocator(".viewer iframe.frame");
    await frame.locator("svg").first().waitFor();

    await page.goto(`${url}#/new/board-ko`);
    await page.waitForSelector(".editor .sheet svg");
    await page.click(".editor-head button.btn.primary");
    await page.waitForFunction(() => document.querySelector(".editor .status")?.textContent?.match(/저장됨|Saved/));
    assert.ok(fs.existsSync(path.join(dir, "새-업무-프로세스.json")));

    assert.deepEqual(errors, [], `browser errors: ${errors.join("\n")}`);
  } finally {
    await browser.close();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
