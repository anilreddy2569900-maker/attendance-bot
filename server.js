// Runs the website on your own computer: node server.js
// Same page and same /api code as the hosted site. No packages needed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import submit from "./api/submit.js";
import tweet from "./api/tweet.js";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "web");
const PORT = process.env.PORT || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const API = { "/api/submit": submit, "/api/tweet": tweet };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    const api = API[url.pathname];
    if (api) {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      try { req.body = JSON.parse(raw || "{}"); } catch { req.body = {}; }
      req.query = Object.fromEntries(url.searchParams);
      res.status = (code) => ((res.statusCode = code), res);
      res.json = (obj) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(obj));
      };
      return api(req, res);
    }

    const name = url.pathname === "/" ? "index.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    const file = path.join(WEB, name);
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Open http://localhost:${PORT} in your browser (Ctrl+C to stop)`));
