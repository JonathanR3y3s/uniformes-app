/**
 * ALMACÉN API
 * Motor de negocio para el sistema unificado de almacén, inventario y entregas.
 * Centraliza toda la lógica de operaciones con stock, movimientos, y documentos.
 */

import { getStore, saveProductos, saveCategorias, saveEntradas, saveLineasEntrada, saveEntregasNuevas, saveLineasEntrega, saveSalidasNuevas, saveLineasSalida, saveDevolucionesNuevas, saveLineasDevolucion, saveMovimientos } from './storage.js';
import { generarLoteFecha } from './utils.js';
import { getUser } from './user-roles.js';

function _cloneAlmacenState(store) {
  return JSON.parse(JSON.stringify({
    productos: store.productos || [],
    entradas: store.entradas || [],
    lineasEntrada: store.lineasEntrada || [],
    entregasNuevas: store.entregasNuevas || [],
    lineasEntrega: store.lineasEntrega || [],
    salidasNuevas: store.salidasNuevas || [],
    lineasSalida: store.lineasSalida || [],
    devolucionesNuevas: store.devolucionesNuevas || [],
    lineasDevolucion: store.lineasDevolucion || [],
    movimientos: store.movimientos || [],
  }));
}

function _restoreAlmacenState(store, snap) {
  store.productos = snap.productos;
  store.entradas = snap.entradas;
  store.lineasEntrada = snap.lineasEntrada;
  store.entregasNuevas = snap.entregasNuevas;
  store.lineasEntrega = snap.lineasEntrega;
  store.salidasNuevas = snap.salidasNuevas;
  store.lineasSalida = snap.lineasSalida;
  store.devolucionesNuevas = snap.devolucionesNuevas;
  store.lineasDevolucion = snap.lineasDevolucion;
  store.movimientos = snap.movimientos;
  saveProductos();
  saveEntradas();
  saveLineasEntrada();
  saveEntregasNuevas();
  saveLineasEntrega();
  saveSalidasNuevas();
  saveLineasSalida();
  saveDevolucionesNuevas();
  saveLineasDevolucion();
  saveMovimientos();
}

function _getStockTarget(producto, variante_id) {
  if (!producto) return { ok: false, error: 'Producto no encontrado' };
  if (!variante_id) return { ok: true, target: producto };
  const variante = (producto.variantes || []).find(v => v.id === variante_id);
  if (!variante) return { ok: false, error: 'Variante no encontrada' };
  return { ok: true, target: variante };
}

function _aplicarStock(producto, delta, variante_id = null, costo_unitario = 0) {
  const targetResult = _getStockTarget(producto, variante_id);
  if (!targetResult.ok) return targetResult;

  const target = targetResult.target;
  const cantidad = Number(delta) || 0;
  const stock_antes = Number(target.stock_actual) || 0;
  const stock_despues = stock_antes + cantidad;
  if (stock_despues < 0) return { ok: false, error: `Stock insuficiente. Disponible: ${stock_antes}` };

  target.stock_actual = stock_despues;

  const costo = Number(costo_unitario) || 0;
  if (cantidad > 0 && costo > 0) {
    target.ultimo_costo = costo;
    if (!variante_id) {
      const costoAnterior = Number(producto.costo_promedio) || 0;
      producto.costo_promedio = stock_despues > 0
        ? ((costoAnterior * stock_antes) + (costo * cantidad)) / stock_despues
        : costo;
    }
  }

  return { ok: true, stock_antes, stock_despues };
}

function _findVarianteByStockKey(producto, stockKey = null) {
  const variantes = Array.isArray(producto?.variantes) ? producto.variantes : [];
  if (!stockKey || !variantes.length) return null;
  const key = String(stockKey).trim().toLowerCase();
  return variantes.find(v =>
    String(v.id || '').toLowerCase() === key ||
    String(v.talla || '').trim().toLowerCase() === key ||
    String(v.nombre || '').trim().toLowerCase() === key
  ) || null;
}

function _getStockDesdeMovimientos(producto_id, variante_id = null) {
  const movs = (getStore().movimientos || [])
    .filter(m => m.producto_id === producto_id && String(m.variante_id || '') === String(variante_id || ''))
    .sort((a, b) => String(b.fecha_hora || '').localeCompare(String(a.fecha_hora || '')));
  if (!movs.length) return null;
  return Number(movs[0].stock_despues) || 0;
}

export function getStockDisponible(producto_id, talla = null) {
  const producto = getStore().productos.find(p => p.id === producto_id);
  if (!producto) return 0;

  const variantes = Array.isArray(producto.variantes) ? producto.variantes : [];
  if (variantes.length) {
    const variante = _findVarianteByStockKey(producto, talla);
    if (variante) {
      const desdeMovimientos = _getStockDesdeMovimientos(producto.id, variante.id);
      return desdeMovimientos ?? (Number(variante.stock_actual) || 0);
    }
    if (!talla) {
      return variantes.reduce((total, v) => {
        const desdeMovimientos = _getStockDesdeMovimientos(producto.id, v.id);
        return total + (desdeMovimientos ?? (Number(v.stock_actual) || 0));
      }, 0);
    }
    return 0;
  }

  const desdeMovimientos = _getStockDesdeMovimientos(producto.id, null);
  return desdeMovimientos ?? (Number(producto.stock_actual) || 0);
}

