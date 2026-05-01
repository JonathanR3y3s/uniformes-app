/**
 * SYNC ENGINE — Control Store Pro
 * Motor de sincronización híbrida localStorage ↔ Supabase.
 *
 * Principios:
 *  1. localStorage es la fuente de verdad para UI (sin latencia)
 *  2. Supabase recibe los cambios en segundo plano (fire & forget)
 *  3. Al iniciar la app, intenta traer datos actualizados de Supabase
 *  4. Si Supabase no responde → trabajamos 100% offline sin interrupciones
 *  5. Cola de pendientes para reintentos automáticos
 */

import {
  getSupabaseStatus, getClient,
  upsertItem, upsertCollection, fetchCollection,
  upsertKV, fetchKV,
} from './supabase-client.js';
import { getStore, saveEmployees, saveEntregas, saveProveedores,
         saveInventario, saveSalidas, saveStockExtra,
         saveComprasAlmacen, saveCampanias, saveStockUniformes,
         saveEncuestas, saveAuditLog, saveAreas } from './storage.js';

export { getSupabaseStatus };

// ─── Colecciones que se sincronizan ────────────────────────────────────────────
export const COLLECTIONS = [
  { key: 'employees',      storeKey: 'employees' },
  { key: 'entregas',       storeKey: 'entregas' },
  { key: 'proveedores',    storeKey: 'proveedores' },
  { key: 'inventario',     storeKey: 'inventario' },
  { key: 'salidas',        storeKey: 'salidas' },
  { key: 'comprasAlmacen', storeKey: 'comprasAlmacen' },
  { key: 'campanias',      storeKey: 'campanias' },
  { key: 'stockUniformes', storeKey: 'stockUniformes' },
  { key: 'encuestas',      storeKey: 'encuestas' },
  { key: 'areas',          storeKey: 'areas' },
];

const KV_KEYS = ['stockExtra', 'areasRules', 'users'];

const SYNC_MODEL_V2_BACKUP_COLLECTIONS = [
  "productos",
  "categorias",
  "entradas",
  "lineasEntrada",
  "entregasNuevas",
  "lineasEntrega",
  "salidasNuevas",
  "lineasSalida",
  "devolucionesNuevas",
  "lineasDevolucion",
  "movimientos"
];

// ─── Estado del motor ──────────────────────────────────────────────────────────
let _initialized = false;
let _syncing = false;
let _pendingQueue = []; // {type:'item'|'collection', collection, item?}
let _lastSyncAt = null;
let _lastV2BackupStatus = null;
let _statusEl = null;
const RETRY_DELAY_MS = 5000;
const SYNC_INTERVAL_MS = 60000; // 1 minuto
const V2_BACKUP_STATUS_KEY = '_sync_v2_backup_status';

// ─── Indicador visual ──────────────────────────────────────────────────────────
function updateStatusBadge(status) {
  if (!_statusEl) {
    _statusEl = document.getElementById('syncStatusBadge');
    if (!_statusEl) {
      _statusEl = document.createElement('div');
      _statusEl.id = 'syncStatusBadge';
      _statusEl.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9999;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;pointer-events:none;transition:all .3s';
      document.body?.appendChild(_statusEl);
    }
  }
  const styles = {
    connected:    { bg:'#d1fae5', color:'#065f46', text:'☁ Sincronizado' },
    syncing:      { bg:'#dbeafe', color:'#1e40af', text:'↑ Sincronizando…' },
    error:        { bg:'#fee2e2', color:'#991b1b', text:'⚠ Sin conexión cloud' },
    disconnected: { bg:'#f1f5f9', color:'#64748b', text:'○ Modo local' },
    pulling:      { bg:'#fef3c7', color:'#92400e', text:'↓ Actualizando…' },
  };
  const s = styles[status] || styles.disconnected;
  _statusEl.style.background = s.bg;
  _statusEl.style.color = s.color;
  _statusEl.textContent = s.text;
  _statusEl.style.opacity = '1';
  if (status === 'connected') {
    setTimeout(() => { if (_statusEl) _statusEl.style.opacity = '0.3'; }, 3000);
  }
}

