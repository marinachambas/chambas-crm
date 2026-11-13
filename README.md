# CRM de vacantes · ChambasAI

Versión web del CRM (antes vivía dentro de claude.ai). Se publica en **Vercel**, igual que `chambas-customers` y `chambas-revenue`.

- **Frontend:** `public/index.html` (el mismo CRM) + `public/shim.js` (conecta el CRM con el backend).
- **Backend:** funciones en `api/` que leen la base de Chambas, Kapso, Slack, Google Drive y Claude con llaves del servidor.
- **Acceso:** abierto con el link, sin login.

## 1. Lo que hay que conseguir (una vez)

| Variable | Qué es | Dónde se saca |
|---|---|---|
| `DATABASE_URL` | Base de Chambas | Pedir a tecnología un usuario **de solo lectura**: `CREATE ROLE crm_lectura LOGIN PASSWORD '...'; GRANT CONNECT ON DATABASE ... TO crm_lectura; GRANT USAGE ON SCHEMA public TO crm_lectura; GRANT SELECT ON ALL TABLES IN SCHEMA public TO crm_lectura;` |
| `KAPSO_API_KEY` | Conversaciones de Kapso | Kapso → proyecto ChambasAI → API keys |
| `SLACK_BOT_TOKEN` | Avisos de #leads-sales | api.slack.com/apps → crear app → *Bot Token Scopes*: `channels:history` → instalar → copiar `xoxb-...` → **invitar el bot a #leads-sales** (`/invite @nombre-del-bot`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Hoja Revenue | Google Cloud → Cuentas de servicio → crear → *Claves* → JSON. Activar **Google Drive API**. **Compartir la hoja Revenue** con el correo de la cuenta de servicio (solo lectura). Pegar el JSON completo (o en base64) |
| `ANTHROPIC_API_KEY` | Resúmenes y tickets | console.anthropic.com → API keys |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Tareas, dueños, pauta, facturas compartidas | En Vercel: *Storage → Marketplace → Upstash Redis* → conectar al proyecto (se llenan solas) |

Opcionales: `REVENUE_SHEET_ID`, `SLACK_CHANNEL_ID`, `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_QUICK`, `DATABASE_SSL=false` si la base no usa SSL.

## 2. Publicar

1. Subir esta carpeta a un repo de GitHub **privado** (la carpeta `migracion/` no se sube: tiene datos de clientes).
2. Vercel → *Add New Project* → importar el repo → *Framework: Other* → Deploy.
3. *Settings → Environment Variables*: pegar todas las variables de la tabla → *Redeploy*.
4. Conectar Upstash Redis desde *Storage*.

## 3. Pasar los datos que ya existen (una vez)

Las tareas marcadas, los dueños de cada cuenta, las facturas emitidas y la pauta del CRM actual vienen en `migracion/datos-actuales.json`:

```bash
npm install
KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/importar-datos.js
```

Los resúmenes de Kapso y la clasificación de tickets no se pasan: se vuelven a generar al picar **Actualizar**.

## 4. Probar en local

```bash
cp .env.example .env   # llenar
npm install
node dev-server.js     # http://localhost:3000
```
Sin `KV_REST_API_URL` usa memoria. 

## Seguridad

- La página no tiene login: no compartan el link fuera del equipo.
- No se pueden consultar las tablas con datos personales de candidatos (leads, employee, cv_data, etc.).
- La base se consulta con transacción **READ ONLY**, una sola instrucción `SELECT/WITH` y límite de tiempo. Aun así, usar un usuario de solo lectura.
- De Kapso solo se permiten herramientas de lectura (`list_whatsapp_conversations`, `kapso_inbox_read`, `list_whatsapp_messages`). De Drive solo se puede bajar la hoja Revenue.
- Las llaves viven solo en Vercel; nunca llegan al navegador.