/**
 * ─────────────────────────────────────────────────────────────
 * CATEGORÍAS
 * ─────────────────────────────────────────────────────────────
 */

export function getCategorias() {
  return getStore().categorias || [];
}

export function createCategoria({ nombre, icono, color, orden }) {
  const store = getStore();
  const id = 'cat-' + Date.now();
  const cat = {
    id,
    nombre,
    icono,
    color,
    orden: orden || store.categorias.length + 1,
    activa: true,
    fecha_creacion: new Date().toISOString(),
  };
  store.categorias.push(cat);
  saveCategorias();
  return cat;
}

export function updateCategoria(id, data) {
  const store = getStore();
  const cat = store.categorias.find(c => c.id === id);
  if (!cat) return { ok: false, error: 'Categoría no encontrada' };
  Object.assign(cat, data);
  saveCategorias();
  return { ok: true, categoria: cat };
}

/**
 * ─────────────────────────────────────────────────────────────
 * GENERACIÓN DE SKU
 * ─────────────────────────────────────────────────────────────
 */

export function generateSKU(nombre, talla, modelo) {
  // Primeras 4 letras del nombre (mayúsculas, sin espacios)
  const base = (nombre || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 4)
    .padEnd(4, 'X');

  // Número de talla con padding de 3 dígitos, si no hay talla: UNI
  const tallaPart = talla ? String(talla).padStart(3, '0') : 'UNI';

  // Últimas 2 dígitos del año, si no hay modelo: 000
  const modeloPart = modelo ? String(modelo).slice(-2).padStart(2, '0') : '00';

  return `${base}-${tallaPart}-${modeloPart}`;
}

/**
 * ─────────────────────────────────────────────────────────────
 * PRODUCTOS
 * ─────────────────────────────────────────────────────────────
 */

export function getProductos(filtros = {}) {
  const store = getStore();
  let result = [...store.productos];

  if (filtros.nivel_control) {
    const nivel = Number(filtros.nivel_control);
    result = result.filter(p => Number(p.nivel_control || 3) === nivel);
  }
  if (filtros.categoria_id) {
    result = result.filter(p => p.categoria_id === filtros.categoria_id);
  }
  if (filtros.q) {
    const q = filtros.q.toLowerCase();
    result = result.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q)
    );
  }
  if (filtros.bajoStock) {
    result = result.filter(p => {
      if (p.es_por_variante && p.variantes && p.variantes.length) {
        return p.variantes.some(v => (v.stock_actual || 0) <= (v.stock_minimo || 5));
      } else {
        return (p.stock_actual || 0) <= (p.stock_minimo || 5);
      }
    });
  }
  if (filtros.soloEntregables) {
    result = result.filter(p => p.es_entregable);
  }
  if (filtros.tipo) {
    result = result.filter(p => (p.tipo || 'personal') === filtros.tipo);
  }

  return result;
}

export function getProductoById(id) {
  const store = getStore();
  return store.productos.find(p => p.id === id);
}

export function createProducto({ nombre, categoria_id, descripcion, unidad, foto, foto_producto, tipo, es_entregable, es_por_variante, stock_minimo, proveedor_frecuente, nivel_control }) {
  const store = getStore();
  const user = getUser();

  const id = 'prod-' + Date.now();
  const sku = generateSKU(nombre, null, null);

  const producto = {
    id,
    nombre,
    categoria_id,
    descripcion: descripcion || '',
    unidad: unidad || 'pieza',
    foto: foto || null,
    foto_producto: foto_producto || foto || null,
    sku,
    stock_actual: es_por_variante ? 0 : 0,
    stock_minimo: Number.isFinite(Number(stock_minimo)) ? Number(stock_minimo) : 5,
    nivel_control: Number(nivel_control) || 3,
    costo_promedio: 0,
    ultimo_costo: 0,
    tipo: tipo === 'consumible' ? 'consumible' : 'personal',
    es_entregable: es_entregable || false,
    es_por_variante: es_por_variante || false,
    variantes: [],
    proveedor_frecuente: proveedor_frecuente || '',
    activo: true,
    creado_por: user?.name || 'Sistema',
    fecha_creacion: new Date().toISOString(),
    actualizado_por: user?.name || 'Sistema',
    fecha_actualizacion: new Date().toISOString(),
  };

  store.productos.push(producto);
  saveProductos();
  return producto;
}

export function updateProducto(id, data) {
  const store = getStore();
  const prod = store.productos.find(p => p.id === id);
  if (!prod) return { ok: false, error: 'Producto no encontrado' };

  const user = getUser();
  Object.assign(prod, data, {
    actualizado_por: user?.name || 'Sistema',
    fecha_actualizacion: new Date().toISOString(),
  });
  saveProductos();
  return { ok: true, producto: prod };
}

