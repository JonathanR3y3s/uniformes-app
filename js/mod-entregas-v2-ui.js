/**
 * ENTREGAS V2 - INTERFAZ
 */

import { getStore, initEntregasV2, createEntrega, completeEntrega, deleteEntrega, filterEntregas } from './mod-entregas-v2.js';
import { getStore as getMainStore } from './storage.js';
import { notify, modal } from './ui.js';
import { esc, today, fmtDate } from './utils.js';

let currentTab = 'pendientes';

export function init() {
  initEntregasV2();
  attachEvents();
}

export function render() {
  const v2 = getStore();
  const pendientes = v2.entregas.filter(e => e.estado === 'pendiente');
  const completadas = v2.entregas.filter(e => e.estado === 'completada');

  let html = `
    <div class="page-head">
      <div class="page-title">
        <h1>Entregas V2 (Avanzado)</h1>
        <p>Entregas con parcialidad y grabación</p>
      </div>
      <button class="btn btn-success" id="btn-new-v2">
        <i class="fas fa-plus"></i> Nueva Entrega
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi warning">
        <div class="kpi-label">Pendientes</div>
        <div class="kpi-value">${pendientes.length}</div>
      </div>
      <div class="kpi success">
        <div class="kpi-label">Completadas</div>
        <div class="kpi-value">${completadas.length}</div>
      </div>
      <div class="kpi info">
        <div class="kpi-label">Total</div>
        <div class="kpi-value">${v2.entregas.length}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div style="display:flex;gap:10px;border-bottom:1px solid var(--border);padding-bottom:15px">
          <button class="tab-btn ${currentTab === 'pendientes' ? 'active' : ''}" data-tab="pendientes">
            Pendientes (${pendientes.length})
          </button>
          <button class="tab-btn ${currentTab === 'completadas' ? 'active' : ''}" data-tab="completadas">
            Completadas (${completadas.length})
          </button>
        </div>
      </div>

      <div class="card-body">
        <div id="tab-content">
          ${renderTabContent(currentTab, v2.entregas)}
        </div>
      </div>
    </div>

    <style>
      .tab-btn {
        background: none;
        border: none;
        padding: 8px 12px;
        color: var(--text-muted);
        cursor: pointer;
        font-weight: 500;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
      }
      .tab-btn.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }
      .entrega-card {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 10px;
        background: var(--surface-alt);
      }
      .entrega-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .entrega-actions {
        display: flex;
        gap: 6px;
      }
      .entrega-actions button {
        padding: 6px 12px;
        font-size: 12px;
      }
    </style>
  `;

  return html;
}

