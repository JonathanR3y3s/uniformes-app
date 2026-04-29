/**
 * ENTREGAS A PERSONAL (NUEVO MODELO)
 * Módulo para gestión de entregas de productos a personal
 */

import { getStore, saveEntregasNuevas } from './storage.js';
import { esc, fmtDate } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole, getUser } from './user-roles.js';
import { getEntregasNuevas, registrarEntregaNueva, getProductos, createProducto, getStockDisponible as getStockDisponibleOficial } from './almacen-api.js';
import { saveEvidence, getEvidenceSrc } from './evidence-storage.js';

let _entregasWizardHandler = null;

function detachEntregasWizardHandler() {
  if (_entregasWizardHandler) {
    document.removeEventListener('click', _entregasWizardHandler, true);
    _entregasWizardHandler = null;
  }
}

function getTallaLinea(producto, linea) {
  if (!producto || !linea) return '';
  if (linea.variante_id) {
    const variante = (producto.variantes || []).find(v => v.id === linea.variante_id);
    return variante?.talla || variante?.nombre || '';
  }
  return linea.talla || '';
}

export function render() {
  const entregasNuevas = getEntregasNuevas();
  const mesActual = new Date().toISOString().slice(0, 7);
  const entregazMes = entregasNuevas.filter(e => e.fecha_hora.startsWith(mesActual));
  const totalPiezas = entregazMes.reduce((sum, e) => {
    const lineas = getStore().lineasEntrega.filter(l => l.entrega_id === e.id);
    return sum + lineas.reduce((s, l) => s + l.cantidad, 0);
  }, 0);

  const empleadosUnicos = new Set(entregazMes.map(e => e.empleado_id)).size;

  let html = `
    <div class="page-content">
      <div class="page-head">
        <div class="page-title">Entregar a Personal</div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnNuevaEntrega"><i class="fas fa-handshake"></i> Nueva Entrega</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">${entregazMes.length}</div>
          <div class="kpi-label">Entregas Este Mes</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${totalPiezas}</div>
          <div class="kpi-label">Piezas Entregadas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${empleadosUnicos}</div>
          <div class="kpi-label">Empleados Atendidos</div>
        </div>
      </div>

      <div class="filters-section">
        <input type="text" id="filterEmpleado" placeholder="Filtrar por empleado..." style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;flex:1">
        <select id="filterArea" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Todas las áreas</option>
          ${(getStore().areas || []).filter(a => a.activa !== false).map(a => `<option value="${a.nombre}">${a.nombre}</option>`).join('')}
        </select>
      </div>

      <div id="entregasContainer" style="margin-top:20px"></div>
    </div>
  `;

  return html;
}

export function init() {
  document.getElementById('btnNuevaEntrega')?.addEventListener('click', openNuevaEntrega);
  document.getElementById('filterEmpleado')?.addEventListener('keyup', renderEntregas);
  document.getElementById('filterArea')?.addEventListener('change', renderEntregas);

  renderEntregas();
}

