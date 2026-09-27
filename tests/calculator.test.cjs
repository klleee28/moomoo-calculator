const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let browser, server, origin;
before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(path.join(__dirname, "../index.html")));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
  fs.mkdirSync("test-results", { recursive: true });
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function pageFor(t, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: 1100 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  t.after(async () => {
    assert.deepEqual(errors, [], "no browser errors");
    await context.close();
  });
  await page.goto(origin);
  return page;
}
const amount = async (page, id) =>
  Number((await page.locator("#" + id).innerText()).replace(/[^\d.-]/g, ""));
const view = (page, name) =>
  page.locator('.nav-btn[data-view="' + name + '"]').click();

test("default position, all workflow views, fees, clipboard and notes", async (t) => {
  const page = await pageFor(t);
  assert.equal(await amount(page, "metricShares"), 2);
  assert.equal(await amount(page, "metricActualLoss"), 8.92);
  assert.ok((await amount(page, "metricTargetNetGain")) >= 20);
  await page.screenshot({
    path: "test-results/desktop-plan.png",
    fullPage: true,
  });
  await page.locator("#btnQuickExpandFees").click();
  assert.equal(await page.locator('[data-panel="outcomes"]').isVisible(), true);
  assert.equal(
    await page.locator("#feeAccordionHeader").getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(await page.locator("#ladderTableBody tr").count(), 8);
  await page.screenshot({
    path: "test-results/desktop-outcomes.png",
    fullPage: true,
  });
  await view(page, "review");
  await page
    .locator("#tradeNotes")
    .fill("Breakout above prior high; stop below support.");
  await page.locator("#btnCopyOrder").click();
  const order = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(order, /BUY NVDA.*2 shares.*STOP/);
  await page.locator("#btnCopyJournal").click();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /Notes: Breakout above prior high/,
  );
  await page.screenshot({
    path: "test-results/desktop-review.png",
    fullPage: true,
  });
  await page.reload();
  assert.equal(
    await page.locator("#tradeNotes").inputValue(),
    "Breakout above prior high; stop below support.",
  );
  assert.equal(await page.locator('[data-panel="review"]').isVisible(), true);
});

test("invalid and empty inputs clear results and prevent copying", async (t) => {
  const page = await pageFor(t);
  for (const [id, value, reset] of [
    ["entryPrice", "", "150"],
    ["entryPrice", "0", "150"],
    ["riskPercentage", "21", "1"],
    ["tradeTicker", "<script>", "NVDA"],
  ]) {
    await page.locator("#" + id).fill(value);
    assert.equal(await page.locator("#btnCopyOrder").isDisabled(), true);
    assert.equal(await page.locator("#metricShares").innerText(), "—");
    assert.equal(
      await page.locator("#" + id).getAttribute("aria-invalid"),
      "true",
    );
    await page.locator("#" + id).fill(reset);
    assert.equal(await page.locator("#btnCopyOrder").isDisabled(), false);
  }
  await page.locator("#stopPrice").fill("155");
  assert.match(
    await page.locator("#bannersContainer").innerText(),
    /stop must be below/,
  );
  assert.equal(await page.locator("#btnCopyJournal").isDisabled(), true);
});

test("short positions place sell-side regulatory fees on entry", async (t) => {
  const page = await pageFor(t);
  await page.locator("#btnDirShort").click();
  await page.locator("#stopPrice").fill("153");
  assert.ok((await amount(page, "metricTargetPrice")) < 150);
  assert.ok((await amount(page, "metricActualLoss")) <= 10);
  await page.locator("#btnQuickExpandFees").click();
  const sec = page
    .locator("#feeTableBody tr")
    .filter({ hasText: "US SEC Regulatory Fee" });
  assert.equal(await sec.locator("td").nth(2).innerText(), "$0.0100");
  assert.equal(await sec.locator("td").nth(3).innerText(), "$0.0000");
  const total = await page
    .locator("#feeTableBody .total-row td")
    .last()
    .innerText();
  assert.equal(total, await page.locator("#metricRtFees").innerText());
});

