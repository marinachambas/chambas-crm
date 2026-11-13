// Puerta única para los datos: mismo nombre de servidor y herramienta que usaba el CRM en claude.ai.
const { requireAuth, send, body } = require("../lib/auth");
const { callTool } = require("../lib/mcpclient");
const { exportXlsx } = require("../lib/google");
const { searchChannel } = require("../lib/slack");
const { Pool, types } = require("pg");
[1082, 1114, 1184].forEach(oid => types.setTypeParser(oid, v => v)); // fechas como texto, igual que antes
let pool = global.__pgPool;
const getPool = () => pool || (pool = global.__pgPool = new Pool({ connectionString:process.env.DATABASE_URL, ssl:process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized:false }, max:3 }));
const KAPSO_TOOLS = new Set(["list_whatsapp_conversations", "kapso_inbox_read", "list_whatsapp_messages"]);
async function sql(query, maxRows) {
  const q = String(query || "").trim().replace(/;+\s*$/, "");
  if (!/^(with|select)\b/i.test(q) || q.includes(";")) { const e = new Error("Solo se permiten consultas de lectura (SELECT/WITH) de una sola instrucción"); e.status = 400; throw e; }
  // la página es pública: nunca se consultan las tablas con datos personales de candidatos
  if (/\bclabe\b/i.test(q) || /\b(leads|employee|employment|employment_history|cv_data|lead_devices|ai_work_enrollment|atlas_recorder|atlas_recorder_day|prepa_in_\w+)\b/i.test(q)) { const e = new Error("Tabla no disponible"); e.status = 400; throw e; }
  const c = await getPool().connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query(`SET LOCAL statement_timeout = ${Number(process.env.SQL_TIMEOUT_MS) || 25000}`);
    const r = await c.query(q);
    await c.query("COMMIT");
    return r.rows.slice(0, Math.min(Number(maxRows) || 5000, 20000));
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
  finally { c.release(); }
}
module.exports = requireAuth(async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error:"method" });
  const { server, tool, args = {} } = await body(req);
  let payload;
  if (server === "Chambas" && tool === "execute_read_query") payload = await sql(args.query, args.max_rows);
  else if (server === "Kapso" && KAPSO_TOOLS.has(tool)) {
    if (!process.env.KAPSO_API_KEY) throw new Error("Falta KAPSO_API_KEY");
    const url = process.env.KAPSO_MCP_URL || "https://api.kapso.ai/mcp", hdr = { "X-API-Key":process.env.KAPSO_API_KEY };
    if (tool === "kapso_inbox_read") {
      // kapso_inbox_read solo existe dentro de claude.ai: aquí se leen los mensajes de la conversación con list_whatsapp_messages
      const r = await callTool(url, hdr, "list_whatsapp_messages", { conversation_id:args.conversation_id, limit:100 });
      const data = Array.isArray(r && r.data) ? r.data : [];
      payload = { messages:data.map(m => {
        const k = m.kapso || {};
        const ts = Number(m.timestamp);
        return { created_at:ts ? new Date(ts * 1000).toISOString() : (m.created_at || ""), direction:k.direction || (m.from ? "inbound" : "outbound"),
          content:k.content || (m.text && m.text.body) || (m.button && m.button.text) || "", caption:(m.document && m.document.caption) || (m.image && m.image.caption) || "",
          message_type:m.type, has_media:!!k.has_media, filename:(m.document && m.document.filename) || (k.media_data && k.media_data.filename) || "", link:(m.document && m.document.link) || k.media_url || "" };
      }).reverse() };
    } else payload = await callTool(url, hdr, tool, args);
  }
  else if (server === "Slack" && tool === "slack_search_public") payload = await searchChannel(args);
  else if (server === "Google Drive" && tool === "download_file_content") {
    const allowedId = process.env.REVENUE_SHEET_ID || "1rzLd59jFMvJgFbDYyaTTnYhOTLYHbeIm8xGx-6btLm4";
    if (args.fileId !== allowedId) return send(res, 403, { error:"archivo_no_permitido" });
    payload = { content:await exportXlsx(args.fileId), mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  else return send(res, 403, { error:"herramienta_no_permitida", server, tool });
  send(res, 200, { payload });
});
