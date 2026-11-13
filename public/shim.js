// Reemplaza el entorno de claude.ai: mismas funciones (mcp, db, sample, user) pero contra el backend propio en /api.
(function () {
  const me = { email:"equipo", name:"Equipo" };
  const authReady = Promise.resolve();

  async function api(path, opts) {
    const r = await fetch(path, { credentials:"same-origin", ...opts, headers:{ "Content-Type":"application/json", ...(opts && opts.headers) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { code:j.error === "rate_limited" ? "rate_limited" : (j.error || "tool_error"), message:j.message || j.error || ("HTTP " + r.status), retryable:r.status >= 500 };
    return j;
  }

  // ---- mcp
  const cache = new Map();
  // caché persistente (IndexedDB): al recargar la página no se vuelve a pedir lo que sigue fresco
  const idb = (() => { try { return new Promise((ok, bad) => { const r = indexedDB.open("crm-cache", 1); r.onupgradeneeded = () => r.result.createObjectStore("c"); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); }); } catch (_) { return Promise.reject(); } })();
  const idbGet = async k => { try { const d = await idb; return await new Promise(ok => { const q = d.transaction("c").objectStore("c").get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (_) { return null; } };
  const idbSet = async (k, v) => { try { const d = await idb; d.transaction("c", "readwrite").objectStore("c").put(v, k); } catch (_) {} };
  const inflight = new Map();
  const mcp = {
    async callTool(server, tool, input, opts = {}) {
      const key = JSON.stringify([server, tool, input]);
      const c = opts.cache || {};
      const fresh = h => h && !c.refresh && Date.now() - h.at < (c.staleTime || 0);
      let hit = cache.get(key);
      if (!hit && c.staleTime && !c.refresh) { hit = await idbGet(key); if (hit) cache.set(key, hit); }
      if (fresh(hit)) return { payload:hit.payload, cache:{ storedAt:hit.at } };
      if (!c.refresh && inflight.has(key)) return inflight.get(key);
      const p = (async () => {
        const j = await api("/api/mcp", { method:"POST", body:JSON.stringify({ server, tool, args:input }) });
        const v = { payload:j.payload, at:Date.now() };
        cache.set(key, v); if (cache.size > 300) cache.delete(cache.keys().next().value);
        if (c.staleTime) idbSet(key, v);
        return { payload:j.payload, cache:{ storedAt:v.at } };
      })();
      inflight.set(key, p);
      try { return await p; } finally { inflight.delete(key); }
    },
  };

  // ---- db (colecciones compartidas, se refrescan cada 15 s)
  const cols = {}; // name -> { ver, docs, listeners:Set }
  let timer = null;
  const snap = name => ({ docs:Object.entries(cols[name].docs || {}).map(([id, v]) => ({ id, data:() => v })), metadata:{ fromCache:false } });
  async function poll() {
    const names = Object.keys(cols).filter(n => cols[n].listeners.size);
    if (!names.length) return;
    const since = {}; names.forEach(n => { if (cols[n].ver != null) since[n] = cols[n].ver; });
    try {
      const j = await api(`/api/db?cols=${encodeURIComponent(names.join(","))}&since=${encodeURIComponent(JSON.stringify(since))}`);
      names.forEach(n => { const x = j[n]; if (!x || x.same) return; cols[n].ver = x.ver; cols[n].docs = x.docs || {}; cols[n].listeners.forEach(l => { try { l.cb(snap(n)); } catch (e) { console.error(e); } }); });
    } catch (e) { names.forEach(n => cols[n].listeners.forEach(l => l.err && l.err(e))); }
  }
  const schedule = (ms = 50) => { clearTimeout(timer); timer = setTimeout(async () => { await poll(); schedule(15000); }, ms); };
  const ensure = n => cols[n] || (cols[n] = { ver:null, docs:{}, listeners:new Set() });
  const db = {
    collection(name) {
      ensure(name);
      return {
        onSnapshot(cb, err) { const l = { cb, err }; cols[name].listeners.add(l); schedule(); return () => cols[name].listeners.delete(l); },
        doc(id) {
          return {
            async get() { const c = cols[name]; if (c.ver == null) await poll(); const v = cols[name].docs[id]; return { exists:v !== undefined, id, data:() => v }; },
            async set(data) { cols[name].docs = { ...cols[name].docs, [id]:data }; const j = await api("/api/db", { method:"POST", body:JSON.stringify({ op:"set", col:name, id, data }) }); cols[name].ver = j.ver; cols[name].listeners.forEach(l => l.cb(snap(name))); },
            async update(patch) { const cur = cols[name].docs[id] || {}; return this.set({ ...cur, ...patch }); },
            async delete() { const d = { ...cols[name].docs }; delete d[id]; cols[name].docs = d; const j = await api("/api/db", { method:"POST", body:JSON.stringify({ op:"delete", col:name, id }) }); cols[name].ver = j.ver; cols[name].listeners.forEach(l => l.cb(snap(name))); },
            async acquire(o = {}) { return api("/api/db", { method:"POST", body:JSON.stringify({ op:"acquire", col:name, id, holder:o.holder, ttlMs:o.ttlMs }) }); },
          };
        },
      };
    },
  };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });

  // ---- sample (Claude)
  const tierOf = o => (o && o.modelTier) || "default";
  const sample = async (input, opts) => { const j = await api("/api/sample", { method:"POST", body:JSON.stringify({ input, tier:tierOf(opts) }) }); if (opts && opts.onText) opts.onText({ text:j.text, delta:j.text }); return { text:j.text, truncated:false }; };
  sample.json = async (input, opts) => (await api("/api/sample", { method:"POST", body:JSON.stringify({ input, tier:tierOf(opts), json:true }) })).value;
  sample.limits = async () => ({ images:false });

  // ---- user
  const user = {
    async id() { return me && me.email; }, async me() { return { id:me.email, name:me.name }; },
    async profiles(ids) { const o = {}; (ids || []).forEach(i => { o[i] = { id:i, name:String(i || "").split("@")[0] }; }); return o; },
    isOwner() { return false; }, canEdit() { return true; }, can() { return true; },
  };

  const impl = { mcp, db, sample, user };
  window.claude = { use:name => authReady.then(() => impl[name] || null) };
})();