export function addVariante(producto_id, { talla, modelo, color }) {
  const store = getStore();
  const prod = store.productos.find(p => p.id === producto_id);
  if (!prod) return { ok: false, error: 'Producto no encontrado' };

  const variante_id = 'var-' + Date.now();
  const sku_variante = generateSKU(prod.nombre, talla, modelo);

  const variante = {
    id: variante_id,
    nombre: `${talla || ''} ${color || ''}`.trim(),
    talla: talla || '',
    modelo: modelo || '',
    color: color || '',
    sku_variante,
    stock_actual: 0,
    stock_minimo: prod.stock_minimo || 5,
    ultimo_costo: 0,
  };

  if (!prod.variantes) prod.variantes = [];
  prod.variantes.push(variante);

  saveProductos();
  return { ok: true, variante };
}

export function getProductosBajoStock() {
  const store = getStore();
  const bajo = [];

  store.productos.forEach(p => {
    if (p.es_por_variante && p.variantes) {
      p.variantes.forEach(v => {
        if ((v.stock_actual || 0) <= (v.stock_minimo || 5)) {
          bajo.push({ ...p, variante: v });
        }
      });
    } else {
      if ((p.stock_actual || 0) <= (p.stock_minimo || 5)) {
        bajo.push(p);
      }
    }
  });

  return bajo;
}

/**
 * ─────────────────────────────────────────────────────────────
 * ENTRADAS (Recepción de Mercancía)
 * ─────────────────────────────────────────────────────────────
 */

export function getEntradas(filtros = {}) {
  const store = getStore();
  let result = [...store.entradas];

  if (filtros.proveedor) {
    result = result.filter(e => e.proveedor.toLowerCase().includes(filtros.proveedor.toLowerCase()));
  }
  if (filtros.estado) {
    result = result.filter(e => e.estado === filtros.estado);
  }
  if (filtros.desde) {
    result = result.filter(e => e.fecha_hora >= filtros.desde);
  }
  if (filtros.hasta) {
    result = result.filter(e => e.fecha_hora <= filtros.hasta);
  }

  return result.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
}

export function registrarEntrada({ id: idOverride, proveedor, fecha_hora, factura_data, lineas = [], observaciones }) {
  const store = getStore();
  const user = getUser();

  // Validar lineas
  for (const linea of lineas) {
    if (!linea.producto_id) return { ok: false, error: 'Línea sin producto' };
    if (!linea.cantidad || linea.cantidad <= 0) return { ok: false, error: 'Cantidad inválida' };
    const costoUnitario = Number(linea.costo_unitario);
    if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
      return { ok: false, error: 'Captura el costo unitario antes de guardar la recepción.' };
    }

    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (!prod) return { ok: false, error: 'Producto no encontrado: ' + linea.producto_id };
    if (linea.variante_id && !(prod.variantes || []).some(v => v.id === linea.variante_id)) {
      return { ok: false, error: 'Variante no encontrada' };
    }
  }

  const snap = _cloneAlmacenState(store);
  const id = idOverride || 'ent-' + Date.now();
  const numero = nextNumeroEntrada();
  const nowISO = new Date().toISOString();
  const fechaRecepcionISO = nowISO;
  const fechaCreacionISO = nowISO;
  const facturaFolio = String(factura_data?.folio || '').trim();
  const estadoFactura = facturaFolio ? 'completa' : 'pendiente';
  const entrada = {
    id,
    numero,
    fecha_hora: fechaRecepcionISO,
    fecha: fechaRecepcionISO,
    fechaRecepcion: fechaRecepcionISO,
    recibido_por: user?.name || 'Sistema',
    recibido_por_id: user?.id || 'system',
    proveedor,
    factura: facturaFolio,
    factura_folio: facturaFolio,
    factura_fecha: facturaFolio ? (factura_data?.fecha || fechaRecepcionISO) : '',
    factura_subtotal: facturaFolio ? (factura_data?.subtotal || 0) : 0,
    factura_iva: facturaFolio ? (factura_data?.iva || 0) : 0,
    factura_total: facturaFolio ? (factura_data?.total || 0) : 0,
    factura_foto: factura_data?.foto || null,
    observaciones: observaciones || '',
    estadoFactura,
    estado: estadoFactura === 'completa' ? 'completa' : 'pendiente_factura',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: fechaCreacionISO,
  };

  store.entradas.push(entrada);

  try {
    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad) || 0;
      const costo = Number(linea.costo_unitario) || 0;
      const linea_id = 'line-' + Date.now() + Math.random();
      const lote = linea.lote || generarLoteFecha();
      const linea_obj = {
        id: linea_id,
        entrada_id: id,
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        lote,
        cantidad,
        costo_unitario: costo,
        costo_total: cantidad * costo,
        foto_producto: linea.foto_producto || null,
        observaciones: linea.observaciones || '',
      };

      store.lineasEntrada.push(linea_obj);

      const mov_resultado = registrarMovimiento({
        tipo: 'entrada_compra',
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        cantidad,
        documento_id: id,
        documento_tipo: 'entrada',
        costo_unitario: costo,
        observaciones: `Entrada ${numero} - ${proveedor}`,
      });

      if (!mov_resultado.ok) throw new Error(mov_resultado.error || 'No se pudo registrar movimiento');
    }
  } catch (e) {
    _restoreAlmacenState(store, snap);
    return { ok: false, error: e.message };
  }

  saveProductos();
  saveEntradas();
  saveLineasEntrada();
  return { ok: true, entrada };
}

