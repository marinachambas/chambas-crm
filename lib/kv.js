// Almacenamiento compartido: Upstash Redis (Vercel KV / Upstash) por REST. Sin variables => memoria (solo pruebas locales).
const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = global.__crmMem || (global.__crmMem = { h:{}, k:{} });
async function cmd(...args) {
  if (!URL_()) {
    if (process.env.VERCEL) throw new Error("Falta configurar KV (Upstash Redis)");
    return memCmd(args);
  }
  const r = await fetch(URL_(), { method:"POST", headers:{ Authorization:`Bearer ${TOKEN()}`, "Content-Type":"application/json" }, body:JSON.stringify(args.map(String)) });
  const j = await r.json();
  if (j.error) throw new Error("KV: " + j.error);
  return j.result;
}
function memCmd([c, ...a]) {
  c = String(c).toUpperCase();
  const live = k => { const v = mem.k[k]; return v && (!v.exp || v.exp > Date.now()) ? v : null; };
  if (c === "HGETALL") { const h = mem.h[a[0]] || {}; return Object.entries(h).flat(); }
  if (c === "HSET") { (mem.h[a[0]] ||= {})[a[1]] = a[2]; return 1; }
  if (c === "HDEL") { if (mem.h[a[0]]) delete mem.h[a[0]][a[1]]; return 1; }
  if (c === "INCR") { const v = live(a[0]); const n = (Number(v && v.v) || 0) + 1; mem.k[a[0]] = { v:String(n), exp:0 }; return n; }
  if (c === "GET") { const v = live(a[0]); return v ? v.v : null; }
  if (c === "SET") { const [k, v, ...opt] = a; const up = opt.map(String).map(x => x.toUpperCase()); const px = up.includes("PX") ? Number(opt[up.indexOf("PX") + 1]) : 0;
    if (up.includes("NX") && live(k)) return null; mem.k[k] = { v:String(v), exp:px ? Date.now() + px : 0 }; return "OK"; }
  if (c === "MGET") return a.map(k => { const v = live(k); return v ? v.v : null; });
  throw new Error("KV memoria: comando no soportado " + c);
}
module.exports = { cmd };