// ─── Inicialización ────────────────────────────────────────────────────────────
export async function initSync() {
  if (_initialized) return;
  _initialized = true;

  updateStatusBadge('disconnected');
  const client = await getClient();
  if (!client) {
    updateStatusBadge('error');
    console.warn('[SYNC] Supabase no disponible — modo offline');
    return;
  }

  // Pull inicial: traer datos de Supabase → localStorage (si hay datos más nuevos)
  await pullFromSupabase();

  // Reintentar pendientes si los hay en localStorage
  _loadPendingQueue();
  _flushQueue();

  // Intervalo periódico de sync
  setInterval(_flushQueue, SYNC_INTERVAL_MS);
  console.log('[SYNC] Motor inicializado');
}

// ─── Pull: Supabase → localStorage ────────────────────────────────────────────
export async function pullFromSupabase() {
  updateStatusBadge('pulling');
  let anyUpdate = false;

  // V2 backup is push-only. Pull/merge disabled until conflict strategy exists.
  for (const col of COLLECTIONS) {
    const result = await fetchCollection(col.key);
    if (!result.ok || !result.data || !result.data.length) continue;

    const store = getStore();
    const local = store[col.storeKey] || [];
    const remoteById = {};
    result.data.forEach(item => { remoteById[item.id] = item; });

    const localById = {};
    local.forEach(item => { localById[item.id] = item; });

    // Merge: actualiza los que vienen del servidor, agrega nuevos
    const merged = Object.values({ ...localById, ...remoteById });

    if (merged.length !== local.length ||
        JSON.stringify(merged.map(i=>i.id).sort()) !== JSON.stringify(local.map(i=>i.id).sort())) {
      store[col.storeKey] = merged;
      anyUpdate = true;
      _saveCollection(col.storeKey);
    }
  }

  // KV: stockExtra
  const kv = await fetchKV('stockExtra');
  if (kv.ok && kv.value) {
    getStore().stockExtra = kv.value;
    saveStockExtra();
  }

  _lastSyncAt = new Date().toISOString();
  localStorage.setItem('_sync_last_pull', _lastSyncAt);

  if (anyUpdate) {
    console.log('[SYNC] Pull completo — datos actualizados desde Supabase');
  }
  updateStatusBadge('connected');
}

// ─── Backup V2 push-only: localStorage → Supabase ─────────────────────────────
export async function pushV2BackupOnly() {
  const client = await getClient();
  if (!client) {
    const status = _recordV2BackupStatus({
      ok: false,
      summaries: [],
      error: 'Sin conexión',
    });
    updateStatusBadge('error');
    console.warn('[SYNC V2 BACKUP] No se pudo iniciar — sin conexión Supabase');
    return status;
  }

  updateStatusBadge('syncing');
  const store = getStore();
  const summaries = [];
  let ok = true;

  for (const collection of SYNC_MODEL_V2_BACKUP_COLLECTIONS) {
    const items = Array.isArray(store[collection]) ? store[collection] : [];
    const summary = {
      collection,
      total: items.length,
      uploaded: 0,
      skipped: 0,
      errors: [],
    };

    for (const item of items) {
      if (!item || item.id === undefined || item.id === null || item.id === '') {
        summary.skipped++;
        summary.errors.push('Registro sin id omitido');
        ok = false;
        continue;
      }

      const result = await upsertItem(collection, item);
      if (result.ok) {
        summary.uploaded++;
      } else {
        summary.errors.push(`id ${item.id}: ${result.error || 'Error al subir'}`);
        ok = false;
      }
    }

    summaries.push(summary);
  }

  const status = _recordV2BackupStatus({ ok, summaries });
  console.log('[SYNC V2 BACKUP] Resumen push-only', summaries);
  updateStatusBadge(ok ? 'connected' : 'error');
  return status;
}

// ─── Push: localStorage → Supabase (background) ───────────────────────────────
/**
 * Encola el push de un item. No bloquea. Retorna inmediatamente.
 */
export function queueItemPush(collection, item) {
  _pendingQueue.push({ type: 'item', collection, item: JSON.parse(JSON.stringify(item)) });
  _savePendingQueue();
  _scheduleFlush();
}

/**
 * Encola el push de una colección completa.
 */
export function queueCollectionPush(collection, items) {
  // Eliminar duplicados de la misma colección en la cola
  _pendingQueue = _pendingQueue.filter(p => !(p.type === 'collection' && p.collection === collection));
  _pendingQueue.push({ type: 'collection', collection, items: JSON.parse(JSON.stringify(items)) });
  _savePendingQueue();
  _scheduleFlush();
}

/**
 * Push inmediato de un item (fire & forget, no bloquea).
 */
