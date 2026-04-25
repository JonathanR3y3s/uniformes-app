/**
 * SUPABASE CLIENT — Control Store Pro
 * Modo híbrido: localStorage como cache primario, Supabase como backend.
 * Usa SOLO la publishable key — nunca la service_role key en frontend.
 */

const SUPABASE_URL = 'https://zyopidigmaftnzwesmr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DkdlbZC0nFD1mf5TjXpo0Q_YvX-Qv8b';
const CDN_URLS = [
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/dist/umd/supabase.js',
];

let _client = null;
let _status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'error'
let _statusListeners = [];
let _loadPromise = null;

// ─── Status ───────────────────────────────────────────────────────────────────
export function getSupabaseStatus() { return _status; }

export function onStatusChange(fn) {
  _statusListeners.push(fn);
  return () => { _statusListeners = _statusListeners.filter(f => f !== fn); };
}

function setStatus(s) {
  _status = s;
  _statusListeners.forEach(fn => { try { fn(s); } catch(e){} });
}

// ─── Load SDK from CDN (lazy, con fallback) ──────────────────────────────────
function loadSDK() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    if (window.supabase?.createClient) { resolve(); return; }
    let idx = 0;
    function tryNext() {
      if (idx >= CDN_URLS.length) { reject(new Error('No se pudo cargar Supabase SDK desde ningún CDN')); return; }
      const script = document.createElement('script');
      script.src = CDN_URLS[idx++];
      script.onload = () => {
        if (window.supabase?.createClient) { resolve(); }
        else { console.warn('[SUPABASE] SDK cargado pero window.supabase no tiene createClient'); tryNext(); }
      };
      script.onerror = () => { console.warn('[SUPABASE] CDN falló, intentando siguiente…'); tryNext(); };
      document.head.appendChild(script);
    }
    tryNext();
  });
  return _loadPromise;
}

// ─── Obtener cliente (lazy init) ──────────────────────────────────────────────
export async function getClient() {
  if (_client) return _client;
  setStatus('connecting');
  try {
    await loadSDK();
    const createFn = window.supabase?.createClient;
    if (typeof createFn !== 'function') throw new Error('window.supabase.createClient no encontrado');
    _client = createFn(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Consideramos conectado en cuanto el cliente se crea sin error.
    // Las operaciones CRUD reportarán errores de columnas/tabla individualmente.
    setStatus('connected');
    console.log('[SUPABASE] Cliente inicializado —', SUPABASE_URL);
    return _client;
  } catch(e) {
    setStatus('error');
    console.error('[SUPABASE] No se pudo inicializar el cliente:', e.message);
    return null;
  }
}

// ─── Helpers CRUD ─────────────────────────────────────────────────────────────

/**
 * Inserta o actualiza un item en Supabase.
 * collection: 'employees' | 'entregas' | etc.
 * item: objeto con campo 'id'
 */
export async function upsertItem(collection, item) {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Sin conexión' };
  try {
    const { error } = await client.from('datos_csp').upsert({
      collection,
      item_id: String(item.id),
      data: item,
    }, { onConflict: 'collection,item_id' });
    if (error) throw error;
    return { ok: true };
  } catch(e) {
    console.warn(`[SUPABASE] upsertItem(${collection}):`, e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Inserta o actualiza una colección completa de golpe.
 * items: array de objetos con campo 'id'
 */
export async function upsertCollection(collection, items) {
  if (!items || !items.length) return { ok: true, count: 0 };
  const client = await getClient();
  if (!client) return { ok: false, error: 'Sin conexión' };
  try {
    const rows = items.map(item => ({
      collection,
      item_id: String(item.id || item._id || JSON.stringify(item).slice(0, 40)),
      data: item,
    }));
    const BATCH = 200; // Supabase recomienda lotes de <500 filas
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await client.from('datos_csp')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'collection,item_id' });
      if (error) throw error;
    }
    return { ok: true, count: rows.length };
  } catch(e) {
    console.warn(`[SUPABASE] upsertCollection(${collection}):`, e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Descarga todos los items de una colección (no eliminados).
 */
export async function fetchCollection(collection) {
  const client = await getClient();
  if (!client) return { ok: false, data: null, error: 'Sin conexión' };
  try {
    const { data, error } = await client
      .from('datos_csp')
      .select('item_id, data, updated_at')
      .eq('collection', collection)
      .eq('deleted', false)
      .order('updated_at', { ascending: true });
    if (error) throw error;
    return { ok: true, data: (data || []).map(r => r.data) };
  } catch(e) {
    console.warn(`[SUPABASE] fetchCollection(${collection}):`, e.message);
    return { ok: false, data: null, error: e.message };
  }
}

/**
 * Elimina lógicamente un item (soft delete).
 */
export async function deleteItem(collection, itemId) {
  const client = await getClient();
  if (!client) return { ok: false };
  try {
    const { error } = await client.from('datos_csp')
      .update({ deleted: true })
      .eq('collection', collection)
      .eq('item_id', String(itemId));
    if (error) throw error;
    return { ok: true };
  } catch(e) {
    console.warn(`[SUPABASE] deleteItem(${collection}, ${itemId}):`, e.message);
    return { ok: false };
  }
}

/**
 * Guarda un valor clave-valor en Supabase (para stockExtra, areasRules, etc.)
 */
export async function upsertKV(key, value) {
  const client = await getClient();
  if (!client) return { ok: false };
  try {
    const { error } = await client.from('datos_csp').upsert({
      collection: '_kv',
      item_id: key,
      data: { _key: key, _value: value },
    }, { onConflict: 'collection,item_id' });
    if (error) throw error;
    return { ok: true };
  } catch(e) {
    console.warn(`[SUPABASE] upsertKV(${key}):`, e.message);
    return { ok: false };
  }
}

export async function fetchKV(key) {
  const client = await getClient();
  if (!client) return { ok: false, value: null };
  try {
    const { data, error } = await client.from('datos_csp')
      .select('data')
      .eq('collection', '_kv')
      .eq('item_id', key)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return { ok: true, value: data?.data?._value ?? null };
  } catch(e) {
    return { ok: false, value: null };
  }
}
