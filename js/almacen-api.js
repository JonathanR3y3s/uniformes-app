/**
 * ALMACÉN API
 * Motor de negocio para el sistema unificado de almacén, inventario y entregas.
 * Centraliza toda la lógica de operaciones con stock, movimientos, y documentos.
 */

import { getStore, saveProductos, saveCategorias, saveEntradas, saveLineasEntrada, saveEntregasNuevas, saveLineasEntrega, saveSalidasNuevas, saveLineasSalida, saveDevolucionesNuevas, saveLineasDevolucion, saveMovimientos } from './storage.js';
import { genId } from './utils.js';
import { getUser } from './user-roles.js';

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

  return result;
}

export function getProductoById(id) {
  const store = getStore();
  return store.productos.find(p => p.id === id);
}

export function createProducto({ nombre, categoria_id, descripcion, unidad, foto, es_entregable, es_por_variante, stock_minimo, proveedor_frecuente }) {
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
    sku,
    stock_actual: es_por_variante ? 0 : 0,
    stock_minimo: stock_minimo || 5,
    costo_promedio: 0,
    ultimo_costo: 0,
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

export function registrarEntrada({ proveedor, factura_data, lineas = [], observaciones }) {
  const store = getStore();
  const user = getUser();

  // Validar lineas
  for (const linea of lineas) {
    if (!linea.producto_id) return { ok: false, error: 'Línea sin producto' };
    if (!linea.cantidad || linea.cantidad <= 0) return { ok: false, error: 'Cantidad inválida' };
    if (linea.costo_unitario == null) return { ok: false, error: 'Falta costo unitario' };

    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (!prod) return { ok: false, error: 'Producto no encontrado: ' + linea.producto_id };
  }

  const id = 'ent-' + Date.now();
  const numero = nextNumeroEntrada();
  const entrada = {
    id,
    numero,
    fecha_hora: new Date().toISOString(),
    recibido_por: user?.name || 'Sistema',
    recibido_por_id: user?.id || 'system',
    proveedor,
    factura_folio: factura_data?.folio || null,
    factura_fecha: factura_data?.fecha || null,
    factura_subtotal: factura_data?.subtotal || null,
    factura_iva: factura_data?.iva || null,
    factura_total: factura_data?.total || null,
    factura_foto: factura_data?.foto || null,
    observaciones: observaciones || '',
    estado: factura_data?.folio ? 'completa' : 'pendiente_factura',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: new Date().toISOString(),
  };

  store.entradas.push(entrada);

  // Procesar líneas: actualizar stock y crear movimientos
  for (const linea of lineas) {
    const linea_id = 'line-' + Date.now() + Math.random();
    const linea_obj = {
      id: linea_id,
      entrada_id: id,
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: linea.cantidad,
      costo_unitario: linea.costo_unitario,
      costo_total: linea.cantidad * linea.costo_unitario,
      foto_producto: linea.foto_producto || null,
      observaciones: linea.observaciones || '',
    };

    store.lineasEntrada.push(linea_obj);

    // Actualizar stock y costo del producto
    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (prod) {
      if (linea.variante_id) {
        const var_obj = prod.variantes.find(v => v.id === linea.variante_id);
        if (var_obj) {
          var_obj.stock_actual = (var_obj.stock_actual || 0) + linea.cantidad;
          var_obj.ultimo_costo = linea.costo_unitario;
        }
      } else {
        prod.stock_actual = (prod.stock_actual || 0) + linea.cantidad;
        prod.ultimo_costo = linea.costo_unitario;
        // Actualizar costo promedio
        const stockAnterior = prod.stock_actual - linea.cantidad;
        if (stockAnterior >= 0) {
          prod.costo_promedio = (prod.costo_promedio * stockAnterior + linea.costo_unitario * linea.cantidad) / prod.stock_actual;
        } else {
          prod.costo_promedio = linea.costo_unitario;
        }
      }
    }

    // Registrar movimiento de entrada
    const mov_resultado = registrarMovimiento({
      tipo: 'entrada_compra',
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: linea.cantidad,
      documento_id: id,
      documento_tipo: 'entrada',
      costo_unitario: linea.costo_unitario,
      observaciones: `Entrada ${numero} - ${proveedor}`,
    });

    if (!mov_resultado.ok) return mov_resultado;
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

export function registrarEntregaNueva({ empleado_id, empleado_nombre, area, motivo, autorizado_por, firma, lineas = [], observaciones }) {
  const store = getStore();
  const user = getUser();

  // Validación TODO-OR-NOTHING: verificar stock de todas las líneas
  for (const linea of lineas) {
    if (!linea.producto_id || !linea.cantidad || linea.cantidad <= 0) {
      return { ok: false, error: 'Línea inválida' };
    }

    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (!prod) return { ok: false, error: 'Producto no encontrado' };

    let stock_disponible = 0;
    if (linea.variante_id) {
      const var_obj = prod.variantes.find(v => v.id === linea.variante_id);
      if (!var_obj) return { ok: false, error: 'Variante no encontrada' };
      stock_disponible = var_obj.stock_actual || 0;
    } else {
      stock_disponible = prod.stock_actual || 0;
    }

    if (stock_disponible < linea.cantidad) {
      return { ok: false, error: `Stock insuficiente en ${prod.nombre}` };
    }
  }

  // Todas las validaciones pasaron, proceder
  const id = 'ent-nueva-' + Date.now();
  const numero = nextNumeroEntregaNueva();
  const entrega = {
    id,
    numero,
    fecha_hora: new Date().toISOString(),
    empleado_id: empleado_id || null,
    empleado_nombre,
    area: area || '',
    motivo: motivo || '',
    autorizado_por: autorizado_por || '',
    firma: firma || null,
    observaciones: observaciones || '',
    entregado_por: user?.name || 'Sistema',
    entregado_por_id: user?.id || 'system',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: new Date().toISOString(),
  };

  store.entregasNuevas.push(entrega);

  // Procesar líneas
  for (const linea of lineas) {
    const linea_id = 'line-' + Date.now() + Math.random();
    const linea_obj = {
      id: linea_id,
      entrega_id: id,
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: linea.cantidad,
      observaciones: linea.observaciones || '',
    };

    store.lineasEntrega.push(linea_obj);

    // Restar stock
    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (prod) {
      if (linea.variante_id) {
        const var_obj = prod.variantes.find(v => v.id === linea.variante_id);
        if (var_obj) {
          var_obj.stock_actual = Math.max(0, (var_obj.stock_actual || 0) - linea.cantidad);
        }
      } else {
        prod.stock_actual = Math.max(0, (prod.stock_actual || 0) - linea.cantidad);
      }
    }

    // Registrar movimiento
    registrarMovimiento({
      tipo: 'salida_entrega',
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: -linea.cantidad,
      documento_id: id,
      documento_tipo: 'entrega',
      observaciones: `Entrega ${numero} a ${empleado_nombre}`,
    });
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

    let stock_disponible = 0;
    if (linea.variante_id) {
      const var_obj = prod.variantes.find(v => v.id === linea.variante_id);
      if (!var_obj) return { ok: false, error: 'Variante no encontrada' };
      stock_disponible = var_obj.stock_actual || 0;
    } else {
      stock_disponible = prod.stock_actual || 0;
    }

    if (stock_disponible < linea.cantidad) {
      return { ok: false, error: `Stock insuficiente en ${prod.nombre}` };
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

  store.salidasNuevas.push(salida);

  // Tipo de movimiento correspondiente
  const tipoMovimientoMap = {
    colocacion: 'salida_colocacion',
    merma: 'salida_merma',
    ajuste: 'salida_ajuste',
    devolucion_proveedor: 'salida_devolucion_proveedor',
    uso_interno: 'salida_uso_interno',
  };

  for (const linea of lineas) {
    const linea_id = 'line-' + Date.now() + Math.random();
    const linea_obj = {
      id: linea_id,
      salida_id: id,
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: linea.cantidad,
      observaciones: linea.observaciones || '',
    };

    store.lineasSalida.push(linea_obj);

    // Restar stock
    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (prod) {
      if (linea.variante_id) {
        const var_obj = prod.variantes.find(v => v.id === linea.variante_id);
        if (var_obj) {
          var_obj.stock_actual = Math.max(0, (var_obj.stock_actual || 0) - linea.cantidad);
        }
      } else {
        prod.stock_actual = Math.max(0, (prod.stock_actual || 0) - linea.cantidad);
      }
    }

    // Registrar movimiento
    registrarMovimiento({
      tipo: tipoMovimientoMap[tipo] || 'salida_ajuste',
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: -linea.cantidad,
      documento_id: id,
      documento_tipo: 'salida',
      observaciones: motivo || '',
    });
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

export function registrarDevolucionNueva({ entrega_original_id, empleado_id, empleado_nombre, motivo, lineas = [], observaciones }) {
  const store = getStore();
  const user = getUser();

  // Validación
  for (const linea of lineas) {
    if (!linea.producto_id || !linea.cantidad || linea.cantidad <= 0) {
      return { ok: false, error: 'Línea inválida' };
    }
  }

  const id = 'dev-nueva-' + Date.now();
  const numero = nextNumeroDevolucionNueva();
  const devolucion = {
    id,
    numero,
    fecha_hora: new Date().toISOString(),
    entrega_original_id: entrega_original_id || null,
    empleado_id: empleado_id || null,
    empleado_nombre: empleado_nombre || '',
    motivo: motivo || '',
    observaciones: observaciones || '',
    recibido_por: user?.name || 'Sistema',
    recibido_por_id: user?.id || 'system',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: new Date().toISOString(),
  };

  store.devolucionesNuevas.push(devolucion);

  // Procesar líneas: SUMA stock
  for (const linea of lineas) {
    const linea_id = 'line-' + Date.now() + Math.random();
    const linea_obj = {
      id: linea_id,
      devolucion_id: id,
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: linea.cantidad,
      observaciones: linea.observaciones || '',
    };

    store.lineasDevolucion.push(linea_obj);

    // Suma stock
    const prod = store.productos.find(p => p.id === linea.producto_id);
    if (prod) {
      if (linea.variante_id) {
        const var_obj = prod.variantes.find(v => v.id === linea.variante_id);
        if (var_obj) {
          var_obj.stock_actual = (var_obj.stock_actual || 0) + linea.cantidad;
        }
      } else {
        prod.stock_actual = (prod.stock_actual || 0) + linea.cantidad;
      }
    }

    // Registrar movimiento entrada
    registrarMovimiento({
      tipo: 'entrada_devolucion',
      producto_id: linea.producto_id,
      variante_id: linea.variante_id || null,
      cantidad: linea.cantidad,
      documento_id: id,
      documento_tipo: 'devolucion',
      observaciones: `Devolución ${numero} de ${empleado_nombre}`,
    });
  }

  saveProductos();
  saveDevolucionesNuevas();
  saveLineasDevolucion();
  return { ok: true, devolucion };
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

export function registrarMovimiento({ tipo, producto_id, variante_id, cantidad, documento_id, documento_tipo, costo_unitario, observaciones }) {
  const store = getStore();
  const user = getUser();

  // Obtener stock antes
  const prod = store.productos.find(p => p.id === producto_id);
  if (!prod) return { ok: false, error: 'Producto no encontrado' };

  let stock_antes = 0;
  if (variante_id) {
    const var_obj = prod.variantes.find(v => v.id === variante_id);
    stock_antes = var_obj ? (var_obj.stock_actual || 0) : 0;
  } else {
    stock_antes = prod.stock_actual || 0;
  }

  const stock_despues = stock_antes + cantidad;

  // VALIDACIÓN CARDINAL: no permitir stock negativo
  if (stock_despues < 0) {
    return { ok: false, error: 'Stock insuficiente' };
  }

  // Crear movimiento
  const id = 'mov-' + Date.now();
  const movimiento = {
    id,
    fecha_hora: new Date().toISOString(),
    tipo,
    producto_id,
    variante_id: variante_id || null,
    cantidad,
    stock_antes,
    stock_despues,
    documento_id: documento_id || null,
    documento_tipo: documento_tipo || '',
    costo_unitario: costo_unitario || 0,
    observaciones: observaciones || '',
    creado_por: user?.name || 'Sistema',
    fecha_creacion: new Date().toISOString(),
  };

  store.movimientos.push(movimiento);
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
