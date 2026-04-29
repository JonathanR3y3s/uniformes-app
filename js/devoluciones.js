/**
 * DEVOLUCIONES DE PERSONAL (RETURNS FROM EMPLOYEES)
 * Módulo para gestión de devoluciones de productos por personal
 */

import { getStore } from './storage.js';
import { esc, fmtDate } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole, getUser } from './user-roles.js';
import { getDevolucionesNuevas, registrarDevolucionNueva, getProductos } from './almacen-api.js';

let _devolucionesWizardHandler = null;

function detachDevolucionesWizardHandler() {
  if (_devolucionesWizardHandler) {
    document.removeEventListener('click', _devolucionesWizardHandler, true);
    _devolucionesWizardHandler = null;
  }
}

export function render() {
  const devolucionesNuevas = getDevolucionesNuevas();
  const mesActual = new Date().toISOString().slice(0, 7);
  const devolucionesMes = devolucionesNuevas.filter(d => d.fecha_hora.startsWith(mesActual));

  const totalPiezas = devolucionesMes.reduce((sum, d) => {
    const lineas = getStore().lineasDevolucion.filter(l => l.devolucion_id === d.id);
    return sum + lineas.reduce((s, l) => s + l.cantidad, 0);
  }, 0);

  const porMotivo = {};
  devolucionesMes.forEach(d => {
    porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1;
  });
  const motivoMayoritario = Object.keys(porMotivo).length > 0
    ? Object.keys(porMotivo).sort((a, b) => porMotivo[b] - porMotivo[a])[0]
    : '—';

  let html = `
    <div class="page-content">
      <div class="page-head">
        <div class="page-title">Devoluciones de Personal</div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnNuevaDevolucion"><i class="fas fa-undo"></i> Nueva Devolución</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">${devolucionesMes.length}</div>
          <div class="kpi-label">Devoluciones Este Mes</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${totalPiezas}</div>
          <div class="kpi-label">Piezas Devueltas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${motivoMayoritario}</div>
          <div class="kpi-label">Motivo Principal</div>
        </div>
      </div>

      <div class="filters-section">
        <input type="text" id="filterEmpleado" placeholder="Filtrar por empleado..." style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;flex:1">
        <select id="filterMotivo" style="padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;flex:1">
          <option value="">Todos los motivos</option>
          <option value="cambio_talla">Cambio de Talla</option>
          <option value="deterioro">Deterioro</option>
          <option value="no_aplica">No Aplica</option>
          <option value="renuncia">Renuncia</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div id="devolucionesContainer" style="margin-top:20px"></div>
    </div>
  `;

  return html;
}

export function init() {
  document.getElementById('btnNuevaDevolucion')?.addEventListener('click', openNuevaDevolucion);
  document.getElementById('filterEmpleado')?.addEventListener('keyup', renderDevoluciones);
  document.getElementById('filterMotivo')?.addEventListener('change', renderDevoluciones);

  renderDevoluciones();
}

function renderDevoluciones() {
  const empleado = document.getElementById('filterEmpleado')?.value || '';
  const motivo = document.getElementById('filterMotivo')?.value || '';

  let devolucionesNuevas = getDevolucionesNuevas();
  if (empleado) devolucionesNuevas = devolucionesNuevas.filter(d => d.empleado_nombre.toLowerCase().includes(empleado.toLowerCase()));
  if (motivo) devolucionesNuevas = devolucionesNuevas.filter(d => d.motivo === motivo);

  let html = `<table class="data-table"><thead><tr><th>Número</th><th>Empleado</th><th>Área</th><th>Motivo</th><th>Productos</th><th>Piezas</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>`;

  if (devolucionesNuevas.length === 0) {
    html += `<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">Sin devoluciones registradas</td></tr>`;
  } else {
    devolucionesNuevas.forEach(d => {
      const lineas = getStore().lineasDevolucion.filter(l => l.devolucion_id === d.id);
      const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
      const motivoIcon = {
        cambio_talla: '📏',
        deterioro: '⚠️',
        no_aplica: '❌',
        renuncia: '👤',
        otro: '❓'
      }[d.motivo] || '•';

      html += `
        <tr>
          <td><strong>${esc(d.numero)}</strong></td>
          <td>${esc(d.empleado_nombre)}</td>
          <td>${esc(d.area)}</td>
          <td><small>${motivoIcon} ${esc(d.motivo)}</small></td>
          <td style="text-align:center">${lineas.length}</td>
          <td style="text-align:center;font-weight:bold">${piezas}</td>
          <td><small>${fmtDate(d.fecha_hora)}</small></td>
          <td style="text-align:center">
            <button class="btn-icon" data-devolucion-id="${d.id}" title="Ver detalles"><i class="fas fa-eye"></i></button>
          </td>
        </tr>
      `;
    });
  }

  html += `</tbody></table>`;
  const container = document.getElementById('devolucionesContainer');
  container.innerHTML = html;

  container.onclick = e => {
    const btn = e.target.closest('button[data-devolucion-id]');
    if (btn) {
      openDetalleDevolucion(btn.dataset.devolucionId);
    }
  };
}