export function completarFactura(entrada_id, factura_data) {
  const store = getStore();
  const entrada = store.entradas.find(e => e.id === entrada_id);
  if (!entrada) return { ok: false, error: 'Entrada no encontrada' };

  entrada.factura_folio = factura_data.folio;
  entrada.factura_fecha = factura_data.fecha;
  entrada.factura_subtotal = factura_data.subtotal;
  entrada.factura_iva = factura_data.iva;
  entrada.factura_total = factura_data.total;
  entrada.factura_foto = factura_data.foto || null;
  entrada.factura = factura_data.folio || '';
  entrada.estadoFactura = 'completa';
  entrada.estado = 'completa';

  saveEntradas();
  return { ok: true, entrada };
}

/**
 * ─────────────────────────────────────────────────────────────
 * ENTREGAS A PERSONAL
 * ─────────────────────────────────────────────────────────────
 */

export function getEntregasNuevas(filtros = {}) {
  const store = getStore();
  let result = [...store.entregasNuevas];

  if (filtros.empleado_id) {
    result = result.filter(e => e.empleado_id === filtros.empleado_id);
  }
  if (filtros.area) {
    result = result.filter(e => e.area === filtros.area);
  }
  if (filtros.motivo) {
    result = result.filter(e => e.motivo === filtros.motivo);
  }
  if (filtros.desde) {
    result = result.filter(e => e.fecha_hora >= filtros.desde);
  }
  if (filtros.hasta) {
    result = result.filter(e => e.fecha_hora <= filtros.hasta);
  }

  return result.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
}

export function registrarEntregaNueva({ id: idOverride, empleado_id, empleado_nombre, area, responsable_area, motivo, autorizado_por, firma, firma_empleado, firma_recibe, quien_entrego, quien_recibe, tipo_entrega, tipo_receptor, lineas = [], observaciones }) {
  const store = getStore();
  const user = getUser();
  const receptorValido = empleado_id || (quien_recibe || empleado_nombre || '').trim();
  if (!receptorValido) {
    return { ok: false, error: 'Receptor inválido' };
  }
  if (tipo_receptor === 'area' && (!area || !String(area).trim() || !String(responsable_area || quien_recibe || '').trim())) {
    return { ok: false, error: 'Área y responsable son obligatorios' };
  }

  // Validación TODO-OR-NOTHING: verificar stock de todas las líneas
  for (const linea of lineas) {
    if (!linea.producto_id || !linea.cantidad || linea.cantidad <= 0) {
      return { ok: false, error: 'Línea inválida' };
    }

    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (!prod) return { ok: false, error: 'Producto no encontrado' };

    if (linea.variante_id && !(prod.variantes || []).some(v => v.id === linea.variante_id)) {
      return { ok: false, error: 'Variante no encontrada' };
    }

    const stock_disponible = getStockDisponible(linea.producto_id, linea.variante_id || null);
    if (stock_disponible < linea.cantidad) {
      return { ok: false, error: `Stock insuficiente. Disponible: ${stock_disponible}` };
    }
  }

  // Todas las validaciones pasaron, proceder
  const id = idOverride || 'ent-nueva-' + Date.now();
  const numero = nextNumeroEntregaNueva();
  const nowISO = new Date().toISOString();
  const entrega = {
    id,
    numero,
    fecha_hora: nowISO,
    fecha: nowISO,
    fechaEntrega: nowISO,
    empleado_id: empleado_id || null,
    empleado_nombre: empleado_nombre || quien_recibe || '',
    area: area || '',
    responsable_area: responsable_area || '',
    motivo: motivo || '',
    autorizado_por: autorizado_por || '',
    firma: firma || null,
    firma_empleado: tipo_entrega === 'consumible' ? null : (firma_empleado || firma || null),
    firma_recibe: firma_recibe || firma || null,
    tipo_entrega: tipo_entrega || 'personal',
    tipo_receptor: tipo_receptor || (empleado_id ? 'empleado' : 'area'),
    quien_entrego: quien_entrego || user?.name || 'Sistema',
    quien_recibe: quien_recibe || empleado_nombre || '',
    observaciones: observaciones || '',
    entregado_por: user?.name || 'Sistema',
    entregado_por_id: user?.id || 'system',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: nowISO,
  };

  const snap = _cloneAlmacenState(store);
  store.entregasNuevas.push(entrega);
  try {
    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad) || 0;
      const linea_id = 'line-' + Date.now() + Math.random();
      const linea_obj = {
        id: linea_id,
        entrega_id: id,
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        cantidad,
        observaciones: linea.observaciones || '',
      };

      store.lineasEntrega.push(linea_obj);

      const mov_resultado = registrarMovimiento({
        tipo: 'salida_entrega',
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        cantidad: -cantidad,
        documento_id: id,
        documento_tipo: 'entrega',
        observaciones: `Entrega ${numero} a ${empleado_nombre}`,
      });

      if (!mov_resultado.ok) throw new Error(mov_resultado.error || 'No se pudo registrar movimiento');
    }
  } catch (e) {
    _restoreAlmacenState(store, snap);
    return { ok: false, error: e.message };
  }

  saveProductos();
  saveEntregasNuevas();
  saveLineasEntrega();
  return { ok: true, entrega };
}

