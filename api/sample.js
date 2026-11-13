// Resúmenes y clasificaciones con Claude (API de Anthropic).
const { requireAuth, send, body } = require("../lib/auth");
const MODELS = { quick:process.env.ANTHROPIC_MODEL_QUICK || "claude-haiku-5-5", default:process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", complex:process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5" };
module.exports = requireAuth(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error:"method" });
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
  const { input, tier = "default", json = false } = await body(req);
  const messages = Array.isArray(input) ? input : [{ role:"user", content:String(input || "") }];
  if (JSON.stringify(messages).length > 60000) return send(res, 413, { error:"muy_grande" });
  if (json) messages[messages.length - 1] = { ...messages[messages.length - 1], content:messages[messages.length - 1].content + "\n\nResponde únicamente con JSON válido, sin texto adicional ni bloques de código." };
  const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{ "x-api-key":process.env.ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01", "content-type":"application/json" },
    body:JSON.stringify({ model:MODELS[tier] || MODELS.default, max_tokens:1200, messages }) });
  const j = await r.json();
  if (!r.ok) return send(res, r.status === 429 ? 429 : 502, { error:r.status === 429 ? "rate_limited" : "anthropic", message:JSON.stringify(j).slice(0, 300) });
  const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  if (!json) return send(res, 200, { text });
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  try { return send(res, 200, { value:JSON.parse(s >= 0 ? clean.slice(s, e + 1) : clean) }); }
  catch (_) { return send(res, 502, { error:"json_invalido", text }); }
});
