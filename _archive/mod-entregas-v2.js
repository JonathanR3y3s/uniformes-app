/**
 * ENTREGAS V2 - CORE OPERATIVO
 * Sistema avanzado de entregas con parcialidad y grabación
 */

const STORAGE_KEY_V2 = 'uniformes_v2_entregas';

const store = {
  entregas: []
};

export function initEntregasV2() {
  load();
}

function load() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_V2);
    store.entregas = data ? JSON.parse(data) : [];
  } catch {
    store.entregas = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(store.entregas));
}

export function getStore() {
  return store;
}

export function createEntrega(data) {
  const entrega = {
    id: Date.now().toString(),
    empleadoId: data.empleadoId,
    tipo: data.tipo,
    fecha: data.fecha || new Date().toISOString().split('T')[0],
    prendas: data.prendas || [],
    estado: data.estado || 'pendiente',
    firma: data.firma || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.entregas.push(entrega);
  save();
  return entrega;
}

export function updateEntrega(id, updates) {
  const entrega = store.entregas.find(e => e.id === id);
  if (!entrega) return null;
  Object.assign(entrega, updates, { updatedAt: new Date().toISOString() });
  save();
  return entrega;
}

export function completeEntrega(id, firma) {
  return updateEntrega(id, { estado: 'completada', firma });
}

export function getEntrega(id) {
  return store.entregas.find(e => e.id === id);
}

export function deleteEntrega(id) {
  const idx = store.entregas.findIndex(e => e.id === id);
  if (idx === -1) return false;
  store.entregas.splice(idx, 1);
  save();
  return true;
}

export function getByEstado(estado) {
  return store.entregas.filter(e => e.estado === estado);
}

export function getByTipo(tipo) {
  return store.entregas.filter(e => e.tipo === tipo);
}

export function getByEmpleado(empleadoId) {
  return store.entregas.filter(e => e.empleadoId === empleadoId);
}

export function getByFecha(fecha) {
  return store.entregas.filter(e => e.fecha === fecha);
}

export function filterEntregas(opts) {
  let result = store.entregas;
  if (opts.estado) result = result.filter(e => e.estado === opts.estado);
  if (opts.tipo) result = result.filter(e => e.tipo === opts.tipo);
  if (opts.empleadoId) result = result.filter(e => e.empleadoId === opts.empleadoId);
  if (opts.fecha) result = result.filter(e => e.fecha === opts.fecha);
  return result;
}

export function exportCSV() {
  const rows = [['ID', 'Empleado', 'Tipo', 'Fecha', 'Estado', 'Prendas', 'Firma', 'Actualizado']];
  store.entregas.forEach(e => {
    rows.push([
      e.id,
      e.empleadoId,
      e.tipo,
      e.fecha,
      e.estado,
      JSON.stringify(e.prendas),
      e.firma || '',
      e.updatedAt
    ]);
  });
  return rows;
}
