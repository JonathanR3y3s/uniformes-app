/**
 * MÓDULO DE ALMACENAMIENTO OFFLINE-FIRST CON INDEXEDDB
 * Proporciona sincronización futura con arquitectura robusta
 * Mantiene compatibilidad con localStorage como fallback
 */

const DB_NAME = 'UniformesAA';
const DB_VERSION = 1;

const STORES = {
  DELIVERIES: 'deliveries',
  SYNC_QUEUE: 'syncQueue',
  CONFLICTS: 'conflicts',
};

let db = null;

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

export async function initOfflineStorage() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn('[Offline] IndexedDB no disponible, usando localStorage');
      resolve(false);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[Offline] Error abriendo IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[Offline] IndexedDB inicializado correctamente');
      resolve(true);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Almacén de entregas
      if (!database.objectStoreNames.contains(STORES.DELIVERIES)) {
        const deliveriesStore = database.createObjectStore(STORES.DELIVERIES, { keyPath: 'id' });
        deliveriesStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        deliveriesStore.createIndex('timestamp', 'timestamp', { unique: false });
        deliveriesStore.createIndex('folio', 'folio', { unique: true });
      }

      // Cola de sincronización
      if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('status', 'status', { unique: false });
        syncStore.createIndex('deliveryId', 'deliveryId', { unique: false });
      }

      // Conflictos de sincronización
      if (!database.objectStoreNames.contains(STORES.CONFLICTS)) {
        database.createObjectStore(STORES.CONFLICTS, { keyPath: 'id' });
      }
    };
  });
}

// ============================================================================
// OPERACIONES CON ENTREGAS
// ============================================================================

export async function saveDeliveryOffline(delivery) {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.DELIVERIES], 'readwrite');
    const store = tx.objectStore(STORES.DELIVERIES);

    const deliveryToSave = {
      ...delivery,
      timestamp: Date.now(),
      syncStatus: 'local',
    };

    const request = store.put(deliveryToSave);

    request.onsuccess = () => {
      console.log('[Offline] Entrega guardada:', deliveryToSave.folio);
      // También guardar en localStorage como respaldo
      saveDeliveryToLocalStorage(deliveryToSave);
      resolve(true);
    };

    request.onerror = () => {
      console.error('[Offline] Error guardando entrega:', request.error);
      reject(request.error);
    };
  });
}

export async function getDeliveryOffline(id) {
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.DELIVERIES], 'readonly');
    const store = tx.objectStore(STORES.DELIVERIES);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getAllDeliveriesOffline() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.DELIVERIES], 'readonly');
    const store = tx.objectStore(STORES.DELIVERIES);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getDeliveriesByStatus(syncStatus) {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.DELIVERIES], 'readonly');
    const store = tx.objectStore(STORES.DELIVERIES);
    const index = store.index('syncStatus');
    const request = index.getAll(syncStatus);

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================================
// COLA DE SINCRONIZACIÓN
// ============================================================================

export async function addToSyncQueue(deliveryId, action = 'create') {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);

    const queueItem = {
      deliveryId,
      action,
      createdAt: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      lastError: null,
    };

    const request = store.add(queueItem);

    request.onsuccess = () => {
      console.log('[Offline] Agregado a cola de sincronización:', deliveryId);
      resolve(true);
    };

    request.onerror = () => {
      console.error('[Offline] Error agregando a cola:', request.error);
      reject(request.error);
    };
  });
}

export async function getSyncQueue() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.SYNC_QUEUE], 'readonly');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function markSyncQueueItemSuccess(queueId) {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);

    // Primero obtener el item
    const getRequest = store.get(queueId);

    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (!item) {
        resolve(false);
        return;
      }

      // Actualizar estado
      item.status = 'synced';
      item.syncedAt = new Date().toISOString();

      const updateRequest = store.put(item);

      updateRequest.onsuccess = () => {
        console.log('[Offline] Elemento sincronizado:', queueId);
        resolve(true);
      };

      updateRequest.onerror = () => {
        reject(updateRequest.error);
      };
    };

    getRequest.onerror = () => {
      reject(getRequest.error);
    };
  });
}

export async function markSyncQueueItemError(queueId, error) {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);

    const getRequest = store.get(queueId);

    getRequest.onsuccess = () => {
      const item = getRequest.result;
      if (!item) {
        resolve(false);
        return;
      }

      item.attempts = (item.attempts || 0) + 1;
      item.lastError = error.toString();

      // Reintentar máximo 3 veces
      if (item.attempts >= 3) {
        item.status = 'failed';
      }

      const updateRequest = store.put(item);

      updateRequest.onsuccess = () => {
        resolve(true);
      };

      updateRequest.onerror = () => {
        reject(updateRequest.error);
      };
    };

    getRequest.onerror = () => {
      reject(getRequest.error);
    };
  });
}

// ============================================================================
// MANEJO DE CONFLICTOS
// ============================================================================

export async function recordSyncConflict(deliveryId, localVersion, remoteVersion) {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.CONFLICTS], 'readwrite');
    const store = tx.objectStore(STORES.CONFLICTS);

    const conflict = {
      id: `conflict_${Date.now()}`,
      deliveryId,
      localVersion,
      remoteVersion,
      createdAt: new Date().toISOString(),
      status: 'unresolved',
    };

    const request = store.add(conflict);

    request.onsuccess = () => {
      console.warn('[Offline] Conflicto registrado:', conflict.id);
      resolve(true);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getUnresolvedConflicts() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.CONFLICTS], 'readonly');
    const store = tx.objectStore(STORES.CONFLICTS);
    const request = store.getAll();

    request.onsuccess = () => {
      const allConflicts = request.result || [];
      const unresolved = allConflicts.filter(c => c.status === 'unresolved');
      resolve(unresolved);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================================
// ESTADO DE CONEXIÓN
// ============================================================================

export function getConnectionStatus() {
  return {
    online: navigator.onLine,
    database: db !== null ? 'indexed' : 'localStorage',
    timestamp: new Date().toISOString(),
  };
}

export function onConnectionChange(callback) {
  window.addEventListener('online', () => callback({ online: true }));
  window.addEventListener('offline', () => callback({ online: false }));
}

// ============================================================================
// LOCALSTORAGE FALLBACK
// ============================================================================

function saveDeliveryToLocalStorage(delivery) {
  const key = `_delivery_${delivery.id}`;
  localStorage.setItem(key, JSON.stringify(delivery));
}

export function getDeliveryFromLocalStorage(id) {
  const key = `_delivery_${id}`;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    console.warn('[OFFLINE] Entrega local corrupta:', id, e);
    return null;
  }
}

// ============================================================================
// ESTADÍSTICAS
// ============================================================================

export async function getOfflineStats() {
  const allDeliveries = await getAllDeliveriesOffline();
  const syncQueue = await getSyncQueue();
  const conflicts = await getUnresolvedConflicts();

  const byStatus = {};
  allDeliveries.forEach(d => {
    byStatus[d.syncStatus] = (byStatus[d.syncStatus] || 0) + 1;
  });

  return {
    totalDeliveries: allDeliveries.length,
    byStatus,
    pendingSync: syncQueue.length,
    conflicts: conflicts.length,
    connectionStatus: getConnectionStatus(),
  };
}
