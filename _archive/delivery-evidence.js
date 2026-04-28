/**
 * MÓDULO DE EVIDENCIA DE ENTREGA
 * Captura completa: folio, firma, timestamp, operador, sincronización
 * Arquitectura offline-first
 */

import { getUser } from './user-roles.js';

// Estructura de entrega mejorada con evidencia
export const DeliverySchema = {
  id: 'unique_id',
  folio: 'UNIF-2026-001', // Folio único

  // DATOS DEL EMPLEADO
  empleadoId: 'emp_123',
  empleadoNombre: 'Juan Pérez',
  empleadoPaterno: 'Pérez',
  empleadoArea: 'Operaciones',
  empleadoSitio: 'México DF',

  // OPERACIÓN
  operadorId: 'op_456',
  operadorNombre: 'Carlos López',

  // FECHA Y HORA
  fecha: '2026-04-17',
  hora: '14:30',
  timestamp: 1713379200000,

  // PRENDAS
  prendas: [
    { id: 'prnd_1', nombre: 'Camisa', talla: 'M', cantidad: 1, color: 'Blanco', costo: 250 },
    { id: 'prnd_2', nombre: 'Pantalón', talla: '32', cantidad: 1, color: 'Gris', costo: 450 },
  ],

  // ESTADO DE ENTREGA
  tipo: 'completa', // completa | parcial
  completaONoEntregadas: [], // IDs de prendas no entregadas si es parcial

  // EVIDENCIA VISUAL Y DIGITAL
  firma: 'data:image/png;base64,...', // Firma digital del empleado
  fotosEntrega: ['foto_1.jpg', 'foto_2.jpg'], // URLs de evidencia visual

  // OBSERVACIONES Y DATOS ADICIONALES
  observaciones: 'Entrega sin problemas',
  observacionesEmpleado: 'Conforme',

  // DATOS FINANCIEROS
  costTotal: 700,
  costoPorPrenda: { prnd_1: 250, prnd_2: 450 },

  // SINCRONIZACIÓN
  syncStatus: 'local', // local | pending | synced | conflict
  lastSyncAttempt: null,
  syncError: null,

  // AUDITORÍA
  createdAt: 1713379200000,
  updatedAt: 1713379200000,
};

// Contador para generar folios únicos
let folioCounter = 0;

export function initDeliveryEvidence() {
  const stored = localStorage.getItem('_folio_counter');
  if (stored) {
    folioCounter = parseInt(stored, 10);
  } else {
    folioCounter = 1000;
  }
}

export function generateFolio() {
  folioCounter++;
  localStorage.setItem('_folio_counter', folioCounter.toString());
  const year = new Date().getFullYear();
  return `UNIF-${year}-${String(folioCounter).padStart(6, '0')}`;
}

export function createDelivery(empleado, prendas, tipo = 'completa', observaciones = '') {
  const user = getUser();
  const now = new Date();

  const costoPorPrenda = {};
  let costTotal = 0;

  prendas.forEach(p => {
    const cost = p.costo || 0;
    costoPorPrenda[p.id] = cost;
    costTotal += cost;
  });

  return {
    id: `dlv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    folio: generateFolio(),

    empleadoId: empleado.id,
    empleadoNombre: empleado.nombre,
    empleadoPaterno: empleado.paterno,
    empleadoArea: empleado.area,
    empleadoSitio: empleado.sitio || 'General',

    operadorId: user.id,
    operadorNombre: user.name,

    fecha: now.toISOString().split('T')[0],
    hora: now.toTimeString().slice(0, 5),
    timestamp: now.getTime(),

    prendas,
    tipo,
    completaONoEntregadas: [],

    firma: null,
    fotosEntrega: [],

    observaciones,
    observacionesEmpleado: '',

    costTotal,
    costoPorPrenda,

    syncStatus: 'local',
    lastSyncAttempt: null,
    syncError: null,

    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  };
}

export function addSignature(delivery, signatureDataURL) {
  delivery.firma = signatureDataURL;
  delivery.updatedAt = Date.now();
  return delivery;
}

export function addPhotos(delivery, photoURLs) {
  delivery.fotosEntrega = (delivery.fotosEntrega || []).concat(photoURLs);
  delivery.updatedAt = Date.now();
  return delivery;
}

export function completeDelivery(delivery, observacionesEmpleado = '') {
  delivery.tipo = 'completa';
  delivery.observacionesEmpleado = observacionesEmpleado;
  delivery.syncStatus = 'local';
  delivery.updatedAt = Date.now();
  return delivery;
}

export function partialDelivery(delivery, noEntregadas, observacionesEmpleado = '') {
  delivery.tipo = 'parcial';
  delivery.completaONoEntregadas = noEntregadas || [];
  delivery.observacionesEmpleado = observacionesEmpleado;
  delivery.syncStatus = 'local';
  delivery.updatedAt = Date.now();
  return delivery;
}

export function markForSync(delivery) {
  delivery.syncStatus = 'pending';
  return delivery;
}

export function markSynced(delivery) {
  delivery.syncStatus = 'synced';
  delivery.lastSyncAttempt = new Date().toISOString();
  return delivery;
}

export function markSyncError(delivery, error) {
  delivery.syncStatus = 'pending';
  delivery.syncError = error;
  return delivery;
}

export function calculateDeliveryCost(delivery) {
  return delivery.costTotal || 0;
}

export function getDeliveryStatus(delivery) {
  if (!delivery.firma) return 'sin_firmar';
  if (delivery.syncStatus === 'synced') return 'sincronizado';
  if (delivery.syncStatus === 'pending') return 'pendiente_sync';
  if (delivery.syncStatus === 'local') return 'solo_local';
  if (delivery.syncStatus === 'conflict') return 'conflicto_sync';
  return 'desconocido';
}
