/**
 * REPORTES DE ALMACÉN
 * Módulo para generación de reportes de gastos, consumo y movimientos
 */

import { getStore } from './storage.js';
import { esc, fmtDate } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole } from './user-roles.js';
import { getProductos, getMovimientos } from './almacen-api.js';

const TIPOS_ENTRADA = new Set(['entrada_compra', 'inventario_inicial', 'ajuste_positivo', 'entrada']);
const TIPOS_COMPRA = new Set(['entrada_compra', 'entrada']);
const TIPOS_SALIDA = new Set([
  'salida_colocacion',
  'salida_merma',
  'salida_ajuste',
  'salida_devolucion_proveedor',
  'salida_uso_interno',
  'ajuste_negativo',
  'salida',
  'ajuste',
]);
const TIPOS_ENTREGA = new Set(['salida_entrega', 'entrega']);
const TIPOS_DEVOLUCION = new Set(['entrada_devolucion', 'devolucion']);

function fechaMov(m) {
  return m.fecha_hora || m.fecha || '';
}

function tipoMov(m) {
  return m.tipo || m.tipo_movimiento || '';
}

function mesMov(m) {
  return fechaMov(m).slice(0, 7);
}

function cantidadAbs(m) {
  return Math.abs(Number(m.cantidad) || 0);
}

function importeMov(m) {
  return cantidadAbs(m) * (Number(m.costo_unitario) || 0);
}

function labelTipo(m, withIcon = false) {
  const labels = {
    entrada_compra: ['Entrada compra', '⬆️ Entrada compra'],
    salida_entrega: ['Entrega', '👤 Entrega'],
    salida_colocacion: ['Salida colocación', '⬇️ Colocación'],
    salida_merma: ['Merma', '⬇️ Merma'],
    salida_ajuste: ['Salida ajuste', '🔧 Ajuste'],
    salida_devolucion_proveedor: ['Devolución proveedor', '⬇️ Dev. proveedor'],
    salida_uso_interno: ['Uso interno', '⬇️ Uso interno'],
    entrada_devolucion: ['Devolución personal', '↩️ Devolución'],
    inventario_inicial: ['Inventario inicial', '⬆️ Inventario inicial'],
    ajuste_positivo: ['Ajuste positivo', '🔧 Ajuste +'],
    ajuste_negativo: ['Ajuste negativo', '🔧 Ajuste -'],
    entrada: ['Entrada', '⬆️ Entrada'],
    salida: ['Salida', '⬇️ Salida'],
    entrega: ['Entrega', '👤 Entrega'],
    devolucion: ['Devolución', '↩️ Devolución'],
    ajuste: ['Ajuste', '🔧 Ajuste'],
  };
  const pair = labels[tipoMov(m)];
  if (!pair) return tipoMov(m) || '—';
  return withIcon ? pair[1] : pair[0];
}

function productoTipo(p) {
  return p?.tipo || 'personal';
}

function nivelControl(p) {
  return Number(p?.nivel_control || 3);
}

function filtroNivelControl() {
  return document.getElementById('reportNivelControl')?.value || '';
}

function productoCumpleNivel(p, nivel) {
  return !nivel || nivelControl(p) === Number(nivel);
}

function movimientoCumpleNivel(m, nivel) {
  if (!nivel) return true;
  const p = getStore().productos.find(x => x.id === m.producto_id);
  return productoCumpleNivel(p, nivel);
}

function entregaTipo(e, productos, lineas) {
  if (e.tipo_entrega) return e.tipo_entrega;
  const ls = lineas.filter(l => l.entrega_id === e.id);
  return ls.some(l => productoTipo(productos.get(l.producto_id)) === 'consumible') ? 'consumible' : 'personal';
}

function costoLinea(linea, producto) {
  const cantidad = Number(linea.cantidad) || 0;
  const costo = Number(producto?.costo_promedio || producto?.ultimo_costo || 0);
  return cantidad * costo;
}

function addMetric(map, key, data) {
  const item = map.get(key) || { label: key, entregas: 0, piezas: 0, gasto: 0 };
  item.entregas += data.entregas || 0;
  item.piezas += data.piezas || 0;
  item.gasto += data.gasto || 0;
  map.set(key, item);
}

