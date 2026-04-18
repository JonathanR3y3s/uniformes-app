/**
 * DASHBOARD EJECUTIVO MEJORADO
 * Métricas operativas, financieras y KPIs
 * Interfaz profesional y clara
 */

import { getStore } from './storage.js';
import { getOperationalMetrics, getFinancialMetrics, getExecutiveMetrics } from './kpi-metrics.js';
import { esc, fmtDate, today } from './utils.js';

export function render() {
  const metrics = getExecutiveMetrics(null, null);
  const operational = metrics.operational;
  const financial = metrics.financial;

  let h = '';
  h += '<div class="page admin-dashboard-page">';

  h += '<div class="page-head">';
  h += '<div class="page-title">';
  h += '<h1>Dashboard Ejecutivo</h1>';
  h += `<p>Actualizado: ${today()}</p>`;
  h += '</div>';
  h += '</div>';

  // ========== SEMÁFOROS RÁPIDOS ==========
  h += '<div class="metric-traffic-lights">';
  h += `<div class="light light-${metrics.semaforo.operacion}"><i class="fas fa-circle"></i> Operación</div>`;
  h += `<div class="light light-${metrics.semaforo.financiero}"><i class="fas fa-circle"></i> Financiero</div>`;
  h += `<div class="light light-${metrics.semaforo.sync}"><i class="fas fa-circle"></i> Sincronización</div>`;
  h += '</div>';

  // ========== KPIs OPERATIVOS ==========
  h += '<div class="card card-section">';
  h += '<div class="card-head"><h2>Operación</h2></div>';
  h += '<div class="card-body">';

  h += '<div class="kpi-grid kpi-grid-4">';

  // Entregas completas
  h += '<div class="kpi">';
  h += `<div class="kpi-label">Entregas Completas</div>`;
  h += `<div class="kpi-value">${operational.completas}</div>`;
  h += `<div class="kpi-subtext">${operational.porcentajeComplecion}% de avance</div>`;
  h += '</div>';

  // Entregas parciales
  h += '<div class="kpi">';
  h += `<div class="kpi-label">Entregas Parciales</div>`;
  h += `<div class="kpi-value">${operational.parciales}</div>`;
  h += `<div class="kpi-subtext">Total: ${operational.total}</div>`;
  h += '</div>';

  // Empleados
  h += '<div class="kpi">';
  h += `<div class="kpi-label">Empleados Atendidos</div>`;
  h += `<div class="kpi-value">${operational.empleadosAtendidos}</div>`;
  h += `<div class="kpi-subtext">${operational.empleadosPendientes} pendientes</div>`;
  h += '</div>';

  // Firma
  h += '<div class="kpi">';
  h += `<div class="kpi-label">Entregas Firmadas</div>`;
  h += `<div class="kpi-value">${operational.porcentajeFirmado}%</div>`;
  h += `<div class="kpi-subtext">${operational.conFirma}/${operational.total}</div>`;
  h += '</div>';

  h += '</div>';

  // Entregas por área
  h += '<div class="metric-section mt-4">';
  h += '<h3 class="mb-3">Entregas por Área</h3>';
  h += '<div class="metric-table">';
  Object.entries(operational.byArea).forEach(([area, data]) => {
    const percentage = data.total > 0 ? Math.round((data.entregados / data.total) * 100) : 0;
    h += `
      <div class="metric-row">
        <div class="metric-label">${area}</div>
        <div class="metric-bar">
          <div class="metric-progress" style="width: ${percentage}%"></div>
        </div>
        <div class="metric-value">${data.entregados}/${data.total}</div>
      </div>
    `;
  });
  h += '</div>';
  h += '</div>';

  h += '</div>';
  h += '</div>';

  // ========== KPIs FINANCIEROS ==========
  h += '<div class="card card-section">';
  h += '<div class="card-head"><h2>Financiero</h2></div>';
  h += '<div class="card-body">';

  h += '<div class="kpi-grid kpi-grid-3">';

  // Gasto total
  h += '<div class="kpi kpi-financial">';
  h += `<div class="kpi-label">Gasto Total</div>`;
  h += `<div class="kpi-value">$${financial.gastoTotal.toLocaleString()}</div>`;
  h += `<div class="kpi-subtext">Promedio: $${financial.gastoPorEntrega}</div>`;
  h += '</div>';

  // Proyección
  h += '<div class="kpi kpi-financial">';
  h += `<div class="kpi-label">Proyección Pendiente</div>`;
  h += `<div class="kpi-value">$${Math.round(financial.proyeccionPendiente).toLocaleString()}</div>`;
  h += `<div class="kpi-subtext">Estimado</div>`;
  h += '</div>';

  // Total proyectado
  h += '<div class="kpi kpi-financial">';
  h += `<div class="kpi-label">Total Proyectado</div>`;
  h += `<div class="kpi-value">$${(financial.gastoTotal + Math.round(financial.proyeccionPendiente)).toLocaleString()}</div>`;
  h += `<div class="kpi-subtext">Entregado + Pendiente</div>`;
  h += '</div>';

  h += '</div>';

  // Top áreas por gasto
  h += '<div class="metric-section mt-4">';
  h += '<h3 class="mb-3">Gasto por Área (Top 5)</h3>';
  financial.topAreas.forEach((item, idx) => {
    h += `
      <div class="metric-row">
        <div class="metric-label">${idx + 1}. ${item.area}</div>
        <div class="metric-value">$${item.cost.toLocaleString()}</div>
      </div>
    `;
  });
  h += '</div>';

  // Top prendas
  h += '<div class="metric-section mt-4">';
  h += '<h3 class="mb-3">Prendas Más Costosas</h3>';
  financial.topPrendas.forEach((item, idx) => {
    h += `
      <div class="metric-row">
        <div class="metric-label">${idx + 1}. ${item.prenda}</div>
        <div class="metric-value">$${item.cost.toLocaleString()}</div>
      </div>
    `;
  });
  h += '</div>';

  h += '</div>';
  h += '</div>';

  // ========== ALERTAS ==========
  if (metrics.alertas.length > 0) {
    h += '<div class="card card-alerts">';
    h += '<div class="card-head"><h2>Alertas</h2></div>';
    h += '<div class="card-body">';
    metrics.alertas.forEach(alerta => {
      const icon = alerta.nivel === 'crítico' ? '⚠️' : 'ℹ️';
      h += `<div class="alert alert-${alerta.nivel}"><strong>${icon} ${alerta.nivel.toUpperCase()}</strong><p>${alerta.mensaje}</p></div>`;
    });
    h += '</div>';
    h += '</div>';
  }

  // ========== SINCRONIZACIÓN ==========
  if (operational.pendingSync > 0) {
    h += '<div class="card card-sync">';
    h += '<div class="card-head">';
    h += '<h2>Estado de Sincronización</h2>';
    h += '</div>';
    h += '<div class="card-body">';
    h += `<p class="mb-3"><strong>${operational.pendingSync}</strong> entregas pendientes de sincronizar</p>`;
    h += '<button class="btn btn-sm btn-primary" id="btnSyncNow">';
    h += '<i class="fas fa-sync"></i> Sincronizar Ahora';
    h += '</button>';
    h += '</div>';
    h += '</div>';
  }

  h += '</div>';

  return h;
}

export function init() {
  document.getElementById('btnSyncNow')?.addEventListener('click', () => {
    console.log('[ADMIN] Iniciando sincronización...');
    // TODO: Implementar sincronización real
  });
}
