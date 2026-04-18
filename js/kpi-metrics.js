/**
 * MÓDULO DE KPIs Y MÉTRICAS
 * Sistema completo de métricas operativas, financieras y ejecutivas
 */

import { getStore } from './storage.js';
import { normTalla } from './utils.js';

// ============================================================================
// MÉTRICAS OPERATIVAS
// ============================================================================

export function getOperationalMetrics(dateFrom, dateTo) {
  const deliveries = filterDeliveriesByDate(getStore().entregas || [], dateFrom, dateTo);

  const completas = deliveries.filter(d => d.tipo === 'completa').length;
  const parciales = deliveries.filter(d => d.tipo === 'parcial').length;
  const total = deliveries.length;

  const empleados = getStore().employees || [];
  const empleadosAtendidos = new Set(deliveries.map(d => d.empleadoId)).size;
  const empleadosPendientes = empleados.filter(e => e.estado === 'activo').length - empleadosAtendidos;

  const conFirma = deliveries.filter(d => d.firma).length;

  const byArea = {};
  empleados.forEach(emp => {
    if (!byArea[emp.area]) byArea[emp.area] = { total: 0, entregados: 0 };
    byArea[emp.area].total++;
  });

  deliveries.forEach(d => {
    const emp = empleados.find(e => e.id === d.empleadoId);
    if (emp && byArea[emp.area]) byArea[emp.area].entregados++;
  });

  const bySitio = {};
  empleados.forEach(emp => {
    const sitio = emp.sitio || 'General';
    if (!bySitio[sitio]) bySitio[sitio] = { total: 0, entregados: 0 };
    bySitio[sitio].total++;
  });

  deliveries.forEach(d => {
    const emp = empleados.find(e => e.id === d.empleadoId);
    if (emp) {
      const sitio = emp.sitio || 'General';
      if (bySitio[sitio]) bySitio[sitio].entregados++;
    }
  });

  const byOperador = {};
  deliveries.forEach(d => {
    if (!byOperador[d.operadorId]) byOperador[d.operadorId] = { nombre: d.operadorNombre || d.operadorId, total: 0 };
    byOperador[d.operadorId].total++;
  });

  const pendingSync = deliveries.filter(d => d.syncStatus === 'pending' || d.syncStatus === 'local').length;

  return {
    total,
    completas,
    parciales,
    porcentajeComplecion: total > 0 ? Math.round((completas / total) * 100) : 0,
    empleadosAtendidos,
    empleadosPendientes,
    conFirma,
    porcentajeFirmado: total > 0 ? Math.round((conFirma / total) * 100) : 0,
    byArea,
    bySitio,
    byOperador,
    pendingSync,
  };
}

export function getOperatorPerformance(operadorId, dateFrom, dateTo) {
  const deliveries = filterDeliveriesByDate(getStore().entregas || [], dateFrom, dateTo).filter(
    d => d.operadorId === operadorId
  );

  const completas = deliveries.filter(d => d.tipo === 'completa').length;
  const parciales = deliveries.filter(d => d.tipo === 'parcial').length;

  return {
    operadorId,
    operadorNombre: deliveries[0]?.operadorNombre || operadorId,
    total: deliveries.length,
    completas,
    parciales,
    porcentajeComplecion: deliveries.length > 0 ? Math.round((completas / deliveries.length) * 100) : 0,
    entregazHoy: getDeliveriesToday(operadorId),
  };
}

function getDeliveriesToday(operadorId) {
  const today = new Date().toISOString().split('T')[0];
  return (getStore().entregas || []).filter(d => d.fecha === today && d.operadorId === operadorId).length;
}

// ============================================================================
// MÉTRICAS FINANCIERAS
// ============================================================================

export function getFinancialMetrics(dateFrom, dateTo) {
  const deliveries = filterDeliveriesByDate(getStore().entregas || [], dateFrom, dateTo);
  const empleados = getStore().employees || [];
  const proveedores = getStore().proveedores || [];

  const gastoTotal = deliveries.reduce((sum, d) => sum + (d.costTotal || 0), 0);
  const gastoPorEntrega = deliveries.length > 0 ? Math.round(gastoTotal / deliveries.length) : 0;

  const gastoPorEmpleado = {};
  empleados.forEach(emp => {
    const empDeliveries = deliveries.filter(d => d.empleadoId === emp.id);
    const cost = empDeliveries.reduce((sum, d) => sum + (d.costTotal || 0), 0);
    if (cost > 0 || empDeliveries.length > 0) {
      gastoPorEmpleado[emp.id] = {
        nombre: emp.nombre,
        entregas: empDeliveries.length,
        costo: cost,
        promedio: empDeliveries.length > 0 ? Math.round(cost / empDeliveries.length) : 0,
      };
    }
  });

  const gastoPorArea = {};
  empleados.forEach(emp => {
    if (!gastoPorArea[emp.area]) gastoPorArea[emp.area] = 0;
  });

  deliveries.forEach(d => {
    const emp = empleados.find(e => e.id === d.empleadoId);
    if (emp) gastoPorArea[emp.area] = (gastoPorArea[emp.area] || 0) + (d.costTotal || 0);
  });

  const gastoPorPrenda = {};
  deliveries.forEach(d => {
    d.prendas?.forEach(p => {
      if (!gastoPorPrenda[p.nombre]) gastoPorPrenda[p.nombre] = 0;
      gastoPorPrenda[p.nombre] += p.costo || 0;
    });
  });

  const topEmpleados = Object.values(gastoPorEmpleado)
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 5);

  const topAreas = Object.entries(gastoPorArea)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area, cost]) => ({ area, cost }));

  const topPrendas = Object.entries(gastoPorPrenda)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([prenda, cost]) => ({ prenda, cost }));

  return {
    gastoTotal,
    gastoPorEntrega,
    gastoPorEmpleado,
    gastoPorArea,
    gastoPorPrenda,
    topEmpleados,
    topAreas,
    topPrendas,
    proyeccionPendiente: calculateProjec tion(empleados, deliveries),
  };
}

