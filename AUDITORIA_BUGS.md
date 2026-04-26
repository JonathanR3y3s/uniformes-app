# Auditoría de Bugs — Control Store Pro v7.0
**Fecha:** 2026-04-26  
**Alcance:** Todos los módulos JS de `uniformes-app-limpia/js/`  
**Criterio:** Solo bugs reales (datos incorrectos, crashes, memory leaks) — sin refactors ni features.

---

## ✅ Bugs Corregidos

### 🔴 Críticos

#### 1. `importar.js` — Respaldos v7.0 rechazados como incompatibles
**Commit:** `a6e6bb1`  
**Síntoma:** Al restaurar un respaldo de v7.0, la app mostraba "Archivo incompatible". Todos los respaldos recientes eran inútiles.  
**Causa:** `previewRestore()` leía `bk.version` (undefined en v7.0) en lugar de `bk._meta?.version`. La lista blanca no incluía `7.0`.  
**Fix:** `const ver = bk._meta?.version || bk.version || ''` + lista blanca ampliada a `5.0–7.0`. También corregido `bk.exportedAt → bk._meta?.exportedAt`.

#### 2. `salidas-almacen.js` — Salidas guardadas sin campo `tipo`
**Commit:** `a396220`  
**Síntoma:** Todas las salidas tenían `tipo: undefined`. El campo aparecía vacío y los KPIs calculaban mal.  
**Causa:** La llamada a `registrarSalida()` usaba `tipo_salida:` pero la API espera `tipo:`. Las lecturas usaban `s.tipo_salida`.  
**Fix:** Corregido parámetro (`tipo: datos.tipo_salida`) y todas las lecturas de registros (`s.tipo`).

#### 3. `devoluciones.js` — Devoluciones guardadas sin campo `motivo`
**Commit:** `573538b`  
**Síntoma:** Todas las devoluciones tenían `motivo: undefined`. El campo aparecía vacío en tabla y detalles.  
**Causa:** `registrarDevolucionNueva()` recibía `motivo_devolucion:` pero la API espera `motivo:`.  
**Fix:** Corregido parámetro (`motivo: datos.motivo_devolucion`) y todas las lecturas de registros.

#### 4. `salidas-almacen.js` — Memory leak: `document.addEventListener` acumulado por cada apertura del wizard
**Commit:** `a7baa28`  
**Síntoma:** Después de 10 aperturas del wizard, cada clic en el modal disparaba 10 handlers. Guardados múltiples por click.  
**Causa:** `document.addEventListener('click', (e) => {...}, true)` con función anónima dentro de `openNuevaSalida()` — imposible de remover.  
**Fix:** Variable de módulo `_salidasWizardHandler` con `removeEventListener` antes de agregar.

#### 5. `devoluciones.js` — Memory leak: `document.addEventListener` acumulado
**Commit:** `573538b`  
**Fix:** Variable de módulo `_devolucionesWizardHandler`.

#### 6. `entregas.js` — Memory leak: `document.addEventListener` acumulado
**Commit:** `71daa78`  
**Fix:** Variable de módulo `_entregasWizardHandler`.

#### 7. `bitacora.js` — `render() + init()` al limpiar duplicaba todos los listeners
**Commit:** `a6e6bb1`  
**Síntoma:** El handler de "limpiar" se multiplicaba en cada uso.  
**Fix:** Cambiado para llamar solo `renderRows()` en lugar de `render() + init()`.

---

### 🟡 Medios

#### 8. `storage.js` — `JSON.parse` sin try-catch en exportBackup
**Commit:** `f00b753`  
**Síntoma:** Si `_users_store`, `_areas_rules` o `_cats_provs` estaban corruptos, exportar respaldo crasheaba.  
**Fix:** IIFEs con try/catch alrededor de los tres `JSON.parse`.

#### 9. `salidas-almacen.js` — `container.addEventListener` acumulado en cada render
**Commit:** `a7baa28`  
**Síntoma:** Después de 10 filtrados, cada clic en la tabla abría el detalle 10 veces.  
**Fix:** `container.onclick = ...` (reemplaza handler previo).

#### 10. `devoluciones.js` — `container.addEventListener` acumulado
**Commit:** `573538b`  
**Fix:** `container.onclick = ...`

#### 11. `entregas.js` — `container.addEventListener` acumulado
**Commit:** `71daa78`  
**Fix:** `container.onclick = ...`

