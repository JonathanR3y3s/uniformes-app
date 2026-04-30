/**
 * RECEPCIÓN
 * Módulo para gestión de recepciones de mercancía con facturas
 */

import { getStore } from './storage.js';
import { esc, fmtMoney, acFiltrar } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole, getUser } from './user-roles.js';
import { getEntradas, registrarEntrada, completarFactura, getProductos, getCategorias, updateProducto } from './almacen-api.js';
import { saveEvidence, getEvidenceSrc } from './evidence-storage.js';
import { isImageFile } from './file-validation.js';

let currentStep = 1;
let _recepcionWizardHandler = null;
const FACTURA_MAX_BYTES = 500 * 1024;
const FACTURA_MAX_SIDE = 800;
const PAGE_SIZE = 50;
let entradasVisibleLimit = PAGE_SIZE;
let wizardData = {
  proveedor: '',
  fecha_hora: new Date().toISOString(),
  observaciones: '',
  factura: { folio: '', fecha: '', subtotal: 0, iva: 0, total: 0, foto: null },
  productoFoto: null,
  lineas: [],
};

function validateImage(file) {
  if (!file) return false;
  if (!isImageFile(file)) {
    notify('Solo se permiten imágenes.', 'warning');
    return false;
  }
  return true;
}

function getBase64Bytes(base64) {
  if (!base64 || typeof base64 !== 'string') return 0;
  if (base64.startsWith('data:')) base64 = base64.split(',')[1] || '';
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.ceil((base64.length * 3) / 4) - padding;
}

function renderEvidencePreviewHtml(evidence, label = 'Foto guardada') {
  const src = getEvidenceSrc(evidence);
  if (!src) return '<span class="empty-evidence">Sin evidencia</span>';
  const kb = typeof evidence === 'string' || evidence?.base64 ? Math.round(getBase64Bytes(evidence.base64 || evidence) / 1024) : null;
  const text = evidence?.storage === 'supabase' ? 'Foto guardada en Supabase' : `${label}${kb ? ` (${kb}KB)` : ''}`;
  return `<div class="evidence-panel" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><img class="evidence-thumb" src="${esc(src)}" style="max-width:120px;max-height:120px;border-radius:4px;object-fit:cover"><small style="color:#475569;font-size:13px">${esc(text)}</small></div>`;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = dataUrl;
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

async function resizeFacturaFile(file) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);
  const ratio = Math.min(1, FACTURA_MAX_SIDE / Math.max(img.width, img.height));
  let width = Math.max(1, Math.round(img.width * ratio));
  let height = Math.max(1, Math.round(img.height * ratio));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let quality = 0.82;

  for (let i = 0; i < 6; i++) {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
    const bytes = getBase64Bytes(base64);
    if (bytes <= FACTURA_MAX_BYTES) return { base64, bytes };
    quality = Math.max(0.55, quality - 0.08);
    width = Math.max(1, Math.round(width * 0.9));
    height = Math.max(1, Math.round(height * 0.9));
  }

  const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
  return { base64, bytes: getBase64Bytes(base64) };
}

function renderFacturaPreview() {
  const preview = document.getElementById('fotoFactPreview');
  if (!preview) return;
  preview.innerHTML = renderEvidencePreviewHtml(wizardData.factura.foto, 'Foto guardada');
}

function renderProductoPreview() {
  const preview = document.getElementById('fotoProdPreview');
  if (!preview) return;
  preview.innerHTML = renderEvidencePreviewHtml(wizardData.productoFoto, 'Foto de producto lista');
}

async function persistEvidence(value, { tipo, entidad, entidadId, filename }) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  return saveEvidence({ base64: value, tipo, entidad, entidadId, filename });
}

function formatFechaSegura(value) {
  if (!value) return 'Sin fecha';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleDateString('es-MX');
}

