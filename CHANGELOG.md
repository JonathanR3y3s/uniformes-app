# CHANGELOG — Control Store Pro

## v7.1 — Fase 1: Correcciones Críticas (2026-04-26)

### Corregidos
- **almacen-api.js**: Patrón transaccional en stock
- **reportes.js**: Campos alineados con esquema v7.0
- **areas-config.js**: Listener acumulable corregido
- **users.js**: Listener acumulable corregido
- **entrega-sku.js**: Listener acumulable corregido
- **devolucion-sku.js**: Listener acumulable corregido
- **entregas.js**: Listener acumulable corregido
- **devoluciones.js**: Listener acumulable corregido
- **recepcion.js**: Listener acumulable corregido
- **offline-storage.js**: JSON.parse con try-catch

### Verificado
- Recepción, entrega, devolución, salida: stock correcto
- Reportes: datos reales v7.0
- 16 vistas: 0 errores en consola
