const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
const path = require("node:path");
test("PostgreSQL policies isolate owners, reject anonymous access and preserve revisions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated,anon;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
    const sql = fs.readFileSync(
      path.join(__dirname, "../supabase/schema.sql"),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`,
    );
    const id = "33333333-3333-4333-8333-333333333333";
    await db.query(
      "insert into public.tradecraft_journal(user_id,id,record) values (auth.uid(),$1,$2)",
      [id, JSON.stringify({ id, status: "planned" })],
    );
    assert.equal(
      (await db.query("select * from public.tradecraft_journal")).rows.length,
      1,
    );
    await db.exec(
      `set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';`,
    );
    assert.equal(
      (await db.query("select * from public.tradecraft_journal")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("delete from public.tradecraft_journal returning id"))
        .rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          'update public.tradecraft_journal set record=record || \'{"status":"open"}\' returning id',
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.tradecraft_journal(user_id,id,record) values ($1,$2,$3)",
        [
          "11111111-1111-4111-8111-111111111111",
          id,
          JSON.stringify({ id, status: "planned" }),
        ],
      ),
      /row-level security/,
    );
    await db.exec(
      `set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';`,
    );
    const changed = await db.query(
      'update public.tradecraft_journal set record=record || \'{"status":"open"}\' where version=1 returning version',
    );
    assert.equal(changed.rows[0].version, 2);
    assert.equal(
      (
        await db.query(
          "update public.tradecraft_journal set record=record where version=1 returning id",
        )
      ).rows.length,
      0,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(
      db.query("select * from public.tradecraft_journal"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