function renderEntregas() {
  const empleado = document.getElementById('filterEmpleado')?.value || '';
  const area = document.getElementById('filterArea')?.value || '';

  let entregasNuevas = getEntregasNuevas();
  if (empleado) entregasNuevas = entregasNuevas.filter(e => ((e.quien_recibe || e.empleado_nombre || '').toLowerCase().includes(empleado.toLowerCase())));
  if (area) entregasNuevas = entregasNuevas.filter(e => e.area === area);

  let html = `<table class="data-table"><thead><tr><th>Número</th><th>Recibe</th><th>Tipo</th><th>Área</th><th>Motivo</th><th>Artículos</th><th>Piezas</th><th>Fecha</th><th>Firma</th><th>Acciones</th></tr></thead><tbody>`;

  if (entregasNuevas.length === 0) {
    html += `<tr><td colspan="10" style="text-align:center;padding:20px;color:#999">Sin entregas registradas</td></tr>`;
  } else {
    entregasNuevas.forEach(e => {
      const lineas = getStore().lineasEntrega.filter(l => l.entrega_id === e.id);
      const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
      const firmaIcon = (e.firma_recibe || e.firma) ? '<i class="fas fa-check" style="color:#4ade80"></i>' : '<span style="background:#7f1d1d;color:#fecaca;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px">SIN FIRMA</span>';
      const recibe = e.quien_recibe || e.empleado_nombre || '—';

      html += `
        <tr>
          <td><strong>${esc(e.numero)}</strong></td>
          <td>${esc(recibe)}</td>
          <td><small>${esc(e.tipo_entrega || 'dotacion')}</small></td>
          <td>${esc(e.area)}</td>
          <td><small>${esc(e.motivo || e.observaciones || '')}</small></td>
          <td style="text-align:center">${lineas.length}</td>
          <td style="text-align:center;font-weight:bold">${piezas}</td>
          <td><small>${fmtDate(e.fecha_hora)}</small></td>
          <td style="text-align:center">${firmaIcon}</td>
          <td style="text-align:center">
            <button class="btn-icon" data-entrega-id="${e.id}" title="Ver detalles"><i class="fas fa-eye"></i></button>
            <button class="btn-icon btn-imprimir" data-entrega-id="${e.id}" title="Imprimir"><i class="fas fa-print"></i></button>
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table>`;
  const container = document.getElementById('entregasContainer');
  container.innerHTML = html;

  container.onclick = e => {
    const verBtn = e.target.closest('button:not(.btn-imprimir)');
    if (verBtn && verBtn.dataset.entregaId) {
      openDetalleEntrega(verBtn.dataset.entregaId);
      return;
    }

    const impBtn = e.target.closest('.btn-imprimir');
    if (impBtn) {
      imprimirRecibo(impBtn.dataset.entregaId);
    }
  };
}

function openNuevaEntrega() {
  const empleados = getStore().employees || [];
  const rol = getUserRole();

  if (rol !== 'admin' && rol !== 'operador') {
    notify('No tienes permiso para crear entregas', 'error');
    return;
  }

  let paso = 1;
  let datos = {
    tipo_receptor: 'empleado',
    receptor_ocasional: null,
    tipo_entrega: 'dotacion',
    empleado_id: '',
    empleado_nombre: '',
    area: '',
    quien_recibe: '',
    motivo: '',
    observaciones: '',
    autorizado_por: '',
    lineas: [],
    firma: null,
  };

  function getStockDisponible(producto, varianteId = null) {
    return producto ? getStockDisponibleOficial(producto.id, varianteId) : 0;
  }

  function getTallaLinea(producto, linea) {
    if (!producto || !linea) return '';
    if (linea.variante_id) {
      const variante = (producto.variantes || []).find(v => v.id === linea.variante_id);
      return variante?.talla || variante?.nombre || '';
    }
    return linea.talla || '';
  }

  function validarLineasStock() {
    for (const linea of datos.lineas) {
      const producto = getStore().productos.find(p => p.id === linea.producto_id);
      const stock = getStockDisponible(producto, linea.variante_id || null);
      const talla = getTallaLinea(producto, linea);
      if (!producto || stock < linea.cantidad) {
        notify('Sin stock de ' + (producto?.nombre || 'producto') + (talla ? ' talla ' + talla : ''), 'error');
        return false;
      }
    }
    return true;
  }

  function canvasTieneFirma(canvas) {
    if (!canvas) return false;
    const emptyCanvas = document.createElement('canvas');
    emptyCanvas.width = canvas.width;
    emptyCanvas.height = canvas.height;
    return canvas.toDataURL('image/png') !== emptyCanvas.toDataURL('image/png');
  }

  showPaso();

  function showPaso() {
    let body = '';

    if (paso === 1) {
      body = `
        <label>Tipo receptor</label>
        <select id="tipoReceptor" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:12px">
          <option value="empleado" ${datos.tipo_receptor === 'empleado' ? 'selected' : ''}>Empleado</option>
          <option value="ocasional" ${datos.tipo_receptor === 'ocasional' ? 'selected' : ''}>Ocasional</option>
        </select>
        <label>Tipo de entrega</label>
        <select id="tipoEntrega" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:12px">
          <option value="dotacion" ${datos.tipo_entrega === 'dotacion' ? 'selected' : ''}>Dotación</option>
          <option value="reemplazo" ${datos.tipo_entrega === 'reemplazo' ? 'selected' : ''}>Reemplazo</option>
          <option value="individual" ${datos.tipo_entrega === 'individual' ? 'selected' : ''}>Individual</option>
          <option value="consumible" ${datos.tipo_entrega === 'consumible' ? 'selected' : ''}>Consumible</option>
        </select>
        <div id="personalEntregaBox" style="${datos.tipo_entrega === 'consumible' || datos.tipo_receptor === 'ocasional' ? 'display:none;' : ''}">
          <label>Empleado *</label>
          <select id="emp" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
            <option value="">Seleccionar...</option>
            ${empleados.filter(e => e.estado === 'activo').map(e => `<option value="${e.id}" ${datos.empleado_id === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
          </select>
        </div>
        <div id="ocasionalEntregaBox" style="${datos.tipo_receptor === 'ocasional' ? '' : 'display:none;'}">
          <label>Nombre receptor ocasional *</label>
          <input type="text" id="receptorOcasionalNombre" value="${esc(datos.receptor_ocasional?.nombre || '')}" placeholder="Nombre completo" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
          <label>Relación</label>
          <select id="receptorOcasionalRelacion" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
            ${['visitante','contratista','proveedor','otro'].map(r => `<option value="${r}" ${datos.receptor_ocasional?.relacion === r ? 'selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div id="consumibleEntregaBox" style="${datos.tipo_entrega === 'consumible' ? '' : 'display:none;'}padding:10px;background:#111;border-radius:4px;font-size:13px;color:#ddd">
          Recibe: <strong>Supervisora de Limpieza</strong>
        </div>
        <div id="tallasBox" style="margin-top:12px;padding:8px;background:#111;border-radius:4px;font-size:12px;color:#999;${datos.tipo_entrega === 'consumible' || datos.tipo_receptor === 'ocasional' ? 'display:none;' : ''}">
          <p>Tallas capturadas: <span id="tallasInfo">—</span></p>
          <p>Última entrega: <span id="ultEntregaInfo">—</span></p>
        </div>
      `;
    } else if (paso === 2) {
      body = `
        <label>Motivo</label>
        <input type="text" id="motivo" value="${esc(datos.motivo || '')}" placeholder="Motivo opcional de la entrega" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:12px">
        <label>Observaciones</label>
        <textarea id="observaciones" placeholder="Observaciones opcionales" style="width:100%;min-height:90px;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:12px">${esc(datos.observaciones || '')}</textarea>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="requiereAutoriza"> Requiere autorización
        </label>
        <input type="text" id="autoriza" placeholder="Autorizado por..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-top:8px;display:none">
      `;
    } else if (paso === 3) {
      const productoTipo = datos.tipo_entrega === 'consumible' ? 'consumible' : 'personal';
      const productos = getProductos({ soloEntregables: true, tipo: productoTipo });
      body = `
        <input type="text" id="searchProd" placeholder="Buscar producto por nombre o SKU..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <div id="prodList" style="max-height:150px;overflow-y:auto;margin-bottom:12px"></div>
        <div id="prodSelectedBox" style="margin-bottom:12px"></div>
        <div id="quickProductBox" style="display:none;margin-bottom:12px;padding:10px;background:#111;border:1px solid #444;border-radius:4px">
          <p class="font-bold" style="margin-bottom:8px">Agregar producto al catálogo</p>
          <input type="text" id="quickProdNombre" placeholder="Nombre" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
          <input type="text" id="quickProdSku" placeholder="SKU / referencia" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
          <select id="quickProdTipo" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
            <option value="personal">Personal</option>
            <option value="consumible">Consumible</option>
          </select>
          <select id="quickProdCategoria" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
            ${(getStore().categorias || []).filter(c => c.activa !== false).map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="btnCrearProductoRapido" style="width:100%"><i class="fas fa-box"></i> Crear producto</button>
          <p class="text-xs text-muted" style="margin-top:6px">La API genera el SKU interno automáticamente.</p>
        </div>
        <input type="number" id="cantidad" min="1" value="1" placeholder="Cantidad" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <button class="btn btn-success" id="btnAgregar" style="width:100%"><i class="fas fa-plus"></i> Agregar</button>
        <div id="lineasList" style="margin-top:12px;max-height:200px;overflow-y:auto"></div>
      `;
    } else if (paso === 4) {
      const receptorFirma = datos.tipo_entrega === 'consumible' ? 'supervisora de limpieza' : (datos.tipo_receptor === 'ocasional' ? 'receptor ocasional' : 'empleado');
      body = `
        <p style="margin-bottom:12px">Firma digital de ${receptorFirma}</p>
        <canvas id="signaturePad" style="border:1px solid #444;border-radius:4px;background:#0f0f0f;width:100%;height:150px;cursor:crosshair"></canvas>
        <button class="btn btn-secondary" id="btnLimpiarFirma" style="margin-top:8px">Limpiar Firma</button>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer">
          <input type="checkbox" id="sinFirma" disabled> Continuar sin firma
        </label>
      `;
    }

    modal.open(`Paso ${paso}/4`, body, getPasoFooter(), 'md');

    if (paso === 1) {
      const tipoReceptor = document.getElementById('tipoReceptor');
      const tipoEntrega = document.getElementById('tipoEntrega');
      tipoReceptor?.addEventListener('change', (e) => {
        datos.tipo_receptor = e.target.value;
        if (datos.tipo_receptor === 'ocasional') {
          datos.empleado_id = null;
          datos.empleado_nombre = '';
          datos.quien_recibe = datos.receptor_ocasional?.nombre || '';
          datos.area = '';
        } else if (datos.tipo_entrega !== 'consumible') {
          datos.receptor_ocasional = null;
          datos.empleado_id = '';
          datos.empleado_nombre = '';
          datos.quien_recibe = '';
          datos.area = '';
        }
        showPaso();
      });
      tipoEntrega?.addEventListener('change', (e) => {
        datos.tipo_entrega = e.target.value;
        datos.lineas = [];
        if (datos.tipo_entrega === 'consumible') {
          datos.tipo_receptor = 'empleado';
          datos.receptor_ocasional = null;
          datos.empleado_id = null;
          datos.empleado_nombre = 'Supervisora de Limpieza';
          datos.quien_recibe = 'Supervisora de Limpieza';
          datos.area = 'Limpieza';
        } else {
          datos.empleado_id = '';
          datos.empleado_nombre = '';
          datos.quien_recibe = '';
          datos.area = '';
        }
        showPaso();
      });

      document.getElementById('receptorOcasionalNombre')?.addEventListener('input', (e) => {
        datos.receptor_ocasional = {
          nombre: e.target.value.trim(),
          relacion: document.getElementById('receptorOcasionalRelacion')?.value || 'visitante',
        };
        datos.quien_recibe = datos.receptor_ocasional.nombre;
      });

      document.getElementById('receptorOcasionalRelacion')?.addEventListener('change', (e) => {
        datos.receptor_ocasional = {
          nombre: (document.getElementById('receptorOcasionalNombre')?.value || '').trim(),
          relacion: e.target.value,
        };
      });

      document.getElementById('emp')?.addEventListener('change', (e) => {
        const emp = empleados.find(x => x.id === e.target.value);
        if (emp) {
          datos.empleado_id = emp.id;
          datos.empleado_nombre = emp.nombre;
          datos.quien_recibe = emp.nombre;
          datos.area = emp.area || '';
          document.getElementById('tallasInfo').textContent = emp.tallas ? Object.keys(emp.tallas).join(', ') : 'Ninguna';
          // TODO: mostrar última entrega
        }
      });
    } else if (paso === 2) {
      document.getElementById('motivo')?.addEventListener('input', (e) => {
        datos.motivo = e.target.value;
        document.getElementById('autoriza').style.display = document.getElementById('requiereAutoriza')?.checked ? 'block' : 'none';
      });
      document.getElementById('observaciones')?.addEventListener('input', (e) => {
        datos.observaciones = e.target.value;
      });
      document.getElementById('requiereAutoriza')?.addEventListener('change', (e) => {
        document.getElementById('autoriza').style.display = e.target.checked ? 'block' : 'none';
      });
    } else if (paso === 3) {
      const productoTipo = datos.tipo_entrega === 'consumible' ? 'consumible' : 'personal';
      let productos = getProductos({ soloEntregables: true, tipo: productoTipo });
      let selectedProd = null;
      let selectedVarianteId = null;
      let selectedTalla = '';

      function renderProductoSeleccionado() {
        const box = document.getElementById('prodSelectedBox');
        if (!box) return;
        if (!selectedProd) {
          box.innerHTML = '';
          return;
        }
        const tipo = selectedProd.tipo || 'personal';
        let extra = '';
        if (tipo !== 'consumible') {
          if (selectedProd.es_por_variante && (selectedProd.variantes || []).length) {
            extra = `<label>Talla</label><select id="varianteProd" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-top:4px">${selectedProd.variantes.map(v => `<option value="${v.id}">${esc(v.talla || v.nombre || 'Sin talla')} — ${getStockDisponible(selectedProd, v.id)} disp.</option>`).join('')}</select>`;
          } else {
            extra = '<label>Talla</label><input type="text" id="tallaManual" placeholder="Talla" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-top:4px">';
          }
        }
        box.innerHTML = `<div style="padding:10px;background:#111;border:1px solid #444;border-radius:4px"><p><strong>${esc(selectedProd.nombre)}</strong> <small style="color:#999">${esc(selectedProd.sku || '')}</small></p><p class="text-xs text-muted">Stock disponible: ${getStockDisponible(selectedProd)}</p>${extra}</div>`;
        document.getElementById('varianteProd')?.addEventListener('change', e => {
          selectedVarianteId = e.target.value;
          const v = (selectedProd.variantes || []).find(x => x.id === selectedVarianteId);
          selectedTalla = v?.talla || v?.nombre || '';
        });
        const firstVar = document.getElementById('varianteProd')?.value;
        if (firstVar) {
          selectedVarianteId = firstVar;
          const v = (selectedProd.variantes || []).find(x => x.id === selectedVarianteId);
          selectedTalla = v?.talla || v?.nombre || '';
        }
      }

      function showQuickCreate(q) {
        if (!window.confirm('Producto no encontrado. ¿Deseas agregarlo al catálogo?')) return;
        const box = document.getElementById('quickProductBox');
        if (box) box.style.display = 'block';
        const name = document.getElementById('quickProdNombre');
        const sku = document.getElementById('quickProdSku');
        if (name) name.value = q || '';
        if (sku && !sku.value) sku.value = q || '';
      }

      document.getElementById('searchProd')?.addEventListener('keyup', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const filtered = q ? productos.filter(p => (p.nombre || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)).slice(0, 10) : [];
        let html = '';
        filtered.forEach(p => {
          const stock = getStockDisponible(p);
          const tipoLabel = (p.tipo || 'personal') === 'consumible' ? 'Consumible' : 'Personal';
          html += `<div class="prod-item" style="cursor:pointer;padding:6px;background:#1f1f1f;border-radius:4px;margin-bottom:4px;font-size:13px" data-prod-id="${p.id}"><strong>${esc(p.nombre)}</strong> <small style="color:#999">${esc(p.sku || '')} · ${tipoLabel}</small> (${stock} disponibles)</div>`;
        });
        if (q && !filtered.length) html = '<button class="btn btn-secondary" id="btnProductoNoExiste" style="width:100%">Producto no encontrado. ¿Deseas agregarlo al catálogo?</button>';
        document.getElementById('prodList').innerHTML = html;

        document.querySelectorAll('.prod-item').forEach(item => {
          item.addEventListener('click', () => {
            selectedProd = productos.find(p => p.id === item.dataset.prodId);
            selectedVarianteId = null;
            selectedTalla = '';
            document.getElementById('searchProd').value = selectedProd ? selectedProd.nombre : '';
            document.getElementById('prodList').innerHTML = '';
            renderProductoSeleccionado();
          });
        });
        document.getElementById('btnProductoNoExiste')?.addEventListener('click', () => showQuickCreate(e.target.value.trim()));
      });

      document.getElementById('btnCrearProductoRapido')?.addEventListener('click', () => {
        const nombre = (document.getElementById('quickProdNombre')?.value || '').trim();
        const skuRef = (document.getElementById('quickProdSku')?.value || '').trim();
        const tipo = document.getElementById('quickProdTipo')?.value || productoTipo;
        const categoria_id = document.getElementById('quickProdCategoria')?.value || '';
        if (!nombre) {
          notify('Escribe el nombre del producto', 'warning');
          return;
        }
        if (!categoria_id) {
          notify('Selecciona una categoría', 'warning');
          return;
        }
        selectedProd = createProducto({
          nombre,
          categoria_id,
          descripcion: skuRef ? 'SKU / referencia sugerida: ' + skuRef : '',
          unidad: 'pieza',
          tipo,
          es_entregable: true,
          es_por_variante: false,
          stock_minimo: 0,
        });
        productos = getProductos({ soloEntregables: true, tipo });
        selectedVarianteId = null;
        selectedTalla = '';
        document.getElementById('quickProductBox').style.display = 'none';
        document.getElementById('searchProd').value = selectedProd.nombre;
        renderProductoSeleccionado();
        notify('Producto creado. Recuerda que inicia sin stock.', 'success');
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
        const tipoProd = selectedProd.tipo || 'personal';
        if (tipoProd !== 'consumible') {
          if (selectedProd.es_por_variante && (selectedProd.variantes || []).length) {
            selectedVarianteId = document.getElementById('varianteProd')?.value || selectedVarianteId;
            const variante = (selectedProd.variantes || []).find(v => v.id === selectedVarianteId);
            selectedTalla = variante?.talla || variante?.nombre || '';
          } else {
            selectedTalla = (document.getElementById('tallaManual')?.value || '').trim();
          }
          if (!selectedTalla) {
            notify('Selecciona o escribe talla', 'warning');
            return;
          }
        } else {
          selectedVarianteId = null;
          selectedTalla = '';
        }

        const stockDisp = getStockDisponible(selectedProd, selectedVarianteId);

        if (cant > stockDisp) {
          notify('Sin stock de ' + selectedProd.nombre + (selectedTalla ? ' talla ' + selectedTalla : ''), 'error');
          return;
        }

        datos.lineas.push({ producto_id: selectedProd.id, variante_id: selectedVarianteId || null, talla: selectedTalla, cantidad: cant, observaciones: selectedTalla ? 'Talla: ' + selectedTalla : '' });
        notify('Producto agregado', 'success');
        selectedProd = null;
        selectedVarianteId = null;
        selectedTalla = '';
        document.getElementById('searchProd').value = '';
        document.getElementById('cantidad').value = '1';
        document.getElementById('prodSelectedBox').innerHTML = '';
        renderLineas();
      });

      function renderLineas() {
        let html = '';
        datos.lineas.forEach((l, idx) => {
          const p = getStore().productos.find(x => x.id === l.producto_id);
          const talla = getTallaLinea(p, l);
          html += `<div style="padding:6px;background:#1f1f1f;border-radius:4px;margin-bottom:4px;display:flex;gap:8px;align-items:center;justify-content:space-between"><span>${p ? esc(p.nombre) : '?'}${talla ? ' T:' + esc(talla) : ''}</span><input type="number" min="1" value="${l.cantidad}" data-linea-idx="${idx}" class="linea-cantidad" style="width:70px;padding:4px;border:1px solid #444;border-radius:4px;background:#111;color:#fff"><button class="btn-icon btn-danger" onclick="removeLinea(${idx})" style="padding:2px 6px"><i class="fas fa-trash"></i></button></div>`;
        });
        document.getElementById('lineasList').innerHTML = html;
        document.querySelectorAll('.linea-cantidad').forEach(inp => {
          inp.addEventListener('change', e => {
            const idx = parseInt(e.target.dataset.lineaIdx, 10);
            const val = parseInt(e.target.value || '0', 10);
            if (val <= 0) {
              notify('Cantidad inválida', 'error');
              e.target.value = datos.lineas[idx].cantidad;
              return;
            }
            datos.lineas[idx].cantidad = val;
          });
        });
      }

      window.removeLinea = (idx) => {
        datos.lineas.splice(idx, 1);
        renderLineas();
      };

      renderLineas();
    } else if (paso === 4) {
      // Canvas para firma
      const canvas = document.getElementById('signaturePad');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        let isDrawing = false;

        canvas.addEventListener('mousedown', () => isDrawing = true);
        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mousemove', (e) => {
          if (!isDrawing) return;
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        });

        document.getElementById('btnLimpiarFirma')?.addEventListener('click', () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          datos.firma = null;
        });
      }
    }
  }

  function getPasoFooter() {
    let footer = '<button class="btn btn-secondary" onclick="window.modalClose()">Cancelar</button>';
    if (paso > 1) footer += '<button class="btn btn-secondary" id="btnAnt">← Anterior</button>';
    if (paso < 4) footer += '<button class="btn btn-primary" id="btnSig">Siguiente →</button>';
    else footer += '<button class="btn btn-success" id="btnGuardar">✓ Registrar Entrega</button>';
    return footer;
  }

  window.modalClose = () => {
    modal.close();
    detachEntregasWizardHandler();
  };

  detachEntregasWizardHandler();
  _entregasWizardHandler = async (e) => {
    if (e.target.id === 'btnAnt') {
      if (paso > 1) paso--;
      showPaso();
    }
    if (e.target.id === 'btnSig') {
      if (paso === 3 && datos.lineas.length === 0) {
        notify('Agrega al menos un artículo', 'warning');
        return;
      }
      if (paso === 3 && !validarLineasStock()) {
        return;
      }
      if (paso === 1 && datos.tipo_entrega === 'personal' && !datos.empleado_id) {
        notify('Selecciona un empleado', 'warning');
        return;
      }
      if (paso === 1 && datos.tipo_receptor === 'empleado' && datos.tipo_entrega !== 'consumible' && !datos.empleado_id) {
        notify('Selecciona un empleado', 'warning');
        return;
      }
      if (paso === 1 && datos.tipo_receptor === 'empleado' && datos.tipo_entrega !== 'consumible') {
        const empActivo = empleados.find(e => e.id === datos.empleado_id && e.estado === 'activo');
        if (!empActivo) {
          notify('Empleado inactivo o no encontrado', 'error');
          return;
        }
      }
      if (paso === 1 && datos.tipo_receptor === 'ocasional') {
        const nombreOcasional = (document.getElementById('receptorOcasionalNombre')?.value || datos.receptor_ocasional?.nombre || '').trim();
        if (!nombreOcasional) {
          notify('Escribe el nombre del receptor ocasional', 'warning');
          return;
        }
        datos.receptor_ocasional = {
          nombre: nombreOcasional,
          relacion: document.getElementById('receptorOcasionalRelacion')?.value || datos.receptor_ocasional?.relacion || 'visitante',
        };
        datos.empleado_id = null;
        datos.empleado_nombre = nombreOcasional;
        datos.quien_recibe = nombreOcasional;
      }
      if (paso === 1 && datos.tipo_entrega === 'consumible') {
        datos.tipo_receptor = 'empleado';
        datos.receptor_ocasional = null;
        datos.empleado_id = null;
        datos.empleado_nombre = 'Supervisora de Limpieza';
        datos.quien_recibe = 'Supervisora de Limpieza';
        datos.area = 'Limpieza';
      }
      if (paso < 4) paso++;
      showPaso();
    }
    if (e.target.id === 'btnGuardar') {
      const btn = e.target;
      // Capturar firma obligatoria antes de registrar
      const signCanvas = document.getElementById('signaturePad');
      if (!signCanvas || !canvasTieneFirma(signCanvas)) {
        notify('La firma es obligatoria para confirmar la entrega.', 'error');
        return;
      }
      btn.disabled = true;
      const entregaId = 'ent-nueva-' + Date.now();
      datos.firma = await saveEvidence({
        base64: signCanvas.toDataURL('image/png'),
        tipo: 'firma',
        entidad: 'entrega',
        entidadId: entregaId,
        filename: 'firma.png',
      });
      if (datos.lineas.length === 0) {
        btn.disabled = false;
        notify('Agrega al menos un artículo', 'warning');
        return;
      }
      if (!validarLineasStock()) {
        btn.disabled = false;
        return;
      }
      const resultado = registrarEntregaNueva({
        id: entregaId,
        empleado_id: datos.empleado_id,
        empleado_nombre: datos.empleado_nombre,
        area: datos.area,
        motivo: datos.motivo,
        autorizado_por: datos.autorizado_por,
        firma: datos.firma || null,
        firma_empleado: datos.tipo_receptor === 'empleado' && datos.tipo_entrega !== 'consumible' ? datos.firma || null : null,
        firma_recibe: datos.firma || null,
        quien_recibe: datos.quien_recibe || datos.empleado_nombre,
        tipo_entrega: datos.tipo_entrega,
        lineas: datos.lineas,
        observaciones: datos.observaciones,
      });

      if (!resultado.ok) {
        btn.disabled = false;
        notify(resultado.error || 'Error', 'error');
        return;
      }

      Object.assign(resultado.entrega, {
        tipo_receptor: datos.tipo_receptor,
        receptor_ocasional: datos.tipo_receptor === 'ocasional' ? datos.receptor_ocasional : null,
        tipo_entrega: datos.tipo_entrega,
        motivo: datos.motivo || '',
        observaciones: datos.observaciones || '',
        entrega_sin_firma: !datos.firma,
      });
      saveEntregasNuevas();

      notify('Entrega registrada', 'success');
      modal.close();
      detachEntregasWizardHandler();
      renderEntregas();
    }
  };
  document.addEventListener('click', _entregasWizardHandler, true);
}

function openDetalleEntrega(id) {
  const entrega = getStore().entregasNuevas.find(e => e.id === id);
  if (!entrega) return;

  const lineas = getStore().lineasEntrega.filter(l => l.entrega_id === id);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const firmaSrc = getEvidenceSrc(entrega.firma_recibe || entrega.firma);

  let body = `
    <p><strong>Número:</strong> ${esc(entrega.numero)}</p>
    <p><strong>Recibe:</strong> ${esc(entrega.quien_recibe || entrega.empleado_nombre)}</p>
    <p><strong>Tipo receptor:</strong> ${esc(entrega.tipo_receptor || 'empleado')}</p>
    ${entrega.receptor_ocasional ? `<p><strong>Relación:</strong> ${esc(entrega.receptor_ocasional.relacion || '—')}</p>` : ''}
    <p><strong>Tipo entrega:</strong> ${esc(entrega.tipo_entrega || 'dotacion')}</p>
    <p><strong>Área:</strong> ${esc(entrega.area)}</p>
    <p><strong>Motivo:</strong> ${esc(entrega.motivo)}</p>
    <p><strong>Observaciones:</strong> ${esc(entrega.observaciones || '—')}</p>
    ${!(entrega.firma_recibe || entrega.firma) ? '<p><span style="background:#7f1d1d;color:#fecaca;font-size:11px;font-weight:700;padding:3px 8px;border-radius:10px">ENTREGA SIN FIRMA</span></p>' : ''}
    <p><strong>Fecha:</strong> ${fmtDate(entrega.fecha_hora)}</p>
    <p><strong>Entregado por:</strong> ${esc(entrega.entregado_por)}</p>
    ${firmaSrc ? `<p><strong>Firma:</strong><br><img src="${esc(firmaSrc)}" style="max-width:260px;border:1px solid #e5e7eb;border-radius:6px;background:#fff"></p>` : ''}

    <h4 style="margin-top:12px">Productos</h4>
    <table class="data-table">
      <thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${lineas.map(l => {
          const p = getStore().productos.find(x => x.id === l.producto_id);
          const talla = getTallaLinea(p, l);
          return `<tr><td>${p ? esc(p.nombre) : '?'}${talla ? ' · T:' + esc(talla) : ''}</td><td style="text-align:center">${l.cantidad}</td></tr>`;
        }).join('')}
        <tr style="font-weight:bold"><td>Total Piezas</td><td style="text-align:center">${piezas}</td></tr>
      </tbody>
    </table>
  `;

  modal.open(`Entrega: ${entrega.numero}`, body, '<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>', 'md');
  window.modalClose = () => modal.close();
}

function imprimirRecibo(id) {
  const entrega = getStore().entregasNuevas.find(e => e.id === id);
  if (!entrega) return;

  const lineas = getStore().lineasEntrega.filter(l => l.entrega_id === id);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const firmaSrc = getEvidenceSrc(entrega.firma_recibe || entrega.firma);

  let html = `
    <html>
    <head><title>Recibo ${entrega.numero}</title><style>
      body { font-family: Arial; max-width: 80mm; margin: 0; padding: 10px; }
      .header { text-align: center; margin-bottom: 10px; border-bottom: 1px solid #000; padding-bottom: 5px; }
      .header h2 { margin: 0; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      td { padding: 3px; border-bottom: 1px dotted #999; }
      .total { font-weight: bold; }
      .firma { margin-top: 20px; height: 40px; border-top: 1px solid #000; }
    </style></head>
    <body>
      <div class="header">
        <h2>ASSA ABLOY MÉXICO</h2>
        <p style="margin: 0; font-size: 11px;">RECIBO DE ENTREGA</p>
      </div>

      <table>
        <tr><td><strong>Número:</strong></td><td>${esc(entrega.numero)}</td></tr>
        <tr><td><strong>Recibe:</strong></td><td>${esc(entrega.quien_recibe || entrega.empleado_nombre)}</td></tr>
        <tr><td><strong>Tipo receptor:</strong></td><td>${esc(entrega.tipo_receptor || 'empleado')}</td></tr>
        <tr><td><strong>Tipo entrega:</strong></td><td>${esc(entrega.tipo_entrega || 'dotacion')}</td></tr>
        ${entrega.receptor_ocasional ? `<tr><td><strong>Relación:</strong></td><td>${esc(entrega.receptor_ocasional.relacion || '—')}</td></tr>` : ''}
        <tr><td><strong>Área:</strong></td><td>${esc(entrega.area)}</td></tr>
        <tr><td><strong>Motivo:</strong></td><td>${esc(entrega.motivo)}</td></tr>
        <tr><td><strong>Obs.:</strong></td><td>${esc(entrega.observaciones || '—')}</td></tr>
        ${!(entrega.firma_recibe || entrega.firma) ? '<tr><td><strong>Firma:</strong></td><td>ENTREGA SIN FIRMA</td></tr>' : ''}
        <tr><td><strong>Fecha:</strong></td><td>${fmtDate(entrega.fecha_hora)}</td></tr>
      </table>

      <h4 style="margin-top: 10px; font-size: 12px;">Productos</h4>
      <table>
        <tr style="font-weight: bold; border-bottom: 2px solid #000;"><td>Producto</td><td style="text-align: right;">Cant</td></tr>
        ${lineas.map(l => {
          const p = getStore().productos.find(x => x.id === l.producto_id);
          const talla = getTallaLinea(p, l);
          return `<tr><td>${p ? esc(p.nombre) : '?'}${talla ? ' · T:' + esc(talla) : ''}</td><td style="text-align: right;">${l.cantidad}</td></tr>`;
        }).join('')}
        <tr class="total"><td>Total</td><td style="text-align: right;">${piezas}</td></tr>
      </table>

      ${firmaSrc ? `<div style="margin-top: 10px; text-align:center"><img src="${esc(firmaSrc)}" style="max-width: 220px; max-height: 80px; border: 1px solid #ddd;"></div>` : ''}
      <div class="firma">
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Recibe: __________</span>
          <span>Entregó: __________</span>
        </div>
      </div>
      <p style="font-size: 10px; text-align: center; margin-top: 10px;">Generado: ${new Date().toLocaleString('es-MX')}</p>
    </body>
    </html>
  `;

  const w = window.open('', '', 'width=300,height=400');
  if (!w) {
    notify('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.', 'warning');
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