function metricasPorTipo() {
  const store = getStore();
  const productos = new Map((store.productos || []).map(p => [p.id, p]));
  const lineas = store.lineasEntrega || [];
  const entregas = store.entregasNuevas || [];
  const personalEmpleado = new Map();
  const personalArea = new Map();
  const consumibleProducto = new Map();
  const consumiblePeriodo = new Map();

  entregas.forEach(e => {
    const tipo = entregaTipo(e, productos, lineas);
    const ls = lineas.filter(l => l.entrega_id === e.id);
    const piezas = ls.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
    const gasto = ls.reduce((s, l) => s + costoLinea(l, productos.get(l.producto_id)), 0);

    if (tipo === 'consumible') {
      ls.forEach(l => {
        const p = productos.get(l.producto_id);
        addMetric(consumibleProducto, p?.nombre || 'Producto', { entregas: 1, piezas: Number(l.cantidad) || 0, gasto: costoLinea(l, p) });
      });
      addMetric(consumiblePeriodo, mesMov(e), { entregas: 1, piezas, gasto });
    } else {
      addMetric(personalEmpleado, e.quien_recibe || e.empleado_nombre || 'Sin empleado', { entregas: 1, piezas, gasto });
      addMetric(personalArea, e.area || 'Sin area', { entregas: 1, piezas, gasto });
    }
  });

  const sortPiezas = arr => Array.from(arr.values()).sort((a, b) => b.piezas - a.piezas);
  const consumibles = sortPiezas(consumibleProducto);
  return {
    personalEmpleado: sortPiezas(personalEmpleado),
    personalArea: sortPiezas(personalArea),
    topEmpleado: sortPiezas(personalEmpleado)[0] || null,
    consumibleProducto: consumibles,
    consumiblePeriodo: Array.from(consumiblePeriodo.values()).sort((a, b) => String(b.label).localeCompare(String(a.label))),
    totalConsumibles: consumibles.reduce((s, x) => s + x.gasto, 0),
    productoMasConsumido: consumibles[0] || null,
  };
}

