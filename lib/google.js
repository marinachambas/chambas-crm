// Google Drive con cuenta de servicio (JWT firmado aquí mismo, sin dependencias)
const crypto = require("crypto");
let tok = global.__gTok || (global.__gTok = { t:"", exp:0 });
async function token() {
  if (tok.t && tok.exp > Date.now() + 60000) return tok.t;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON");
  const sa = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString());
  const now = Math.floor(Date.now() / 1000);
  const enc = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg:"RS256", typ:"JWT" })}.${enc({ iss:sa.client_email, scope:"https://www.googleapis.com/auth/drive.readonly", aud:"https://oauth2.googleapis.com/token", iat:now, exp:now + 3600 })}`;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" }, body:new URLSearchParams({ grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer", assertion:`${unsigned}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw new Error("Google token: " + JSON.stringify(j).slice(0, 200));
  tok.t = j.access_token; tok.exp = Date.now() + (j.expires_in || 3600) * 1000;
  return tok.t;
}
async function exportXlsx(fileId) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`, { headers:{ Authorization:"Bearer " + await token() } });
  if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer()).toString("base64");
}
module.exports = { exportXlsx };