export function render() {
  const entradas = getEntradas();
  const mesActual = new Date().toISOString().slice(0, 7);
  const entradasMes = entradas.filter(e => {
    const d = new Date(e.fecha_hora);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 7) === mesActual;
  });
  const pendientesFactura = entradas.filter(e => e.estado === 'pendiente_factura');

  let html = `
    <div class="page-content">
      <div class="page-head">
        <div class="page-title">Recibir Mercancía</div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnNuevaRecepcion"><i class="fas fa-inbox"></i> Nueva Recepción</button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">${entradasMes.length}</div>
          <div class="kpi-label">Recepciones Este Mes</div>
        </div>
        ${pendientesFactura.length > 0 ? `
        <div class="kpi-card" style="border: 1px solid #facc15">
          <div class="kpi-value" style="color: #facc15">${pendientesFactura.length}</div>
          <div class="kpi-label">Pendientes de Factura</div>
        </div>
        ` : ''}
        <div class="kpi-card">
          <div class="kpi-value">${fmtMoney(entradasMes.reduce((sum, e) => sum + (e.factura_total || 0), 0))}</div>
          <div class="kpi-label">Gasto Este Mes</div>
        </div>
      </div>

      <!-- Filtros -->
      <div class="filters-section">
        <input type="text" id="filterProveedor" placeholder="Filtrar por proveedor..." style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;flex:1">
        <select id="filterEstado" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todos los estados</option>
          <option value="completa">Completa</option>
          <option value="pendiente_factura">Pendiente Factura</option>
        </select>
      </div>

      <!-- Tabla de entradas -->
      <div id="entradasContainer" style="margin-top:20px"></div>
    </div>
  `;

  return html;
}

export function init() {
  document.getElementById('btnNuevaRecepcion')?.addEventListener('click', openNuevaRecepcion);
  const resetEntradas = () => { entradasVisibleLimit = PAGE_SIZE; renderEntradas(); };
  document.getElementById('filterProveedor')?.addEventListener('keyup', resetEntradas);
  document.getElementById('filterEstado')?.addEventListener('change', resetEntradas);

  renderEntradas();
}

