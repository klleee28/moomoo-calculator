const http = require("node:http");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const file = resolve(__dirname, "../dist/index.html");
http
  .createServer((req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(readFileSync(file));
  })
  .listen(8766, "127.0.0.1", () =>
    console.log("Preview: http://127.0.0.1:8766"),
  );
