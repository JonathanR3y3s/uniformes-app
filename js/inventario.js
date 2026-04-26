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
  getMovimientos,
  generateSKU,
} from './almacen-api.js';

let currentPage = 1;
let currentView = 'grid'; // 'grid' o 'tabla'

export function render() {
  const role = getUserRole();
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
        <div class="kpi-card">
          <div class="kpi-value">${fmtMoney(valorTotal)}</div>
          <div class="kpi-label">Valor Total</div>
        </div>
      </div>

      <!-- Filtros -->
      <div class="filters-section">
        <select id="filterCategoria" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todas las Categorías</option>
          ${categorias.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
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
    renderProductos();
  });

  document.getElementById('btnLimpiarFiltros')?.addEventListener('click', () => {
    document.getElementById('filterCategoria').value = '';
    document.getElementById('filterBusqueda').value = '';
    document.getElementById('filterBajoStock').checked = false;
    renderProductos();
  });

  document.getElementById('filterCategoria')?.addEventListener('change', renderProductos);
  document.getElementById('filterBusqueda')?.addEventListener('keyup', () => setTimeout(renderProductos, 300));
  document.getElementById('filterBajoStock')?.addEventListener('change', renderProductos);

  renderProductos();
}

function getFilterros() {
  const categoria = document.getElementById('filterCategoria')?.value || '';
  const q = document.getElementById('filterBusqueda')?.value || '';
  const bajoStock = document.getElementById('filterBajoStock')?.checked || false;

  return {
    categoria_id: categoria || undefined,
    q,
    bajoStock,
  };
}

