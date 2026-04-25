/**
 * SUPABASE CLIENT — Control Store Pro
 * Modo híbrido: localStorage como cache primario, Supabase como backend.
 * Usa SOLO la publishable key — nunca la service_role key en frontend.
 */

const SUPABASE_URL = 'https://zyopidigmaftnzwesmr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DkdlbZC0nFD1mf5TjXpo0Q_YvX-Qv8b';
const CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

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

// ─── Load SDK from CDN (lazy) ─────────────────────────────────────────────────
function loadSDK() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    // Si ya está cargado globalmente
    if (window.supabase?.createClient) { resolve(); return; }
    const script = document.createElement('script');
    script.src = CDN_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Supabase SDK'));
    document.head.appendChild(script);
  });
  return _loadPromise;
}

// ─── Obtener cliente (lazy init) ──────────────────────────────────────────────
export async function getClient() {
  if (_client) return _client;
  setStatus('connecting');
  try {
    await loadSDK();
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { enabled: false }, // deshabilitado por ahora
    });
    // Prueba de conexión rápida
    const { error } = await _client.from('datos_csp').select('collection').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows (OK)
      throw error;
    }
    setStatus('connected');
    console.log('[SUPABASE] Conectado correctamente');
    return _client;
  } catch(e) {
    setStatus('error');
    console.warn('[SUPABASE] Error de conexión:', e.message);
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
