/**
 * SALIDAS DE ALMACÉN (WAREHOUSE EXITS)
 * Módulo para gestión de salidas de productos por colocación, merma, ajuste, devolución a proveedor, uso interno
 */

import { getStore } from './storage.js';
import { esc, fmtDate } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole, getUser } from './user-roles.js';
import { getSalidas as getSalidasNuevas, registrarSalida, getProductos } from './almacen-api.js';

let _salidasWizardHandler = null;

export function render() {
  const salidasNuevas = getSalidasNuevas();
  const mesActual = new Date().toISOString().slice(0, 7);
  const salidasMes = salidasNuevas.filter(s => s.fecha_hora.startsWith(mesActual));

  const totalPiezas = salidasMes.reduce((sum, s) => {
    const lineas = getStore().lineasSalida.filter(l => l.salida_id === s.id);
    return sum + lineas.reduce((s, l) => s + l.cantidad, 0);
  }, 0);

  const porTipo = {};
  salidasMes.forEach(s => {
    porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1;
  });
  const tipoMayoritario = Object.keys(porTipo).length > 0
    ? Object.keys(porTipo).sort((a, b) => porTipo[b] - porTipo[a])[0]
    : '—';

  let html = `
    <div class="page-content">
      <div class="page-head">
        <div class="page-title">Salidas de Almacén</div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnNuevaSalida"><i class="fas fa-arrow-out"></i> Nueva Salida</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">${salidasMes.length}</div>
          <div class="kpi-label">Salidas Este Mes</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${totalPiezas}</div>
          <div class="kpi-label">Piezas Salidas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${tipoMayoritario}</div>
          <div class="kpi-label">Tipo Principal</div>
        </div>
      </div>

      <div class="filters-section">
        <select id="filterTipo" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;flex:1">
          <option value="">Todos los tipos</option>
          <option value="colocacion">Colocación</option>
          <option value="merma">Merma / Pérdida</option>
          <option value="ajuste">Ajuste</option>
          <option value="devolucion_proveedor">Devolución a Proveedor</option>
          <option value="uso_interno">Uso Interno</option>
        </select>
        <input type="text" id="filterProducto" placeholder="Filtrar por producto..." style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;flex:1">
      </div>

      <div id="salidasContainer" style="margin-top:20px"></div>
    </div>
  `;

  return html;
}

export function init() {
  document.getElementById('btnNuevaSalida')?.addEventListener('click', openNuevaSalida);
  document.getElementById('filterTipo')?.addEventListener('change', renderSalidas);
  document.getElementById('filterProducto')?.addEventListener('keyup', renderSalidas);

  renderSalidas();
}

