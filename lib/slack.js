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
async function searchChannel({ query, after }) {
  const tokenS = process.env.SLACK_BOT_TOKEN; if (!tokenS) throw new Error("Falta SLACK_BOT_TOKEN");
  const m = String(query || "").match(/in:<#([A-Z0-9]+)>/);
  const channel = (m && m[1]) || process.env.SLACK_CHANNEL_ID || "C08DP2PPUAJ";
  const phrase = (String(query || "").match(/"([^"]+)"/) || [])[1] || "";
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out = []; let cursor = "";
  for (let i = 0; i < 40; i++) {
    const u = new URL("https://slack.com/api/conversations.history");
    u.searchParams.set("channel", channel); u.searchParams.set("limit", "200");
    if (after) u.searchParams.set("oldest", String(after));
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u, { headers:{ Authorization:"Bearer " + tokenS } });
    const j = await r.json();
    if (!j.ok) throw new Error("Slack: " + j.error);
    (j.messages || []).forEach(msg => { const t = textOf(msg); if (!phrase || norm(t).includes(norm(phrase))) out.push(`${t}\n${fmtMx(msg.ts)}`); });
    cursor = j.response_metadata && j.response_metadata.next_cursor;
    if (!cursor || !j.has_more) break;
  }
  return { results:out.map((t, i) => `${i + 1}. #leads-sales - Chambas Alert: ${t}`).join("\n"), pagination_info:"" };
}
module.exports = { searchChannel };