export function pushItemNow(collection, item) {
  upsertItem(collection, item).then(r => {
    if (!r.ok) queueItemPush(collection, item);
    else updateStatusBadge('connected');
  }).catch(() => queueItemPush(collection, item));
  updateStatusBadge('syncing');
}

let _flushTimer = null;
function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; _flushQueue(); }, 800);
}

async function _flushQueue() {
  if (_syncing || !_pendingQueue.length) return;
  const client = await getClient();
  if (!client) { updateStatusBadge('error'); return; }

  _syncing = true;
  updateStatusBadge('syncing');
  const failed = [];

  while (_pendingQueue.length) {
    const task = _pendingQueue.shift();
    let result;
    if (task.type === 'item') {
      result = await upsertItem(task.collection, task.item);
    } else {
      result = await upsertCollection(task.collection, task.items);
    }
    if (!result.ok) failed.push(task);
  }

  _pendingQueue = failed;
  _savePendingQueue();
  _syncing = false;

  if (failed.length) {
    updateStatusBadge('error');
    setTimeout(_flushQueue, RETRY_DELAY_MS);
  } else {
    updateStatusBadge('connected');
    _lastSyncAt = new Date().toISOString();
  }
}

// ─── Persistencia de cola pendiente ───────────────────────────────────────────
function _savePendingQueue() {
  try {
    localStorage.setItem('_sync_queue', JSON.stringify(_pendingQueue.slice(-100))); // max 100
  } catch(e) {}
}

function _loadPendingQueue() {
  try {
    const raw = localStorage.getItem('_sync_queue');
    if (raw) _pendingQueue = JSON.parse(raw) || [];
  } catch(e) { _pendingQueue = []; }
}

// ─── Migración completa localStorage → Supabase ──────────────────────────────
export async function migrateLocalToSupabase(onProgress) {
  const store = getStore();
  const total = COLLECTIONS.length + KV_KEYS.length;
  let done = 0;

  for (const col of COLLECTIONS) {
    const items = store[col.storeKey] || [];
    onProgress?.(`Subiendo ${col.key} (${items.length} registros)…`, done, total);
    if (items.length) {
      await upsertCollection(col.key, items);
    }
    done++;
  }

  // KV: stockExtra
  onProgress?.('Subiendo stockExtra…', done, total);
  if (Object.keys(store.stockExtra || {}).length) {
    await upsertKV('stockExtra', store.stockExtra);
  }
  done++;

  // KV: users
  onProgress?.('Subiendo usuarios…', done, total);
  try {
    const users = JSON.parse(localStorage.getItem('_users_store') || '[]');
    if (users.length) await upsertKV('users', users);
  } catch(e) {}
  done++;

  // KV: areasRules
  onProgress?.('Subiendo reglas de área…', done, total);
  try {
    const rules = JSON.parse(localStorage.getItem('_areas_rules') || '{}');
    if (Object.keys(rules).length) await upsertKV('areasRules', rules);
  } catch(e) {}
  done++;

  _lastSyncAt = new Date().toISOString();
  onProgress?.('Migración completada', total, total);
  return { ok: true, total: done };
}

// ─── Utilidades públicas ───────────────────────────────────────────────────────
export function getLastSyncAt() {
  return _lastSyncAt || localStorage.getItem('_sync_last_pull') || null;
}

export function getLastV2BackupStatus() {
  if (_lastV2BackupStatus) return _lastV2BackupStatus;
  try {
    const raw = localStorage.getItem(V2_BACKUP_STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

export function isConnected() {
  return getSupabaseStatus() === 'connected';
}

function _recordV2BackupStatus({ ok, summaries, error }) {
  const status = {
    ok: Boolean(ok),
    at: new Date().toISOString(),
    summaries: summaries || [],
    error: error || null,
  };
  _lastV2BackupStatus = status;
  try {
    localStorage.setItem(V2_BACKUP_STATUS_KEY, JSON.stringify(status));
  } catch(e) {}
  return status;
}

// ─── Helper interno ────────────────────────────────────────────────────────────
function _saveCollection(storeKey) {
  const saves = {
    employees:      saveEmployees,
    entregas:       saveEntregas,
    proveedores:    saveProveedores,
    inventario:     saveInventario,
    salidas:        saveSalidas,
    comprasAlmacen: saveComprasAlmacen,
    campanias:      saveCampanias,
    stockUniformes: saveStockUniformes,
    encuestas:      saveEncuestas,
    areas:          saveAreas,
  };
  saves[storeKey]?.();
}