#### 12. `recepcion.js` — `container.addEventListener` acumulado
**Commit:** `4758a77`  
**Fix:** `container.onclick = ...`

#### 13. `inventario.js` — `container.addEventListener` acumulado
**Commit:** `416ae22`  
**Fix:** `container.onclick = ...`

#### 14. `config-view.js` — `mainContent.addEventListener` acumulado en cada `init()`
**Commit:** `3c35fb4`  
**Fix:** `removeEventListener` antes de `addEventListener`.

#### 15. `entregas.js` — `window.open()` sin null-check (crash con popups bloqueados)
**Commit:** `71daa78`  
**Fix:** `if (!w) { notify(...); return; }`

#### 16. `reportes.js` — `window.open()` sin null-check
**Commit:** `feef170`  
**Fix:** `if (!w) { notify(...); return; }`

#### 17. `entregas.js` — `e.empleado_nombre.toLowerCase()` sin null guard
**Commit:** `71daa78`  
**Fix:** `(e.empleado_nombre || '').toLowerCase()`

---

## ⚠️ Bugs Encontrados — No Corregidos (Deuda Técnica)

### 🟡 Medios (requieren cambio de feature o estructura de datos)

**A.** `entregas.js` — Filtro de área con opciones hardcodeadas (Administración, Operaciones, Ventas, Logística). No refleja áreas reales del sistema.

**B.** `devoluciones.js` — El campo `area` del empleado se captura en el wizard pero `registrarDevolucionNueva()` no lo almacena. Las devoluciones no tienen área.

**C.** `recepcion.js` — El wizard listener vive en `DOMContentLoaded` (siempre activo aunque el wizard esté cerrado). No causa datos incorrectos pero es ineficiente.

**D.** `entrega-sku.js` / `devolucion-sku.js` / `inventario-sku.js` — Módulos del sistema SKU legacy que coexisten con el nuevo modelo v7.0 sin integración. Datos potencialmente duplicados.

**E.** `mod-entregas-v2.js` / `mod-entregas-v2-ui.js` — Posible código muerto (versión intermedia del sistema de entregas).

### 🟢 Menores / Cosméticos

- `entregas.js` — Firma digital del wizard siempre se guarda como `null` (canvas no se serializa a base64).
- `salidas-almacen.js` — Campo `autorizado_por` capturado en datos pero nunca leído en el wizard.
- `recepcion.js` — Foto de factura marcada `TODO` desde la implementación inicial.

---

## 📊 Resumen

| Categoría           | Encontrados | Corregidos |
|---------------------|-------------|------------|
| 🔴 Críticos         | 7           | 7 (100%)   |
| 🟡 Medios           | 10          | 10 (100%)  |
| 🟡 Medios (deuda)   | 5           | 0          |
| 🟢 Menores          | 3           | 0          |

**Commits de corrección:** `a6e6bb1` → `3c35fb4` (10 commits sobre v7.0)

---

## 🔧 Notas Técnicas para Futuros Desarrollos

1. **Patrón wizard seguro:** Guardar handler en variable de módulo → `removeEventListener` → `addEventListener`. Ver `salidas-almacen.js` como referencia.

2. **Patrón tabla reactiva:** Usar `container.onclick = handler` (no `addEventListener`) cuando el contenedor se recrea en cada render.

3. **API Almacén v7.0 — parámetros correctos:**
   - `registrarSalida({ tipo, motivo, lineas })` — NO `tipo_salida`
   - `registrarDevolucionNueva({ motivo, lineas })` — NO `motivo_devolucion`
   - `registrarEntregaNueva({ motivo, lineas })` — correcto desde el inicio

4. **Estructura del backup v7.0:** `bk._meta.version` y `bk._meta.exportedAt` (no en raíz del objeto).

---

## ✅ Correcciones de Deuda Técnica (Segunda Ronda)

### Corregidos

**1. `entregas.js` — Filtro de área hardcodeado**
**Commit:** `087c622`  
**Fix:** Reemplazado con opciones dinámicas: `getStore().areas.filter(a => a.activa !== false).map(...)`. Las áreas ahora reflejan exactamente lo configurado en el sistema.

**2. `almacen-api.js` + `devoluciones.js` — Campo `area` no almacenado en devoluciones**
**Commit:** `80c5ae4`  
**Fix:** Agregado `area` a la firma de `registrarDevolucionNueva()` y al objeto devolucion almacenado. Ahora `d.area` existe y los reportes por área son posibles.

