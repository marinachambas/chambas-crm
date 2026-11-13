// Lee los avisos del bot en #leads-sales con un token de bot de Slack y los devuelve con el mismo formato que usaba el CRM.
const fmtMx = ts => {
  const d = new Date(Number(ts) * 1000);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone:"America/Mexico_City", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second} CST`;
};
function textOf(m) {
  const parts = [m.text || ""];
  (m.attachments || []).forEach(a => parts.push(a.pretext || "", a.title || "", a.text || "", ...(a.fields || []).map(f => `${f.title}: ${f.value}`)));
  const walk = b => { if (!b) return; if (Array.isArray(b)) return b.forEach(walk); if (b.type === "text" || b.type === "mrkdwn" || b.type === "plain_text") { if (b.text) parts.push(b.text); return; } if (b.text) walk(b.text); if (b.fields) walk(b.fields); if (b.elements) walk(b.elements); };
  walk(m.blocks);
  // sin negritas de Slack (*texto*) para que los campos se lean igual que antes
  return [...new Set(parts.map(s => String(s).replace(/\*/g, "").trim()).filter(Boolean))].join("\n");
}
let chCache = global.__slackCache || (global.__slackCache = {});
async function channelMessages(channel, oldest) {
  const c = chCache[channel];
  if (c && Date.now() - c.at < 3 * 60 * 1000 && Number(c.oldest) <= Number(oldest || 0)) return c.msgs.filter(m => !oldest || Number(m.ts) >= Number(oldest));
  const tokenS = process.env.SLACK_BOT_TOKEN; if (!tokenS) { const e = new Error("Falta SLACK_BOT_TOKEN en Vercel"); e.code = e.message; throw e; }
  const from = Math.min(Number(oldest || 0) || Infinity, Math.floor(Date.now() / 1000) - 95 * 86400);
  const msgs = []; let cursor = "";
  for (let i = 0; i < 60; i++) {
    const u = new URL("https://slack.com/api/conversations.history");
    u.searchParams.set("channel", channel); u.searchParams.set("limit", "999"); u.searchParams.set("oldest", String(from));
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u, { headers:{ Authorization:"Bearer " + tokenS } });
    const j = await r.json();
    if (!j.ok) { const e = new Error(j.error === "not_in_channel" ? "El bot de Slack no está en #leads-sales: escribe /invite @CRM Chambas en ese canal" : j.error === "missing_scope" ? "Al bot de Slack le falta el permiso channels:history" : j.error === "invalid_auth" || j.error === "not_authed" ? "SLACK_BOT_TOKEN inválido" : "Slack: " + j.error); e.code = e.message; throw e; }
    (j.messages || []).forEach(m => msgs.push({ ts:m.ts, text:textOf(m) }));
    cursor = j.response_metadata && j.response_metadata.next_cursor;
    if (!cursor || !j.has_more) break;
  }
  chCache[channel] = { at:Date.now(), oldest:from, msgs };
  return msgs.filter(m => !oldest || Number(m.ts) >= Number(oldest));
}
async function searchChannel({ query, after }) {
  const m = String(query || "").match(/in:<#([A-Z0-9]+)>/);
  const channel = (m && m[1]) || process.env.SLACK_CHANNEL_ID || "C08DP2PPUAJ";
  const phrase = (String(query || "").match(/"([^"]+)"/) || [])[1] || "";
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out = (await channelMessages(channel, after)).filter(x => !phrase || norm(x.text).includes(norm(phrase))).map(x => `${x.text}\n${fmtMx(x.ts)}`);
  return { results:out.map((t, i) => `${i + 1}. #leads-sales - Chambas Alert: ${t}`).join("\n"), pagination_info:"" };
}
module.exports = { searchChannel };