/**
 * ─────────────────────────────────────────────────────────────
 * SALIDAS
 * ─────────────────────────────────────────────────────────────
 */

export function getSalidas(filtros = {}) {
  const store = getStore();
  let result = [...store.salidasNuevas];

  if (filtros.tipo) {
    result = result.filter(s => s.tipo === filtros.tipo);
  }
  if (filtros.desde) {
    result = result.filter(s => s.fecha_hora >= filtros.desde);
  }
  if (filtros.hasta) {
    result = result.filter(s => s.fecha_hora <= filtros.hasta);
  }

  return result.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
}

export function registrarSalida({ tipo, autorizado_por, motivo, lineas = [], observaciones }) {
  const store = getStore();
  const user = getUser();

  // Validación TODO-OR-NOTHING
  for (const linea of lineas) {
    if (!linea.producto_id || !linea.cantidad || linea.cantidad <= 0) {
      return { ok: false, error: 'Línea inválida' };
    }

    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (!prod) return { ok: false, error: 'Producto no encontrado' };

    if (linea.variante_id) {
      const var_obj = (prod.variantes || []).find(v => v.id === linea.variante_id);
      if (!var_obj) return { ok: false, error: 'Variante no encontrada' };
    }
    const stock_disponible = getStockDisponible(linea.producto_id, linea.variante_id || null);

    if (stock_disponible < linea.cantidad) {
      return { ok: false, error: `Stock insuficiente. Disponible: ${stock_disponible}` };
    }
  }

  // Proceder
  const id = 'sal-' + Date.now();
  const numero = nextNumeroSalidaNueva();
  const salida = {
    id,
    numero,
    fecha_hora: new Date().toISOString(),
    tipo,
    autorizado_por: autorizado_por || '',
    motivo: motivo || '',
    observaciones: observaciones || '',
    registrado_por: user?.name || 'Sistema',
    registrado_por_id: user?.id || 'system',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: new Date().toISOString(),
  };

  // Tipo de movimiento correspondiente
  const tipoMovimientoMap = {
    colocacion: 'salida_colocacion',
    merma: 'salida_merma',
    ajuste: 'salida_ajuste',
    devolucion_proveedor: 'salida_devolucion_proveedor',
    uso_interno: 'salida_uso_interno',
  };

  const snap = _cloneAlmacenState(store);
  store.salidasNuevas.push(salida);
  try {
    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad) || 0;
      const linea_id = 'line-' + Date.now() + Math.random();
      const linea_obj = {
        id: linea_id,
        salida_id: id,
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        cantidad,
        observaciones: linea.observaciones || '',
      };

      store.lineasSalida.push(linea_obj);

      const mov_resultado = registrarMovimiento({
        tipo: tipoMovimientoMap[tipo] || 'salida_ajuste',
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        cantidad: -cantidad,
        documento_id: id,
        documento_tipo: 'salida',
        observaciones: motivo || '',
      });

      if (!mov_resultado.ok) throw new Error(mov_resultado.error || 'No se pudo registrar movimiento');
    }
  } catch (e) {
    _restoreAlmacenState(store, snap);
    return { ok: false, error: e.message };
  }

  saveProductos();
  saveSalidasNuevas();
  saveLineasSalida();
  return { ok: true, salida };
}

/**
 * ─────────────────────────────────────────────────────────────
 * DEVOLUCIONES
 * ─────────────────────────────────────────────────────────────
 */

export function getDevolucionesNuevas(filtros = {}) {
  const store = getStore();
  let result = [...store.devolucionesNuevas];

  if (filtros.empleado_id) {
    result = result.filter(d => d.empleado_id === filtros.empleado_id);
  }
  if (filtros.desde) {
    result = result.filter(d => d.fecha_hora >= filtros.desde);
  }
  if (filtros.hasta) {
    result = result.filter(d => d.fecha_hora <= filtros.hasta);
  }

  return result.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
}

