/**
 * VISTA DE OPERADOR - ENTREGA RÁPIDA PARA IPAD
 * Interfaz ultra simple, táctil, optimizada para operación en campo
 * Máximo 2-3 pantallas por entrega
 */

import { getStore } from './storage.js';
import { getUser } from './user-roles.js';
import { createDelivery, completeDelivery, addSignature } from './delivery-evidence.js';
import { initSignatureCapture, getSignatureData, hasSignature } from './signature-capture.js';
import { saveDeliveryOffline, addToSyncQueue } from './offline-storage.js';
import { esc, fmtDate, today } from './utils.js';
import { notify, modal } from './ui.js';

let currentDelivery = null;
let deliveryStep = 1; // 1: Buscar empleado, 2: Seleccionar prendas, 3: Firmar, 4: Confirmar

export function render() {
  const user = getUser();

  let h = '';
  h += '<div class="page operator-delivery-page">';
  h += '<div class="operator-header">';
  h += `<h1>Entrega de Uniformes</h1>`;
  h += `<div class="operator-status">`;
  h += `<span class="badge badge-info">${esc(user.name)}</span>`;
  h += `<span class="text-xs text-muted">${today()}</span>`;
  h += '</div>';
  h += '</div>';

  if (deliveryStep === 1) {
    h += renderSearchEmployee();
  } else if (deliveryStep === 2) {
    h += renderSelectPrendas();
  } else if (deliveryStep === 3) {
    h += renderSignature();
  } else if (deliveryStep === 4) {
    h += renderConfirm();
  }

  h += '</div>';

  return h;
}

function renderSearchEmployee() {
  const store = getStore();
  const activos = store.employees.filter(e => e.estado === 'activo');

  let h = '';
  h += '<div class="operator-step">';
  h += '<h2>Buscar Empleado</h2>';
  h += '<p class="text-muted mb-4">Escanea o busca el empleado a entregar uniformes</p>';

  h += '<div class="form-group mb-4">';
  h += '<input type="text" class="form-input input-lg" id="opSearchInput" ';
  h += 'placeholder="Escribe nombre o #ID..." ';
  h += 'style="font-size: 16px; padding: 16px; border-radius: 8px;">';
  h += '</div>';

  h += '<div id="opResults" class="operator-list">';
  if (activos.length === 0) {
    h += '<div class="empty-state"><i class="fas fa-users"></i><p>No hay empleados activos</p></div>';
  } else {
    activos.slice(0, 10).forEach(emp => {
      h += `
        <button class="operator-emp-card" data-emp-id="${emp.id}">
          <div class="emp-avatar"><i class="fas fa-user-circle"></i></div>
          <div class="emp-info">
            <div class="emp-name">${esc(emp.nombre)} ${esc(emp.paterno || '')}</div>
            <div class="emp-area text-xs text-muted">${emp.area}</div>
            <div class="emp-id text-xs">#${emp.id}</div>
          </div>
          <div class="emp-arrow"><i class="fas fa-chevron-right"></i></div>
        </button>
      `;
    });
  }
  h += '</div>';

  h += '</div>';

  return h;
}

function renderSelectPrendas() {
  if (!currentDelivery) return '<p>Error: Sin empleado seleccionado</p>';

  const emp = getStore().employees.find(e => e.id === currentDelivery.empleadoId);
  if (!emp) return '<p>Error: Empleado no encontrado</p>';

  let h = '';
  h += '<div class="operator-step">';
  h += '<button class="btn btn-ghost btn-sm" id="opBack" style="margin-bottom: 16px;"><i class="fas fa-arrow-left"></i> Atrás</button>';

  h += '<h2>Prendas a Entregar</h2>';
  h += `<p class="text-muted mb-4">Empleado: <strong>${esc(emp.nombre)}</strong></p>`;

  const prendas = Object.entries(emp.tallas || {}).filter(([_, v]) => v);

  if (prendas.length === 0) {
    h += '<div class="empty-state"><i class="fas fa-shirt"></i><p>Sin tallas capturadas para este empleado</p></div>';
  } else {
    h += '<div class="operator-prendas">';
    prendas.forEach(([prenda, talla], idx) => {
      h += `
        <label class="operator-prenda-card">
          <input type="checkbox" class="op-prenda-check" value="${prenda}" data-talla="${talla}" checked>
          <div class="prenda-details">
            <div class="prenda-name">${esc(prenda)}</div>
            <div class="prenda-talla text-xs text-muted">Talla: ${talla}</div>
          </div>
          <div class="check-mark"><i class="fas fa-check-circle"></i></div>
        </label>
      `;
    });
    h += '</div>';
  }

  h += '<button class="btn btn-success btn-lg mt-4" id="opNext">';
  h += '<i class="fas fa-arrow-right"></i> Siguiente';
  h += '</button>';

  h += '</div>';

  return h;
}

function renderSignature() {
  if (!currentDelivery) return '<p>Error</p>';

  let h = '';
  h += '<div class="operator-step">';
  h += '<button class="btn btn-ghost btn-sm" id="opBack" style="margin-bottom: 16px;"><i class="fas fa-arrow-left"></i> Atrás</button>';

  h += '<h2>Firma del Empleado</h2>';
  h += '<p class="text-muted mb-4">Confirma la entrega firmando abajo</p>';

  h += '<div id="opSignatureContainer"></div>';

  h += '<button class="btn btn-success btn-lg mt-4" id="opNext">';
  h += '<i class="fas fa-check"></i> Confirmar';
  h += '</button>';

  h += '</div>';

  return h;
}

