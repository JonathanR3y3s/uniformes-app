/**
 * RECEPCIÓN
 * Módulo para gestión de recepciones de mercancía con facturas
 */

import { getStore } from './storage.js';
import { esc, fmtDate, fmtMoney } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole, getUser } from './user-roles.js';
import { getEntradas, registrarEntrada, completarFactura, getProductos, getCategorias } from './almacen-api.js';

let currentStep = 1;
let wizardData = {
  proveedor: '',
  fecha_hora: new Date().toISOString(),
  observaciones: '',
  factura: { folio: '', fecha: '', subtotal: 0, iva: 0, total: 0, foto: null },
  lineas: [],
};

export function render() {
  const entradas = getEntradas();
  const mesActual = new Date().toISOString().slice(0, 7);
  const entradasMes = entradas.filter(e => e.fecha_hora.startsWith(mesActual));
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
  document.getElementById('filterProveedor')?.addEventListener('keyup', renderEntradas);
  document.getElementById('filterEstado')?.addEventListener('change', renderEntradas);

  renderEntradas();
}

function renderEntradas() {
  const filtros = {
    proveedor: document.getElementById('filterProveedor')?.value || '',
    estado: document.getElementById('filterEstado')?.value || '',
  };

  let entradas = getEntradas(filtros);

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
    entradas.forEach(e => {
      const lineas = getStore().lineasEntrada.filter(l => l.entrada_id === e.id);
      const estadoBadge = e.estado === 'pendiente_factura'
        ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px">⚠️ Pendiente</span>'
        : '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:12px">✓ Completa</span>';

      html += `
        <tr>
          <td><strong>${esc(e.numero)}</strong></td>
          <td>${esc(e.proveedor)}</td>
          <td>${fmtDate(e.fecha_hora)}</td>
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

  const container = document.getElementById('entradasContainer');
  container.innerHTML = html;

  // Delegación de eventos (onclick evita acumulación de listeners por cada render)
  container.onclick = e => {
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
        <input type="text" id="prov" list="proveedoresList" value="${wizardData.proveedor}" placeholder="Nombre del proveedor" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <datalist id="proveedoresList">
          ${proveedoresHistorico.map(p => `<option value="${p}">`).join('')}
        </datalist>
      </div>
      <div style="margin-top:12px">
        <label>Fecha y Hora</label>
        <input type="datetime-local" id="fechaHora" value="${wizardData.fecha_hora.slice(0, 16)}" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>
      <div style="margin-top:12px">
        <label>Observaciones</label>
        <textarea id="obs" placeholder="Notas de la recepción..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;min-height:80px">${wizardData.observaciones}</textarea>
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
            <input type="text" id="folio" value="${wizardData.factura.folio}" placeholder="Ej: INV-2024-001" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          </div>
          <div>
            <label>Fecha Factura</label>
            <input type="date" id="fechaFact" value="${wizardData.factura.fecha}" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
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
          <input type="file" id="fotoFact" accept="image/*" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <div id="fotoFactPreview" style="margin-top:8px"></div>
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
        <input type="file" id="fotoProd" accept="image/*" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
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
  } else if (currentStep === 3) {
    const searchInput = document.getElementById('searchProd');
    let selectedProduct = null;

    searchInput.addEventListener('keyup', () => {
      const q = searchInput.value.toLowerCase();
      const productos = getProductos();
      const filtered = productos.filter(p => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 10);

      let html = '';
      filtered.forEach(p => {
        html += `<div class="prod-item" style="cursor:pointer;padding:8px;background:#1f1f1f;border-radius:4px;margin-bottom:4px" data-prod-id="${p.id}"><strong>${esc(p.nombre)}</strong><br><small style="color:#999">${esc(p.sku)}</small></div>`;
      });
      document.getElementById('prodList').innerHTML = html;

      document.querySelectorAll('.prod-item').forEach(item => {
        item.addEventListener('click', () => {
          selectedProduct = getStore().productos.find(p => p.id === item.dataset.prodId);
          searchInput.value = selectedProduct ? selectedProduct.nombre : '';
          document.getElementById('prodList').innerHTML = '';
        });
      });
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
        observaciones: '',
      });

      notify('Producto agregado', 'success');
      selectedProduct = null;
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
  _recepcionWizardHandler = (e) => {
    if (e.target.id === 'btnAnterior') {
      if (currentStep > 1) currentStep--;
      showWizardStep();
    }
    if (e.target.id === 'btnSiguiente') {
      if (currentStep === 1) {
        wizardData.proveedor = document.getElementById('prov')?.value || '';
        wizardData.observaciones = document.getElementById('obs')?.value || '';
        if (!wizardData.proveedor) {
          notify('El proveedor es obligatorio', 'error');
          return;
        }
      } else if (currentStep === 2) {
        if (!document.getElementById('sinFactura')?.checked) {
          wizardData.factura = {
            folio: document.getElementById('folio')?.value || '',
            fecha: document.getElementById('fechaFact')?.value || '',
            subtotal: parseFloat(document.getElementById('subtotal')?.value || 0),
            iva: parseFloat(document.getElementById('iva')?.value || 0),
            total: parseFloat(document.getElementById('total')?.value || 0),
            foto: null, // TODO: capturar foto — ver AUDITORIA_BUGS.md item H
          };
        }
      }
      if (currentStep < 4) {
        currentStep++;
        showWizardStep();
      }
    }
    if (e.target.id === 'btnConfirmar') {
      const resultado = registrarEntrada({
        proveedor: wizardData.proveedor,
        factura_data: document.getElementById('sinFactura')?.checked ? {} : wizardData.factura,
        lineas: wizardData.lineas,
        observaciones: wizardData.observaciones,
      });

      if (!resultado.ok) {
        notify(resultado.error || 'Error al registrar', 'error');
        return;
      }

      notify('Recepción registrada correctamente', 'success');
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

  const body = `
    <div>
      <h4>Información de Recepción</h4>
      <p><strong>Número:</strong> ${esc(entrada.numero)}</p>
      <p><strong>Proveedor:</strong> ${esc(entrada.proveedor)}</p>
      <p><strong>Fecha:</strong> ${fmtDate(entrada.fecha_hora)}</p>
      <p><strong>Recibido por:</strong> ${esc(entrada.recibido_por)}</p>
      <p><strong>Observaciones:</strong> ${esc(entrada.observaciones)}</p>

      ${entrada.factura_folio ? `
      <h4 style="margin-top:12px">Factura</h4>
      <p><strong>Folio:</strong> ${esc(entrada.factura_folio)}</p>
      <p><strong>Fecha:</strong> ${fmtDate(entrada.factura_fecha)}</p>
      <p><strong>Subtotal:</strong> ${fmtMoney(entrada.factura_subtotal || 0)}</p>
      <p><strong>IVA:</strong> ${fmtMoney(entrada.factura_iva || 0)}</p>
      <p><strong>Total:</strong> ${fmtMoney(entrada.factura_total || 0)}</p>
      ` : '<p style="color:#facc15">⚠️ Sin factura registrada</p>'}

      <h4 style="margin-top:12px">Artículos</h4>
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
      <div>
        <label>Fecha Factura *</label>
        <input type="date" id="fechaFactura" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
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
    const fecha = document.getElementById('fechaFactura')?.value;
    const subtotal = parseFloat(document.getElementById('subtotalFact')?.value || 0);
    const iva = parseFloat(document.getElementById('ivaFact')?.value || 0);
    const total = parseFloat(document.getElementById('totalFact')?.value || 0);

    if (!folio || !fecha) {
      notify('Folio y fecha son obligatorios', 'error');
      return;
    }

    const resultado = completarFactura(id, {
      folio,
      fecha,
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
