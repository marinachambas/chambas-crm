// Datos compartidos del CRM (tareas, dueños, pauta, facturas…). Cada colección es un hash en Redis + un contador de versión.
const { requireAuth, send, body } = require("../lib/auth");
const { cmd } = require("../lib/kv");
const COL_RE = /^[a-z0-9_\/-]{1,80}$/i, ID_RE = /^[^\s]{1,300}$/;
module.exports = requireAuth(async (req, res) => {
  if (req.method === "GET") {
    const url = new URL(req.url, "http://x");
    const cols = String(url.searchParams.get("cols") || "").split(",").filter(c => COL_RE.test(c)).slice(0, 40);
    if (!cols.length) return send(res, 400, { error:"cols" });
    const vers = await cmd("MGET", ...cols.map(c => "ver:" + c));
    const since = JSON.parse(url.searchParams.get("since") || "{}");
    const out = {};
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i], v = Number(vers[i]) || 0;
      if (since[c] != null && Number(since[c]) === v) { out[c] = { ver:v, same:true }; continue; }
      const flat = await cmd("HGETALL", "col:" + c) || [];
      const docs = {};
      for (let j = 0; j < flat.length; j += 2) { try { docs[flat[j]] = JSON.parse(flat[j + 1]); } catch (_) {} }
      out[c] = { ver:v, docs };
    }
    return send(res, 200, out);
  }
  if (req.method === "POST") {
    const b = await body(req);
    const { op, col, id } = b;
    if (!COL_RE.test(col || "") || !ID_RE.test(id || "")) return send(res, 400, { error:"col_id" });
    if (op === "set") {
      const json = JSON.stringify(b.data ?? null);
      if (json.length > 200000) return send(res, 413, { error:"muy_grande" });
      await cmd("HSET", "col:" + col, id, json); const ver = await cmd("INCR", "ver:" + col);
      return send(res, 200, { ok:true, ver });
    }
    if (op === "delete") { await cmd("HDEL", "col:" + col, id); const ver = await cmd("INCR", "ver:" + col); return send(res, 200, { ok:true, ver }); }
    if (op === "acquire") {
      const ttl = Math.min(Math.max(Number(b.ttlMs) || 60000, 1000), 600000);
      const key = `lock:${col}:${id}`;
      const ok = await cmd("SET", key, String(b.holder || req.session.email), "NX", "PX", String(ttl));
      if (ok) return send(res, 200, { acquired:true });
      const cur = await cmd("GET", key);
      if (cur === String(b.holder || req.session.email)) { await cmd("SET", key, cur, "PX", String(ttl)); return send(res, 200, { acquired:true }); }
      return send(res, 200, { acquired:false, holder:cur });
    }
    return send(res, 400, { error:"op" });
  }
  send(res, 405, { error:"method" });
});