function renderProductos() {
  const filtros = getFilterros();
  const productos = getProductos(filtros);
  const categorias = getCategorias();
  const catMap = Object.fromEntries(categorias.map(c => [c.id, c]));
  const role = getUserRole();

  let html = '';

  if (!productos.length) {
    html = `<div style="text-align:center;padding:40px;color:#999">
      <p>No hay productos para mostrar</p>
    </div>`;
  } else if (currentView === 'grid') {
    html = `<div class="products-grid">`;
    productos.forEach(p => {
      const cat = catMap[p.categoria_id];
      const foto = p.foto ? `data:image/png;base64,${p.foto}` : null;
      const bgColor = cat?.color || '#666';

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
            ${foto ? `<img src="${foto}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-box" style="font-size:48px;color:${bgColor}"></i>`}
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
            </div>
            <div style="font-size:12px;color:#999;margin-top:4px">${fmtMoney((p.costo_promedio || 0) * stockNum)}</div>
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
          <th>SKU</th>
          <th>Producto</th>
          <th>Categoría</th>
          <th>Stock</th>
          <th>Costo</th>
          <th>Valor</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
    `;

    productos.forEach(p => {
      const cat = catMap[p.categoria_id];
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
              <td>${esc(v.sku_variante)}</td>
              <td>${esc(p.nombre)} (${esc(v.nombre)})</td>
              <td>${esc(cat?.nombre || '—')}</td>
              <td style="text-align:center;font-weight:bold">${v.stock_actual || 0}</td>
              <td style="text-align:right">${fmtMoney(v.ultimo_costo || 0)}</td>
              <td style="text-align:right">${fmtMoney(valor)}</td>
              <td>${estado}</td>
              <td style="text-align:center">
                ${role === 'admin' ? `<button class="btn-icon btn-ajuste" data-product-id="${p.id}" data-variante-id="${v.id}" title="Ajustar"><i class="fas fa-balance-scale"></i></button>` : ''}
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
            <td>${esc(p.sku)}</td>
            <td>${esc(p.nombre)}</td>
            <td>${esc(cat?.nombre || '—')}</td>
            <td style="text-align:center;font-weight:bold">${p.stock_actual || 0}</td>
            <td style="text-align:right">${fmtMoney(p.costo_promedio || 0)}</td>
            <td style="text-align:right">${fmtMoney(valor)}</td>
            <td>${estado}</td>
            <td style="text-align:center">
              ${role === 'admin' ? `<button class="btn-icon btn-ajuste" data-product-id="${p.id}" title="Ajustar"><i class="fas fa-balance-scale"></i></button>` : ''}
            </td>
          </tr>
        `;
      }
    });

    html += `</tbody></table>`;
  }

  const container = document.getElementById('productosContainer');
  container.innerHTML = html;

  // Delegación de eventos (onclick evita acumulación de listeners por cada render)
  container.onclick = e => {
    const card = e.target.closest('.product-card');
    if (card) {
      const id = card.dataset.productId;
      openDetalleProducto(id);
      return;
    }

    const row = e.target.closest('tr[data-product-id]');
    if (row && !e.target.closest('.btn-ajuste')) {
      const id = row.dataset.productId;
      openDetalleProducto(id);
      return;
    }

    const ajuste = e.target.closest('.btn-ajuste');
    if (ajuste) {
      const id = ajuste.dataset.productId;
      const varId = ajuste.dataset.varianteId || null;
      if (role === 'admin') {
        openAjusteStock(id, varId);
      }
    }
  };
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
          <label>Stock Mínimo</label>
          <input type="number" id="formStockMin" value="5" min="0" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
        </div>
      </div>

      <div class="form-row c2">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="formEntregable"> ¿Se entrega a personal?
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="formVariante"> ¿Tiene variantes (talla/modelo/color)?
        </label>
      </div>

      <div>
        <label>Foto (Base64)</label>
        <input type="file" id="formFoto" accept="image/*" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
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
  const varianteCheckbox = document.getElementById('formVariante');
  const fotoInput = document.getElementById('formFoto');

  nombre.addEventListener('keyup', () => updateSKUPreview());

  varianteCheckbox.addEventListener('change', () => {
    document.getElementById('variantesSection').style.display = varianteCheckbox.checked ? 'block' : 'none';
  });

  fotoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(',')[1];
        document.getElementById('fotoPreview').innerHTML = `<img src="data:image/png;base64,${base64}" style="max-width:100px;max-height:100px;border-radius:4px">`;
        fotoInput.dataset.base64 = base64;
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
    const stockMinVal = parseInt(document.getElementById('formStockMin').value || 5, 10);
    const entregableVal = document.getElementById('formEntregable').checked;
    const varianteVal = document.getElementById('formVariante').checked;
    const proveedorVal = document.getElementById('formProveedor').value.trim();
    const descripcionVal = document.getElementById('formDescripcion').value.trim();
    const fotoVal = fotoInput.dataset.base64 || null;

    if (!nombreVal || !categoriaVal) {
      notify('Nombre y categoría son obligatorios', 'error');
      return;
    }

    // Crear producto
    const producto = createProducto({
      nombre: nombreVal,
      categoria_id: categoriaVal,
      descripcion: descripcionVal,
      unidad: unidadVal,
      foto: fotoVal,
      es_entregable: entregableVal,
      es_por_variante: varianteVal,
      stock_minimo: stockMinVal,
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

  updateSKUPreview();
}

function openDetalleProducto(id) {
  const prod = getProductoById(id);
  if (!prod) return;

  const categorias = getCategorias();
  const catMap = Object.fromEntries(categorias.map(c => [c.id, c]));
  const cat = catMap[prod.categoria_id];
  const role = getUserRole();

  let movimientos = getMovimientos({ producto_id: id });
  movimientos = movimientos.slice(0, 10);

  const foto = prod.foto ? `data:image/png;base64,${prod.foto}` : null;

  let variantesHtml = '';
  if (prod.es_por_variante && prod.variantes && prod.variantes.length) {
    variantesHtml = `
      <h4 style="margin-top:12px">Variantes:</h4>
      <table class="data-table">
        <thead>
          <tr><th>Talla</th><th>Modelo</th><th>Color</th><th>SKU</th><th>Stock</th><th>Costo</th></tr>
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
              <td>${fmtMoney(v.ultimo_costo || 0)}</td>
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
        ${foto ? `<img src="${foto}" style="width:100%;max-height:300px;border-radius:8px;object-fit:cover">` : `<div style="width:100%;height:200px;background:#222;border-radius:8px;display:flex;align-items:center;justify-content:center"><i class="fas fa-box" style="font-size:48px;color:#666"></i></div>`}
      </div>
      <div>
        <div style="font-size:20px;font-weight:bold">${esc(prod.nombre)}</div>
        <div style="font-size:14px;color:#999">SKU: ${esc(prod.sku)}</div>
        <div style="margin-top:8px">
          <strong>${esc(cat?.nombre || 'Sin categoría')}</strong> | ${esc(prod.unidad)}
        </div>
        <div style="margin-top:16px">
          <div style="color:#999">Stock Actual:</div>
          <div style="font-size:24px;font-weight:bold;color:#4ade80">${prod.stock_actual || 0}</div>
          <div style="font-size:12px;color:#666">Mínimo: ${prod.stock_minimo}</div>
        </div>
        <div style="margin-top:12px">
          <div style="color:#999">Costo Promedio:</div>
          <div style="font-size:16px;font-weight:bold">${fmtMoney(prod.costo_promedio || 0)}</div>
        </div>
        <div style="margin-top:12px">
          <div style="color:#999">Valor Total en Inventario:</div>
          <div style="font-size:16px;font-weight:bold">${fmtMoney((prod.stock_actual || 0) * (prod.costo_promedio || 0))}</div>
        </div>
        ${prod.descripcion ? `<div style="margin-top:12px;padding:8px;background:#111;border-radius:4px;font-size:13px">${esc(prod.descripcion)}</div>` : ''}
      </div>
    </div>

    ${variantesHtml}

    <h4 style="margin-top:12px">Últimos Movimientos:</h4>
    <table class="data-table">
      <thead>
        <tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Stock</th><th>Usuario</th></tr>
      </thead>
      <tbody>
        ${movimientos
          .map(
            m => `
          <tr>
            <td>${fmtDate(m.fecha_hora)} ${new Date(m.fecha_hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
            <td><small>${m.tipo}</small></td>
            <td style="text-align:center;color:${m.cantidad > 0 ? '#4ade80' : '#dc2626'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td>
            <td style="text-align:center">${m.stock_despues}</td>
            <td><small>${esc(m.creado_por)}</small></td>
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
  }

  modal.open(`Detalle: ${prod.nombre}`, body, footer, 'lg');

  window.modalClose = () => modal.close();

  if (role === 'admin') {
    document.getElementById('btnEditar')?.addEventListener('click', () => {
      notify('Edición aún no implementada', 'info');
    });

    document.getElementById('btnAjuste')?.addEventListener('click', () => {
      modal.close();
      openAjusteStock(id, null);
    });
  }
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
