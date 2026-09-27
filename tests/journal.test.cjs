const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
let browser, server, origin;
before(async () => {
  let html = fs.readFileSync(
    path.join(__dirname, "../dist/index.html"),
    "utf8",
  );
  html = html.replace(
    /window.TRADECRAFT_CONFIG=.*?;<\/script>/,
    'window.TRADECRAFT_CONFIG={"supabaseUrl":"https://journal-test.supabase.co","supabaseKey":"sb_publishable_test"};</script>',
  );
  server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
});
after(async () => {
  await browser?.close();
  server?.close();
});
const firstUser = "11111111-1111-4111-8111-111111111111",
  secondUser = "22222222-2222-4222-8222-222222222222";
const userFor = (email) => ({
  id: email === "other@example.com" ? secondUser : firstUser,
  email,
  aud: "authenticated",
  role: "authenticated",
});
function session(email) {
  const user = userFor(email);
  const payload = {
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
  };
  return {
    access_token:
      Buffer.from('{"alg":"HS256"}').toString("base64url") +
      "." +
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      ".test",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "test-refresh",
    user,
  };
}
function fixture() {
  return { rows: new Map(), failWrite: false };
}
async function setup(t, data = fixture(), width = 1440) {
  const context = await browser.newContext({
      viewport: { width, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    assert.deepEqual(errors, []);
    await context.close();
  });
  await page.route("https://journal-test.supabase.co/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method();
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (method === "OPTIONS") return reply({});
    if (url.pathname === "/auth/v1/token")
      return reply(session(req.postDataJSON().email || "trader@example.com"));
    if (url.pathname === "/auth/v1/logout") return reply({});
    if (url.pathname === "/auth/v1/user")
      return reply(userFor("trader@example.com"));
    if (url.pathname === "/auth/v1/recover") return reply({});
    if (url.pathname === "/auth/v1/signup")
      return reply({ user: userFor("trader@example.com"), session: null });
    if (url.pathname !== "/rest/v1/tradecraft_journal")
      return reply({ message: "Unexpected endpoint" }, 404);
    const body = method === "GET" ? null : req.postDataJSON();
    const owner =
      (url.searchParams.get("user_id") || "").replace("eq.", "") ||
      (Array.isArray(body) ? body[0]?.user_id : body?.user_id);
    const token = req.headers().authorization?.split(" ")[1],
      tokenOwner = token
        ? JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
            .sub
        : null;
    if (!tokenOwner || tokenOwner !== owner)
      return reply({ message: "Not allowed" }, 403);
    const own = [...data.rows.values()].filter((row) => row.user_id === owner);
    if (method === "GET") return reply(own);
    if (data.failWrite)
      return reply({ message: "Temporary sync failure" }, 503);
    if (method === "POST") {
      const added = [];
      for (const item of Array.isArray(body) ? body : [body]) {
        const key = owner + item.id;
        if (data.rows.has(key)) {
          if (req.headers().prefer?.includes("ignore-duplicates")) continue;
          return reply({ code: "23505", message: "Duplicate key" }, 409);
        }
        const row = { ...item, version: 1 };
        data.rows.set(key, row);
        added.push(row);
      }
      return reply(added, 201);
    }
    const id = url.searchParams.get("id")?.replace("eq.", ""),
      version = Number(url.searchParams.get("version")?.replace("eq.", "")),
      key = owner + id,
      row = data.rows.get(key);
    if (!row || row.version !== version) return reply([]);
    if (method === "DELETE") {
      data.rows.delete(key);
      return reply([row]);
    }
    const next = { ...row, record: body.record, version: row.version + 1 };
    data.rows.set(key, next);
    return reply([next]);
  });
  await page.goto(origin + "/#journal");
  return { page, data };
}
async function signIn(page, email = "trader@example.com") {
  await page.locator("#authEmail").fill(email);
  await page.locator("#authPassword").fill("testing-password");
  await page.locator("#emailSignIn").click();
  await page.locator("#journalAccount").waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    document
      .getElementById("journalSyncStatus")
      .textContent.startsWith("Synced"),
  );
}
async function newRecord(page, status = "planned") {
  await page.locator('.nav-btn[data-view="review"]').click();
  await page.locator("#btnSaveJournal").click();
  await page.locator("#recordStatus").selectOption(status);
}
async function save(page) {
  await page.locator("#submitRecord").click();
  await page.locator("#journalDialog").waitFor({ state: "hidden" });
}
test("sign in, create a plan, edit execution, and sync across two browser sessions", async (t) => {
  const { page, data } = await setup(t);
  await signIn(page);
  await newRecord(page);
  await page.locator("#recordNotes").fill("Breakout setup.");
  await save(page);
  assert.equal(data.rows.size, 1);
  assert.equal(await page.locator("#journalRows tr").count(), 1);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("#journalRows tr").length === 1,
  );
  await page.locator("#journalRows button").click();
  await page.locator("#recordStatus").selectOption("closed");
  await page.locator("#recordExit").fill("160");
  await page.locator("#recordFees").fill("3");
  assert.equal(await page.locator("#recordNet").innerText(), "$17.00");
  await save(page);
  assert.equal(await page.locator("#journalNet").innerText(), "$17.00");
  assert.equal(await page.locator("#journalWinRate").innerText(), "100%");
  const other = await setup(t, data, 390);
  await signIn(other.page);
  assert.equal(await other.page.locator("#journalNet").innerText(), "$17.00");
  assert.equal(
    await other.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/journal-desktop.png",
    fullPage: true,
  });
  await other.page.screenshot({
    path: "test-results/journal-mobile.png",
    fullPage: true,
  });
  await page.locator("#signOutJournal").click();
  await page.locator("#journalAuth").waitFor({ state: "visible" });
  assert.equal(await page.locator("#journalRows tr").count(), 0);
  await signIn(page, "other@example.com");
  assert.equal(await page.locator("#journalRows tr").count(), 0);
});
test("save failures keep draft; competing edits are rejected; deletion requires confirmation", async (t) => {
  const { page, data } = await setup(t);
  await signIn(page);
  await newRecord(page);
  data.failWrite = true;
  await page.locator("#submitRecord").click();
  await page.locator("#recordError").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#recordError").innerText(),
    /Temporary sync failure/,
  );
  assert.equal(data.rows.size, 0);
  data.failWrite = false;
  await save(page);
  await page.locator("#journalRows button").click();
  [...data.rows.values()][0].version++;
  await page.locator("#submitRecord").click();
  await page.locator("#recordError").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#recordError").innerText(),
    /another device/,
  );
  await page.locator("#cancelRecord").click();
  await page.locator("#refreshJournal").click();
  await page.waitForFunction(() =>
    document
      .getElementById("journalSyncStatus")
      .textContent.startsWith("Synced"),
  );
  await page.locator("#journalRows button").click();
  await page.locator("#deleteRecord").click();
  assert.equal(data.rows.size, 1);
  await page.locator("#confirmDeleteRecord").click();
  await page.locator("#journalDialog").waitFor({ state: "hidden" });
  assert.equal(data.rows.size, 0);
});
test("backup exports, duplicate-safe imports, filtering and notes render as text", async (t) => {
  const { page, data } = await setup(t);
  await signIn(page);
  await newRecord(page);
  await page
    .locator("#recordNotes")
    .fill('<img src=x onerror="alert(1)"> earnings setup');
  await save(page);
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportJournal").click();
  const download = await downloadPromise;
  const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.equal(backup.records.length, 1);
  assert.equal(backup.records[0]._version, undefined);
  await page.locator("#journalFile").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.waitForFunction(() =>
    document
      .getElementById("journalNotice")
      .textContent.includes("Backup imported"),
  );
  assert.equal(data.rows.size, 1);
  await page.locator("#journalSearch").fill("unmatched");
  assert.equal(await page.locator("#journalRows tr").count(), 0);
  await page.locator("#journalSearch").fill("earnings");
  assert.equal(await page.locator("#journalRows tr").count(), 1);
  await page.locator("#journalRows button").click();
  assert.match(await page.locator("#recordNotes").inputValue(), /<img/);
  assert.equal(await page.locator("#journalDialog img").count(), 0);
  await page.locator("#cancelRecord").click();
  backup.records[0].shares = -1;
  await page.locator("#journalFile").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.waitForFunction(() =>
    document
      .getElementById("journalNotice")
      .textContent.includes("invalid trade record"),
  );
  assert.equal(data.rows.size, 1);
});