function calculateProjection(empleados, entregados) {
  const totalEmpleados = empleados.filter(e => e.estado === 'activo').length;
  const gastoPromedio = entregados.length > 0 ? entregados.reduce((s, d) => s + (d.costTotal || 0), 0) / entregados.length : 0;
  return (totalEmpleados - entregados.length) * gastoPromedio;
}

// ============================================================================
// MÉTRICAS DE INVENTARIO
// ============================================================================

export function getInventoryMetrics() {
  const store = getStore();
  const entregas = store.entregas || [];
  const inventario = store.inventario || [];

  const prendaMasSolicitada = {};
  entregas.forEach(d => {
    d.prendas?.forEach(p => {
      prendaMasSolicitada[p.nombre] = (prendaMasSolicitada[p.nombre] || 0) + 1;
    });
  });

  const tallaMasDemandada = {};
  entregas.forEach(d => {
    d.prendas?.forEach(p => {
      tallaMasDemandada[p.talla] = (tallaMasDemandada[p.talla] || 0) + 1;
    });
  });

  return {
    prendaMasSolicitada: Object.entries(prendaMasSolicitada)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([prenda, count]) => ({ prenda, count })),
    tallaMasDemandada: Object.entries(tallaMasDemandada)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([talla, count]) => ({ talla, count })),
    totalInventario: inventario.length,
    stockActual: calculateCurrentStock(store),
  };
}

function calculateCurrentStock(store) {
  const stock = {};
  store.inventario?.forEach(item => {
    const key = `${item.prenda}|${normTalla(item.talla)}`;
    stock[key] = (stock[key] || 0) + item.cantidad;
  });

  store.entregas?.forEach(d => {
    d.prendas?.forEach(p => {
      const key = `${p.nombre}|${normTalla(p.talla)}`;
      stock[key] = (stock[key] || 0) - 1;
    });
  });

  return stock;
}

// ============================================================================
// MÉTRICAS EJECUTIVAS
// ============================================================================

export function getExecutiveMetrics(dateFrom, dateTo) {
  const operational = getOperationalMetrics(dateFrom, dateTo);
  const financial = getFinancialMetrics(dateFrom, dateTo);

  return {
    operational,
    financial,
    semaforo: {
      operacion: operational.porcentajeComplecion >= 80 ? 'green' : operational.porcentajeComplecion >= 50 ? 'yellow' : 'red',
      financiero: financial.gastoTotal > 0 ? 'green' : 'gray',
      sync: operational.pendingSync === 0 ? 'green' : 'yellow',
    },
    alertas: generateAlerts(operational, financial),
  };
}

function generateAlerts(operational, financial) {
  const alertas = [];

  if (operational.porcentajeComplecion < 50) {
    alertas.push({ nivel: 'crítico', mensaje: 'Menos del 50% de entregas completadas' });
  }
  if (operational.pendingSync > 0) {
    alertas.push({ nivel: 'aviso', mensaje: `${operational.pendingSync} entregas pendientes de sincronizar` });
  }
  if (operational.porcentajeFirmado < 80) {
    alertas.push({ nivel: 'aviso', mensaje: `Solo ${operational.porcentajeFirmado}% de entregas firmadas` });
  }

  return alertas;
}

// ============================================================================
// UTILIDADES
// ============================================================================

function filterDeliveriesByDate(deliveries, dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return deliveries;

  return deliveries.filter(d => {
    const dFecha = new Date(d.fecha);
    const dFrom = new Date(dateFrom);
    const dTo = new Date(dateTo);
    return dFecha >= dFrom && dFecha <= dTo;
  });
}

export function getMetricsDateRange() {
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  return {
    today: today.toISOString().split('T')[0],
    lastMonth: lastMonth.toISOString().split('T')[0],
    lastWeek: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };
}