export function registrarDevolucionNueva({ id: idOverride, entrega_original_id, entrega_original_folio, devolucion_sin_entrega_original, empleado_id, empleado_nombre, area, motivo, condicion, lineas = [], observaciones, firma }) {
  const store = getStore();
  const user = getUser();
  const motivoNormalizado = String(motivo || '').trim();
  const sinEntregaOriginal = Boolean(devolucion_sin_entrega_original);
  const entregaReferencia = entrega_original_id || entrega_original_folio || '';
  const entregaOriginal = entrega_original_id
    ? store.entregasNuevas.find(e => e.id === entrega_original_id)
    : entrega_original_folio
      ? store.entregasNuevas.find(e => e.numero === entrega_original_folio)
      : null;

  if (!entregaReferencia && !sinEntregaOriginal) {
    return { ok: false, error: 'Selecciona entrega original o registra la excepción' };
  }
  if (entregaReferencia && !entregaOriginal) {
    return { ok: false, error: 'Entrega original no encontrada' };
  }
  if (sinEntregaOriginal && motivoNormalizado !== 'Devolución sin entrega original') {
    return { ok: false, error: 'El motivo debe ser "Devolución sin entrega original"' };
  }
  if (!motivoNormalizado) {
    return { ok: false, error: 'El motivo es obligatorio' };
  }
  const lineasOriginales = entregaOriginal
    ? (store.lineasEntrega || []).filter(l => l.entrega_id === entregaOriginal.id)
    : [];

  // Validación
  for (const linea of lineas) {
    if (!linea.producto_id || !linea.cantidad || linea.cantidad <= 0) {
      return { ok: false, error: 'Línea inválida' };
    }
    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (!prod) return { ok: false, error: 'Producto no encontrado' };
    if (linea.variante_id && !(prod.variantes || []).some(v => v.id === linea.variante_id)) {
      return { ok: false, error: 'Variante no encontrada' };
    }
    const condicionLinea = linea.condicion || condicion || 'regresa_a_stock';
    if (!['regresa_a_stock', 'va_a_merma', 'reparacion_revision'].includes(condicionLinea)) {
      return { ok: false, error: 'Condición inválida' };
    }
    if (lineasOriginales.length) {
      const cantidadOriginal = lineasOriginales
        .filter(l => l.producto_id === linea.producto_id && String(l.variante_id || '') === String(linea.variante_id || ''))
        .reduce((sum, l) => sum + (Number(l.cantidad) || 0), 0);
      if (!cantidadOriginal) {
        return { ok: false, error: 'Producto no pertenece a la entrega original' };
      }
      if (Number(linea.cantidad) > cantidadOriginal) {
        return { ok: false, error: 'La devolución excede la entrega original' };
      }
    }
  }

  const id = idOverride || 'dev-nueva-' + Date.now();
  const numero = nextNumeroDevolucionNueva();
  const nowISO = new Date().toISOString();
  const devolucion = {
    id,
    numero,
    fecha_hora: nowISO,
    fecha: nowISO,
    fechaDevolucion: nowISO,
    entrega_original_id: entregaOriginal?.id || null,
    entrega_original_folio: entregaOriginal?.numero || entrega_original_folio || '',
    devolucion_sin_entrega_original: sinEntregaOriginal,
    empleado_id: empleado_id || null,
    empleado_nombre: empleado_nombre || '',
    area: area || '',
    motivo: motivoNormalizado,
    condicion: condicion || 'regresa_a_stock',
    observaciones: observaciones || '',
    firma: firma || null,
    recibido_por: user?.name || 'Sistema',
    recibido_por_id: user?.id || 'system',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: nowISO,
  };

  const snap = _cloneAlmacenState(store);
  store.devolucionesNuevas.push(devolucion);
  try {
    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad) || 0;
      const linea_id = 'line-' + Date.now() + Math.random();
      const linea_obj = {
        id: linea_id,
        devolucion_id: id,
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        cantidad,
        condicion: linea.condicion || condicion || 'regresa_a_stock',
        observaciones: linea.observaciones || '',
      };

      store.lineasDevolucion.push(linea_obj);
      const condicionLinea = linea_obj.condicion;
      if (condicionLinea !== 'regresa_a_stock') continue;

      const mov_resultado = registrarMovimiento({
        tipo: 'entrada_devolucion',
        producto_id: linea.producto_id,
        variante_id: linea.variante_id || null,
        cantidad,
        documento_id: id,
        documento_tipo: 'devolucion',
        motivo: motivoNormalizado,
        observaciones: `Devolución ${numero} de ${empleado_nombre}`,
      });

      if (!mov_resultado.ok) throw new Error(mov_resultado.error || 'No se pudo registrar movimiento');
    }
  } catch (e) {
    _restoreAlmacenState(store, snap);
    return { ok: false, error: e.message };
  }

  saveProductos();
  saveDevolucionesNuevas();
  saveLineasDevolucion();
  return { ok: true, devolucion };
}

