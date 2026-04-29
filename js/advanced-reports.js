/**
 * MÓDULO DE REPORTES AVANZADOS Y MODULARES
 * Permite seleccionar y combinar métricas de forma flexible
 * Exportación a Excel
 */

import { getStore } from './storage.js';
import { getOperationalMetrics, getFinancialMetrics, getInventoryMetrics } from './kpi-metrics.js';
import { esc } from './utils.js';

const REPORT_MODULES = {
  // Operativos
  operacion_general: {
    nombre: 'Resumen Operativo',
    categoria: 'operativo',
    fn: (data) => renderOperationSummary(data),
  },
  entregas_por_area: {
    nombre: 'Entregas por Área',
    categoria: 'operativo',
    fn: (data) => renderByArea(data),
  },
  entregas_por_sitio: {
    nombre: 'Entregas por Sitio',
    categoria: 'operativo',
    fn: (data) => renderBySitio(data),
  },
  entregas_por_operador: {
    nombre: 'Entregas por Operador',
    categoria: 'operativo',
    fn: (data) => renderByOperador(data),
  },

  // Financieros
  financiero_resumen: {
    nombre: 'Resumen Financiero',
    categoria: 'financiero',
    fn: (data) => renderFinancialSummary(data),
  },
  gasto_por_area: {
    nombre: 'Gasto por Área',
    categoria: 'financiero',
    fn: (data) => renderGastoByArea(data),
  },
  gasto_por_empleado: {
    nombre: 'Gasto por Empleado',
    categoria: 'financiero',
    fn: (data) => renderGastoByEmpleado(data),
  },
  gasto_por_prenda: {
    nombre: 'Gasto por Prenda',
    categoria: 'financiero',
    fn: (data) => renderGastoByPrenda(data),
  },

  // Inventario
  inventario_demanda: {
    nombre: 'Demanda de Inventario',
    categoria: 'inventario',
    fn: (data) => renderInventoryDemand(data),
  },
};

export function render() {
  let h = '';
  h += '<div class="page advanced-reports-page">';
  h += '<div class="page-head">';
  h += '<h1>Reportes Avanzados</h1>';
  h += '<p>Selecciona módulos para generar tu reporte personalizado</p>';
  h += '</div>';

  h += '<div class="card">';
  h += '<div class="card-head"><h2>Módulos Disponibles</h2></div>';
  h += '<div class="card-body">';

  h += '<div class="modules-grid">';

  Object.entries(REPORT_MODULES).forEach(([key, module]) => {
    h += `
      <label class="module-selector-card">
        <input type="checkbox" class="report-module-check" value="${key}" data-categoria="${module.categoria}">
        <div class="module-icon"><i class="fas fa-chart-bar"></i></div>
        <div class="module-name">${module.nombre}</div>
        <div class="module-cat text-xs text-muted">${module.categoria}</div>
      </label>
    `;
  });

  h += '</div>';

  h += '<div class="mt-4 flex gap-2">';
  h += '<button class="btn btn-primary" id="btnGenerateReport"><i class="fas fa-chart-line"></i> Generar Reporte</button>';
  h += '<button class="btn btn-ghost" id="btnClearSelection"><i class="fas fa-times"></i> Limpiar</button>';
  h += '</div>';

  h += '</div>';
  h += '</div>';

  h += '<div id="reportContainer"></div>';

  h += '</div>';

  return h;
}

export function init() {
  document.getElementById('btnGenerateReport')?.addEventListener('click', () => {
    const selected = Array.from(document.querySelectorAll('.report-module-check:checked')).map(ch => ch.value);

    if (selected.length === 0) {
      alert('Selecciona al menos un módulo');
      return;
    }

    generateReport(selected);
  });

  document.getElementById('btnClearSelection')?.addEventListener('click', () => {
    document.querySelectorAll('.report-module-check').forEach(ch => (ch.checked = false));
  });
}

