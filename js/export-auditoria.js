/**
 * EXPORT AUDITORIA
 * Reportes imprimibles y Excel para entregas de personal/consumibles.
 */

import { getStore } from './storage.js';
import { esc, fmtDate, fmtMoney } from './utils.js';
import { notify } from './ui.js';
import { getUserRole } from './user-roles.js';

const XLSX_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';

function esAdmin() {
  return getUserRole() === 'admin';
}

function fechaISO(fecha) {
  return (fecha || '').slice(0, 10);
}

function horaISO(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function empleadoNombre(emp) {
  return emp?.nombre || emp?.name || emp?.nombreCompleto || emp?.id || '';
}

function productoCosto(producto, varianteId) {
  if (!producto) return 0;
  if (varianteId && Array.isArray(producto.variantes)) {
    const variante = producto.variantes.find(v => v.id === varianteId);
    if (variante) return Number(variante.ultimo_costo || variante.costo_promedio || producto.costo_promedio || 0);
  }
  return Number(producto.costo_promedio || producto.ultimo_costo || 0);
}

function nivelControl(producto) {
  return Number(producto?.nivel_control || 3);
}

function getMaps() {
  const store = getStore();
  const productos = new Map((store.productos || []).map(p => [p.id, p]));
  const empleados = new Map((store.employees || []).map(e => [e.id, e]));
  return { store, productos, empleados };
}

function lineasEntrega(entregaId) {
  return (getStore().lineasEntrega || []).filter(l => l.entrega_id === entregaId);
}

function tipoEntrega(entrega) {
  const { productos } = getMaps();
  const texto = [
    entrega.motivo,
    entrega.area,
    ...lineasEntrega(entrega.id).map(l => productos.get(l.producto_id)?.nombre || ''),
  ].join(' ').toLowerCase();

  if (texto.includes('consumible') || texto.includes('limpieza') || texto.includes('aseo')) {
    return 'consumible';
  }
  return entrega.empleado_id ? 'personal' : 'consumible';
}

function detalleEntrega(entrega) {
  const { productos, empleados } = getMaps();
  const empleado = empleados.get(entrega.empleado_id);
  const area = entrega.area || empleado?.area || '';
  const recibe = entrega.quien_recibe || entrega.empleado_nombre || empleadoNombre(empleado) || '';
  const entregaNombre = entrega.quien_entrego || entrega.entregado_por || entrega.creado_por || '';

  const lineas = lineasEntrega(entrega.id).map(linea => {
    const producto = productos.get(linea.producto_id);
    const costoUnitario = productoCosto(producto, linea.variante_id);
    const cantidad = Number(linea.cantidad || 0);
    return {
      ...linea,
      producto,
      producto_nombre: producto?.nombre || linea.producto_id || 'Producto',
      cantidad,
      costo_unitario: costoUnitario,
      costo_total: cantidad * costoUnitario,
    };
  });

  return {
    ...entrega,
    fecha: fechaISO(entrega.fecha_hora || entrega.fecha),
    hora: horaISO(entrega.fecha_hora || entrega.fecha),
    tipo: tipoEntrega(entrega),
    area,
    quien_recibe: recibe,
    quien_entrego: entregaNombre,
    firma_recibe: entrega.firma_recibe || entrega.firma || null,
    lineas,
    piezas: lineas.reduce((sum, l) => sum + l.cantidad, 0),
    costo_total: lineas.reduce((sum, l) => sum + l.costo_total, 0),
  };
}

function obtenerFiltros() {
  return {
    fechaInicio: document.getElementById('audFechaInicio')?.value || '',
    fechaFin: document.getElementById('audFechaFin')?.value || '',
    tipo: document.getElementById('audTipo')?.value || 'todos',
    empleado: document.getElementById('audEmpleado')?.value || '',
    area: document.getElementById('audArea')?.value || '',
    producto: document.getElementById('audProducto')?.value || '',
    nivelControl: document.getElementById('audNivelControl')?.value || '',
  };
}

function filtrarEntregas(filtros) {
  return (getStore().entregasNuevas || [])
    .map(detalleEntrega)
    .filter(e => {
      if (filtros.fechaInicio && e.fecha < filtros.fechaInicio) return false;
      if (filtros.fechaFin && e.fecha > filtros.fechaFin) return false;
      if (filtros.tipo && filtros.tipo !== 'todos' && e.tipo !== filtros.tipo) return false;
      if (filtros.empleado && e.empleado_id !== filtros.empleado) return false;
      if (filtros.area && e.area !== filtros.area) return false;
      if (filtros.producto && !e.lineas.some(l => l.producto_id === filtros.producto)) return false;
      if (filtros.nivelControl && !e.lineas.some(l => nivelControl(l.producto) === Number(filtros.nivelControl))) return false;
      return true;
    });
}

function resumen(entregas) {
  const porArea = new Map();
  const porProducto = new Map();
  const porEmpleado = new Map();

  entregas.forEach(entrega => {
    const areaKey = entrega.area || 'Sin area';
    const area = porArea.get(areaKey) || { area: areaKey, entregas: 0, piezas: 0, costo: 0 };
    area.entregas += 1;
    area.piezas += entrega.piezas;
    area.costo += entrega.costo_total;
    porArea.set(areaKey, area);

    const empKey = entrega.quien_recibe || 'Sin empleado';
    const emp = porEmpleado.get(empKey) || { empleado: empKey, area: entrega.area || '', entregas: 0, piezas: 0, costo: 0 };
    emp.entregas += 1;
    emp.piezas += entrega.piezas;
    emp.costo += entrega.costo_total;
    porEmpleado.set(empKey, emp);

    entrega.lineas.forEach(linea => {
      const p = porProducto.get(linea.producto_id) || { producto: linea.producto_nombre, cantidad: 0, costo: 0 };
      p.cantidad += linea.cantidad;
      p.costo += linea.costo_total;
      porProducto.set(linea.producto_id, p);
    });
  });

  return {
    totalEntregas: entregas.length,
    totalPiezas: entregas.reduce((sum, e) => sum + e.piezas, 0),
    totalCosto: entregas.reduce((sum, e) => sum + e.costo_total, 0),
    porArea: Array.from(porArea.values()).sort((a, b) => b.piezas - a.piezas),
    porProducto: Array.from(porProducto.values()).sort((a, b) => b.cantidad - a.cantidad),
    porEmpleado: Array.from(porEmpleado.values()).sort((a, b) => b.piezas - a.piezas),
  };
}

function opcionesSelect() {
  const { store } = getMaps();
  const entregas = (store.entregasNuevas || []).map(detalleEntrega);
  const empleados = new Map();
  const areas = new Set();

  (store.employees || []).forEach(emp => {
    const nombre = empleadoNombre(emp);
    if (emp.id && nombre) empleados.set(emp.id, nombre);
    if (emp.area) areas.add(emp.area);
  });

  entregas.forEach(e => {
    if (e.empleado_id && e.quien_recibe) empleados.set(e.empleado_id, e.quien_recibe);
    if (e.area) areas.add(e.area);
  });

  return {
    empleados: Array.from(empleados.entries()).sort((a, b) => a[1].localeCompare(b[1])),
    areas: Array.from(areas).sort((a, b) => a.localeCompare(b)),
    productos: (store.productos || []).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
  };
}

function filtrosTexto(filtros) {
  return [
    filtros.fechaInicio ? `Desde ${filtros.fechaInicio}` : '',
    filtros.fechaFin ? `Hasta ${filtros.fechaFin}` : '',
    filtros.tipo && filtros.tipo !== 'todos' ? `Tipo ${filtros.tipo}` : 'Tipo todos',
    filtros.empleado ? `Empleado ${filtros.empleado}` : '',
    filtros.area ? `Area ${filtros.area}` : '',
    filtros.producto ? `Producto ${filtros.producto}` : '',
    filtros.nivelControl ? `Nivel ${filtros.nivelControl}` : 'Nivel todos',
  ].filter(Boolean).join(' | ');
}

function firmaHtml(firma) {
  if (!firma) return 'Sin firma';
  const src = firma.startsWith('data:') ? firma : `data:image/png;base64,${firma}`;
  return `<img src="${src}" style="max-width:180px;max-height:70px;border:1px solid #ddd">`;
}

function tablaResumen(titulo, filas, columnas, admin) {
  return `
    <h2>${esc(titulo)}</h2>
    <table>
      <thead><tr>${columnas.map(c => `<th>${esc(c.label)}</th>`).join('')}${admin ? '<th>Costo</th>' : ''}</tr></thead>
      <tbody>
        ${filas.map(f => `
          <tr>
            ${columnas.map(c => `<td>${esc(String(f[c.key] ?? ''))}</td>`).join('')}
            ${admin ? `<td>${fmtMoney(f.costo || 0)}</td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function printHtml(filtros, entregas) {
  const admin = esAdmin();
  const res = resumen(entregas);
  return `
    <!doctype html>
    <html>
    <head>
      <title>ASSA ABLOY - Reporte de Entregas</title>
      <style>
        body { font-family: Arial, sans-serif; color:#222; margin:24px; }
        h1 { margin:0 0 6px; font-size:22px; }
        h2 { margin-top:24px; font-size:16px; }
        .muted { color:#666; font-size:12px; }
        .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:18px 0; }
        .box { border:1px solid #ddd; padding:10px; }
        .num { font-size:20px; font-weight:bold; }
        table { width:100%; border-collapse:collapse; margin-top:8px; font-size:11px; }
        th, td { border:1px solid #ddd; padding:6px; vertical-align:top; }
        th { background:#f2f2f2; text-align:left; }
        .firma { width:190px; text-align:center; }
        @media print { button { display:none; } }
      </style>
    </head>
    <body>
      <h1>ASSA ABLOY - Reporte de Entregas</h1>
      <div class="muted">Generado: ${new Date().toLocaleString('es-MX')}</div>
      <div class="muted">Periodo y filtros: ${esc(filtrosTexto(filtros) || 'Todos')}</div>

      <div class="summary">
        <div class="box"><div class="num">${res.totalEntregas}</div><div>Entregas</div></div>
        <div class="box"><div class="num">${res.totalPiezas}</div><div>Piezas</div></div>
        ${admin ? `<div class="box"><div class="num">${fmtMoney(res.totalCosto)}</div><div>Costo</div></div>` : '<div class="box"><div class="num">N/A</div><div>Costo oculto</div></div>'}
      </div>

      <h2>Detalle por entrega</h2>
      <table>
        <thead>
          <tr>
            <th>Numero</th><th>Fecha</th><th>Hora</th><th>Entrego</th><th>Recibio</th><th>Area</th><th>Articulos</th>${admin ? '<th>Costo</th>' : ''}<th>Firma</th>
          </tr>
        </thead>
        <tbody>
          ${entregas.map(e => `
            <tr>
              <td>${esc(e.numero || e.id)}</td>
              <td>${esc(e.fecha)}</td>
              <td>${esc(e.hora)}</td>
              <td>${esc(e.quien_entrego)}</td>
              <td>${esc(e.quien_recibe)}</td>
              <td>${esc(e.area)}</td>
              <td>${e.lineas.map(l => `${esc(l.producto_nombre)} x ${l.cantidad}`).join('<br>')}</td>
              ${admin ? `<td>${fmtMoney(e.costo_total)}</td>` : ''}
              <td class="firma">${firmaHtml(e.firma_recibe)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${tablaResumen('Totales por area', res.porArea, [{ key: 'area', label: 'Area' }, { key: 'entregas', label: 'Entregas' }, { key: 'piezas', label: 'Piezas' }], admin)}
      ${tablaResumen('Totales por producto', res.porProducto, [{ key: 'producto', label: 'Producto' }, { key: 'cantidad', label: 'Piezas' }], admin)}
    </body>
    </html>
  `;
}

function cargarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${XLSX_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.XLSX), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.onload = () => resolve(window.XLSX);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function filaDetalle(entrega, admin) {
  const base = {
    Numero: entrega.numero || entrega.id,
    Fecha: entrega.fecha,
    Hora: entrega.hora,
    Tipo: entrega.tipo,
    Entrego: entrega.quien_entrego,
    Recibio: entrega.quien_recibe,
    Area: entrega.area,
    Articulos: entrega.lineas.map(l => `${l.producto_nombre} x ${l.cantidad}`).join('; '),
    Piezas: entrega.piezas,
    Firma: entrega.firma_recibe ? 'Si' : 'No',
  };
  if (admin) base.Costo = entrega.costo_total;
  return base;
}

export function render() {
  const { empleados, areas, productos } = opcionesSelect();

  return `
    <div class="page-content">
      <div class="page-head">
        <div class="page-title">Exportar Auditoria</div>
      </div>

      <div class="filters-section">
        <input type="date" id="audFechaInicio" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <input type="date" id="audFechaFin" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <select id="audTipo" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="todos">Todos</option>
          <option value="personal">Personal</option>
          <option value="consumible">Consumible</option>
        </select>
        <select id="audEmpleado" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todos los empleados</option>
          ${empleados.map(([id, nombre]) => `<option value="${esc(id)}">${esc(nombre)}</option>`).join('')}
        </select>
        <select id="audArea" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todas las areas</option>
          ${areas.map(area => `<option value="${esc(area)}">${esc(area)}</option>`).join('')}
        </select>
        <select id="audProducto" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todos los productos</option>
          ${productos.map(p => `<option value="${esc(p.id)}">${esc(p.nombre || p.sku || p.id)}</option>`).join('')}
        </select>
        <select id="audNivelControl" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todos</option>
          <option value="1">Nivel 1</option>
          <option value="2">Nivel 2</option>
          <option value="3">Nivel 3</option>
          <option value="4">Nivel 4</option>
        </select>
      </div>

      <div style="display:flex;gap:10px;margin:16px 0">
        <button class="btn btn-primary" id="audPDF"><i class="fas fa-file-pdf"></i> Exportar PDF</button>
        <button class="btn btn-success" id="audExcel"><i class="fas fa-file-excel"></i> Exportar Excel</button>
      </div>

      <div id="audResumen" style="padding:12px;background:#111;border-radius:4px;color:#ccc"></div>
    </div>
  `;
}

export function init() {
  const actualizar = () => {
    const entregas = filtrarEntregas(obtenerFiltros());
    const res = resumen(entregas);
    document.getElementById('audResumen').innerHTML = `
      <strong>${res.totalEntregas}</strong> entregas | <strong>${res.totalPiezas}</strong> piezas
      ${esAdmin() ? ` | <strong>${fmtMoney(res.totalCosto)}</strong>` : ''}
    `;
  };

  ['audFechaInicio', 'audFechaFin', 'audTipo', 'audEmpleado', 'audArea', 'audProducto', 'audNivelControl'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', actualizar);
  });

  document.getElementById('audPDF')?.addEventListener('click', () => exportarPDF(obtenerFiltros()));
  document.getElementById('audExcel')?.addEventListener('click', () => exportarExcel(obtenerFiltros()));

  actualizar();
}

export function exportarPDF(filtros) {
  const entregas = filtrarEntregas(filtros);
  if (!entregas.length) {
    notify('No hay entregas para exportar con esos filtros', 'warning');
    return;
  }

  const w = window.open('', '', 'width=1000,height=700');
  if (!w) {
    notify('El navegador bloqueo la ventana de impresion', 'warning');
    return;
  }
  w.document.write(printHtml(filtros, entregas));
  w.document.close();
  setTimeout(() => w.print(), 400);
}

export async function exportarExcel(filtros) {
  const entregas = filtrarEntregas(filtros);
  if (!entregas.length) {
    notify('No hay entregas para exportar con esos filtros', 'warning');
    return;
  }

  try {
    const XLSX = await cargarSheetJS();
    const admin = esAdmin();
    const res = resumen(entregas);
    const wb = XLSX.utils.book_new();

    const resumenRows = [
      { Concepto: 'Total entregas', Valor: res.totalEntregas },
      { Concepto: 'Total piezas', Valor: res.totalPiezas },
    ];
    if (admin) resumenRows.push({ Concepto: 'Costo total', Valor: res.totalCosto });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), 'Resumen');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entregas.map(e => filaDetalle(e, admin))), 'Detalle');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res.porArea.map(r => admin ? r : { area: r.area, entregas: r.entregas, piezas: r.piezas })), 'Por Area');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res.porProducto.map(r => admin ? r : { producto: r.producto, cantidad: r.cantidad })), 'Por Producto');

    if (entregas.some(e => e.tipo === 'personal')) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res.porEmpleado.map(r => admin ? r : { empleado: r.empleado, area: r.area, entregas: r.entregas, piezas: r.piezas })), 'Por Empleado');
    }

    XLSX.writeFile(wb, `auditoria_entregas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    notify('Excel de auditoria descargado', 'success');
  } catch (error) {
    console.error('[EXPORT AUDITORIA]', error);
    notify('No se pudo cargar SheetJS para exportar Excel', 'error');
  }
}