/**
 * ─────────────────────────────────────────────────────────────
 * MERMAS
 * ─────────────────────────────────────────────────────────────
 */

export function registrarMerma({ producto_id, producto_nombre, cantidad, talla, motivo, descripcion, evidencia, usuario } = {}) {
  const store = getStore();
  const prod = store.productos.find(p => p.id === producto_id);
  if (!prod) return { ok: false, error: 'Producto no encontrado' };

  const cantidadNum = Number(cantidad);
  if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
    return { ok: false, error: 'Cantidad inválida' };
  }
  if (!motivo) return { ok: false, error: 'El motivo es obligatorio' };

  let variante_id = null;
  let tallaMovimiento = talla || null;
  const variantes = Array.isArray(prod.variantes) ? prod.variantes : [];
  if (variantes.length) {
    const variante = _findVarianteByStockKey(prod, talla);
    if (!variante) return { ok: false, error: 'Variante no encontrada' };
    variante_id = variante.id;
    tallaMovimiento = variante.talla || variante.nombre || variante.id;
  }

  const stockDisponible = getStockDisponible(producto_id, variante_id || null);
  if (stockDisponible < cantidadNum) {
    return { ok: false, error: `Stock insuficiente. Disponible: ${stockDisponible}` };
  }

  const timestamp = Date.now();
  const documento_id = 'merma-' + timestamp;
  const mov_resultado = registrarMovimiento({
    tipo: 'merma',
    producto_id,
    producto_nombre: producto_nombre || prod.nombre,
    variante_id,
    talla: tallaMovimiento,
    cantidad: -cantidadNum,
    documento_id,
    documento_tipo: 'merma',
    motivo,
    descripcion: descripcion || '',
    evidencia: evidencia || null,
    usuario: usuario || getUser()?.name || 'Sistema',
    observaciones: descripcion || motivo,
  });

  if (!mov_resultado.ok) {
    return { ok: false, error: mov_resultado.error || 'No se pudo registrar merma' };
  }

  return { ok: true, movimiento: mov_resultado.movimiento };
}

/**
 * ─────────────────────────────────────────────────────────────
 * MOVIMIENTOS
 * ─────────────────────────────────────────────────────────────
 */

export function getMovimientos(filtros = {}) {
  const store = getStore();
  let result = [...store.movimientos];

  if (filtros.producto_id) {
    result = result.filter(m => m.producto_id === filtros.producto_id);
  }
  if (filtros.variante_id) {
    result = result.filter(m => m.variante_id === filtros.variante_id);
  }
  if (filtros.tipo) {
    result = result.filter(m => m.tipo === filtros.tipo);
  }
  if (filtros.desde) {
    result = result.filter(m => m.fecha_hora >= filtros.desde);
  }
  if (filtros.hasta) {
    result = result.filter(m => m.fecha_hora <= filtros.hasta);
  }

  return result.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
}

export function registrarMovimiento({ tipo, producto_id, producto_nombre, variante_id, talla, cantidad, documento_id, documento_tipo, costo_unitario, observaciones, motivo, descripcion, evidencia, usuario }) {
  const store = getStore();
  const user = getUser();
  const delta = Number(cantidad) || 0;

  // Obtener stock antes
  const prod = store.productos.find(p => p.id === producto_id);
  if (!prod) return { ok: false, error: 'Producto no encontrado' };

  const targetResult = _getStockTarget(prod, variante_id);
  if (!targetResult.ok) return targetResult;

  const stock_antes = getStockDisponible(producto_id, variante_id || null);
  const stock_despues = stock_antes + delta;

  // VALIDACIÓN CARDINAL: no permitir stock negativo
  if (delta < 0 && Math.abs(delta) > stock_antes) {
    return { ok: false, error: `Stock insuficiente. Disponible: ${stock_antes}` };
  }

  // Crear movimiento
  const id = 'mov-' + Date.now();
  const movimiento = {
    id,
    fecha_hora: new Date().toISOString(),
    tipo,
    producto_id,
    producto_nombre: producto_nombre || prod.nombre || '',
    variante_id: variante_id || null,
    talla: talla || '',
    cantidad: delta,
    stock_antes,
    stock_despues,
    documento_id: documento_id || null,
    documento_tipo: documento_tipo || '',
    costo_unitario: costo_unitario || 0,
    observaciones: observaciones || '',
    motivo: motivo || '',
    descripcion: descripcion || '',
    evidencia: evidencia || null,
    usuario: usuario || user?.name || 'Sistema',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: new Date().toISOString(),
  };

  store.movimientos.push(movimiento);
  const aplicado = _aplicarStock(prod, delta, variante_id || null, costo_unitario);
  if (!aplicado.ok) {
    store.movimientos = store.movimientos.filter(m => m.id !== id);
    return aplicado;
  }

  saveProductos();
  saveMovimientos();

  return { ok: true, movimiento };
}

export function getUltimosMovimientos(limit = 20) {
  const store = getStore();
  return store.movimientos.slice(-limit).reverse();
}