test("custom risk warning, fee-inclusive cash clamp and auto size", async (t) => {
  const page = await pageFor(t);
  await page.locator("#btnModeManual").click();
  await page.locator("#customSharesInput").fill("10");
  assert.match(
    await page.locator("#bannersContainer").innerText(),
    /exceeds your risk budget/,
  );
  await page.locator("#btnClampCash").click();
  assert.equal(await page.locator("#customSharesInput").inputValue(), "6");
  assert.equal(
    await page.locator("#btnModeManual").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#customSharesInput").fill("2.5");
  assert.equal(await page.locator("#btnCopyOrder").isDisabled(), true);
  await page.locator("#btnModeAuto").click();
  assert.equal(await amount(page, "metricShares"), 2);
  assert.equal(await page.locator("#btnCopyOrder").isDisabled(), false);
});

test("settings persist; reset clears plan but retains broker preferences", async (t) => {
  const page = await pageFor(t);
  await view(page, "settings");
  await page.locator("#btnCommissionStd").click();
  await page.locator("#usdMyrRate").fill("4.55");
  await page.reload();
  assert.equal(await page.locator("#usdMyrRate").inputValue(), "4.55");
  assert.equal(
    await page.locator("#btnCommissionStd").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#btnResetDefaults").click();
  assert.equal(await page.locator("#usdMyrRate").inputValue(), "4.55");
  assert.equal(
    await page.locator("#btnCommissionStd").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator('[data-panel="plan"]').isVisible(), true);
  await view(page, "settings");
  await page.screenshot({
    path: "test-results/desktop-settings.png",
    fullPage: true,
  });
});

test("small risk budget and impossible short target do not produce a copyable plan", async (t) => {
  const page = await pageFor(t);
  await page.locator("#accountBalance").fill("10");
  assert.equal(await amount(page, "metricShares"), 0);
  assert.equal(await page.locator("#btnCopyOrder").isDisabled(), true);
  await page.locator("#accountBalance").fill("1000");
  await page.locator("#btnDirShort").click();
  await page.locator("#entryPrice").fill("1");
  await page.locator("#stopPrice").fill("2");
  assert.equal(await page.locator("#btnCopyOrder").isDisabled(), true);
  assert.equal(
    await page.locator("#metricTargetPrice").innerText(),
    "Unavailable",
  );
  assert.doesNotMatch(await page.locator("body").innerText(), /NaN|Infinity/);
});

test("phone and tablet layouts fit, navigate and remain usable", async (t) => {
  const page = await pageFor(t, 390);
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["plan", "outcomes", "review", "settings"]) {
      await view(page, name);
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      );
      assert.equal(fits, true, name + " fits at " + width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await view(page, "plan");
  await page.screenshot({
    path: "test-results/mobile-plan.png",
    fullPage: true,
  });
});

test("storage corruption and denied storage do not break calculations", async (t) => {
  const page = await pageFor(t);
  await page.evaluate(() =>
    localStorage.setItem("tradecraft.preferences.v1", "{bad json"),
  );
  await page.reload();
  assert.equal(await amount(page, "metricShares"), 2);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("denied");
    };
  });
  await page.reload();
  assert.equal(await amount(page, "metricShares"), 2);
  await view(page, "settings");
  assert.match(
    await page.locator("#saveStatus").innerText(),
    /Storage unavailable/,
  );
});

test("examples, custom reward levels and sub-dollar precision stay synchronized", async (t) => {
  const page = await pageFor(t);
  await page.locator("summary").click();
  await page.locator('[data-preset^="AAPL,"]').click();
  assert.equal(await page.locator("#tradeTicker").inputValue(), "AAPL");
  assert.equal(await page.locator("#entryPrice").inputValue(), "180");
  await page.locator("#rrRatio").fill("2.7");
  assert.equal(await page.locator("#rrSlider").inputValue(), "2.7");
  assert.equal(
    await page.locator('[data-set="rr:2"]').getAttribute("aria-pressed"),
    "false",
  );
  await view(page, "outcomes");
  assert.match(
    await page.locator("#ladderTableBody .active-target").innerText(),
    /2.7R/,
  );
  await view(page, "plan");
  await page.locator("#entryPrice").fill("0.5");
  await page.locator("#stopPrice").fill("0.499");
  assert.equal(await page.locator("#summaryStop").innerText(), "$0.4990");
  await view(page, "review");
  await page.locator("#btnCopyOrder").click();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /STOP: \$0.4990/,
  );
});

test("cash clamp reserves entry fees at an exact position-value boundary", async (t) => {
  const page = await pageFor(t);
  await page.locator("#accountBalance").fill("300");
  await page.locator("#btnModeManual").click();
  await page.locator("#customSharesInput").fill("2");
  await page.locator("#btnClampCash").click();
  assert.equal(await page.locator("#customSharesInput").inputValue(), "1");
  assert.equal(await page.locator("#btnClampCash").count(), 0);
});
