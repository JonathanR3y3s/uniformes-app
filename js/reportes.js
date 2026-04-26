/**
 * REPORTES DE ALMACÉN
 * Módulo para generación de reportes de gastos, consumo y movimientos
 */

import { getStore } from './storage.js';
import { esc, fmtDate } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole } from './user-roles.js';
import { getProductos, getMovimientos } from './almacen-api.js';

export function render() {
  const mesActual = new Date().toISOString().slice(0, 7);
  const movimientosMes = getMovimientos().filter(m => m.fecha.startsWith(mesActual));

  const gastoTotal = movimientosMes
    .filter(m => m.tipo_movimiento === 'entrada')
    .reduce((sum, m) => sum + (m.costo_unitario * m.cantidad || 0), 0);

  const productos = getProductos();
  const stockValorizado = productos.reduce((sum, p) => {
    const stock = p.es_por_variante
      ? (p.variantes || []).reduce((s, v) => s + (v.stock_actual || 0), 0)
      : (p.stock_actual || 0);
    return sum + (stock * p.costo_promedio || 0);
  }, 0);

  let html = `
    <div class="page-content">
      <div class="page-head">
        <div class="page-title">Reportes de Almacén</div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnReporteGastos"><i class="fas fa-chart-bar"></i> Reporte Gastos</button>
          <button class="btn btn-primary" id="btnReporteConsumo"><i class="fas fa-chart-line"></i> Reporte Consumo</button>
          <button class="btn btn-primary" id="btnReporteMovimientos"><i class="fas fa-exchange-alt"></i> Movimientos</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">$${gastoTotal.toLocaleString('es-MX', {minimumFractionDigits:0})}</div>
          <div class="kpi-label">Gasto Este Mes</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">$${stockValorizado.toLocaleString('es-MX', {minimumFractionDigits:0})}</div>
          <div class="kpi-label">Stock Valorizado</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${productos.length}</div>
          <div class="kpi-label">Productos en Stock</div>
        </div>
      </div>

      <div id="reporteContainer" style="margin-top:20px"></div>
    </div>
  `;

  return html;
}

export function init() {
  document.getElementById('btnReporteGastos')?.addEventListener('click', () => openReporteGastos());
  document.getElementById('btnReporteConsumo')?.addEventListener('click', () => openReporteConsumo());
  document.getElementById('btnReporteMovimientos')?.addEventListener('click', () => openReporteMovimientos());
}

function openReporteGastos() {
  const rol = getUserRole();
  if (rol !== 'admin') {
    notify('No tienes permiso para ver reportes', 'error');
    return;
  }

  const movimientos = getMovimientos().filter(m => m.tipo_movimiento === 'entrada');

  // Agrupar por mes
  const porMes = {};
  movimientos.forEach(m => {
    const mes = m.fecha.slice(0, 7);
    if (!porMes[mes]) porMes[mes] = [];
    porMes[mes].push(m);
  });

  // Calcular gastos por mes
  const meses = Object.keys(porMes).sort();
  let datos = [];

  meses.forEach(mes => {
    const movsMes = porMes[mes];
    const gasto = movsMes.reduce((sum, m) => sum + (m.costo_unitario * m.cantidad || 0), 0);
    const cantidad = movsMes.reduce((sum, m) => sum + m.cantidad, 0);
    datos.push({ mes, gasto, cantidad, movimientos: movsMes.length });
  });

  // Generar tabla HTML
  let body = `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr><th>Mes</th><th style="text-align:right">Gasto Total</th><th style="text-align:center">Cantidad</th><th style="text-align:center">Entradas</th></tr>
        </thead>
        <tbody>
          ${datos.map(d => `
            <tr>
              <td><strong>${d.mes}</strong></td>
              <td style="text-align:right">$${d.gasto.toLocaleString('es-MX', {minimumFractionDigits:0})}</td>
              <td style="text-align:center">${d.cantidad}</td>
              <td style="text-align:center">${d.movimientos}</td>
            </tr>
          `).join('')}
          <tr style="font-weight:bold;background:#0f0f0f">
            <td>TOTAL</td>
            <td style="text-align:right">$${datos.reduce((s, d) => s + d.gasto, 0).toLocaleString('es-MX', {minimumFractionDigits:0})}</td>
            <td style="text-align:center">${datos.reduce((s, d) => s + d.cantidad, 0)}</td>
            <td style="text-align:center">${datos.reduce((s, d) => s + d.movimientos, 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="margin-top:12px;font-size:12px;color:#999">
      <p>Período: ${meses[0] || '—'} a ${meses[meses.length-1] || '—'}</p>
    </div>
  `;

  let footer = `
    <button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>
    <button class="btn btn-success" id="btnExportarExcel" onclick="exportarGastosExcel()"><i class="fas fa-file-excel"></i> Excel</button>
    <button class="btn btn-success" id="btnExportarPDF" onclick="exportarGastosPDF()"><i class="fas fa-file-pdf"></i> PDF</button>
  `;

  modal.open('Reporte de Gastos', body, footer, 'lg');

  window.modalClose = () => modal.close();
  window.exportarGastosExcel = () => exportGastosExcel(datos);
  window.exportarGastosPDF = () => exportGastosPDF(datos);
}