/**
 * ─────────────────────────────────────────────────────────────
 * REPORTES
 * ─────────────────────────────────────────────────────────────
 */

export function getResumenMensual(year, month) {
  const store = getStore();
  const desde = new Date(year, month - 1, 1).toISOString();
  const hasta = new Date(year, month, 0, 23, 59, 59).toISOString();

  const entradas = store.entradas.filter(e => e.fecha_hora >= desde && e.fecha_hora <= hasta);
  const entregas = store.entregasNuevas.filter(e => e.fecha_hora >= desde && e.fecha_hora <= hasta);
  const salidas = store.salidasNuevas.filter(s => s.fecha_hora >= desde && s.fecha_hora <= hasta);
  const devoluciones = store.devolucionesNuevas.filter(d => d.fecha_hora >= desde && d.fecha_hora <= hasta);

  let gastoTotal = 0;
  const gastoXCategoria = {};

  // Calcular gasto por entrada
  entradas.forEach(ent => {
    const lineas = store.lineasEntrada.filter(l => l.entrada_id === ent.id);
    lineas.forEach(linea => {
      const prod = store.productos.find(p => p.id === linea.producto_id);
      if (prod) {
        const costo = linea.costo_total || 0;
        gastoTotal += costo;
        const cat = prod.categoria_id;
        gastoXCategoria[cat] = (gastoXCategoria[cat] || 0) + costo;
      }
    });
  });

  return {
    gastoTotal,
    gastoXCategoria,
    entradas: entradas.length,
    entregas: entregas.length,
    salidas: salidas.length,
    devoluciones: devoluciones.length,
  };
}

export function getComparacionMensual(year1, month1, year2, month2) {
  const r1 = getResumenMensual(year1, month1);
  const r2 = getResumenMensual(year2, month2);
  return { mes1: r1, mes2: r2 };
}

export function getConsumoPorProducto(year, month) {
  const store = getStore();
  const desde = new Date(year, month - 1, 1).toISOString();
  const hasta = new Date(year, month, 0, 23, 59, 59).toISOString();

  const consumo = {};
  store.entregasNuevas
    .filter(e => e.fecha_hora >= desde && e.fecha_hora <= hasta)
    .forEach(ent => {
      const lineas = store.lineasEntrega.filter(l => l.entrega_id === ent.id);
      lineas.forEach(linea => {
        const key = linea.producto_id + '|' + (linea.variante_id || '');
        consumo[key] = (consumo[key] || 0) + linea.cantidad;
      });
    });

  return consumo;
}

export function getGastosPorCategoria(year, month) {
  const { gastoXCategoria } = getResumenMensual(year, month);
  return gastoXCategoria;
}

/**
 * ─────────────────────────────────────────────────────────────
 * NUMERACIÓN
 * ─────────────────────────────────────────────────────────────
 */

export function nextNumeroEntrada() {
  const store = getStore();
  const existentes = store.entradas
    .map(e => e.numero)
    .filter(n => n && n.startsWith('REC-'))
    .map(n => parseInt(n.slice(4), 10))
    .filter(n => !isNaN(n));
  const max = existentes.length ? Math.max(...existentes) : 0;
  return 'REC-' + String(max + 1).padStart(5, '0');
}

export function nextNumeroEntregaNueva() {
  const store = getStore();
  const existentes = store.entregasNuevas
    .map(e => e.numero)
    .filter(n => n && n.startsWith('ENT-N-'))
    .map(n => parseInt(n.slice(6), 10))
    .filter(n => !isNaN(n));
  const max = existentes.length ? Math.max(...existentes) : 0;
  return 'ENT-N-' + String(max + 1).padStart(5, '0');
}

export function nextNumeroSalidaNueva() {
  const store = getStore();
  const existentes = store.salidasNuevas
    .map(s => s.numero)
    .filter(n => n && n.startsWith('SAL-'))
    .map(n => parseInt(n.slice(4), 10))
    .filter(n => !isNaN(n));
  const max = existentes.length ? Math.max(...existentes) : 0;
  return 'SAL-' + String(max + 1).padStart(5, '0');
}

export function nextNumeroDevolucionNueva() {
  const store = getStore();
  const existentes = store.devolucionesNuevas
    .map(d => d.numero)
    .filter(n => n && n.startsWith('DEV-N-'))
    .map(n => parseInt(n.slice(6), 10))
    .filter(n => !isNaN(n));
  const max = existentes.length ? Math.max(...existentes) : 0;
  return 'DEV-N-' + String(max + 1).padStart(5, '0');
}

/**
 * ─────────────────────────────────────────────────────────────
 * MIGRACIÓN
 * ─────────────────────────────────────────────────────────────
 */

export function migrateSKUtoUnified() {
  const store = getStore();
  // TODO: Implementar lógica de migración desde store.articulos y store.skus
  // Por ahora solo un stub
  return { ok: true, message: 'Migración lista' };
}