function renderEntradas() {
  const filtros = {
    proveedor: document.getElementById('filterProveedor')?.value || '',
    estado: document.getElementById('filterEstado')?.value || '',
  };

  let entradas = getEntradas(filtros);
  const entradasVisibles = entradas.slice(0, entradasVisibleLimit);

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Número</th>
          <th>Proveedor</th>
          <th>Fecha</th>
          <th>Artículos</th>
          <th>Total</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (entradas.length === 0) {
    html += `<tr><td colspan="7" style="text-align:center;padding:20px;color:#999">Sin recepciones registradas</td></tr>`;
  } else {
    entradasVisibles.forEach(e => {
      const lineas = getStore().lineasEntrada.filter(l => l.entrada_id === e.id);
      const estadoBadge = e.estado === 'pendiente_factura'
        ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px">⚠️ Pendiente</span>'
        : '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:12px">✓ Completa</span>';

      html += `
        <tr>
          <td><strong>${esc(e.numero)}</strong></td>
          <td>${esc(e.proveedor)}</td>
          <td>${formatFechaSegura(e.fecha_hora)}</td>
          <td style="text-align:center">${lineas.length}</td>
          <td style="text-align:right">${fmtMoney(e.factura_total || 0)}</td>
          <td>${estadoBadge}</td>
          <td style="text-align:center">
            <button class="btn-icon" data-entrada-id="${e.id}" title="Ver detalles"><i class="fas fa-eye"></i></button>
            ${e.estado === 'pendiente_factura' ? `<button class="btn-icon btn-completar" data-entrada-id="${e.id}" title="Completar factura"><i class="fas fa-file-check"></i></button>` : ''}
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table>`;
  if (entradas.length > entradasVisibleLimit) {
    html += `<div style="text-align:center;margin-top:12px"><button class="btn btn-ghost btn-sm" id="entradasVerMas">Ver más</button></div>`;
  }

  const container = document.getElementById('entradasContainer');
  container.innerHTML = html;

  // Delegación de eventos (onclick evita acumulación de listeners por cada render)
  container.onclick = e => {
    const moreBtn = e.target.closest('#entradasVerMas');
    if (moreBtn) {
      entradasVisibleLimit += PAGE_SIZE;
      renderEntradas();
      return;
    }

    const verBtn = e.target.closest('button[data-entrada-id]:not(.btn-completar)');
    if (verBtn) {
      const id = verBtn.dataset.entradaId;
      openDetalleEntrada(id);
      return;
    }

    const completarBtn = e.target.closest('.btn-completar');
    if (completarBtn) {
      const id = completarBtn.dataset.entradaId;
      openCompletarFactura(id);
    }
  };
}

function openNuevaRecepcion() {
  currentStep = 1;
  wizardData = {
    proveedor: '',
    fecha_hora: new Date().toISOString(),
    observaciones: '',
    factura: { folio: '', fecha: '', subtotal: 0, iva: 0, total: 0, foto: null },
    productoFoto: null,
    lineas: [],
  };

  showWizardStep();
  _attachRecepcionWizardListener();
}

function showWizardStep() {
  let body = '';
  let stepLabel = '';

  if (currentStep === 1) {
    // Paso 1: Proveedor
    stepLabel = 'Proveedor (Paso 1/4)';
    const proveedoresHistorico = [...new Set(getStore().entradas.map(e => e.proveedor).filter(Boolean))];

    body = `
      <div>
        <label>Proveedor *</label>
        <input type="text" id="prov" list="proveedoresList" value="${esc(wizardData.proveedor)}" placeholder="Nombre del proveedor" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <datalist id="proveedoresList">
          ${proveedoresHistorico.map(p => `<option value="${esc(p)}">`).join('')}
        </datalist>
      </div>
      <div style="margin-top:12px">
        <label>Observaciones</label>
        <textarea id="obs" placeholder="Notas de la recepción..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;min-height:80px">${esc(wizardData.observaciones)}</textarea>
      </div>
    `;
  } else if (currentStep === 2) {
    // Paso 2: Factura
    stepLabel = 'Factura (Paso 2/4)';
    const sinFactura = !wizardData.factura.folio;

    body = `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px">
        <input type="checkbox" id="sinFactura" ${sinFactura ? 'checked' : ''}> No tengo factura ahora
      </label>

      <div id="facturaSection" style="${sinFactura ? 'display:none' : ''}">
        <div class="form-row c2">
          <div>
            <label>Folio Factura</label>
            <input type="text" id="folio" value="${esc(wizardData.factura.folio)}" placeholder="Ej: INV-2024-001" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          </div>
        </div>

        <div class="form-row c3" style="margin-top:12px;gap:8px">
          <div>
            <label>Subtotal</label>
            <input type="number" id="subtotal" value="${wizardData.factura.subtotal}" step="0.01" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          </div>
          <div>
            <label>IVA</label>
            <input type="number" id="iva" value="${wizardData.factura.iva}" step="0.01" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          </div>
          <div>
            <label>Total</label>
            <input type="number" id="total" value="${wizardData.factura.total}" step="0.01" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          </div>
        </div>

        <div style="margin-top:12px">
          <label>Foto Factura</label>
          <input type="file" id="fotoFact" accept="image/*" capture="environment" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <div id="fotoFactPreview" style="margin-top:8px">${renderEvidencePreviewHtml(wizardData.factura.foto, 'Foto guardada')}</div>
        </div>
      </div>
    `;
  } else if (currentStep === 3) {
    // Paso 3: Productos
    stepLabel = 'Productos (Paso 3/4)';
    const productos = getProductos();

    body = `
      <div style="margin-bottom:12px;padding:8px;background:#111;border-radius:4px">
        <label>Buscar Producto</label>
        <input type="text" id="searchProd" placeholder="Nombre o SKU..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <div id="prodList" style="margin-top:8px;max-height:200px;overflow-y:auto"></div>
      </div>

      <div style="margin-bottom:12px">
        <label>Cantidad</label>
        <input type="number" id="cantidad" min="1" value="1" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>

      <div class="form-row c2" style="gap:8px;margin-bottom:12px">
        <div>
          <label>Costo Unitario *</label>
          <input type="number" id="costoUnit" step="0.01" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="btn btn-success" id="btnAgregar" style="width:100%;padding:8px"><i class="fas fa-plus"></i> Agregar</button>
        </div>
      </div>

      <div style="margin-bottom:12px">
        <label>Foto Producto (opcional)</label>
        <input type="file" id="fotoProd" accept="image/*" capture="environment" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <div id="fotoProdPreview" style="margin-top:8px">${renderEvidencePreviewHtml(wizardData.productoFoto, 'Foto de producto lista')}</div>
      </div>

      <h4 style="margin:12px 0 8px 0">Líneas agregadas:</h4>
      <div id="lineasList" style="max-height:300px;overflow-y:auto"></div>

      ${wizardData.lineas.length === 0 ? '<p style="color:#999;font-size:12px">Agrega al menos un producto</p>' : `<div style="margin-top:8px;padding:8px;background:#111;border-radius:4px;text-align:right"><strong>Subtotal: ${fmtMoney(wizardData.lineas.reduce((s, l) => s + (l.cantidad * l.costo_unitario), 0))}</strong></div>`}
    `;
  } else if (currentStep === 4) {
    // Paso 4: Resumen
    stepLabel = 'Resumen (Paso 4/4)';
    const subtotal = wizardData.lineas.reduce((s, l) => s + (l.cantidad * l.costo_unitario), 0);

    body = `
      <div style="padding:12px;background:#111;border-radius:4px;margin-bottom:12px">
        <p><strong>Proveedor:</strong> ${esc(wizardData.proveedor)}</p>
        <p><strong>Artículos:</strong> ${wizardData.lineas.length}</p>
        <p><strong>Subtotal:</strong> ${fmtMoney(subtotal)}</p>
        ${wizardData.factura.folio ? `<p><strong>Factura:</strong> ${esc(wizardData.factura.folio)}</p><p><strong>Total Factura:</strong> ${fmtMoney(wizardData.factura.total || 0)}</p>` : '<p style="color:#facc15">⚠️ Sin factura registrada</p>'}
      </div>

      <table class="data-table">
        <thead>
          <tr><th>Producto</th><th>Cantidad</th><th>Costo</th><th>Total</th></tr>
        </thead>
        <tbody>
          ${wizardData.lineas.map(l => {
            const prod = getStore().productos.find(p => p.id === l.producto_id);
            return `
              <tr>
                <td>${prod ? esc(prod.nombre) : '?'}</td>
                <td style="text-align:center">${l.cantidad}</td>
                <td style="text-align:right">${fmtMoney(l.costo_unitario)}</td>
                <td style="text-align:right;font-weight:bold">${fmtMoney(l.cantidad * l.costo_unitario)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  modal.open(stepLabel, body, getWizardFooter(), 'md');

  // Conectar eventos dinámicos según el paso
  if (currentStep === 1) {
    document.getElementById('prov').addEventListener('blur', () => {
      wizardData.proveedor = document.getElementById('prov').value;
    });
  } else if (currentStep === 2) {
    document.getElementById('sinFactura').addEventListener('change', (e) => {
      document.getElementById('facturaSection').style.display = e.target.checked ? 'none' : 'block';
    });
    document.getElementById('fotoFact')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!validateImage(file)) {
        e.target.value = '';
        wizardData.factura.foto = null;
        renderFacturaPreview();
        return;
      }
      try {
        const result = await resizeFacturaFile(file);
        if (result.bytes > FACTURA_MAX_BYTES) {
          wizardData.factura.foto = null;
          e.target.value = '';
          renderFacturaPreview();
          notify('La foto de factura supera 500KB incluso comprimida', 'error');
          return;
        }
        wizardData.factura.foto = result.base64;
        renderFacturaPreview();
        notify('Foto de factura cargada', 'success');
      } catch (err) {
        wizardData.factura.foto = null;
        e.target.value = '';
        renderFacturaPreview();
        notify(err.message || 'No se pudo cargar la foto', 'error');
      }
    });
  } else if (currentStep === 3) {
    const searchInput = document.getElementById('searchProd');
    let selectedProduct = null;

    const acBoxRec = document.createElement('div');
    acBoxRec.className = 'ac-box';
    const wrapperRec = document.createElement('div');
    wrapperRec.style.position = 'relative';
    searchInput.parentNode.insertBefore(wrapperRec, searchInput);
    wrapperRec.appendChild(searchInput);
    wrapperRec.appendChild(acBoxRec);

    const productosRec = getProductos();
    searchInput.addEventListener('input', (e) => {
      const res = acFiltrar(productosRec, ['nombre', 'sku'], e.target.value);
      acBoxRec.innerHTML = res.map(p => `<div class="ac-item" data-id="${p.id}">${esc(p.nombre)} (${esc(p.sku || '')})</div>`).join('');
      document.getElementById('prodList').innerHTML = '';
    });

    acBoxRec.addEventListener('click', (e) => {
      const el = e.target.closest('.ac-item');
      if (!el) return;
      selectedProduct = productosRec.find(x => x.id == el.dataset.id);
      searchInput.value = selectedProduct ? selectedProduct.nombre : '';
      searchInput.dataset.id = selectedProduct ? selectedProduct.id : '';
      acBoxRec.innerHTML = '';
    });

    document.getElementById('fotoProd')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!validateImage(file)) {
        e.target.value = '';
        wizardData.productoFoto = null;
        renderProductoPreview();
        return;
      }
      try {
        const result = await resizeFacturaFile(file);
        wizardData.productoFoto = result.base64;
        renderProductoPreview();
        notify('Foto de producto cargada', 'success');
      } catch (err) {
        wizardData.productoFoto = null;
        e.target.value = '';
        renderProductoPreview();
        notify(err.message || 'No se pudo cargar la foto del producto', 'error');
      }
    });

    document.getElementById('btnAgregar').addEventListener('click', () => {
      if (!selectedProduct) {
        notify('Selecciona un producto', 'warning');
        return;
      }

      const cantidad = parseInt(document.getElementById('cantidad').value || 0, 10);
      const costo = parseFloat(document.getElementById('costoUnit').value || 0);

      if (cantidad <= 0 || costo <= 0) {
        notify('Cantidad y costo deben ser mayores a cero', 'error');
        return;
      }

      wizardData.lineas.push({
        producto_id: selectedProduct.id,
        cantidad,
        costo_unitario: costo,
        foto_producto: wizardData.productoFoto || null,
        observaciones: '',
      });

      notify('Producto agregado', 'success');
      selectedProduct = null;
      wizardData.productoFoto = null;
      document.getElementById('searchProd').value = '';
      document.getElementById('cantidad').value = '1';
      document.getElementById('costoUnit').value = '';
      showWizardStep();
    });

    renderLineasList();
  }
}

