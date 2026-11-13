// Servidor local para probar (imita Vercel): node dev-server.js  → http://localhost:3000
const http = require("http"), fs = require("fs"), path = require("path");
try { fs.readFileSync(".env", "utf8").split("\n").forEach(l => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim(); }); } catch (_) {}
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) {
    const f = path.join(__dirname, "api", u.pathname.slice(5) + ".js");
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end("no"); }
    return require(f)(req, res);
  }
  const file = path.join(__dirname, "public", u.pathname === "/" ? "index.html" : u.pathname);
  if (!file.startsWith(path.join(__dirname, "public")) || !fs.existsSync(file)) { res.statusCode = 404; return res.end("no"); }
  res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8");
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log("http://localhost:" + (process.env.PORT || 3000)));