function renderSalidas() {
  const tipoFilter = document.getElementById('filterTipo')?.value || '';
  const prodFilter = document.getElementById('filterProducto')?.value || '';

  let salidasNuevas = getSalidasNuevas();
  if (tipoFilter) salidasNuevas = salidasNuevas.filter(s => s.tipo === tipoFilter);

  let html = `<table class="data-table"><thead><tr><th>Número</th><th>Tipo</th><th>Productos</th><th>Piezas</th><th>Motivo</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;

  if (salidasNuevas.length === 0) {
    html += `<tr><td colspan="7" style="text-align:center;padding:20px;color:#999">Sin salidas registradas</td></tr>`;
  } else {
    salidasNuevas.forEach(s => {
      const lineas = getStore().lineasSalida.filter(l => l.salida_id === s.id);

      // Filtrar por producto si aplica
      let lineasFiltradas = lineas;
      if (prodFilter) {
        lineasFiltradas = lineas.filter(l => {
          const p = getStore().productos.find(x => x.id === l.producto_id);
          return p && p.nombre.toLowerCase().includes(prodFilter.toLowerCase());
        });
      }

      if (lineasFiltradas.length === 0 && prodFilter) return;

      const piezas = lineasFiltradas.reduce((sum, l) => sum + l.cantidad, 0);
      const tipoLabel = {
        colocacion: '📦 Colocación',
        merma: '⚠️ Merma',
        ajuste: '🔧 Ajuste',
        devolucion_proveedor: '↩️ Devolución',
        uso_interno: '🏭 Uso Interno'
      }[s.tipo] || s.tipo;

      html += `
        <tr>
          <td><strong>${esc(s.numero)}</strong></td>
          <td>${tipoLabel}</td>
          <td style="text-align:center">${lineasFiltradas.length}</td>
          <td style="text-align:center;font-weight:bold">${piezas}</td>
          <td><small>${esc(s.motivo || '—')}</small></td>
          <td><small>${fmtDate(s.fecha_hora)}</small></td>
          <td style="text-align:center">
            <button class="btn-icon" data-salida-id="${s.id}" title="Ver detalles"><i class="fas fa-eye"></i></button>
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table>`;
  const container = document.getElementById('salidasContainer');
  container.innerHTML = html;

  container.onclick = e => {
    const btn = e.target.closest('button[data-salida-id]');
    if (btn) {
      openDetalleSalida(btn.dataset.salidaId);
    }
  };
}

function openNuevaSalida() {
  const rol = getUserRole();

  if (rol !== 'admin' && rol !== 'operador') {
    notify('No tienes permiso para crear salidas', 'error');
    return;
  }

  let paso = 1;
  let datos = {
    tipo_salida: '',
    motivo: '',
    autorizado_por: '',
    referencia: '',
    observaciones: '',
    lineas: [],
  };

  showPaso();

  function showPaso() {
    let body = '';

    if (paso === 1) {
      body = `
        <label>Tipo de Salida *</label>
        <select id="tipoSalida" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Seleccionar...</option>
          <option value="colocacion">Colocación (envío a cliente)</option>
          <option value="merma">Merma / Pérdida</option>
          <option value="ajuste">Ajuste de Inventario</option>
          <option value="devolucion_proveedor">Devolución a Proveedor</option>
          <option value="uso_interno">Uso Interno</option>
        </select>
        <textarea id="motivo" placeholder="Motivo / Referencia..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-top:12px;height:80px"></textarea>
        <input type="text" id="autorizadoPor" placeholder="Autorizado por (opcional)..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-top:8px">
      `;
    } else if (paso === 2) {
      const productos = getProductos();
      body = `
        <input type="text" id="searchProd" placeholder="Buscar producto..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <div id="prodList" style="max-height:150px;overflow-y:auto;margin-bottom:12px"></div>
        <input type="number" id="cantidad" min="1" value="1" placeholder="Cantidad" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <button class="btn btn-success" id="btnAgregar" style="width:100%"><i class="fas fa-plus"></i> Agregar</button>
        <div id="lineasList" style="margin-top:12px;max-height:200px;overflow-y:auto"></div>
      `;
    } else if (paso === 3) {
      const lineas = datos.lineas;
      const totalPiezas = lineas.reduce((sum, l) => sum + l.cantidad, 0);

      body = `
        <h4>Resumen de Salida</h4>
        <p><strong>Tipo:</strong> ${datos.tipo_salida}</p>
        <p><strong>Motivo:</strong> ${esc(datos.motivo || '—')}</p>
        <p><strong>Autorizado por:</strong> ${esc(datos.autorizado_por || '—')}</p>
        <p><strong>Total Piezas:</strong> ${totalPiezas}</p>
        <p><strong>Total Productos:</strong> ${lineas.length}</p>
        <table class="data-table" style="margin-top:12px;font-size:12px">
          <thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
          <tbody>
            ${lineas.map(l => {
              const p = getStore().productos.find(x => x.id === l.producto_id);
              return `<tr><td>${p ? esc(p.nombre) : '?'}</td><td>${l.cantidad}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    }

    modal.open(`Paso ${paso}/3`, body, getPasoFooter(), 'md');

    if (paso === 1) {
      document.getElementById('tipoSalida')?.addEventListener('change', (e) => {
        datos.tipo_salida = e.target.value;
      });
      document.getElementById('motivo')?.addEventListener('input', (e) => {
        datos.motivo = e.target.value;
      });
      document.getElementById('autorizadoPor')?.addEventListener('input', (e) => {
        datos.autorizado_por = e.target.value;
      });
    } else if (paso === 2) {
      const productos = getProductos();
      let selectedProd = null;

      document.getElementById('searchProd')?.addEventListener('keyup', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = productos.filter(p => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 10);
        let html = '';
        filtered.forEach(p => {
          const stock = p.es_por_variante
            ? (p.variantes || []).reduce((s, v) => s + (v.stock_actual || 0), 0)
            : (p.stock_actual || 0);
          html += `<div class="prod-item" style="cursor:pointer;padding:6px;background:#1f1f1f;border-radius:4px;margin-bottom:4px;font-size:13px" data-prod-id="${p.id}"><strong>${esc(p.nombre)}</strong> (${stock} disponibles)</div>`;
        });
        document.getElementById('prodList').innerHTML = html;

        document.querySelectorAll('.prod-item').forEach(item => {
          item.addEventListener('click', () => {
            selectedProd = productos.find(p => p.id === item.dataset.prodId);
            document.getElementById('searchProd').value = selectedProd ? selectedProd.nombre : '';
            document.getElementById('prodList').innerHTML = '';
          });
        });
      });

      document.getElementById('btnAgregar')?.addEventListener('click', () => {
        if (!selectedProd) {
          notify('Selecciona un producto', 'warning');
          return;
        }
        const cant = parseInt(document.getElementById('cantidad').value || 0);
        if (cant <= 0) {
          notify('Cantidad inválida', 'error');
          return;
        }

        const stockDisp = selectedProd.es_por_variante
          ? (selectedProd.variantes || []).reduce((s, v) => s + (v.stock_actual || 0), 0)
          : (selectedProd.stock_actual || 0);

        if (cant > stockDisp) {
          notify(`Stock insuficiente (disponible: ${stockDisp})`, 'error');
          return;
        }

        datos.lineas.push({ producto_id: selectedProd.id, cantidad: cant });
        notify('Producto agregado', 'success');
        selectedProd = null;
        document.getElementById('searchProd').value = '';
        document.getElementById('cantidad').value = '1';
        renderLineas();
      });

      function renderLineas() {
        let html = '';
        datos.lineas.forEach((l, idx) => {
          const p = getStore().productos.find(x => x.id === l.producto_id);
          html += `<div style="padding:6px;background:#1f1f1f;border-radius:4px;margin-bottom:4px;display:flex;justify-content:space-between"><span>${p ? esc(p.nombre) : '?'} x${l.cantidad}</span><button class="btn-icon btn-danger" onclick="removeLinea(${idx})" style="padding:2px 6px"><i class="fas fa-trash"></i></button></div>`;
        });
        document.getElementById('lineasList').innerHTML = html;
      }

      window.removeLinea = (idx) => {
        datos.lineas.splice(idx, 1);
        renderLineas();
      };

      renderLineas();
    }
  }

  function getPasoFooter() {
    let footer = '<button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button>';
    if (paso > 1) footer += '<button class="btn btn-secondary" id="btnAnt">← Anterior</button>';
    if (paso < 3) footer += '<button class="btn btn-primary" id="btnSig">Siguiente →</button>';
    else footer += '<button class="btn btn-success" id="btnGuardar">✓ Registrar Salida</button>';
    return footer;
  }

  window.modalClose = () => modal.close();

  if (_salidasWizardHandler) {
    document.removeEventListener('click', _salidasWizardHandler, true);
  }
  _salidasWizardHandler = (e) => {
    if (e.target.id === 'btnAnt') {
      if (paso > 1) paso--;
      showPaso();
    }
    if (e.target.id === 'btnSig') {
      if (paso === 1 && !datos.tipo_salida) {
        notify('Selecciona un tipo de salida', 'warning');
        return;
      }
      if (paso === 2 && datos.lineas.length === 0) {
        notify('Agrega al menos un producto', 'warning');
        return;
      }
      if (paso < 3) paso++;
      showPaso();
    }
    if (e.target.id === 'btnGuardar') {
      const resultado = registrarSalida({
        tipo: datos.tipo_salida,
        motivo: datos.motivo,
        autorizado_por: datos.autorizado_por || '',
        lineas: datos.lineas,
      });

      if (!resultado.ok) {
        notify(resultado.error || 'Error', 'error');
        return;
      }

      notify('Salida registrada', 'success');
      modal.close();
      renderSalidas();
    }
  };
  document.addEventListener('click', _salidasWizardHandler, true);
}

function openDetalleSalida(id) {
  const salida = getStore().salidasNuevas.find(s => s.id === id);
  if (!salida) return;

  const lineas = getStore().lineasSalida.filter(l => l.salida_id === id);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);

  const tipoLabel = {
    colocacion: 'Colocación',
    merma: 'Merma / Pérdida',
    ajuste: 'Ajuste',
    devolucion_proveedor: 'Devolución a Proveedor',
    uso_interno: 'Uso Interno'
  }[salida.tipo] || salida.tipo;

  let body = `
    <p><strong>Número:</strong> ${esc(salida.numero)}</p>
    <p><strong>Tipo:</strong> ${tipoLabel}</p>
    <p><strong>Motivo:</strong> ${esc(salida.motivo || '—')}</p>
    <p><strong>Fecha:</strong> ${fmtDate(salida.fecha_hora)}</p>
    <p><strong>Autorizado por:</strong> ${esc(salida.autorizado_por || '—')}</p>
    <p><strong>Registrado por:</strong> ${esc(salida.registrado_por)}</p>

    <h4 style="margin-top:12px">Productos</h4>
    <table class="data-table">
      <thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${lineas.map(l => {
          const p = getStore().productos.find(x => x.id === l.producto_id);
          return `<tr><td>${p ? esc(p.nombre) : '?'}</td><td style="text-align:center">${l.cantidad}</td></tr>`;
        }).join('')}
        <tr style="font-weight:bold"><td>Total Piezas</td><td style="text-align:center">${piezas}</td></tr>
      </tbody>
    </table>
  `;

  modal.open(`Salida: ${salida.numero}`, body, '<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>', 'md');
  window.modalClose = () => modal.close();
}