function renderLineasList() {
  const container = document.getElementById('lineasList');
  if (!container) return;

  let html = '<div>';
  wizardData.lineas.forEach((l, idx) => {
    const prod = getStore().productos.find(p => p.id === l.producto_id);
    html += `
      <div style="padding:8px;background:#1f1f1f;border-radius:4px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:bold;font-size:13px">${prod ? esc(prod.nombre) : '?'}</div>
          <small style="color:#999">${l.cantidad} x ${fmtMoney(l.costo_unitario)} = ${fmtMoney(l.cantidad * l.costo_unitario)}</small>
        </div>
        <button type="button" class="btn-icon btn-danger" onclick="removeLineaWizard(${idx})"><i class="fas fa-trash"></i></button>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

window.removeLineaWizard = function(idx) {
  wizardData.lineas.splice(idx, 1);
  renderLineasList();
};

function getWizardFooter() {
  let footer = '<button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button>';

  if (currentStep > 1) {
    footer += '<button class="btn btn-secondary" id="btnAnterior">← Anterior</button>';
  }

  if (currentStep < 4) {
    footer += '<button class="btn btn-primary" id="btnSiguiente">Siguiente →</button>';
  } else {
    footer += '<button class="btn btn-success" id="btnConfirmar">✓ Confirmar Recepción</button>';
  }

  return footer;
}

// Conectar botones de navegación del wizard — se activa en openNuevaRecepcion, se limpia al cerrar
function _attachRecepcionWizardListener() {
  if (_recepcionWizardHandler) {
    document.removeEventListener('click', _recepcionWizardHandler, true);
  }
  _recepcionWizardHandler = async (e) => {
    if (e.target.id === 'btnAnterior') {
      if (currentStep > 1) currentStep--;
      showWizardStep();
    }
    if (e.target.id === 'btnSiguiente') {
      if (currentStep === 1) {
        wizardData.proveedor = document.getElementById('prov')?.value || '';
        const nowISO = new Date().toISOString();
        wizardData.fecha_hora = nowISO;
        wizardData.observaciones = document.getElementById('obs')?.value || '';
        if (!wizardData.proveedor) {
          notify('El proveedor es obligatorio', 'error');
          return;
        }
      } else if (currentStep === 2) {
        if (!document.getElementById('sinFactura')?.checked) {
          const nowISO = new Date().toISOString();
          wizardData.factura = {
            folio: document.getElementById('folio')?.value || '',
            fecha: nowISO,
            subtotal: parseFloat(document.getElementById('subtotal')?.value || 0),
            iva: parseFloat(document.getElementById('iva')?.value || 0),
            total: parseFloat(document.getElementById('total')?.value || 0),
            foto: wizardData.factura.foto || null,
          };
        }
      }
      if (currentStep < 4) {
        currentStep++;
        showWizardStep();
      }
    }
    if (e.target.id === 'btnConfirmar') {
      const btn = e.target;
      btn.disabled = true;
      const entradaId = 'ent-' + Date.now();
      const facturaData = document.getElementById('sinFactura')?.checked ? {} : { ...wizardData.factura };
      if (facturaData.foto) {
        facturaData.foto = await persistEvidence(facturaData.foto, {
          tipo: 'foto',
          entidad: 'recepcion',
          entidadId: entradaId,
          filename: 'factura.jpg',
        });
      }
      const lineas = [];
      for (let i = 0; i < wizardData.lineas.length; i++) {
        const linea = { ...wizardData.lineas[i] };
        if (linea.foto_producto) {
          linea.foto_producto = await persistEvidence(linea.foto_producto, {
            tipo: 'foto',
            entidad: 'recepcion-producto',
            entidadId: `${entradaId}-linea-${i + 1}`,
            filename: 'producto.jpg',
          });
        }
        lineas.push(linea);
      }
      const resultado = registrarEntrada({
        id: entradaId,
        proveedor: wizardData.proveedor,
        fecha_hora: wizardData.fecha_hora,
        factura_data: facturaData,
        lineas,
        observaciones: wizardData.observaciones,
      });

      if (!resultado.ok) {
        btn.disabled = false;
        notify(resultado.error || 'Error al registrar', 'error');
        return;
      }

      let fotosAsignadas = 0;
      let fotosExistentes = 0;
      lineas.forEach(linea => {
        if (!linea.foto_producto) return;
        const prod = getStore().productos.find(p => p.id === linea.producto_id);
        if (!prod) return;
        if (!prod.foto_producto) {
          updateProducto(prod.id, { foto_producto: linea.foto_producto });
          fotosAsignadas++;
        } else {
          fotosExistentes++;
          console.info('[RECEPCION] Producto ya tiene foto principal; no se sobrescribe:', prod.id);
        }
      });

      notify('Recepción registrada correctamente', 'success');
      if (fotosAsignadas) notify(`${fotosAsignadas} foto(s) asignada(s) como foto principal`, 'success');
      if (fotosExistentes) notify('Producto con foto existente: no se sobrescribió', 'info');
      modal.close();
      if (_recepcionWizardHandler) {
        document.removeEventListener('click', _recepcionWizardHandler, true);
        _recepcionWizardHandler = null;
      }
      renderEntradas();
    }
  };
  document.addEventListener('click', _recepcionWizardHandler, true);
}

window.modalClose = () => modal.close();

function openDetalleEntrada(id) {
  const entrada = getStore().entradas.find(e => e.id === id);
  if (!entrada) return;

  const lineas = getStore().lineasEntrada.filter(l => l.entrada_id === id);
  const facturaFotoSrc = getEvidenceSrc(entrada.factura_foto);
  const lineasConFoto = lineas.filter(l => l.foto_producto);

  const body = `
    <div>
      <h4>Información de Recepción</h4>
      <p><strong>Número:</strong> ${esc(entrada.numero)}</p>
      <p><strong>Proveedor:</strong> ${esc(entrada.proveedor)}</p>
      <p><strong>Fecha:</strong> ${formatFechaSegura(entrada.fecha_hora)}</p>
      <p><strong>Recibido por:</strong> ${esc(entrada.recibido_por)}</p>
      <p><strong>Observaciones:</strong> ${esc(entrada.observaciones)}</p>

      ${entrada.factura_folio ? `
      <h4 style="margin-top:12px">Factura</h4>
      <p><strong>Folio:</strong> ${esc(entrada.factura_folio)}</p>
      <p><strong>Fecha:</strong> ${formatFechaSegura(entrada.factura_fecha)}</p>
      <p><strong>Subtotal:</strong> ${fmtMoney(entrada.factura_subtotal || 0)}</p>
      <p><strong>IVA:</strong> ${fmtMoney(entrada.factura_iva || 0)}</p>
      <p><strong>Total:</strong> ${fmtMoney(entrada.factura_total || 0)}</p>
      ${facturaFotoSrc ? `<div style="margin-top:8px"><strong>Foto factura:</strong><br><img src="${esc(facturaFotoSrc)}" style="max-width:160px;max-height:160px;border-radius:6px;object-fit:cover;border:1px solid #e5e7eb;margin-top:4px;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Tap para ver grande"></div>` : '<p style="font-size:12px;color:#94a3b8;margin-top:4px"><i class="fas fa-image"></i> Sin foto de factura</p>'}
      ` : '<p style="color:#facc15">⚠️ Sin factura registrada</p>'}

      ${lineasConFoto.length > 0 ? `
      <h4 style="margin-top:12px">Fotos de Productos</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
        ${lineasConFoto.map(l => {
          const src = getEvidenceSrc(l.foto_producto);
          const prod = getStore().productos.find(p => p.id === l.producto_id);
          return src ? `<div style="text-align:center"><img src="${esc(src)}" style="width:100px;height:100px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;cursor:pointer" onclick="window.open(this.src,'_blank')" title="Tap para ver grande"><div style="font-size:10px;color:#94a3b8;margin-top:4px">${esc(prod?.nombre || '?')}</div></div>` : '';
        }).join('')}
      </div>
      ` : ''}

      <h4 style="margin-top:12px">Artículos</h4>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr><th>Producto</th><th>Cantidad</th><th>Costo Unit.</th><th>Total</th></tr>
        </thead>
        <tbody>
          ${lineas.map(l => {
            const prod = getStore().productos.find(p => p.id === l.producto_id);
            return `
              <tr>
                <td>${prod ? esc(prod.nombre) : '?'}</td>
                <td style="text-align:center">${l.cantidad}</td>
                <td style="text-align:right">${fmtMoney(l.costo_unitario)}</td>
                <td style="text-align:right;font-weight:bold">${fmtMoney(l.costo_total)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>
  `;

  modal.open(`Detalles: ${entrada.numero}`, body, '<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>', 'lg');
  window.modalClose = () => modal.close();
}

function openCompletarFactura(id) {
  const entrada = getStore().entradas.find(e => e.id === id);
  if (!entrada) return;

  const body = `
    <div class="form-row c2">
      <div>
        <label>Folio Factura *</label>
        <input type="text" id="folioFactura" placeholder="Ej: INV-2024-001" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>
    </div>

    <div class="form-row c3" style="margin-top:12px;gap:8px">
      <div>
        <label>Subtotal</label>
        <input type="number" id="subtotalFact" step="0.01" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>
      <div>
        <label>IVA</label>
        <input type="number" id="ivaFact" step="0.01" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>
      <div>
        <label>Total</label>
        <input type="number" id="totalFact" step="0.01" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>
    </div>
  `;

  modal.open('Completar Factura', body, `
    <button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button>
    <button class="btn btn-primary" id="btnSaveFactura">Guardar Factura</button>
  `, 'md');

  window.modalClose = () => modal.close();

  document.getElementById('btnSaveFactura')?.addEventListener('click', () => {
    const folio = document.getElementById('folioFactura')?.value.trim();
    const nowISO = new Date().toISOString();
    const subtotal = parseFloat(document.getElementById('subtotalFact')?.value || 0);
    const iva = parseFloat(document.getElementById('ivaFact')?.value || 0);
    const total = parseFloat(document.getElementById('totalFact')?.value || 0);

    if (!folio) {
      notify('El folio es obligatorio', 'error');
      return;
    }

    const resultado = completarFactura(id, {
      folio,
      fecha: nowISO,
      subtotal,
      iva,
      total,
    });

    if (!resultado.ok) {
      notify(resultado.error || 'Error al guardar', 'error');
      return;
    }

    notify('Factura guardada', 'success');
    modal.close();
    renderEntradas();
  });
}