function openReporteConsumo() {
  const rol = getUserRole();
  if (rol !== 'admin') {
    notify('No tienes permiso para ver reportes', 'error');
    return;
  }

  const movimientos = getMovimientos();
  const productos = getProductos();

  // Consumo por producto (salidas - entregas)
  const consumoPorProducto = {};

  productos.forEach(p => {
    const movsProducto = movimientos.filter(m => m.producto_id === p.id);
    const entradas = movsProducto.filter(m => m.tipo_movimiento === 'entrada').reduce((s, m) => s + m.cantidad, 0);
    const salidas = movsProducto.filter(m => m.tipo_movimiento === 'salida').reduce((s, m) => s + m.cantidad, 0);
    const entregas = movsProducto.filter(m => m.tipo_movimiento === 'entrega').reduce((s, m) => s + m.cantidad, 0);
    const devoluciones = movsProducto.filter(m => m.tipo_movimiento === 'devolucion').reduce((s, m) => s + m.cantidad, 0);

    const consumo = salidas + entregas - devoluciones;
    if (consumo > 0) {
      consumoPorProducto[p.id] = {
        nombre: p.nombre,
        sku: p.sku,
        entradas,
        salidas,
        entregas,
        devoluciones,
        consumo,
        costo_promedio: p.costo_promedio || 0
      };
    }
  });

  const datos = Object.values(consumoPorProducto)
    .sort((a, b) => b.consumo - a.consumo)
    .slice(0, 50);

  let body = `
    <div style="overflow-x:auto">
      <table class="data-table" style="font-size:11px">
        <thead>
          <tr>
            <th>Producto</th><th>SKU</th>
            <th style="text-align:center">Entradas</th>
            <th style="text-align:center">Salidas</th>
            <th style="text-align:center">Entregas</th>
            <th style="text-align:center">Devoluciones</th>
            <th style="text-align:center">Consumo Neto</th>
            <th style="text-align:right">Costo</th>
          </tr>
        </thead>
        <tbody>
          ${datos.map(d => `
            <tr>
              <td><small>${esc(d.nombre)}</small></td>
              <td><small>${esc(d.sku)}</small></td>
              <td style="text-align:center">${d.entradas}</td>
              <td style="text-align:center">${d.salidas}</td>
              <td style="text-align:center">${d.entregas}</td>
              <td style="text-align:center">${d.devoluciones}</td>
              <td style="text-align:center;font-weight:bold">${d.consumo}</td>
              <td style="text-align:right">$${(d.consumo * d.costo_promedio).toLocaleString('es-MX', {minimumFractionDigits:0})}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  let footer = `
    <button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>
    <button class="btn btn-success" id="btnExportarExcel" onclick="exportarConsumoExcel()"><i class="fas fa-file-excel"></i> Excel</button>
  `;

  modal.open('Reporte de Consumo', body, footer, 'lg');

  window.modalClose = () => modal.close();
  window.exportarConsumoExcel = () => exportConsumoExcel(datos);
}