function renderConfirm() {
  if (!currentDelivery) return '<p>Error</p>';

  const emp = getStore().employees.find(e => e.id === currentDelivery.empleadoId);

  let h = '';
  h += '<div class="operator-step operator-confirm-step">';
  h += '<div class="confirm-success">';
  h += '<i class="fas fa-check-circle" style="color: var(--success); font-size: 48px; margin-bottom: 16px;"></i>';
  h += '<h2>Entrega Registrada</h2>';
  h += `<p class="text-muted">Folio: <strong>${currentDelivery.folio}</strong></p>`;
  h += `<p class="text-sm text-muted mt-2">Empleado: ${esc(emp?.nombre || 'N/A')}</p>`;
  h += `<p class="text-sm text-muted">Prendas: ${currentDelivery.prendas.length}</p>`;
  h += '</div>';

  h += '<div class="confirm-actions mt-4">';
  h += '<button class="btn btn-success btn-lg" id="opNewDelivery">';
  h += '<i class="fas fa-plus"></i> Nueva Entrega';
  h += '</button>';
  h += '</div>';

  h += '</div>';

  return h;
}

export function init() {
  attachEvents();
}

function attachEvents() {
  if (deliveryStep === 1) {
    const searchInput = document.getElementById('opSearchInput');
    const resultsContainer = document.getElementById('opResults');

    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', () => filterEmployees(searchInput.value));
    }

    // Seleccionar empleado
    document.querySelectorAll('.operator-emp-card').forEach(card => {
      card.addEventListener('click', () => {
        const empId = card.dataset.empId;
        selectEmployee(empId);
      });
    });
  } else if (deliveryStep === 2) {
    document.getElementById('opBack')?.addEventListener('click', () => {
      deliveryStep = 1;
      const render_fn = window.views?.operador?.render || render;
      if (render_fn) {
        document.getElementById('mainContent').innerHTML = render_fn();
        init();
      }
    });

    document.getElementById('opNext')?.addEventListener('click', () => {
      const selected = Array.from(document.querySelectorAll('.op-prenda-check:checked')).map(ch => ({
        id: `prnd_${ch.value}`,
        nombre: ch.value,
        talla: ch.dataset.talla,
        cantidad: 1,
        costo: 0,
      }));

      if (selected.length === 0) {
        notify('Selecciona al menos una prenda', 'warning');
        return;
      }

      currentDelivery.prendas = selected;
      deliveryStep = 3;

      const render_fn = window.views?.operador?.render || render;
      if (render_fn) {
        document.getElementById('mainContent').innerHTML = render_fn();
        init();
      }
    });
  } else if (deliveryStep === 3) {
    document.getElementById('opBack')?.addEventListener('click', () => {
      deliveryStep = 2;
      const render_fn = window.views?.operador?.render || render;
      if (render_fn) {
        document.getElementById('mainContent').innerHTML = render_fn();
        init();
      }
    });

    initSignatureCapture('opSignatureContainer');

    document.getElementById('opNext')?.addEventListener('click', async () => {
      const sig = getSignatureData();
      if (!sig) {
        notify('Captura tu firma por favor', 'warning');
        return;
      }

      addSignature(currentDelivery, sig);
      await saveDeliveryOffline(currentDelivery);
      await addToSyncQueue(currentDelivery.id, 'create');

      deliveryStep = 4;

      const render_fn = window.views?.operador?.render || render;
      if (render_fn) {
        document.getElementById('mainContent').innerHTML = render_fn();
        init();
      }
    });
  } else if (deliveryStep === 4) {
    document.getElementById('opNewDelivery')?.addEventListener('click', () => {
      currentDelivery = null;
      deliveryStep = 1;

      const render_fn = window.views?.operador?.render || render;
      if (render_fn) {
        document.getElementById('mainContent').innerHTML = render_fn();
        init();
      }
    });
  }
}

function filterEmployees(query) {
  const store = getStore();
  const activos = store.employees.filter(e => e.estado === 'activo');

  const q = query.toLowerCase();
  const filtered = activos.filter(e =>
    e.nombre.toLowerCase().includes(q) ||
    (e.paterno || '').toLowerCase().includes(q) ||
    e.id.toLowerCase().includes(q)
  );

  const resultsContainer = document.getElementById('opResults');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '';

  if (filtered.length === 0) {
    resultsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No encontrado</p></div>';
    return;
  }

  filtered.slice(0, 10).forEach(emp => {
    const card = document.createElement('button');
    card.className = 'operator-emp-card';
    card.dataset.empId = emp.id;
    card.innerHTML = `
      <div class="emp-avatar"><i class="fas fa-user-circle"></i></div>
      <div class="emp-info">
        <div class="emp-name">${esc(emp.nombre)} ${esc(emp.paterno || '')}</div>
        <div class="emp-area text-xs text-muted">${emp.area}</div>
        <div class="emp-id text-xs">#${emp.id}</div>
      </div>
      <div class="emp-arrow"><i class="fas fa-chevron-right"></i></div>
    `;
    card.addEventListener('click', () => selectEmployee(emp.id));
    resultsContainer.appendChild(card);
  });
}

function selectEmployee(empId) {
  const emp = getStore().employees.find(e => e.id === empId);
  if (!emp) return;

  currentDelivery = createDelivery(emp, [], 'completa', '');
  deliveryStep = 2;

  const render_fn = window.views?.operador?.render || render;
  if (render_fn) {
    document.getElementById('mainContent').innerHTML = render_fn();
    init();
  }
}