function tablaMetricas(titulo, filas, admin) {
  return `
    <div class="card">
      <div class="card-head"><h3>${esc(titulo)}</h3></div>
      <div class="table-wrap">
        <table class="data-table" style="font-size:12px">
          <thead><tr><th>Nombre</th><th style="text-align:center">Entregas</th><th style="text-align:center">Piezas</th>${admin ? '<th style="text-align:right">Gasto</th>' : ''}</tr></thead>
          <tbody>
            ${(filas.length ? filas.slice(0, 8).map(f => `
              <tr>
                <td>${esc(f.label)}</td>
                <td style="text-align:center">${f.entregas}</td>
                <td style="text-align:center">${f.piezas}</td>
                ${admin ? `<td style="text-align:right">$${f.gasto.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</td>` : ''}
              </tr>
            `).join('') : `<tr><td colspan="${admin ? 4 : 3}" style="text-align:center;color:#999">Sin datos</td></tr>`)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function render() {
  const admin = getUserRole() === 'admin';
  const mesActual = new Date().toISOString().slice(0, 7);
  const movimientosMes = getMovimientos().filter(m => fechaMov(m).startsWith(mesActual));

  const gastoTotal = movimientosMes
    .filter(m => TIPOS_COMPRA.has(tipoMov(m)))
    .reduce((sum, m) => sum + importeMov(m), 0);

  const productos = getProductos();
  const metricasTipo = metricasPorTipo();
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
          ${admin ? '<button class="btn btn-primary" id="btnReporteGastos"><i class="fas fa-chart-bar"></i> Reporte Gastos</button>' : ''}
          ${admin ? '<button class="btn btn-primary" id="btnReporteConsumo"><i class="fas fa-chart-line"></i> Reporte Consumo</button>' : ''}
          <button class="btn btn-primary" id="btnReporteMovimientos"><i class="fas fa-exchange-alt"></i> Movimientos</button>
        </div>
      </div>

      <div class="kpi-grid">
        ${admin ? `<div class="kpi-card">
          <div class="kpi-value">$${gastoTotal.toLocaleString('es-MX', {minimumFractionDigits:0})}</div>
          <div class="kpi-label">Gasto Este Mes</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">$${stockValorizado.toLocaleString('es-MX', {minimumFractionDigits:0})}</div>
          <div class="kpi-label">Stock Valorizado</div>
        </div>` : ''}
        <div class="kpi-card">
          <div class="kpi-value">${productos.length}</div>
          <div class="kpi-label">Productos en Stock</div>
        </div>
      </div>

      <div style="margin-top:20px">
        <div class="page-title" style="font-size:18px;margin-bottom:12px">Métricas por Tipo</div>
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-value">${metricasTipo.personalEmpleado.reduce((s, x) => s + x.entregas, 0)}</div>
            <div class="kpi-label">Entregas Personal</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-value">${metricasTipo.consumibleProducto.reduce((s, x) => s + x.entregas, 0)}</div>
            <div class="kpi-label">Entregas Consumible</div>
          </div>
          ${admin ? `<div class="kpi-card">
            <div class="kpi-value">$${metricasTipo.totalConsumibles.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</div>
            <div class="kpi-label">Gasto Consumibles</div>
          </div>` : ''}
          <div class="kpi-card">
            <div class="kpi-value" style="font-size:18px">${esc(metricasTipo.productoMasConsumido?.label || '—')}</div>
            <div class="kpi-label">Producto Más Consumido</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:12px">
          ${tablaMetricas('Personal: entregas por empleado', metricasTipo.personalEmpleado, admin)}
          ${tablaMetricas('Personal: gasto por área', metricasTipo.personalArea, admin)}
          ${tablaMetricas('Consumible: entregas por producto', metricasTipo.consumibleProducto, admin)}
          ${tablaMetricas('Consumible: consumo por período', metricasTipo.consumiblePeriodo, admin)}
        </div>
      </div>

      <div id="reporteContainer" style="margin-top:20px"></div>
      <div class="filters-section" style="margin-top:12px">
        <select id="reportNivelControl" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todos los niveles</option>
          <option value="1">Nivel 1</option>
          <option value="2">Nivel 2</option>
          <option value="3">Nivel 3</option>
          <option value="4">Nivel 4</option>
        </select>
      </div>
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

  const nivel = filtroNivelControl();
  const movimientos = getMovimientos().filter(m => TIPOS_COMPRA.has(tipoMov(m)) && movimientoCumpleNivel(m, nivel));

  // Agrupar por mes
  const porMes = {};
  movimientos.forEach(m => {
    const mes = mesMov(m);
    if (!mes) return;
    if (!porMes[mes]) porMes[mes] = [];
    porMes[mes].push(m);
  });

  // Calcular gastos por mes
  const meses = Object.keys(porMes).sort();
  let datos = [];

  meses.forEach(mes => {
    const movsMes = porMes[mes];
    const gasto = movsMes.reduce((sum, m) => sum + importeMov(m), 0);
    const cantidad = movsMes.reduce((sum, m) => sum + cantidadAbs(m), 0);
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
      <p>Período: ${meses[0] || '—'} a ${meses[meses.length-1] || '—'} · Nivel: ${nivel || 'Todos'}</p>
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

  const nivel = filtroNivelControl();
  const movimientos = getMovimientos();
  const productos = getProductos({ nivel_control: nivel || undefined });

  // Consumo por producto (salidas - entregas)
  const consumoPorProducto = {};

  productos.forEach(p => {
    const movsProducto = movimientos.filter(m => m.producto_id === p.id);
    const entradas = movsProducto.filter(m => TIPOS_ENTRADA.has(tipoMov(m))).reduce((s, m) => s + cantidadAbs(m), 0);
    const salidas = movsProducto.filter(m => TIPOS_SALIDA.has(tipoMov(m))).reduce((s, m) => s + cantidadAbs(m), 0);
    const entregas = movsProducto.filter(m => TIPOS_ENTREGA.has(tipoMov(m))).reduce((s, m) => s + cantidadAbs(m), 0);
    const devoluciones = movsProducto.filter(m => TIPOS_DEVOLUCION.has(tipoMov(m))).reduce((s, m) => s + cantidadAbs(m), 0);

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

  const admin = rol === 'admin';
  const nivel = filtroNivelControl();
  const movimientos = getMovimientos().filter(m => movimientoCumpleNivel(m, nivel)).slice(-200).reverse();

  let body = `
    <div style="overflow-x:auto">
      <table class="data-table" style="font-size:11px">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Producto</th>
            <th style="text-align:center">Cantidad</th>
            ${admin ? '<th style="text-align:right">Costo Unit.</th><th style="text-align:right">Importe</th>' : ''}
            <th>Stock Después</th>
          </tr>
        </thead>
        <tbody>
          ${movimientos.map(m => {
            const p = getStore().productos.find(x => x.id === m.producto_id);
            const tipoLabel = labelTipo(m, true);
            return `
              <tr>
                <td><small>${fmtDate(fechaMov(m).slice(0, 10))}</small></td>
                <td><small>${tipoLabel}</small></td>
                <td><small>${p ? esc(p.nombre) : '?'}</small></td>
                <td style="text-align:center">${m.cantidad}</td>
                ${admin ? `<td style="text-align:right">$${m.costo_unitario?.toFixed(2) || '—'}</td><td style="text-align:right">$${importeMov(m).toLocaleString('es-MX', {minimumFractionDigits:0})}</td>` : ''}
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
  window.exportarMovimientosExcel = () => exportMovimientosExcel(movimientos, admin);
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

function exportMovimientosExcel(movimientos, admin = getUserRole() === 'admin') {
  let csv = admin
    ? 'Fecha,Tipo,Producto,Cantidad,Costo Unitario,Importe,Stock Después\n'
    : 'Fecha,Tipo,Producto,Cantidad,Stock Después\n';
  movimientos.forEach(m => {
    const p = getStore().productos.find(x => x.id === m.producto_id);
    const tipoLabel = labelTipo(m);
    if (admin) {
      csv += `${fechaMov(m)},"${tipoLabel}","${p ? p.nombre : '?'}",${m.cantidad},$${m.costo_unitario?.toFixed(2) || 0},$${importeMov(m).toFixed(2)},${m.stock_despues}\n`;
    } else {
      csv += `${fechaMov(m)},"${tipoLabel}","${p ? p.nombre : '?'}",${m.cantidad},${m.stock_despues}\n`;
    }
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