test("entry reasons and fractional trades persist; blank fees stay estimated and zero is actual", async (t) => {
  const { page, data } = await setup(t);
  await signIn(page);
  await page.locator('.nav-btn[data-view="plan"]').click();
  await page.locator("#btnModeManual").click();
  await page.locator("#customSharesInput").fill("0.25");
  await newRecord(page, "closed");
  assert.equal(await page.locator("#recordShares").inputValue(), "0.25");
  await page.locator('[data-reason="Breakout"]').click();
  await page.locator('[data-reason="Volume spike"]').click();
  await page.locator('[data-reason="Reversal"]').click();
  await page.locator('[data-reason="Reversal"]').click();
  await page.locator("#recordCustomReason").fill("Retest of premarket high");
  await page.locator("#recordNotes").fill("Waited for confirmation.");
  await page.locator("#recordExit").fill("160");
  assert.equal(await page.locator("#recordFees").inputValue(), "");
  assert.equal(
    await page.locator("#recordNetLabel").innerText(),
    "Estimated net P&L",
  );
  assert.equal(await page.locator("#recordNet").innerText(), "$0.04");
  assert.equal(data.rows.size, 0);
  await page.screenshot({
    path: "test-results/journal-reasons-editor.png",
    fullPage: true,
  });
  await save(page);
  const record = [...data.rows.values()][0].record;
  assert.deepEqual(record.entryReasons, ["Breakout", "Volume spike"]);
  assert.equal(record.customEntryReason, "Retest of premarket high");
  assert.equal(record.fees, null);
  assert.equal(record.shares, 0.25);
  assert.equal(record.plan.shares, 0.25);
  assert.match(
    await page.locator("#journalRows").innerText(),
    /Breakout.*Volume spike.*Retest/,
  );
  assert.match(await page.locator("#journalNetLabel").innerText(), /estimated/);
  assert.match(
    await page.locator("#journalRows").innerText(),
    /Estimated fees/,
  );
  await page.locator("#journalSearch").fill("premarket");
  assert.equal(await page.locator("#journalRows tr").count(), 1);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("#journalRows tr").length === 1,
  );
  await page.screenshot({
    path: "test-results/journal-reasons-desktop.png",
    fullPage: true,
  });
  await page.locator("#journalRows button").click();
  assert.equal(
    await page.locator('[data-reason="Breakout"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.locator('[data-reason="Reversal"]').getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.locator("#recordCustomReason").inputValue(),
    "Retest of premarket high",
  );
  assert.equal(await page.locator("#recordFees").inputValue(), "");
  await page.locator("#recordFees").fill("-1");
  await page.locator("#submitRecord").click();
  assert.equal(await page.locator("#journalDialog").isVisible(), true);
  await page.locator("#recordFees").fill("0");
  assert.equal(await page.locator("#recordNet").innerText(), "$2.50");
  await save(page);
  assert.equal([...data.rows.values()][0].record.fees, 0);
  assert.equal(
    await page.locator("#journalNetLabel").innerText(),
    "Closed net P&L",
  );
  assert.equal(await page.locator("#journalNet").innerText(), "$2.50");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportJournal").click();
  const backup = JSON.parse(
    fs.readFileSync(await (await downloadPromise).path(), "utf8"),
  );
  assert.deepEqual(backup.records[0].entryReasons, [
    "Breakout",
    "Volume spike",
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "test-results/journal-reasons-mobile.png",
    fullPage: true,
  });
});