**3. `recepcion.js` — Wizard listener en `DOMContentLoaded` siempre activo**
**Commit:** `c2170af`  
**Fix:** Extraída la lógica a `_attachRecepcionWizardListener()` con variable de módulo `_recepcionWizardHandler`. Se activa al abrir `openNuevaRecepcion()` y se limpia después de confirmar. El listener ya no vive permanentemente en el document.

**6. `entregas.js` — Firma digital siempre `null`**
**Commit:** `40ddbd8`  
**Fix:** En el handler de `btnGuardar`, se llama `canvas.toDataURL('image/png')` antes de guardar si el canvas existe y no se marcó "sin firma". La firma ahora se serializa y almacena correctamente.

**7. `salidas-almacen.js` — Campo `autorizado_por` nunca capturado ni visible**
**Commit:** `c1a531b`  
**Fix:** Agregado campo de texto "Autorizado por" en paso 1 del wizard. Se inicializa en `datos`, se captura en el handler, aparece en el resumen (paso 3) y en el modal de detalle. Se pasa correctamente a `registrarSalida()`.

---

### Investigados — Documentados como Diseño o Limitación Conocida

**4. `mod-entregas-v2.js` / `mod-entregas-v2-ui.js` — Estado del módulo**
- `mod-entregas-v2-ui.js` sí está importado en `app.js` y registrado como vista `entregasv2`
- Sin embargo, **no aparece en `config.js` NAV** — ningún item de navegación apunta a `entregasv2`
- Resultado: el módulo es accesible solo programáticamente (ej. `navigate('entregasv2')`) pero no desde la UI
- `mod-entregas-v2.js` provee la lógica de datos; `mod-entregas-v2-ui.js` la UI
- **Decisión:** No se borra. Es código en espera ("holding pattern") — posiblemente el reemplazo planificado del módulo de entregas de uniformes v1. Documentar como tal.
- **Acción recomendada:** Si el módulo no se va a activar, eliminarlo del import en `app.js` para reducir el bundle inicial.

**5. Módulos SKU legacy — Coexistencia con v7.0**
- Los módulos `inventario-sku.js`, `entrega-sku.js`, `devolucion-sku.js` usan `sku-api.js` que almacena datos en `store.articulos`, `store.skus`, `store.documentosEntrega`, `store.documentosDevolucion`
- El nuevo modelo v7.0 (`almacen-api.js`) almacena en `store.productos`, `store.entregasNuevas`, `store.salidasNuevas`, `store.devolucionesNuevas`
- **No hay solapamiento directo** — son colecciones separadas en el store
- Sin embargo, un "producto" puede existir en `store.skus` (legacy) Y en `store.productos` (v7.0) sin relación entre sí
- El dashboard v7.0 solo lee del nuevo modelo; los reportes SKU legacy solo leen del modelo anterior
- **Acción recomendada:** Migrar datos de `store.skus` → `store.productos` y desactivar los módulos SKU legacy en una futura fase de consolidación. No es urgente mientras ambos sistemas se usen por separado.

**8. `recepcion.js` — Foto de factura marcada `TODO`**
- La captura de foto de factura está marcada como `TODO` en `foto: null` dentro del objeto factura
- Implementar requeriría: input `<file>`, leer con `FileReader`, convertir a base64, y almacenar en el objeto factura
- El objeto `factura_data` ya tiene el campo `foto` reservado — solo falta la UI de captura
- **Complejidad:** Baja-media en mobile (usar `<input type="file" capture="environment">`), media en desktop
- **Estado:** Pendiente de implementación. No afecta el funcionamiento actual — las facturas se registran sin foto correctamente.

---

## 📊 Estado Final

| Item | Estado |
|------|--------|
| Filtro área hardcodeado (`entregas.js`) | ✅ Corregido — `087c622` |
| `area` no almacenada en devoluciones | ✅ Corregido — `80c5ae4` |
| Wizard recepción siempre activo | ✅ Corregido — `c2170af` |
| mod-entregas-v2 dead code | 📋 Documentado — código en espera, no en NAV |
| SKU legacy vs v7.0 coexistencia | 📋 Documentado — stores separados, sin colisión |
| Firma digital null | ✅ Corregido — `40ddbd8` |
| `autorizado_por` no capturado | ✅ Corregido — `c1a531b` |
| Foto de factura TODO | 📋 Documentado — campo reservado, UI pendiente |