function generateReport(moduleKeys) {
  const metrics = {
    operational: getOperationalMetrics(null, null),
    financial: getFinancialMetrics(null, null),
    inventory: getInventoryMetrics(),
  };

  let reportHtml = '<div class="card report-output mt-4">';
  reportHtml += '<div class="card-head"><h2>Reporte Generado</h2></div>';
  reportHtml += '<div class="card-body">';

  moduleKeys.forEach(key => {
    const module = REPORT_MODULES[key];
    if (module) {
      const content = module.fn(metrics);
      reportHtml += `
        <div class="report-section">
          <h3>${module.nombre}</h3>
          ${content}
        </div>
      `;
    }
  });

  reportHtml += '<div class="report-actions mt-4">';
  reportHtml += '<button class="btn btn-sm btn-ghost" disabled title="Próximamente" style="opacity:0.45;cursor:not-allowed"><i class="fas fa-file-excel"></i> Excel (próximamente)</button>';
  reportHtml += '<button class="btn btn-sm btn-primary" id="btnPrintReport"><i class="fas fa-print"></i> Imprimir</button>';
  reportHtml += '</div>';

  reportHtml += '</div>';
  reportHtml += '</div>';

  const container = document.getElementById('reportContainer');
  if (container) {
    container.innerHTML = reportHtml;

    document.getElementById('btnPrintReport')?.addEventListener('click', () => {
      window.print();
    });
  }
}

// ============================================================================
// RENDERIZADORES DE MÓDULOS
// ============================================================================

function renderOperationSummary(data) {
  const op = data.operational;

  let h = '<table class="report-table">';
  h += '<tr><td>Total Entregas</td><td class="text-right">' + op.total + '</td></tr>';
  h += '<tr><td>Entregas Completas</td><td class="text-right">' + op.completas + '</td></tr>';
  h += '<tr><td>Entregas Parciales</td><td class="text-right">' + op.parciales + '</td></tr>';
  h += '<tr><td>Porcentaje Completitud</td><td class="text-right">' + op.porcentajeComplecion + '%</td></tr>';
  h += '<tr><td>Entregas Firmadas</td><td class="text-right">' + op.conFirma + '/' + op.total + '</td></tr>';
  h += '</table>';
  return h;
}

function renderByArea(data) {
  const op = data.operational;

  let h = '<table class="report-table">';
  h += '<thead><tr><th>Área</th><th class="text-right">Entregados</th><th class="text-right">Total</th><th class="text-right">%</th></tr></thead>';
  h += '<tbody>';

  Object.entries(op.byArea).forEach(([area, info]) => {
    const pct = info.total > 0 ? Math.round((info.entregados / info.total) * 100) : 0;
    h += `<tr><td>${area}</td><td class="text-right">${info.entregados}</td><td class="text-right">${info.total}</td><td class="text-right">${pct}%</td></tr>`;
  });

  h += '</tbody></table>';
  return h;
}

function renderBySitio(data) {
  const op = data.operational;

  let h = '<table class="report-table">';
  h += '<thead><tr><th>Sitio</th><th class="text-right">Entregados</th><th class="text-right">Total</th><th class="text-right">%</th></tr></thead>';
  h += '<tbody>';

  Object.entries(op.bySitio).forEach(([sitio, info]) => {
    const pct = info.total > 0 ? Math.round((info.entregados / info.total) * 100) : 0;
    h += `<tr><td>${sitio}</td><td class="text-right">${info.entregados}</td><td class="text-right">${info.total}</td><td class="text-right">${pct}%</td></tr>`;
  });

  h += '</tbody></table>';
  return h;
}

function renderByOperador(data) {
  const op = data.operational;

  let h = '<table class="report-table">';
  h += '<thead><tr><th>Operador</th><th class="text-right">Entregas</th></tr></thead>';
  h += '<tbody>';

  Object.entries(op.byOperador).forEach(([opId, info]) => {
    h += `<tr><td>${info.nombre}</td><td class="text-right">${info.total}</td></tr>`;
  });

  h += '</tbody></table>';
  return h;
}