test("legacy records load and new fractional reasons survive JSON import", async (t) => {
  const { page, data } = await setup(t);
  await signIn(page);
  await newRecord(page);
  await save(page);
  const legacy = [...data.rows.values()][0].record;
  delete legacy.entryReasons;
  delete legacy.customEntryReason;
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll("#journalRows tr").length === 1,
  );
  assert.equal(
    await page.locator("#journalRows .entry-reason").innerText(),
    "—",
  );
  const imported = {
    ...legacy,
    id: "33333333-3333-4333-8333-333333333333",
    shares: 0.125,
    status: "closed",
    exit: 140,
    fees: null,
    closedAt: legacy.entryAt,
    entryReasons: ["Pullback"],
    customEntryReason: '<img src=x onerror="alert(1)">',
    plan: { ...legacy.plan, shares: 0.125, direction: "short" },
  };
  await page
    .locator("#journalFile")
    .setInputFiles({
      name: "new.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "tradecraft-journal",
          version: 1,
          records: [imported],
        }),
      ),
    });
  await page.waitForFunction(
    () => document.querySelectorAll("#journalRows tr").length === 2,
  );
  assert.equal(data.rows.size, 2);
  assert.equal(await page.locator("#journalRows img").count(), 0);
  assert.match(await page.locator("#journalRows").innerText(), /Pullback/);
  assert.equal(await page.locator("#journalNet").innerText(), "-$1.21");
});