function openNuevaDevolucion() {
  const empleados = getStore().employees || [];
  const rol = getUserRole();

  if (rol !== 'admin' && rol !== 'operador') {
    notify('No tienes permiso para crear devoluciones', 'error');
    return;
  }

  let paso = 1;
  let datos = {
    empleado_id: '',
    empleado_nombre: '',
    area: '',
    motivo_devolucion: '',
    observaciones: '',
    lineas: [],
    firma: null,
  };

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
        <label>Empleado *</label>
        <select id="emp" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff">
          <option value="">Seleccionar...</option>
          ${empleados.filter(e => e.estado === 'activo').map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}
        </select>
        <div style="margin-top:12px;padding:8px;background:#111;border-radius:4px;font-size:12px;color:#999">
          <p>Empleado: <span id="empInfo">—</span></p>
          <p>Área: <span id="areaInfo">—</span></p>
        </div>
      `;
    } else if (paso === 2) {
      body = `
        <label>Motivo de Devolución *</label>
        <select id="motivo" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:12px">
          <option value="">Seleccionar...</option>
          <option value="cambio_talla">Cambio de Talla</option>
          <option value="deterioro">Deterioro / Daño</option>
          <option value="no_aplica">No Aplica / No le Quedó</option>
          <option value="renuncia">Renuncia</option>
          <option value="otro">Otro</option>
        </select>
        <label>Observaciones</label>
        <textarea id="observaciones" placeholder="Detalles adicionales..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;height:80px"></textarea>
      `;
    } else if (paso === 3) {
      const productos = getProductos();
      body = `
        <input type="text" id="searchProd" placeholder="Buscar producto..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <div id="prodList" style="max-height:150px;overflow-y:auto;margin-bottom:12px"></div>
        <input type="number" id="cantidad" min="1" value="1" placeholder="Cantidad" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <button class="btn btn-success" id="btnAgregar" style="width:100%"><i class="fas fa-plus"></i> Agregar</button>
        <div id="lineasList" style="margin-top:12px;max-height:200px;overflow-y:auto"></div>
      `;
    } else if (paso === 4) {
      const lineas = datos.lineas;
      const totalPiezas = lineas.reduce((sum, l) => sum + l.cantidad, 0);

      body = `
        <h4>Resumen de Devolución</h4>
        <p><strong>Empleado:</strong> ${esc(datos.empleado_nombre)}</p>
        <p><strong>Área:</strong> ${esc(datos.area)}</p>
        <p><strong>Motivo:</strong> ${esc(datos.motivo_devolucion)}</p>
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
        <div style="margin-top:14px">
          <p style="margin-bottom:12px">Firma digital del empleado</p>
          <canvas id="signaturePad" style="border:1px solid #444;border-radius:4px;background:#0f0f0f;width:100%;height:150px;cursor:crosshair"></canvas>
          <button class="btn btn-secondary" id="btnLimpiarFirma" style="margin-top:8px">Limpiar Firma</button>
        </div>
      `;
    }

    modal.open(`Paso ${paso}/4`, body, getPasoFooter(), 'md');

    if (paso === 1) {
      document.getElementById('emp')?.addEventListener('change', (e) => {
        const emp = empleados.find(x => x.id === e.target.value);
        if (emp) {
          datos.empleado_id = emp.id;
          datos.empleado_nombre = emp.nombre;
          datos.area = emp.area || '';
          document.getElementById('empInfo').textContent = emp.nombre;
          document.getElementById('areaInfo').textContent = emp.area || '—';
        }
      });
    } else if (paso === 2) {
      document.getElementById('motivo')?.addEventListener('change', (e) => {
        datos.motivo_devolucion = e.target.value;
      });
      document.getElementById('observaciones')?.addEventListener('input', (e) => {
        datos.observaciones = e.target.value;
      });
    } else if (paso === 3) {
      const productos = getProductos();
      let selectedProd = null;

      document.getElementById('searchProd')?.addEventListener('keyup', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = productos.filter(p => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 10);
        let html = '';
        filtered.forEach(p => {
          html += `<div class="prod-item" style="cursor:pointer;padding:6px;background:#1f1f1f;border-radius:4px;margin-bottom:4px;font-size:13px" data-prod-id="${p.id}"><strong>${esc(p.nombre)}</strong></div>`;
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
    } else if (paso === 4) {
      // Canvas para firma — trazo continuo con soporte touch
      const canvas = document.getElementById('signaturePad');
      if (canvas) {
        canvas.width = 900;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        let isDrawing = false;
        let lastX = 0, lastY = 0;
        function toCanvasPos(clientX, clientY) {
          const r = canvas.getBoundingClientRect();
          return { x: (clientX - r.left) * (canvas.width / r.width), y: (clientY - r.top) * (canvas.height / r.height) };
        }
        function onDown(clientX, clientY) { isDrawing = true; const p = toCanvasPos(clientX, clientY); lastX = p.x; lastY = p.y; }
        function onMove(clientX, clientY) {
          if (!isDrawing) return;
          const p = toCanvasPos(clientX, clientY);
          ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
          lastX = p.x; lastY = p.y;
        }
        function onUp() { isDrawing = false; }
        canvas.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
        canvas.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
        canvas.addEventListener('mouseup', onUp);
        canvas.addEventListener('mouseleave', onUp);
        canvas.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches[0]) onDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        canvas.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });

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
    else footer += '<button class="btn btn-success" id="btnGuardar">✓ Registrar Devolución</button>';
    return footer;
  }

  window.modalClose = () => {
    modal.close();
    detachDevolucionesWizardHandler();
  };

  detachDevolucionesWizardHandler();
  _devolucionesWizardHandler = (e) => {
    if (e.target.id === 'btnAnt') {
      if (paso > 1) paso--;
      showPaso();
    }
    if (e.target.id === 'btnSig') {
      if (paso === 1 && !datos.empleado_id) {
        notify('Selecciona un empleado', 'warning');
        return;
      }
      if (paso === 2 && !datos.motivo_devolucion) {
        notify('Selecciona un motivo', 'warning');
        return;
      }
      if (paso === 3 && datos.lineas.length === 0) {
        notify('Agrega al menos un producto', 'warning');
        return;
      }
      if (paso < 4) paso++;
      showPaso();
    }
    if (e.target.id === 'btnGuardar') {
      const signCanvas = document.getElementById('signaturePad');
      if (!signCanvas || !canvasTieneFirma(signCanvas)) {
        notify('La firma es obligatoria para confirmar la entrega.', 'error');
        return;
      }
      datos.firma = signCanvas.toDataURL('image/png');
      const resultado = registrarDevolucionNueva({
        empleado_id: datos.empleado_id,
        empleado_nombre: datos.empleado_nombre,
        area: datos.area,
        motivo: datos.motivo_devolucion,
        observaciones: datos.observaciones,
        firma: datos.firma,
        lineas: datos.lineas,
      });

      if (!resultado.ok) {
        notify(resultado.error || 'Error', 'error');
        return;
      }

      notify('Devolución registrada', 'success');
      modal.close();
      detachDevolucionesWizardHandler();
      renderDevoluciones();
    }
  };
  document.addEventListener('click', _devolucionesWizardHandler, true);
}

function openDetalleDevolucion(id) {
  const devolucion = getStore().devolucionesNuevas.find(d => d.id === id);
  if (!devolucion) return;

  const lineas = getStore().lineasDevolucion.filter(l => l.devolucion_id === id);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);

  let body = `
    <p><strong>Número:</strong> ${esc(devolucion.numero)}</p>
    <p><strong>Empleado:</strong> ${esc(devolucion.empleado_nombre)}</p>
    <p><strong>Área:</strong> ${esc(devolucion.area)}</p>
    <p><strong>Motivo:</strong> ${esc(devolucion.motivo)}</p>
    <p><strong>Observaciones:</strong> ${esc(devolucion.observaciones || '—')}</p>
    <p><strong>Fecha:</strong> ${fmtDate(devolucion.fecha_hora)}</p>
    <p><strong>Registrado por:</strong> ${esc(devolucion.registrado_por)}</p>

    <h4 style="margin-top:12px">Productos Devueltos</h4>
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

  modal.open(`Devolución: ${devolucion.numero}`, body, '<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>', 'md');
  window.modalClose = () => modal.close();
}
