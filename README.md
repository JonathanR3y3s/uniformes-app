# Sistema de Gestión de Uniformes ASSA ABLOY

App PWA para gestión de uniformes — ASSA ABLOY México 2026

## Características

- ✓ Dashboard con KPIs en tiempo real
- ✓ Gestión de empleados (captura de tallas, estado, perfiles)
- ✓ Entregas y salidas de uniformes
- ✓ Inventario y stock extra
- ✓ Importación/exportación Excel
- ✓ Reportes y totales
- ✓ Progressive Web App (offline ready)
- ✓ Soporte para múltiples áreas/plantas

## Estructura

```
.
├── index.html           # Punto de entrada
├── manifest.json        # Configuración PWA
├── sw.js               # Service Worker
├── css/
│   └── styles.css      # Estilos principales
├── js/
│   ├── app.js          # Router principal
│   ├── config.js       # Configuración (reglas, áreas)
│   ├── storage.js      # Gestión de localStorage
│   ├── ui.js           # UI helpers y modales
│   ├── rules.js        # Lógica de negocio
│   ├── utils.js        # Funciones utilitarias
│   ├── dashboard.js    # Vista Dashboard
│   ├── empleados.js    # Vista Empleados
│   ├── captura.js      # Vista Captura de Tallas
│   ├── entregas.js     # Vista Entregas
│   ├── totales.js      # Vista Totales
│   ├── tablero.js      # Tablero Maestro
│   ├── inventario.js   # Vista Inventario
│   ├── salidas.js      # Vista Salidas
│   ├── importar.js     # Importación Excel
│   ├── exportar.js     # Exportación Excel
│   ├── catalogo.js     # Catálogo de áreas
│   ├── config-view.js  # Configuración
│   └── ...
└── icons/              # Iconos generados automáticamente

```

## Desarrollo

### Servidor local

```bash
# Python 3
python3 -m http.server 8080

# Node http-server (si está instalado)
npx http-server
```

Luego abrir: `http://localhost:8080`

### Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (ES6 Modules)
- **Storage**: localStorage
- **Librerías CDN**:
  - Chart.js 4.4.1 (gráficos)
  - XLSX 0.18.5 (importación/exportación Excel)
  - Font Awesome 6.4.0 (iconos)
  - Google Fonts: Inter (tipografía)

## Deploy

### GitHub Pages

```bash
# Ver DEPLOY.md para instrucciones completas
```

### Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Netlify

```bash
# Conectar repositorio en netlify.com
# o usar Netlify CLI:
npm i -g netlify-cli
netlify deploy
```

### Servidor Apache/Nginx

- Usar `.htaccess` (incluido) para rewriting de URLs
- O configurar manualmente el rewriting en nginx.conf

## Uso

1. **Empleados**: Crear registros de empleados por área
2. **Captura**: Registrar tallas de cada empleado
3. **Entregas**: Registrar entregas de uniformes
4. **Totales**: Ver resumen de uniformes por prenda/talla
5. **Inventario**: Gestionar stock y salidas
6. **Reportes**: Generar reportes y exportar a Excel

## Datos

Todos los datos se guardan en localStorage del navegador. Para sincronización en múltiples dispositivos:
- Exportar datos como Excel (vista Exportar)
- Importar en otro dispositivo (vista Importar)

## PWA

- Funciona offline una vez cargada
- Installable en dispositivos móviles y desktop
- Icons y splash screens automáticos
- Service Worker con caché inteligente

## Licencia

ASSA ABLOY México 2026

---

Para más información sobre deploy, ver [DEPLOY.md](./DEPLOY.md)