function openReporteMovimientos() {
  const rol = getUserRole();
  if (rol !== 'admin' && rol !== 'operador') {
    notify('No tienes permiso para ver movimientos', 'error');
    return;
  }

  const movimientos = getMovimientos().slice(-200).reverse();

  let body = `
    <div style="overflow-x:auto">
      <table class="data-table" style="font-size:11px">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Producto</th>
            <th style="text-align:center">Cantidad</th>
            <th style="text-align:right">Costo Unit.</th>
            <th style="text-align:right">Importe</th>
            <th>Stock Después</th>
          </tr>
        </thead>
        <tbody>
          ${movimientos.map(m => {
            const p = getStore().productos.find(x => x.id === m.producto_id);
            const tipoLabel = {
              entrada: '⬆️ Entrada',
              salida: '⬇️ Salida',
              entrega: '👤 Entrega',
              devolucion: '↩️ Devolución',
              ajuste: '🔧 Ajuste'
            }[m.tipo_movimiento] || m.tipo_movimiento;
            return `
              <tr>
                <td><small>${fmtDate(m.fecha)}</small></td>
                <td><small>${tipoLabel}</small></td>
                <td><small>${p ? esc(p.nombre) : '?'}</small></td>
                <td style="text-align:center">${m.cantidad}</td>
                <td style="text-align:right">$${m.costo_unitario?.toFixed(2) || '—'}</td>
                <td style="text-align:right">$${(m.cantidad * (m.costo_unitario || 0)).toLocaleString('es-MX', {minimumFractionDigits:0})}</td>
                <td style="text-align:center">${m.stock_despues}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  let footer = `
    <button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>
    <button class="btn btn-success" id="btnExportarExcel" onclick="exportarMovimientosExcel()"><i class="fas fa-file-excel"></i> Excel</button>
  `;

  modal.open('Últimos Movimientos', body, footer, 'lg');

  window.modalClose = () => modal.close();
  window.exportarMovimientosExcel = () => exportMovimientosExcel(movimientos);
}

// Exportar a CSV (Excel simple)
function exportGastosExcel(datos) {
  let csv = 'Mes,Gasto Total,Cantidad,Entradas\n';
  datos.forEach(d => {
    csv += `${d.mes},$${d.gasto.toFixed(2)},${d.cantidad},${d.movimientos}\n`;
  });
  csv += `TOTAL,$${datos.reduce((s, d) => s + d.gasto, 0).toFixed(2)},${datos.reduce((s, d) => s + d.cantidad, 0)},${datos.reduce((s, d) => s + d.movimientos, 0)}\n`;

  downloadCSV(csv, 'reporte_gastos.csv');
}

function exportConsumoExcel(datos) {
  let csv = 'Producto,SKU,Entradas,Salidas,Entregas,Devoluciones,Consumo,Costo Total\n';
  datos.forEach(d => {
    csv += `"${d.nombre}","${d.sku}",${d.entradas},${d.salidas},${d.entregas},${d.devoluciones},${d.consumo},$${(d.consumo * d.costo_promedio).toFixed(2)}\n`;
  });
  downloadCSV(csv, 'reporte_consumo.csv');
}

function exportMovimientosExcel(movimientos) {
  let csv = 'Fecha,Tipo,Producto,Cantidad,Costo Unitario,Importe,Stock Después\n';
  movimientos.forEach(m => {
    const p = getStore().productos.find(x => x.id === m.producto_id);
    const tipoLabel = {
      entrada: 'Entrada',
      salida: 'Salida',
      entrega: 'Entrega',
      devolucion: 'Devolución',
      ajuste: 'Ajuste'
    }[m.tipo_movimiento] || m.tipo_movimiento;
    csv += `${m.fecha},"${tipoLabel}","${p ? p.nombre : '?'}",${m.cantidad},$${m.costo_unitario?.toFixed(2) || 0},$${(m.cantidad * (m.costo_unitario || 0)).toFixed(2)},${m.stock_despues}\n`;
  });
  downloadCSV(csv, 'reporte_movimientos.csv');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  notify(`${filename} descargado`, 'success');
}

function exportGastosPDF(datos) {
  let html = `
    <html>
    <head>
      <title>Reporte de Gastos</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .total { font-weight: bold; background-color: #f0f0f0; }
      </style>
    </head>
    <body>
      <h1>Reporte de Gastos de Almacén</h1>
      <p>Generado: ${new Date().toLocaleString('es-MX')}</p>
      <table>
        <thead>
          <tr><th>Mes</th><th>Gasto Total</th><th>Cantidad</th><th>Entradas</th></tr>
        </thead>
        <tbody>
  `;

  datos.forEach(d => {
    html += `
      <tr>
        <td>${d.mes}</td>
        <td>$${d.gasto.toLocaleString('es-MX', {minimumFractionDigits:0})}</td>
        <td>${d.cantidad}</td>
        <td>${d.movimientos}</td>
      </tr>
    `;
  });

  const totalGasto = datos.reduce((s, d) => s + d.gasto, 0);
  const totalCant = datos.reduce((s, d) => s + d.cantidad, 0);
  const totalMov = datos.reduce((s, d) => s + d.movimientos, 0);

  html += `
          <tr class="total">
            <td>TOTAL</td>
            <td>$${totalGasto.toLocaleString('es-MX', {minimumFractionDigits:0})}</td>
            <td>${totalCant}</td>
            <td>${totalMov}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;

  const w = window.open('', '', 'width=800,height=600');
  if (!w) {
    notify('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.', 'warning');
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
