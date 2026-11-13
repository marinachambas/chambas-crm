// Pasa las tareas, dueños, facturas y pauta que ya existen en el CRM de claude.ai a la base nueva (Upstash).
// Uso (una sola vez):  KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/importar-datos.js
const fs = require("fs"), path = require("path");
const { cmd } = require("../lib/kv");
(async () => {
  if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) { console.error("Faltan KV_REST_API_URL y KV_REST_API_TOKEN"); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "migracion", "datos-actuales.json"), "utf8"));
  for (const [col, docs] of Object.entries(data)) {
    let n = 0;
    for (const [id, doc] of Object.entries(docs)) { await cmd("HSET", "col:" + col, id, JSON.stringify(doc)); n++; }
    await cmd("INCR", "ver:" + col);
    console.log(`${col}: ${n} registros`);
  }
  console.log("Listo.");
})().catch(e => { console.error(e); process.exit(1); });