function renderFinancialSummary(data) {
  const fin = data.financial;

  let h = '<table class="report-table">';
  h += '<tr><td>Gasto Total</td><td class="text-right">$' + fin.gastoTotal.toLocaleString() + '</td></tr>';
  h += '<tr><td>Costo Promedio por Entrega</td><td class="text-right">$' + fin.gastoPorEntrega + '</td></tr>';
  h += '<tr><td>Proyección Pendiente</td><td class="text-right">$' + Math.round(fin.proyeccionPendiente).toLocaleString() + '</td></tr>';
  h += '<tr><td><strong>Total Proyectado</strong></td><td class="text-right"><strong>$' + (fin.gastoTotal + Math.round(fin.proyeccionPendiente)).toLocaleString() + '</strong></td></tr>';
  h += '</table>';
  return h;
}

function renderGastoByArea(data) {
  const fin = data.financial;

  let h = '<table class="report-table">';
  h += '<thead><tr><th>Área</th><th class="text-right">Gasto</th></tr></thead>';
  h += '<tbody>';

  Object.entries(fin.gastoPorArea).forEach(([area, gasto]) => {
    h += `<tr><td>${area}</td><td class="text-right">$${gasto.toLocaleString()}</td></tr>`;
  });

  h += '</tbody></table>';
  return h;
}

function renderGastoByEmpleado(data) {
  const fin = data.financial;

  let h = '<table class="report-table">';
  h += '<thead><tr><th>Empleado</th><th class="text-right">Entregas</th><th class="text-right">Gasto</th><th class="text-right">Promedio</th></tr></thead>';
  h += '<tbody>';

  fin.topEmpleados.forEach((emp) => {
    h += `<tr><td>${emp.nombre}</td><td class="text-right">${emp.entregas}</td><td class="text-right">$${emp.costo.toLocaleString()}</td><td class="text-right">$${emp.promedio.toLocaleString()}</td></tr>`;
  });

  h += '</tbody></table>';
  return h;
}

function renderGastoByPrenda(data) {
  const fin = data.financial;

  let h = '<table class="report-table">';
  h += '<thead><tr><th>Prenda</th><th class="text-right">Gasto Total</th></tr></thead>';
  h += '<tbody>';

  fin.topPrendas.forEach((prenda) => {
    h += `<tr><td>${prenda.prenda}</td><td class="text-right">$${prenda.cost.toLocaleString()}</td></tr>`;
  });

  h += '</tbody></table>';
  return h;
}

function renderInventoryDemand(data) {
  const inv = data.inventory;

  let h = '<div class="inventory-demand-report">';
  h += '<h4>Prendas Más Solicitadas</h4>';
  h += '<table class="report-table">';
  h += '<thead><tr><th>Prenda</th><th class="text-right">Cantidad</th></tr></thead>';
  h += '<tbody>';

  inv.prendaMasSolicitada.forEach((p) => {
    h += `<tr><td>${p.prenda}</td><td class="text-right">${p.count}</td></tr>`;
  });

  h += '</tbody></table>';

  h += '<h4 class="mt-3">Tallas Más Demandadas</h4>';
  h += '<table class="report-table">';
  h += '<thead><tr><th>Talla</th><th class="text-right">Cantidad</th></tr></thead>';
  h += '<tbody>';

  inv.tallaMasDemandada.forEach((t) => {
    h += `<tr><td>${t.talla}</td><td class="text-right">${t.count}</td></tr>`;
  });

  h += '</tbody></table>';
  h += '</div>';
  return h;
}

function exportReportToExcel(moduleKeys, metrics) {
  console.log('Exportar Excel: próximamente para reportes avanzados', moduleKeys);
}
