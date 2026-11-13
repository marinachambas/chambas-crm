// Cliente mínimo de MCP (Streamable HTTP) para llamar herramientas de Kapso con la API key del proyecto.
let sessions = global.__mcpSessions || (global.__mcpSessions = {});
let rpcId = 1;
async function post(url, headers, msg, sessionId) {
  const h = { "Content-Type":"application/json", Accept:"application/json, text/event-stream", ...headers };
  if (sessionId) h["Mcp-Session-Id"] = sessionId;
  const r = await fetch(url, { method:"POST", headers:h, body:JSON.stringify(msg) });
  const sid = r.headers.get("mcp-session-id");
  const ct = r.headers.get("content-type") || "";
  const txt = await r.text();
  if (!r.ok && r.status !== 202) { const e = new Error(`MCP ${r.status}: ${txt.slice(0, 200)}`); e.status = r.status; throw e; }
  if (!txt) return { sid, msg:null };
  if (ct.includes("text/event-stream")) {
    const msgs = txt.split(/\n\n/).map(b => b.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("")).filter(Boolean).map(d => { try { return JSON.parse(d); } catch (_) { return null; } }).filter(Boolean);
    return { sid, msg:msgs.find(m => m.id === msg.id) || msgs[msgs.length - 1] || null };
  }
  try { return { sid, msg:JSON.parse(txt) }; } catch (_) { return { sid, msg:null }; }
}
async function init(url, headers) {
  const id = rpcId++;
  const { sid, msg } = await post(url, headers, { jsonrpc:"2.0", id, method:"initialize", params:{ protocolVersion:"2025-06-18", capabilities:{}, clientInfo:{ name:"crm-chambas", version:"1.0" } } });
  if (msg && msg.error) throw new Error("MCP init: " + JSON.stringify(msg.error).slice(0, 200));
  await post(url, headers, { jsonrpc:"2.0", method:"notifications/initialized" }, sid).catch(() => {});
  return sid || "";
}
async function callTool(url, headers, name, args) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (sessions[url] == null) sessions[url] = await init(url, headers);
    const id = rpcId++;
    try {
      const { msg } = await post(url, headers, { jsonrpc:"2.0", id, method:"tools/call", params:{ name, arguments:args || {} } }, sessions[url] || undefined);
      if (!msg) throw new Error("MCP sin respuesta");
      if (msg.error) { const e = new Error(msg.error.message || "tool_error"); e.code = "tool_error"; throw e; }
      const r = msg.result || {};
      if (r.isError) { const e = new Error((r.content || []).map(c => c.text).join(" ").slice(0, 300) || "tool_error"); e.code = "tool_error"; throw e; }
      if (r.structuredContent != null) return r.structuredContent;
      const text = (r.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
      try { return JSON.parse(text); } catch (_) { return text; }
    } catch (e) {
      if ((e.status === 404 || e.status === 400) && attempt === 0) { delete sessions[url]; continue; } // sesión vencida
      throw e;
    }
  }
}
module.exports = { callTool };