function renderTabContent(tab, entregas) {
  const filtered = entregas.filter(e => {
    if (tab === 'pendientes') return e.estado === 'pendiente';
    if (tab === 'completadas') return e.estado === 'completada';
    return true;
  });

  if (!filtered.length) {
    return `<div style="text-align:center;padding:30px;color:var(--text-muted)">
      <i class="fas fa-inbox" style="font-size:32px;opacity:0.3;margin-bottom:10px;display:block"></i>
      <p>Sin entregas en este estado</p>
    </div>`;
  }

  return filtered.map(e => {
    const emp = getMainStore().employees.find(x => x.id === e.empleadoId);
    const empName = emp ? esc(emp.nombre + ' ' + (emp.paterno || '')) : e.empleadoId;
    const empArea = emp ? emp.area : '—';

    return `
      <div class="entrega-card">
        <div class="entrega-header">
          <div>
            <p style="margin:0;font-weight:600">${empName}</p>
            <p style="margin:3px 0 0 0;font-size:12px;color:var(--text-muted)">${empArea} • ${e.tipo} • ${fmtDate(e.fecha)}</p>
          </div>
          <span class="badge badge-${e.estado === 'completada' ? 'success' : 'warning'}">${e.estado.toUpperCase()}</span>
        </div>

        <div style="margin:8px 0;font-size:12px">
          <strong>Prendas:</strong> ${e.prendas.length > 0 ? e.prendas.map(p => p.prenda + ':' + p.talla).join(', ') : 'Sin prendas'}
        </div>

        ${e.firma ? `<div style="margin:8px 0;font-size:12px"><strong>Firma:</strong> ${esc(e.firma)}</div>` : ''}

        <div class="entrega-actions">
          ${e.estado === 'pendiente' ? `
            <button class="btn btn-sm btn-success" onclick="window.completeEnt('${e.id}')">Completar</button>
            <button class="btn btn-sm btn-warning" onclick="window.editEnt('${e.id}')">Editar</button>
          ` : ''}
          <button class="btn btn-sm btn-ghost" onclick="window.deleteEnt('${e.id}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

function attachEvents() {
  document.getElementById('btn-new-v2')?.addEventListener('click', newEntrega);
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      currentTab = e.target.dataset.tab;
      document.getElementById('mainContent').innerHTML = render();
      attachEvents();
    });
  });
}

function newEntrega() {
  const emps = getMainStore().employees.filter(e => e.estado === 'activo');
  const tipos = ['nuevo_ingreso', 'dotacion', 'reposicion', 'extra'];

  let html = `
    <div class="form-group">
      <label class="form-label">Empleado *</label>
      <select class="form-select" id="v2-emp">
        <option value="">Seleccionar</option>
        ${emps.map(e => `<option value="${e.id}">${esc(e.nombre)} (${e.area})</option>`).join('')}
      </select>
    </div>

    <div class="form-row c3">
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="form-select" id="v2-tipo">
          ${tipos.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input type="date" class="form-input" id="v2-fecha" value="${today()}">
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="v2-estado">
          <option value="pendiente">Pendiente</option>
          <option value="completada">Completada</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Prendas (JSON)</label>
      <textarea class="form-input" id="v2-prendas" rows="3" placeholder='[{"prenda":"PLAYERA POLO TIPO A","talla":"M"}]'></textarea>
    </div>

    <div class="form-group">
      <label class="form-label">Firma / Notas</label>
      <input type="text" class="form-input" id="v2-firma" placeholder="Nombre o nota">
    </div>
  `;

  modal.open('Nueva Entrega V2', html,
    `<button class="btn btn-ghost" onclick="window.closeModal()">Cancelar</button>
     <button class="btn btn-success" onclick="window.saveEntV2()">Guardar</button>`,
    'lg'
  );
}

window.completeEnt = (id) => {
  const firma = prompt('Firma del operador:');
  if (firma) {
    completeEntrega(id, firma);
    notify('Entrega completada', 'success');
    document.getElementById('mainContent').innerHTML = render();
    attachEvents();
  }
};

window.editEnt = (id) => {
  notify('Edición en desarrollo', 'warning');
};

window.deleteEnt = (id) => {
  if (confirm('¿Eliminar esta entrega?')) {
    deleteEntrega(id);
    notify('Entrega eliminada', 'success');
    document.getElementById('mainContent').innerHTML = render();
    attachEvents();
  }
};

window.saveEntV2 = () => {
  const empId = document.getElementById('v2-emp')?.value;
  const tipo = document.getElementById('v2-tipo')?.value;
  const fecha = document.getElementById('v2-fecha')?.value;
  const estado = document.getElementById('v2-estado')?.value;
  const prendasRaw = document.getElementById('v2-prendas')?.value;
  const firma = document.getElementById('v2-firma')?.value;

  if (!empId) {
    notify('Selecciona empleado', 'warning');
    return;
  }

  let prendas = [];
  if (prendasRaw.trim()) {
    try {
      prendas = JSON.parse(prendasRaw);
    } catch {
      notify('JSON de prendas inválido', 'error');
      return;
    }
  }

  createEntrega({ empleadoId: empId, tipo, fecha, prendas, estado, firma });
  notify('Entrega creada', 'success');
  modal.close();
  document.getElementById('mainContent').innerHTML = render();
  attachEvents();
};

window.closeModal = () => {
  import('./ui.js').then(m => m.modal.close());
};
