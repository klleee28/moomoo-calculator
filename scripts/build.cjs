const {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} = require("node:fs");
const { resolve } = require("node:path");
const { buildSync } = require("esbuild");
const root = resolve(__dirname, "..");
const local = {};
const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) local[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
const env = { ...local, ...process.env };
const config = {
  supabaseUrl: env.SUPABASE_URL || "",
  supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "",
  googleAuthEnabled: env.GOOGLE_AUTH_ENABLED === "true",
};
if (!!config.supabaseUrl !== !!config.supabaseKey)
  throw Error("Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
if (process.env.VERCEL && !config.supabaseUrl)
  throw Error(
    "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Vercel before deploying.",
  );
if (config.supabaseUrl && new URL(config.supabaseUrl).protocol !== "https:")
  throw Error("Supabase must use an HTTPS URL.");
if (config.supabaseKey.startsWith("sb_secret_"))
  throw Error("Never expose a secret key in the app. Use a publishable key.");
if (config.supabaseKey.startsWith("eyJ")) {
  const payload = JSON.parse(
    Buffer.from(config.supabaseKey.split(".")[1], "base64url").toString(),
  );
  if (payload.role !== "anon")
    throw Error("Only the legacy anon key may be used in the browser.");
}
const bundled = buildSync({
  entryPoints: [resolve(root, "src/cloud-client.js")],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  legalComments: "inline",
}).outputFiles[0].text;
const bootstrap =
  "<script>window.TRADECRAFT_CONFIG=" +
  JSON.stringify(config).replace(/</g, "\\u003c") +
  ";</script><script>" +
  bundled.replace(/<\/script/gi, "<\\/script") +
  "</script>";
const html = readFileSync(resolve(root, "index.html"), "utf8").replace(
  "<!-- CLOUD_BOOTSTRAP -->",
  bootstrap,
);
mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(resolve(root, "dist/index.html"), html);
console.log(
  "App built in dist/. Cloud journal " +
    (config.supabaseUrl
      ? "configured."
      : "not configured; calculator works without sign-in."),
);
