#!/usr/bin/env node
/**
 * 本地预览 GitHub Pages 产物（out/，带 /wulonvocab 前缀，模拟子路径托管）：
 *   npm run build:pages && npm run serve:pages
 */

import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = "out";
const prefix = process.env.NEXT_PUBLIC_BASE_PATH ?? "/wulonvocab";
const port = Number(process.env.PORT ?? 4010);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  if (prefix && pathname.startsWith(prefix)) pathname = pathname.slice(prefix.length);
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  let file = normalize(join(root, pathname));
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    const data = readFileSync(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
}).listen(port, () => {
  console.log(`static preview ready: http://localhost:${port}${prefix}/`);
});
