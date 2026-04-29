/**
 * INVENTARIO
 * Módulo nuevo para gestión unificada de productos, categorías y stock.
 * Reemplaza al legacy inventario-sku.js con un sistema centralizado.
 */

import { getStore } from './storage.js';
import { esc, fmtDate, fmtMoney } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole, getUser } from './user-roles.js';
import {
  getProductos,
  getProductoById,
  createProducto,
  updateProducto,
  addVariante,
  getProductosBajoStock,
  getCategorias,
  registrarMovimiento,
  registrarMerma,
  getMovimientos,
  getStockDisponible,
  generateSKU,
} from './almacen-api.js';
import { saveEvidence, getEvidenceSrc } from './evidence-storage.js';
import { isImageFile } from './file-validation.js';

let currentPage = 1;
let currentView = 'grid'; // 'grid' o 'tabla'
const PAGE_SIZE = 50;
let productosVisibleLimit = PAGE_SIZE;

function validateImage(file) {
  if (!file) return false;
  if (!isImageFile(file)) {
    notify('Solo se permiten imágenes.', 'warning');
    return false;
  }
  return true;
}

function nivelControl(p) {
  return Number(p?.nivel_control || 3);
}

function nivelControlBadge(nivel) {
  const cfg = {
    1: { color: '#dc2626', text: 'Nivel 1 - Control total' },
    2: { color: '#2563eb', text: 'Nivel 2 - Dotación' },
    3: { color: '#f59e0b', text: 'Nivel 3 - Bajo' },
    4: { color: '#6b7280', text: 'Nivel 4 - Mínimo' },
  }[Number(nivel) || 3];
  return `<span style="display:inline-block;padding:2px 8px;background:${cfg.color}22;border:1px solid ${cfg.color};border-radius:4px;font-size:11px;color:${cfg.color}">${cfg.text}</span>`;
}

export function render() {
  const role = getUserRole();
  const isAdmin = role === 'admin';
  const bajos = getProductosBajoStock();
  const productos = getProductos();
  const categorias = getCategorias();

  // Calcular KPIs
  const totalProductos = productos.length;
  const conStock = productos.filter(
    p => (p.es_por_variante ? p.variantes?.some(v => (v.stock_actual || 0) > 0) : (p.stock_actual || 0) > 0)
  ).length;
  const bajosCount = bajos.length;
  const valorTotal = productos.reduce((sum, p) => {
    if (p.es_por_variante) {
      return sum + (p.variantes || []).reduce((s, v) => s + ((v.stock_actual || 0) * (v.ultimo_costo || 0)), 0);
    } else {
      return sum + ((p.stock_actual || 0) * (p.costo_promedio || 0));
    }
  }, 0);

  let html = `
    <div class="page-content">
      <div class="page-head">
        <div class="page-title">Inventario</div>
        <div class="page-actions">
  `;

  if (role === 'admin') {
    html += `<button class="btn btn-primary" id="btnNewProducto"><i class="fas fa-plus"></i> Nuevo Producto</button>`;
  }

  html += `
          <button class="btn btn-secondary" id="btnToggleView" title="Cambiar vista">
            <i class="fas fa-${currentView === 'grid' ? 'table' : 'th'}"></i>
          </button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">${totalProductos}</div>
          <div class="kpi-label">Total Productos</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${conStock}</div>
          <div class="kpi-label">Con Stock</div>
        </div>
        <div class="kpi-card ${bajosCount > 0 ? 'kpi-alert' : ''}">
          <div class="kpi-value" style="${bajosCount > 0 ? 'color:#dc2626' : ''}">${bajosCount}</div>
          <div class="kpi-label">Bajo Mínimo</div>
        </div>
        ${isAdmin ? `<div class="kpi-card">
          <div class="kpi-value">${fmtMoney(valorTotal)}</div>
          <div class="kpi-label">Valor Total</div>
        </div>` : ''}
      </div>

      <!-- Filtros -->
      <div class="filters-section">
        <select id="filterCategoria" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todas las Categorías</option>
          ${categorias.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
        </select>
        <select id="filterNivelControl" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todos los niveles</option>
          <option value="1">Nivel 1</option>
          <option value="2">Nivel 2</option>
          <option value="3">Nivel 3</option>
          <option value="4">Nivel 4</option>
        </select>
        <input type="text" id="filterBusqueda" placeholder="Buscar por nombre o SKU..." style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;flex:1">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="filterBajoStock"> Solo bajo stock
        </label>
        <button class="btn btn-secondary" id="btnLimpiarFiltros"><i class="fas fa-times"></i> Limpiar</button>
      </div>

      <!-- Contenedor de productos -->
      <div id="productosContainer" style="margin-top:20px"></div>
    </div>
  `;

  return html;
}

export function init() {
  const role = getUserRole();

  document.getElementById('btnNewProducto')?.addEventListener('click', () => {
    if (role === 'admin') openNuevoProducto();
  });

  document.getElementById('btnToggleView')?.addEventListener('click', () => {
    currentView = currentView === 'grid' ? 'tabla' : 'grid';
    productosVisibleLimit = PAGE_SIZE;
    renderProductos();
  });

  document.getElementById('btnLimpiarFiltros')?.addEventListener('click', () => {
    document.getElementById('filterCategoria').value = '';
    document.getElementById('filterNivelControl').value = '';
    document.getElementById('filterBusqueda').value = '';
    document.getElementById('filterBajoStock').checked = false;
    productosVisibleLimit = PAGE_SIZE;
    renderProductos();
  });

  const resetProductos = () => { productosVisibleLimit = PAGE_SIZE; renderProductos(); };
  document.getElementById('filterCategoria')?.addEventListener('change', resetProductos);
  document.getElementById('filterNivelControl')?.addEventListener('change', resetProductos);
  document.getElementById('filterBusqueda')?.addEventListener('keyup', () => setTimeout(resetProductos, 300));
  document.getElementById('filterBajoStock')?.addEventListener('change', resetProductos);

  renderProductos();
}

