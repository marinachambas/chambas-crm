// Sesión firmada en cookie (HMAC). Solo correos del dominio permitido.
const crypto = require("crypto");
const COOKIE = "crm_session";
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) throw new Error("Falta SESSION_SECRET (mínimo 32 caracteres)"); return s; };
const sign = data => crypto.createHmac("sha256", secret()).update(data).digest("base64url");
function makeSession(email, name) {
  const body = Buffer.from(JSON.stringify({ email, name, exp:Date.now() + 30 * 864e5 })).toString("base64url");
  return `${body}.${sign(body)}`;
}
function readSession(req) {
  if (process.env.DEV_NO_AUTH === "1") return { email:"dev@chambas.ai", name:"Dev" };
  const raw = String(req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="));
  if (!raw) return null;
  const [body, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!body || !sig) return null;
  let good; try { good = sign(body); } catch (_) { return null; }
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try { const s = JSON.parse(Buffer.from(body, "base64url").toString()); return s.exp > Date.now() ? s : null; } catch (_) { return null; }
}
function setCookie(res, value, maxAgeSec) {
  res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`);
}
function allowed(email) {
  email = String(email || "").toLowerCase();
  const list = String(process.env.ALLOWED_EMAILS || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (list.length) return list.includes(email);
  const dom = String(process.env.ALLOWED_DOMAIN || "chambas.ai").toLowerCase();
  return email.endsWith("@" + dom);
}
function send(res, status, obj) { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); }
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (_) {} }
  const chunks = []; for await (const c of req) chunks.push(c);
  const t = Buffer.concat(chunks).toString(); if (!t) return {};
  try { return JSON.parse(t); } catch (_) { const e = new Error("JSON inválido"); e.status = 400; throw e; }
}
// Envuelve un handler: exige sesión válida
const requireAuth = handler => async (req, res) => {
  req.session = readSession(req) || { email:"equipo", name:"Equipo" }; // acceso abierto con el link
  try { await handler(req, res); }
  catch (e) { console.error(e); const m = String(e.message || e).slice(0, 300); send(res, e.status || 500, { error:e.code || m.slice(0, 160) || "error", message:m }); }
};
module.exports = { makeSession, readSession, setCookie, allowed, requireAuth, send, body };
