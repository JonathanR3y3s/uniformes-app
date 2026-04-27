# Sistema de Inventario

## SKU legacy

Estado: existente pero oculto del NAV.

Archivos principales:
- `js/sku-api.js`
- `js/inventario-sku.js`
- `js/entrega-sku.js`
- `js/devolucion-sku.js`

Store usado:
- `articulos`
- `skus`
- `movimientosInventario`
- `documentosEntrega`
- `documentosDevolucion`

Notas:
- El sistema SKU se conserva por compatibilidad historica.
- Sus datos permanecen intactos en localStorage.
- No se migra todavia y no debe borrarse en esta fase.
- Las vistas siguen registradas en `app.js`, pero no aparecen en el NAV.

## v7.0 actual

Estado: activo y visible en el NAV.

Archivos principales:
- `js/almacen-api.js`
- `js/inventario.js`
- `js/categorias.js`
- `js/recepcion.js`
- `js/entregas.js`
- `js/devoluciones.js`
- `js/salidas-almacen.js`
- `js/reportes.js`

Store usado:
- `productos`
- `categorias`
- `entradas`
- `lineasEntrada`
- `entregasNuevas`
- `lineasEntrega`
- `salidasNuevas`
- `lineasSalida`
- `devolucionesNuevas`
- `lineasDevolucion`
- `movimientos`

Notas:
- `almacen-api.js` es la capa central del sistema v7.0.
- Los movimientos v7.0 son la fuente operativa para cambios de stock.
- Las vistas activas del NAV deben apuntar al sistema v7.0.

## Solapamiento

Ambos sistemas representan inventario, entregas, devoluciones y movimientos, pero usan colecciones distintas y no comparten una misma fuente de verdad.

Solapamientos principales:
- Catalogo/inventario: `articulos`/`skus` vs `productos`/`categorias`.
- Entregas: `documentosEntrega` vs `entregasNuevas`/`lineasEntrega`.
- Devoluciones: `documentosDevolucion` vs `devolucionesNuevas`/`lineasDevolucion`.
- Movimientos: `movimientosInventario` vs `movimientos`.

Recomendacion:
- Mantener SKU legacy oculto por ahora.
- No migrar todavia.
- No mezclar escrituras entre SKU y v7.0.
- Planear una migracion posterior con respaldo de localStorage, mapa de campos y validacion de stock antes/despues.

## Vistas existentes pero no visibles

Verificacion limitada contra `app.js` y `js/config.js`.

Estas vistas estan registradas en `app.js` y no estan en el NAV:
- `entregasv2`
- `exportar`
- `operador`
- `tablero`
- `inventario-sku`
- `entrega-sku`
- `devolucion-sku`

Notas:
- No se abrieron ni validaron sus archivos en esta fase.
- Se documentan solo como existentes pero no visibles.
- No se recomienda eliminarlas hasta decidir su uso o archivo en una fase posterior.