function getFilterros() {
  const categoria = document.getElementById('filterCategoria')?.value || '';
  const nivel = document.getElementById('filterNivelControl')?.value || '';
  const q = document.getElementById('filterBusqueda')?.value || '';
  const bajoStock = document.getElementById('filterBajoStock')?.checked || false;

  return {
    categoria_id: categoria || undefined,
    nivel_control: nivel || undefined,
    q,
    bajoStock,
  };
}

function tipoProductoBadge(tipo = 'personal') {
  const isConsumible = tipo === 'consumible';
  const color = isConsumible ? '#2563eb' : '#059669';
  const label = isConsumible ? 'Consumible' : 'Personal';
  return `<span style="display:inline-block;padding:2px 8px;background:${color}22;border:1px solid ${color};border-radius:4px;font-size:11px;color:${color}">${label}</span>`;
}

function getProductoFotoSrc(producto) {
  return getEvidenceSrc(producto?.foto_producto || producto?.foto);
}

function renderProductoFotoThumb(producto, size = 64) {
  const src = getProductoFotoSrc(producto);
  if (!src) {
    return `<div style="width:${size}px;height:${size}px;border:1px dashed #555;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;text-align:center;line-height:1.2">Sin foto</div>`;
  }
  return `<button type="button" class="producto-foto-view" data-product-id="${producto.id}" title="Ver foto" style="width:${size}px;height:${size}px;border:0;padding:0;background:transparent;cursor:pointer"><img src="${esc(src)}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid #444"></button>`;
}

function getVarianteLabel(variante) {
  if (!variante) return '—';
  const partes = [variante.talla, variante.modelo, variante.color].filter(Boolean);
  return partes.length ? partes.join(' / ') : (variante.nombre || variante.id || 'Variante');
}

function getMovimientoTipoLabel(tipo) {
  const labels = {
    merma: 'Merma',
    entrada_compra: 'Entrada compra',
    salida_entrega: 'Salida entrega',
    entrada_devolucion: 'Entrada devolución',
    ajuste_positivo: 'Ajuste positivo',
    ajuste_negativo: 'Ajuste negativo',
    salida_merma: 'Salida merma',
  };
  return labels[tipo] || tipo || '—';
}

