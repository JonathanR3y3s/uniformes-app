/**
 * COSTOS - BASE DE CÁLCULOS
 * Cálculos de costos sin UI completa
 */

import { getStore as getMainStore } from './storage.js';
import { getStore as getEntregasStore } from './mod-entregas-v2.js';

export function calcCostosPorEmpleado() {
  const mainStore = getMainStore();
  const costos = {};

  mainStore.employees.forEach(emp => {
    let total = 0;

    // Contar prendas asignadas
    if (emp.tallas) {
      Object.entries(emp.tallas).forEach(([prenda, talla]) => {
        const precio = getPrecioProveedor(prenda, talla);
        total += precio;
      });
    }

    costos[emp.id] = {
      empleadoId: emp.id,
      nombre: emp.nombre,
      area: emp.area,
      totalPrendas: Object.keys(emp.tallas || {}).length,
      costoPrendas: total,
      estado: 'calculado'
    };
  });

  return costos;
}

export function calcCostoAcumulado() {
  const porEmpleado = calcCostosPorEmpleado();
  return Object.values(porEmpleado).reduce((sum, item) => sum + item.costoPrendas, 0);
}

export function calcGastoTotal() {
  const mainStore = getMainStore();
  let total = 0;

  // Gastos en proveedores
  mainStore.proveedores.forEach(prov => {
    const cantidad = parseInt(prov.cantidad, 10) || 0;
    const precio = parseFloat(prov.precioUnitario) || 0;
    total += cantidad * precio;
  });

  return total;
}

export function getPrecioProveedor(prenda, talla) {
  const mainStore = getMainStore();
  const prov = mainStore.proveedores.find(p =>
    p.prenda === prenda && p.talla === talla
  );
  return prov ? (parseFloat(prov.precioUnitario) || 0) : 0;
}

export function generateCostosReport() {
  const porEmpleado = calcCostosPorEmpleado();
  const acumulado = calcCostoAcumulado();
  const gastoTotal = calcGastoTotal();

  return {
    timestamp: new Date().toISOString(),
    porEmpleado,
    costoAcumulado: acumulado,
    gastoTotal,
    diferencia: gastoTotal - acumulado,
    resumen: {
      empleados: Object.keys(porEmpleado).length,
      prendasTotales: Object.values(porEmpleado).reduce((sum, e) => sum + e.totalPrendas, 0),
      costoPromedioPorEmpleado: acumulado / Object.keys(porEmpleado).length
    }
  };
}

export function exportCostosCSV() {
  const report = generateCostosReport();
  const rows = [
    ['REPORTE DE COSTOS'],
    ['Fecha', report.timestamp],
    [''],
    ['POR EMPLEADO'],
    ['Empleado ID', 'Nombre', 'Área', 'Prendas', 'Costo Prendas']
  ];

  Object.values(report.porEmpleado).forEach(item => {
    rows.push([
      item.empleadoId,
      item.nombre,
      item.area,
      item.totalPrendas,
      item.costoPrendas.toFixed(2)
    ]);
  });

  rows.push(['']);
  rows.push(['RESUMEN']);
  rows.push(['Concepto', 'Valor']);
  rows.push(['Total Empleados', report.resumen.empleados]);
  rows.push(['Total Prendas', report.resumen.prendasTotales]);
  rows.push(['Costo Acumulado Prendas', report.costoAcumulado.toFixed(2)]);
  rows.push(['Gasto Total (Proveedores)', report.gastoTotal.toFixed(2)]);
  rows.push(['Diferencia', report.diferencia.toFixed(2)]);
  rows.push(['Costo Promedio/Empleado', report.resumen.costoPromedioPorEmpleado.toFixed(2)]);

  return rows;
}
