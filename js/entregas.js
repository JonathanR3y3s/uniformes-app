/**
 * ENTREGAS A PERSONAL (NUEVO MODELO)
 * Módulo para gestión de entregas de productos a personal
 */

import { getStore } from './storage.js';
import { esc, fmtDate } from './utils.js';
import { notify, modal } from './ui.js';
import { getUserRole, getUser } from './user-roles.js';
import { getEntregasNuevas, registrarEntregaNueva, getProductos } from './almacen-api.js';

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
          <option value="ADMINISTRACIÓN">Administración</option>
          <option value="OPERACIONES">Operaciones</option>
          <option value="VENTAS">Ventas</option>
          <option value="LOGÍSTICA">Logística</option>
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
  if (empleado) entregasNuevas = entregasNuevas.filter(e => e.empleado_nombre.toLowerCase().includes(empleado.toLowerCase()));
  if (area) entregasNuevas = entregasNuevas.filter(e => e.area === area);

  let html = `<table class="data-table"><thead><tr><th>Número</th><th>Empleado</th><th>Área</th><th>Motivo</th><th>Artículos</th><th>Piezas</th><th>Fecha</th><th>Firma</th><th>Acciones</th></tr></thead><tbody>`;

  if (entregasNuevas.length === 0) {
    html += `<tr><td colspan="9" style="text-align:center;padding:20px;color:#999">Sin entregas registradas</td></tr>`;
  } else {
    entregasNuevas.forEach(e => {
      const lineas = getStore().lineasEntrega.filter(l => l.entrega_id === e.id);
      const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
      const firmaIcon = e.firma ? '<i class="fas fa-check" style="color:#4ade80"></i>' : '—';

      html += `
        <tr>
          <td><strong>${esc(e.numero)}</strong></td>
          <td>${esc(e.empleado_nombre)}</td>
          <td>${esc(e.area)}</td>
          <td><small>${esc(e.motivo)}</small></td>
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

  container.addEventListener('click', e => {
    const verBtn = e.target.closest('button:not(.btn-imprimir)');
    if (verBtn && verBtn.dataset.entregaId) {
      openDetalleEntrega(verBtn.dataset.entregaId);
      return;
    }

    const impBtn = e.target.closest('.btn-imprimir');
    if (impBtn) {
      imprimirRecibo(impBtn.dataset.entregaId);
    }
  });
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
    empleado_id: '',
    empleado_nombre: '',
    area: '',
    motivo: '',
    autorizado_por: '',
    lineas: [],
    firma: null,
  };

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
          <p>Tallas capturadas: <span id="tallasInfo">—</span></p>
          <p>Última entrega: <span id="ultEntregaInfo">—</span></p>
        </div>
      `;
    } else if (paso === 2) {
      body = `
        <select id="motivo" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:12px">
          <option value="">Seleccionar motivo...</option>
          <option value="dotacion_anual">Dotación Anual</option>
          <option value="nuevo_ingreso">Nuevo Ingreso</option>
          <option value="reposicion">Reposición</option>
          <option value="premio">Premio / Concurso</option>
          <option value="kit_bienvenida">Kit de Bienvenida</option>
          <option value="souvenir_temporada">Souvenir de Temporada</option>
          <option value="extraordinario">Extraordinario</option>
          <option value="otro">Otro</option>
        </select>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="requiereAutoriza"> Requiere autorización
        </label>
        <input type="text" id="autoriza" placeholder="Autorizado por..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-top:8px;display:none">
      `;
    } else if (paso === 3) {
      const productos = getProductos({ soloEntregables: true });
      body = `
        <input type="text" id="searchProd" placeholder="Buscar producto..." style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <div id="prodList" style="max-height:150px;overflow-y:auto;margin-bottom:12px"></div>
        <input type="number" id="cantidad" min="1" value="1" placeholder="Cantidad" style="width:100%;padding:8px;border:1px solid #444;border-radius:4px;background:#1f1f1f;color:#fff;margin-bottom:8px">
        <button class="btn btn-success" id="btnAgregar" style="width:100%"><i class="fas fa-plus"></i> Agregar</button>
        <div id="lineasList" style="margin-top:12px;max-height:200px;overflow-y:auto"></div>
      `;
    } else if (paso === 4) {
      body = `
        <p style="margin-bottom:12px">Firma digital del empleado</p>
        <canvas id="signaturePad" style="border:1px solid #444;border-radius:4px;background:#0f0f0f;width:100%;height:150px;cursor:crosshair"></canvas>
        <button class="btn btn-secondary" id="btnLimpiarFirma" style="margin-top:8px">Limpiar Firma</button>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer">
          <input type="checkbox" id="sinFirma"> Continuar sin firma
        </label>
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
          document.getElementById('tallasInfo').textContent = emp.tallas ? Object.keys(emp.tallas).join(', ') : 'Ninguna';
          // TODO: mostrar última entrega
        }
      });
    } else if (paso === 2) {
      document.getElementById('motivo')?.addEventListener('change', (e) => {
        datos.motivo = e.target.value;
        document.getElementById('autoriza').style.display = document.getElementById('requiereAutoriza')?.checked ? 'block' : 'none';
      });
      document.getElementById('requiereAutoriza')?.addEventListener('change', (e) => {
        document.getElementById('autoriza').style.display = e.target.checked ? 'block' : 'none';
      });
    } else if (paso === 3) {
      const productos = getProductos({ soloEntregables: true });
      let selectedProd = null;

      document.getElementById('searchProd')?.addEventListener('keyup', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = productos.filter(p => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 10);
        let html = '';
        filtered.forEach(p => {
          const stock = p.es_por_variante ? (p.variantes || []).reduce((s, v) => s + (v.stock_actual || 0), 0) : (p.stock_actual || 0);
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

  window.modalClose = () => modal.close();

  document.addEventListener('click', (e) => {
    if (e.target.id === 'btnAnt') {
      if (paso > 1) paso--;
      showPaso();
    }
    if (e.target.id === 'btnSig') {
      if (paso === 3 && datos.lineas.length === 0) {
        notify('Agrega al menos un producto', 'warning');
        return;
      }
      if (paso < 4) paso++;
      showPaso();
    }
    if (e.target.id === 'btnGuardar') {
      const resultado = registrarEntregaNueva({
        empleado_id: datos.empleado_id,
        empleado_nombre: datos.empleado_nombre,
        area: datos.area,
        motivo: datos.motivo,
        autorizado_por: datos.autorizado_por,
        firma: null,
        lineas: datos.lineas,
      });

      if (!resultado.ok) {
        notify(resultado.error || 'Error', 'error');
        return;
      }

      notify('Entrega registrada', 'success');
      modal.close();
      renderEntregas();
    }
  }, true);
}

function openDetalleEntrega(id) {
  const entrega = getStore().entregasNuevas.find(e => e.id === id);
  if (!entrega) return;

  const lineas = getStore().lineasEntrega.filter(l => l.entrega_id === id);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);

  let body = `
    <p><strong>Número:</strong> ${esc(entrega.numero)}</p>
    <p><strong>Empleado:</strong> ${esc(entrega.empleado_nombre)}</p>
    <p><strong>Área:</strong> ${esc(entrega.area)}</p>
    <p><strong>Motivo:</strong> ${esc(entrega.motivo)}</p>
    <p><strong>Fecha:</strong> ${fmtDate(entrega.fecha_hora)}</p>
    <p><strong>Entregado por:</strong> ${esc(entrega.entregado_por)}</p>

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

  modal.open(`Entrega: ${entrega.numero}`, body, '<button class="btn btn-secondary" onclick="window.modalClose()">Cerrar</button>', 'md');
  window.modalClose = () => modal.close();
}

function imprimirRecibo(id) {
  const entrega = getStore().entregasNuevas.find(e => e.id === id);
  if (!entrega) return;

  const lineas = getStore().lineasEntrega.filter(l => l.entrega_id === id);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);

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
        <tr><td><strong>Empleado:</strong></td><td>${esc(entrega.empleado_nombre)}</td></tr>
        <tr><td><strong>Área:</strong></td><td>${esc(entrega.area)}</td></tr>
        <tr><td><strong>Motivo:</strong></td><td>${esc(entrega.motivo)}</td></tr>
        <tr><td><strong>Fecha:</strong></td><td>${fmtDate(entrega.fecha_hora)}</td></tr>
      </table>

      <h4 style="margin-top: 10px; font-size: 12px;">Productos</h4>
      <table>
        <tr style="font-weight: bold; border-bottom: 2px solid #000;"><td>Producto</td><td style="text-align: right;">Cant</td></tr>
        ${lineas.map(l => {
          const p = getStore().productos.find(x => x.id === l.producto_id);
          return `<tr><td>${p ? esc(p.nombre) : '?'}</td><td style="text-align: right;">${l.cantidad}</td></tr>`;
        }).join('')}
        <tr class="total"><td>Total</td><td style="text-align: right;">${piezas}</td></tr>
      </table>

      <div class="firma">
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Empleado: __________</span>
          <span>Entregó: __________</span>
        </div>
      </div>
      <p style="font-size: 10px; text-align: center; margin-top: 10px;">Generado: ${new Date().toLocaleString('es-MX')}</p>
    </body>
    </html>
  `;

  const w = window.open('', '', 'width=300,height=400');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}