function renderMovimientoEvidencia(movimiento) {
  const src = getEvidenceSrc(movimiento?.evidencia);
  if (!src) return '<span class="empty-evidence">Sin evidencia</span>';
  return `<button type="button" class="mov-evidencia-view" data-mov-id="${movimiento.id}" title="Ver evidencia" style="width:56px;height:56px;border:0;padding:0;background:transparent;cursor:zoom-in"><img class="evidence-thumb" src="${esc(src)}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #444"></button>`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function openFotoProducto(id) {
  const prod = getProductoById(id);
  const src = getProductoFotoSrc(prod);
  if (!prod || !src) return;
  modal.open(`Foto: ${prod.nombre}`, `
    <div style="text-align:center">
      <img src="${esc(src)}" style="max-width:100%;max-height:70vh;border-radius:8px;object-fit:contain">
    </div>
  `, '<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>', 'lg');
  window.modalClose = () => modal.close();
}

function renderProductos() {
  const filtros = getFilterros();
  const productos = getProductos(filtros);
  const categorias = getCategorias();
  const catMap = Object.fromEntries(categorias.map(c => [c.id, c]));
  const role = getUserRole();
  const isAdmin = role === 'admin';
  const productosVisibles = productos.slice(0, productosVisibleLimit);

  let html = '';

  if (!productos.length) {
    html = `<div style="text-align:center;padding:40px;color:#999">
      <p>No hay productos para mostrar</p>
    </div>`;
  } else if (currentView === 'grid') {
    html = `<div class="products-grid">`;
    productosVisibles.forEach(p => {
      const cat = catMap[p.categoria_id];
      const foto = getProductoFotoSrc(p);
      const bgColor = cat?.color || '#666';
      const tipo = p.tipo || 'personal';
      const nivel = nivelControl(p);

      let stockHtml = '';
      let stockNum = 0;
      if (p.es_por_variante) {
        const totalStock = (p.variantes || []).reduce((s, v) => s + (v.stock_actual || 0), 0);
        stockNum = totalStock;
        stockHtml = `<div style="font-size:24px;font-weight:bold;color:${totalStock > p.stock_minimo ? '#4ade80' : totalStock > 0 ? '#facc15' : '#999'}">${totalStock}</div>`;
      } else {
        stockNum = p.stock_actual || 0;
        const color = stockNum > p.stock_minimo ? '#4ade80' : stockNum > 0 ? '#facc15' : '#999';
        stockHtml = `<div style="font-size:24px;font-weight:bold;color:${color}">${stockNum}</div>`;
      }

      html += `
        <div class="product-card" style="cursor:pointer" data-product-id="${p.id}">
          <div class="product-image" style="background:${foto ? '' : bgColor + '33'}">
            ${foto ? `<button type="button" class="producto-foto-view" data-product-id="${p.id}" title="Ver foto" style="width:100%;height:100%;border:0;padding:0;background:transparent;cursor:zoom-in"><img src="${esc(foto)}" style="width:100%;height:100%;object-fit:cover"></button>` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#999;font-size:13px">Sin foto</div>`}
          </div>
          <div style="padding:12px">
            <div style="font-weight:bold;font-size:14px">${esc(p.nombre)}</div>
            <div style="font-size:12px;color:#999">${esc(p.sku)}</div>
            <div style="margin-top:8px;text-align:center">
              ${stockHtml}
              <div style="font-size:12px;color:#666">Mín: ${p.stock_minimo}</div>
            </div>
            <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
              <span style="display:inline-block;padding:2px 8px;background:${bgColor}33;border:1px solid ${bgColor};border-radius:4px;font-size:11px;color:${bgColor}">${esc(cat?.nombre || 'Sin categoría')}</span>
              ${tipoProductoBadge(tipo)}
              ${nivelControlBadge(nivel)}
            </div>
            ${isAdmin ? `<div style="font-size:12px;color:#999;margin-top:4px">${fmtMoney((p.costo_promedio || 0) * stockNum)}</div>` : ''}
            ${role === 'admin' ? `<button type="button" class="btn btn-warning btn-merma" data-product-id="${p.id}" style="width:100%;margin-top:10px"><i class="fas fa-minus-circle"></i> Ajustar merma</button>` : ''}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  } else {
    // Vista tabla
    html = `<table class="data-table">
      <thead>
        <tr>
          <th>Foto</th>
          <th>SKU</th>
          <th>Producto</th>
          <th>Categoría</th>
          <th>Tipo</th>
          <th>Nivel</th>
          <th>Stock</th>
          ${isAdmin ? '<th>Costo</th><th>Valor</th>' : ''}
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
    `;

    productosVisibles.forEach(p => {
      const cat = catMap[p.categoria_id];
      const tipo = p.tipo || 'personal';
      const nivel = nivelControl(p);
      if (p.es_por_variante) {
        (p.variantes || []).forEach(v => {
          const valor = (v.stock_actual || 0) * (v.ultimo_costo || 0);
          const estado =
            (v.stock_actual || 0) <= (v.stock_minimo || 5)
              ? '<span style="color:#facc15">Bajo</span>'
              : (v.stock_actual || 0) > 0
                ? '<span style="color:#4ade80">OK</span>'
                : '<span style="color:#999">Sin stock</span>';

          html += `
            <tr data-product-id="${p.id}" data-variante-id="${v.id}" class="cursor-pointer">
              <td>${renderProductoFotoThumb(p, 48)}</td>
              <td>${esc(v.sku_variante)}</td>
              <td>${esc(p.nombre)} (${esc(v.nombre)})</td>
              <td>${esc(cat?.nombre || '—')}</td>
              <td>${tipoProductoBadge(tipo)}</td>
              <td>${nivelControlBadge(nivel)}</td>
              <td style="text-align:center;font-weight:bold">${v.stock_actual || 0}</td>
              ${isAdmin ? `<td style="text-align:right">${fmtMoney(v.ultimo_costo || 0)}</td><td style="text-align:right">${fmtMoney(valor)}</td>` : ''}
              <td>${estado}</td>
              <td style="text-align:center">
                ${role === 'admin' ? `<button class="btn-icon btn-ajuste" data-product-id="${p.id}" data-variante-id="${v.id}" title="Ajustar"><i class="fas fa-balance-scale"></i></button>
                <button class="btn btn-warning btn-merma" data-product-id="${p.id}" data-variante-id="${v.id}" title="Ajustar merma" style="padding:4px 8px;font-size:12px"><i class="fas fa-minus-circle"></i> Merma</button>` : ''}
              </td>
            </tr>
          `;
        });
      } else {
        const valor = (p.stock_actual || 0) * (p.costo_promedio || 0);
        const estado =
          (p.stock_actual || 0) <= p.stock_minimo
            ? '<span style="color:#facc15">Bajo</span>'
            : (p.stock_actual || 0) > 0
              ? '<span style="color:#4ade80">OK</span>'
              : '<span style="color:#999">Sin stock</span>';

        html += `
          <tr data-product-id="${p.id}" class="cursor-pointer">
            <td>${renderProductoFotoThumb(p, 48)}</td>
            <td>${esc(p.sku)}</td>
            <td>${esc(p.nombre)}</td>
            <td>${esc(cat?.nombre || '—')}</td>
            <td>${tipoProductoBadge(tipo)}</td>
            <td>${nivelControlBadge(nivel)}</td>
            <td style="text-align:center;font-weight:bold">${p.stock_actual || 0}</td>
            ${isAdmin ? `<td style="text-align:right">${fmtMoney(p.costo_promedio || 0)}</td><td style="text-align:right">${fmtMoney(valor)}</td>` : ''}
            <td>${estado}</td>
            <td style="text-align:center">
              ${role === 'admin' ? `<button class="btn-icon btn-ajuste" data-product-id="${p.id}" title="Ajustar"><i class="fas fa-balance-scale"></i></button>
              <button class="btn btn-warning btn-merma" data-product-id="${p.id}" title="Ajustar merma" style="padding:4px 8px;font-size:12px"><i class="fas fa-minus-circle"></i> Merma</button>` : ''}
            </td>
          </tr>
        `;
      }
    });

    html += `</tbody></table>`;
  }

  if (productos.length > productosVisibleLimit) {
    html += `<div style="text-align:center;margin-top:12px"><button class="btn btn-ghost btn-sm" id="productosVerMas">Ver más</button></div>`;
  }

  const container = document.getElementById('productosContainer');
  container.innerHTML = html;

  // Delegación de eventos (onclick evita acumulación de listeners por cada render)
  container.onclick = e => {
    const fotoBtn = e.target.closest('.producto-foto-view');
    if (fotoBtn) {
      e.stopPropagation();
      openFotoProducto(fotoBtn.dataset.productId);
      return;
    }

    const merma = e.target.closest('.btn-merma');
    if (merma) {
      e.stopPropagation();
      const id = merma.dataset.productId;
      const varId = merma.dataset.varianteId || null;
      if (role === 'admin') {
        openMermaProducto(id, varId);
      }
      return;
    }

    const ajuste = e.target.closest('.btn-ajuste');
    if (ajuste) {
      e.stopPropagation();
      const id = ajuste.dataset.productId;
      const varId = ajuste.dataset.varianteId || null;
      if (role === 'admin') {
        openAjusteStock(id, varId);
      }
      return;
    }

    const card = e.target.closest('.product-card');
    if (card) {
      const id = card.dataset.productId;
      openDetalleProducto(id);
      return;
    }

    const row = e.target.closest('tr[data-product-id]');
    if (row) {
      const id = row.dataset.productId;
      openDetalleProducto(id);
    }
  };

  document.getElementById('productosVerMas')?.addEventListener('click', () => {
    productosVisibleLimit += PAGE_SIZE;
    renderProductos();
  });
}

function openNuevoProducto() {
  const categorias = getCategorias();
  const role = getUserRole();

  let variantesHtml = '';
  let variantesCount = 0;

  const body = `
    <div style="max-height:70vh;overflow-y:auto">
      <div class="form-row c2">
        <div>
          <label>Nombre *</label>
          <input type="text" id="formNombre" placeholder="Ej: Pantalón de vestir" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        </div>
        <div>
          <label>Categoría *</label>
          <select id="formCategoria" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
            <option value="">Seleccionar...</option>
            ${categorias.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row c2">
        <div>
          <label>Unidad</label>
          <select id="formUnidad" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
            <option value="pieza">Pieza</option>
            <option value="caja">Caja</option>
            <option value="kg">Kilogramo</option>
            <option value="litro">Litro</option>
            <option value="paquete">Paquete</option>
            <option value="garrafon">Garrafón</option>
            <option value="bolsa">Bolsa</option>
            <option value="botella">Botella</option>
            <option value="rollo">Rollo</option>
            <option value="par">Par</option>
            <option value="juego">Juego</option>
          </select>
        </div>
        <div>
          <label>Tipo</label>
          <select id="formTipo" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
            <option value="personal">Personal</option>
            <option value="consumible">Consumible</option>
          </select>
        </div>
      </div>

      <div class="form-row c2">
        <div>
          <label>Nivel de control</label>
          <select id="formNivelControl" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
            <option value="1">1 - Control total</option>
            <option value="2">2 - Dotación</option>
            <option value="3" selected>3 - Bajo</option>
            <option value="4">4 - Mínimo</option>
          </select>
        </div>
        <div id="stockMinWrap" style="display:none">
          <label>Stock Mínimo</label>
          <input type="number" id="formStockMin" value="5" min="0" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        </div>
      </div>

      <div class="form-row c2">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="formEntregable"> <span id="formEntregableLabel">¿Se entrega a personal?</span>
        </label>
        <label id="formVarianteWrap" style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="formVariante"> ¿Tiene variantes (talla/modelo/color)?
        </label>
      </div>

      <div>
        <label>Foto de producto</label>
        <input type="file" id="formFoto" accept="image/*" capture="environment" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <div id="fotoPreview" style="margin-top:8px"></div>
      </div>

      <div>
        <label>Proveedor Frecuente (opcional)</label>
        <input type="text" id="formProveedor" placeholder="Ej: ABC Uniformes" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>

      <div>
        <label>Descripción</label>
        <textarea id="formDescripcion" placeholder="Detalles adicionales..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;min-height:80px"></textarea>
      </div>

      <!-- Sección variantes -->
      <div id="variantesSection" style="display:none;margin-top:20px;padding:12px;background:#111;border-radius:4px">
        <h4 style="margin:0 0 12px 0">Variantes</h4>
        <div id="variantesList"></div>
        <button type="button" class="btn btn-secondary" id="btnAddVariante" style="margin-top:8px">+ Agregar Variante</button>
      </div>

      <!-- Preview SKU -->
      <div style="margin-top:12px;padding:8px;background:#111;border-radius:4px">
        <small style="color:#999">SKU Generado:</small>
        <div id="skuPreview" style="font-family:monospace;font-weight:bold;color:#4ade80">—</div>
      </div>
    </div>
  `;

  modal.open('Nuevo Producto', body, `
    <button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button>
    <button class="btn btn-primary" id="formSubmit">Guardar Producto</button>
  `, 'md');

  window.modalClose = () => modal.close();

  // Event listeners
  const nombre = document.getElementById('formNombre');
  const tipoSelect = document.getElementById('formTipo');
  const entregableCheckbox = document.getElementById('formEntregable');
  const entregableLabel = document.getElementById('formEntregableLabel');
  const varianteCheckbox = document.getElementById('formVariante');
  const varianteWrap = document.getElementById('formVarianteWrap');
  const nivelControlSelect = document.getElementById('formNivelControl');
  const stockMinWrap = document.getElementById('stockMinWrap');
  const fotoInput = document.getElementById('formFoto');

  nombre.addEventListener('keyup', () => updateSKUPreview());
  nivelControlSelect.addEventListener('change', updateStockMinVisibility);

  tipoSelect.addEventListener('change', () => {
    const esConsumible = tipoSelect.value === 'consumible';
    if (esConsumible) {
      varianteCheckbox.checked = false;
      entregableCheckbox.checked = true;
      document.getElementById('variantesList').innerHTML = '';
    }
    entregableLabel.textContent = esConsumible ? '¿Se entrega como consumible?' : '¿Se entrega a personal?';
    varianteWrap.style.display = esConsumible ? 'none' : 'flex';
    document.getElementById('variantesSection').style.display = !esConsumible && varianteCheckbox.checked ? 'block' : 'none';
  });

  varianteCheckbox.addEventListener('change', () => {
    document.getElementById('variantesSection').style.display = varianteCheckbox.checked ? 'block' : 'none';
  });

  fotoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!validateImage(file)) {
        e.target.value = '';
        delete fotoInput.dataset.base64;
        document.getElementById('fotoPreview').innerHTML = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('fotoPreview').innerHTML = `<img src="${esc(ev.target.result)}" style="max-width:100px;max-height:100px;border-radius:4px;object-fit:cover">`;
        fotoInput.dataset.base64 = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById('btnAddVariante').addEventListener('click', () => {
    variantesCount++;
    const varId = 'new-' + variantesCount;
    const html = `
      <div style="padding:8px;background:#1f1f1f;border-radius:4px;margin-bottom:8px" id="var-${varId}">
        <div class="form-row c3" style="gap:8px">
          <input type="text" placeholder="Talla (ej: 34)" class="var-talla" style="padding:6px;border:1px solid #444;border-radius:4px;background:#0f0f0f;color:#fff">
          <input type="text" placeholder="Modelo (ej: 2024)" class="var-modelo" style="padding:6px;border:1px solid #444;border-radius:4px;background:#0f0f0f;color:#fff">
          <input type="text" placeholder="Color (ej: Azul)" class="var-color" style="padding:6px;border:1px solid #444;border-radius:4px;background:#0f0f0f;color:#fff">
        </div>
        <button type="button" class="btn-icon btn-danger" style="margin-top:6px" onclick="document.getElementById('var-${varId}').remove()"><i class="fas fa-trash"></i></button>
      </div>
    `;
    document.getElementById('variantesList').insertAdjacentHTML('beforeend', html);
  });

  document.getElementById('formSubmit').addEventListener('click', async () => {
    const nombreVal = nombre.value.trim();
    const categoriaVal = document.getElementById('formCategoria').value;
    const unidadVal = document.getElementById('formUnidad').value;
    const tipoVal = document.getElementById('formTipo').value;
    const nivelControlVal = parseInt(document.getElementById('formNivelControl').value || 3, 10);
    const stockMinVal = nivelControlVal === 1 ? parseInt(document.getElementById('formStockMin').value || 0, 10) : 0;
    const entregableVal = document.getElementById('formEntregable').checked;
    const varianteVal = tipoVal === 'personal' && document.getElementById('formVariante').checked;
    const proveedorVal = document.getElementById('formProveedor').value.trim();
    const descripcionVal = document.getElementById('formDescripcion').value.trim();
    let fotoVal = fotoInput.dataset.base64 || null;

    if (!nombreVal || !categoriaVal) {
      notify('Nombre y categoría son obligatorios', 'error');
      return;
    }
    if (nivelControlVal === 1 && !document.getElementById('formStockMin').value.trim()) {
      notify('Stock mínimo es obligatorio para Nivel 1', 'warning');
      return;
    }

    if (fotoVal) {
      fotoVal = await saveEvidence({
        base64: fotoVal,
        tipo: 'foto',
        entidad: 'producto',
        entidadId: nombreVal,
        filename: 'producto.jpg',
      });
    }

    // Crear producto
    const producto = createProducto({
      nombre: nombreVal,
      categoria_id: categoriaVal,
      descripcion: descripcionVal,
      unidad: unidadVal,
      foto_producto: fotoVal,
      tipo: tipoVal,
      es_entregable: entregableVal,
      es_por_variante: varianteVal,
      stock_minimo: stockMinVal,
      nivel_control: nivelControlVal,
      proveedor_frecuente: proveedorVal,
    });

    // Agregar variantes si aplica
    if (varianteVal) {
      const variantesInputs = document.querySelectorAll('#variantesList > div');
      if (variantesInputs.length === 0) {
        notify('Debes agregar al menos una variante', 'warning');
        return;
      }

      variantesInputs.forEach(el => {
        const talla = el.querySelector('.var-talla').value.trim();
        const modelo = el.querySelector('.var-modelo').value.trim();
        const color = el.querySelector('.var-color').value.trim();

        if (talla || modelo || color) {
          addVariante(producto.id, { talla, modelo, color });
        }
      });
    }

    notify('Producto creado correctamente', 'success');
    modal.close();
    renderProductos();
  });

  function updateSKUPreview() {
    const n = nombre.value.trim();
    const sku = n ? generateSKU(n, null, null) : '—';
    document.getElementById('skuPreview').textContent = sku;
  }

  function updateStockMinVisibility() {
    const isNivel1 = nivelControlSelect.value === '1';
    stockMinWrap.style.display = isNivel1 ? 'block' : 'none';
    if (!isNivel1) document.getElementById('formStockMin').value = '';
  }

  updateSKUPreview();
  updateStockMinVisibility();
}

function openDetalleProducto(id) {
  const prod = getProductoById(id);
  if (!prod) return;

  const categorias = getCategorias();
  const catMap = Object.fromEntries(categorias.map(c => [c.id, c]));
  const cat = catMap[prod.categoria_id];
  const role = getUserRole();
  const isAdmin = role === 'admin';
  const tipo = prod.tipo || 'personal';
  const nivel = nivelControl(prod);

  let movimientos = getMovimientos({ producto_id: id });
  movimientos = movimientos.slice(0, 10);

  const foto = getProductoFotoSrc(prod);
  const stockDisponibleDetalle = prod.es_por_variante
    ? (prod.variantes || []).reduce((total, v) => total + getStockDisponible(prod.id, v.id), 0)
    : getStockDisponible(prod.id, null);

  let variantesHtml = '';
  if (prod.es_por_variante && prod.variantes && prod.variantes.length) {
    variantesHtml = `
      <h4 style="margin-top:12px">Variantes:</h4>
      <table class="data-table">
        <thead>
          <tr><th>Talla</th><th>Modelo</th><th>Color</th><th>SKU</th><th>Stock</th>${isAdmin ? '<th>Costo</th>' : ''}</tr>
        </thead>
        <tbody>
          ${prod.variantes
            .map(
              v => `
            <tr>
              <td>${esc(v.talla || '—')}</td>
              <td>${esc(v.modelo || '—')}</td>
              <td>${esc(v.color || '—')}</td>
              <td>${esc(v.sku_variante)}</td>
              <td>${v.stock_actual || 0}</td>
              ${isAdmin ? `<td>${fmtMoney(v.ultimo_costo || 0)}</td>` : ''}
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  const body = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div id="detalleFotoProducto">
          ${foto ? `<button type="button" class="producto-foto-view" data-product-id="${prod.id}" title="Ver foto" style="width:100%;border:0;padding:0;background:transparent;cursor:zoom-in"><img src="${esc(foto)}" style="width:100%;max-height:300px;border-radius:8px;object-fit:cover"></button>` : `<div style="width:100%;height:200px;background:#222;border:1px dashed #555;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999">Sin foto</div>`}
        </div>
        ${isAdmin ? `<div style="margin-top:10px">
          <label class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
            <i class="fas fa-camera"></i> Tomar / cambiar foto
            <input type="file" id="detalleFotoInput" accept="image/*" capture="environment" style="display:none">
          </label>
        </div>` : ''}
      </div>
      <div>
        <div style="font-size:20px;font-weight:bold">${esc(prod.nombre)}</div>
        <div style="font-size:14px;color:#999">SKU: ${esc(prod.sku)}</div>
        <div style="margin-top:8px">
          <strong>${esc(cat?.nombre || 'Sin categoría')}</strong> | ${esc(prod.unidad)}
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${tipoProductoBadge(tipo)}${nivelControlBadge(nivel)}</div>
        <div style="margin-top:16px">
          <div style="color:#999">Stock Actual:</div>
          <div style="font-size:24px;font-weight:bold;color:#4ade80">${stockDisponibleDetalle}</div>
          <div style="font-size:12px;color:#666">Mínimo: ${prod.stock_minimo}</div>
        </div>
        ${isAdmin ? `<div style="margin-top:12px">
          <div style="color:#999">Costo Promedio:</div>
          <div style="font-size:16px;font-weight:bold">${fmtMoney(prod.costo_promedio || 0)}</div>
        </div>
        <div style="margin-top:12px">
          <div style="color:#999">Valor Total en Inventario:</div>
          <div style="font-size:16px;font-weight:bold">${fmtMoney((prod.stock_actual || 0) * (prod.costo_promedio || 0))}</div>
        </div>` : ''}
        ${prod.descripcion ? `<div style="margin-top:12px;padding:8px;background:#111;border-radius:4px;font-size:13px">${esc(prod.descripcion)}</div>` : ''}
      </div>
    </div>

    ${variantesHtml}

    <h4 style="margin-top:12px">Últimos Movimientos:</h4>
    <table class="data-table">
      <thead>
        <tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Stock</th><th>Motivo</th><th>Usuario</th><th>Evidencia</th></tr>
      </thead>
      <tbody>
        ${movimientos
          .map(
            m => `
          <tr>
            <td>${fmtDate(m.fecha_hora)} ${new Date(m.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
            <td><small>${esc(getMovimientoTipoLabel(m.tipo))}</small></td>
            <td style="text-align:center;color:${m.cantidad > 0 ? '#4ade80' : '#dc2626'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td>
            <td style="text-align:center">${m.stock_despues}</td>
            <td><small>${esc(m.motivo || m.observaciones || '—')}</small></td>
            <td><small>${esc(m.usuario || m.creado_por)}</small></td>
            <td>${renderMovimientoEvidencia(m)}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;

  let footer = `<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>`;
  if (role === 'admin') {
    footer += `<button class="btn btn-warning" id="btnEditar">Editar</button>`;
    footer += `<button class="btn btn-danger" id="btnAjuste">Ajustar Stock</button>`;
    footer += `<button class="btn btn-warning" id="btnMerma"><i class="fas fa-minus-circle"></i> Ajustar merma</button>`;
  }

  modal.open(`Detalle: ${prod.nombre}`, body, footer, 'lg');

  window.modalClose = () => modal.close();

  document.querySelector('#detalleFotoProducto .producto-foto-view')?.addEventListener('click', () => {
    openFotoProducto(id);
  });

  if (role === 'admin') {
    document.getElementById('detalleFotoInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!validateImage(file)) {
        e.target.value = '';
        return;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        const preview = document.getElementById('detalleFotoProducto');
        if (preview) {
          preview.innerHTML = `<button type="button" class="producto-foto-view" data-product-id="${prod.id}" title="Ver foto" style="width:100%;border:0;padding:0;background:transparent;cursor:zoom-in"><img src="${esc(dataUrl)}" style="width:100%;max-height:300px;border-radius:8px;object-fit:cover"></button>`;
          preview.querySelector('.producto-foto-view')?.addEventListener('click', () => openFotoProducto(id));
        }
        const evidencia = await saveEvidence({
          base64: dataUrl,
          tipo: 'foto',
          entidad: 'producto',
          entidadId: prod.id,
          filename: 'producto.jpg',
        });
        updateProducto(id, { foto_producto: evidencia });
        notify('Foto de producto actualizada', 'success');
        renderProductos();
      } catch (err) {
        notify(err.message || 'No se pudo guardar la foto', 'error');
      }
    });

    document.getElementById('btnEditar')?.addEventListener('click', () => {
      openEditarNivelControl(id);
    });

    document.getElementById('btnAjuste')?.addEventListener('click', () => {
      modal.close();
      openAjusteStock(id, null);
    });

    document.getElementById('btnMerma')?.addEventListener('click', () => {
      modal.close();
      openMermaProducto(id, null);
    });
  }

  document.querySelectorAll('.mov-evidencia-view').forEach(btn => {
    btn.addEventListener('click', () => {
      const mov = movimientos.find(m => m.id === btn.dataset.movId);
      const src = getEvidenceSrc(mov?.evidencia);
      if (!src) return;
      modal.open('Evidencia de merma', `
        <div style="text-align:center">
          <img src="${esc(src)}" style="max-width:100%;max-height:70vh;border-radius:8px;object-fit:contain">
        </div>
      `, '<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>', 'lg');
      window.modalClose = () => modal.close();
    });
  });
}

function openEditarNivelControl(id) {
  const prod = getProductoById(id);
  if (!prod) return;
  const nivel = nivelControl(prod);
  const body = `
    <div class="form-row c2">
      <div>
        <label>Nivel de control</label>
        <select id="editNivelControl" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="1" ${nivel === 1 ? 'selected' : ''}>1 - Control total</option>
          <option value="2" ${nivel === 2 ? 'selected' : ''}>2 - Dotación</option>
          <option value="3" ${nivel === 3 ? 'selected' : ''}>3 - Bajo</option>
          <option value="4" ${nivel === 4 ? 'selected' : ''}>4 - Mínimo</option>
        </select>
      </div>
      <div id="editStockMinWrap">
        <label>Stock Mínimo</label>
        <input type="number" id="editStockMin" value="${Number(prod.stock_minimo || 0)}" min="0" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>
    </div>
  `;
  modal.open('Editar nivel de control', body, '<button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button><button class="btn btn-primary" id="editNivelSave">Guardar</button>', 'md');
  window.modalClose = () => modal.close();
  const nivelSelect = document.getElementById('editNivelControl');
  const stockWrap = document.getElementById('editStockMinWrap');
  function syncStockMin() {
    const isNivel1 = nivelSelect.value === '1';
    stockWrap.style.display = isNivel1 ? 'block' : 'none';
    if (!isNivel1) document.getElementById('editStockMin').value = '';
  }
  nivelSelect.addEventListener('change', syncStockMin);
  syncStockMin();
  document.getElementById('editNivelSave')?.addEventListener('click', () => {
    const nivelVal = parseInt(nivelSelect.value || 3, 10);
    if (nivelVal === 1 && !document.getElementById('editStockMin').value.trim()) {
      notify('Stock mínimo es obligatorio para Nivel 1', 'warning');
      return;
    }
    const stockMinVal = nivelVal === 1 ? parseInt(document.getElementById('editStockMin').value || 0, 10) : 0;
    updateProducto(id, { nivel_control: nivelVal, stock_minimo: stockMinVal });
    notify('Nivel de control actualizado', 'success');
    modal.close();
    renderProductos();
  });
}

function openMermaProducto(id, variante_id = null) {
  const prod = getProductoById(id);
  if (!prod) return;

  const variantes = Array.isArray(prod.variantes) ? prod.variantes : [];
  const usaVariantes = prod.es_por_variante && variantes.length > 0;
  const user = getUser();

  const varianteOptions = usaVariantes
    ? variantes.map(v => {
      const stock = getStockDisponible(prod.id, v.id);
      const selected = variante_id === v.id ? 'selected' : '';
      return `<option value="${esc(v.id)}" ${selected}>${esc(getVarianteLabel(v))} - Stock ${stock}</option>`;
    }).join('')
    : '';

  const stockInicial = usaVariantes && variante_id
    ? getStockDisponible(prod.id, variante_id)
    : usaVariantes
      ? 0
      : getStockDisponible(prod.id, null);

  const body = `
    <div style="display:grid;gap:12px">
      <div>
        <label>Producto</label>
        <input type="text" value="${esc(prod.nombre)}" readonly style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#111;color:#fff">
      </div>

      ${usaVariantes ? `<div>
        <label>Talla / variante *</label>
        <select id="mermaVariante" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Seleccionar variante...</option>
          ${varianteOptions}
        </select>
      </div>` : ''}

      <div style="padding:8px;background:#111;border-radius:4px">
        <div style="color:#999;font-size:13px">Stock disponible actual</div>
        <div id="mermaStockDisponible" style="font-size:22px;font-weight:bold;color:#4ade80">${stockInicial}</div>
      </div>

      <div>
        <label>Cantidad a descontar *</label>
        <input type="number" id="mermaCantidad" min="1" step="1" value="1" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
      </div>

      <div>
        <label>Motivo *</label>
        <select id="mermaMotivo" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Seleccionar...</option>
          <option value="Daño">Daño</option>
          <option value="Caducidad">Caducidad</option>
          <option value="Pérdida">Pérdida</option>
          <option value="Robo interno">Robo interno</option>
          <option value="Error operativo">Error operativo</option>
          <option value="Otro">Otro</option>
        </select>
      </div>

      <div>
        <label>Descripción / observaciones</label>
        <textarea id="mermaDescripcion" placeholder="Describe la causa o contexto de la merma..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;min-height:80px"></textarea>
      </div>

      <div>
        <label>Evidencia opcional</label>
        <input type="file" id="mermaEvidencia" accept="image/*" capture="environment" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        <div id="mermaEvidenciaPreview" style="margin-top:8px;color:#999;font-size:13px"><span class="empty-evidence">Sin evidencia</span></div>
      </div>
    </div>
  `;

  modal.open('Ajuste por merma', body, `
    <button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button>
    <button class="btn btn-primary" id="mermaSubmit">Registrar merma</button>
  `, 'md');

  window.modalClose = () => modal.close();

  const varianteSelect = document.getElementById('mermaVariante');
  const cantidadInput = document.getElementById('mermaCantidad');
  const evidenciaInput = document.getElementById('mermaEvidencia');

  function selectedVarianteId() {
    return usaVariantes ? (varianteSelect?.value || '') : null;
  }

  function selectedStock() {
    const selected = selectedVarianteId();
    if (usaVariantes && !selected) return 0;
    return getStockDisponible(prod.id, selected || null);
  }

  function syncStockDisponible() {
    const stock = selectedStock();
    const stockEl = document.getElementById('mermaStockDisponible');
    if (stockEl) stockEl.textContent = stock;
  }

  varianteSelect?.addEventListener('change', syncStockDisponible);
  cantidadInput?.addEventListener('input', syncStockDisponible);

  evidenciaInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const preview = document.getElementById('mermaEvidenciaPreview');
    if (!file) {
      delete evidenciaInput.dataset.base64;
      if (preview) preview.innerHTML = '<span class="empty-evidence">Sin evidencia</span>';
      return;
    }
    if (!validateImage(file)) {
      e.target.value = '';
      delete evidenciaInput.dataset.base64;
      if (preview) preview.innerHTML = '<span class="empty-evidence">Sin evidencia</span>';
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      evidenciaInput.dataset.base64 = dataUrl;
      if (preview) {
        preview.innerHTML = `<img class="evidence-thumb" src="${esc(dataUrl)}" style="width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #444">`;
      }
    } catch (err) {
      notify(err.message || 'No se pudo leer la evidencia', 'error');
    }
  });

  document.getElementById('mermaSubmit')?.addEventListener('click', async () => {
    const cantidad = Number(cantidadInput?.value || 0);
    const motivo = document.getElementById('mermaMotivo')?.value || '';
    const descripcion = document.getElementById('mermaDescripcion')?.value.trim() || '';
    const varianteSeleccionada = selectedVarianteId();
    const stock = selectedStock();

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      notify('Cantidad inválida', 'error');
      return;
    }
    if (!motivo) {
      notify('El motivo es obligatorio', 'error');
      return;
    }
    if (usaVariantes && !varianteSeleccionada) {
      notify('Selecciona una talla/variante', 'error');
      return;
    }
    if (cantidad > stock) {
      notify('Stock insuficiente para registrar merma', 'error');
      return;
    }
    if (!window.confirm('¿Seguro que deseas registrar esta merma? Esta acción no se puede deshacer.')) {
      return;
    }

    let evidencia = null;
    if (evidenciaInput?.dataset.base64) {
      evidencia = await saveEvidence({
        base64: evidenciaInput.dataset.base64,
        tipo: 'merma',
        entidad: 'inventario',
        entidadId: prod.id,
        filename: evidenciaInput.files?.[0]?.name || 'merma.jpg',
      });
    }

    const resultado = registrarMerma({
      producto_id: prod.id,
      producto_nombre: prod.nombre,
      cantidad,
      talla: varianteSeleccionada,
      motivo,
      descripcion,
      evidencia,
      usuario: user?.name || 'Sistema',
    });

    if (!resultado.ok) {
      notify(resultado.error || 'No se pudo registrar merma', 'error');
      return;
    }

    notify('Merma registrada correctamente', 'success');
    modal.close();
    renderProductos();
  });

  syncStockDisponible();
}

function openAjusteStock(id, variante_id) {
  const prod = getProductoById(id);
  if (!prod) return;

  let stockActual = 0;
  if (variante_id) {
    const var_obj = prod.variantes?.find(v => v.id === variante_id);
    stockActual = var_obj ? (var_obj.stock_actual || 0) : 0;
  } else {
    stockActual = prod.stock_actual || 0;
  }

  const body = `
    <div class="form-row c2">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="radio" name="tipo" value="positivo" checked> Sumar Stock
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="radio" name="tipo" value="negativo"> Restar Stock
      </label>
    </div>

    <div>
      <label>Cantidad</label>
      <input type="number" id="ajusteQuantidad" min="1" value="1" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
    </div>

    <div>
      <label>Motivo *</label>
      <input type="text" id="ajusteMotivo" placeholder="Descripción del ajuste" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
    </div>

    <div style="padding:8px;background:#111;border-radius:4px;margin-top:12px">
      <div style="color:#999;font-size:13px">Stock Actual: ${stockActual}</div>
      <div style="color:#999;font-size:13px">Nuevo Stock: <span id="nuevoStock" style="color:#4ade80;font-weight:bold">${stockActual}</span></div>
    </div>
  `;

  modal.open('Ajustar Stock', body, `
    <button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button>
    <button class="btn btn-primary" id="ajusteSubmit">Registrar Ajuste</button>
  `, 'md');

  window.modalClose = () => modal.close();

  const cantInput = document.getElementById('ajusteQuantidad');
  cantInput.addEventListener('keyup', () => {
    const tipo = document.querySelector('input[name="tipo"]:checked').value;
    const cantidad = parseInt(cantInput.value || 0, 10);
    const nuevo = tipo === 'positivo' ? stockActual + cantidad : stockActual - cantidad;
    document.getElementById('nuevoStock').textContent = Math.max(0, nuevo);
  });

  document.getElementById('ajusteSubmit').addEventListener('click', () => {
    const tipo = document.querySelector('input[name="tipo"]:checked').value;
    const cantidad = parseInt(cantInput.value || 0, 10);
    const motivo = document.getElementById('ajusteMotivo').value.trim();

    if (!cantidad || cantidad <= 0) {
      notify('Cantidad inválida', 'error');
      return;
    }
    if (!motivo) {
      notify('El motivo es obligatorio', 'error');
      return;
    }

    const resultado = registrarMovimiento({
      tipo: tipo === 'positivo' ? 'ajuste_positivo' : 'ajuste_negativo',
      producto_id: id,
      variante_id: variante_id || null,
      cantidad: tipo === 'positivo' ? cantidad : -cantidad,
      observaciones: motivo,
    });

    if (!resultado.ok) {
      notify(resultado.error || 'Error al registrar ajuste', 'error');
      return;
    }

    notify('Ajuste registrado', 'success');
    modal.close();
    renderProductos();
  });
}
