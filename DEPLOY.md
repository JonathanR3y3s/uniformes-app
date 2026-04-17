# Guía de Deployment - Uniformes ASSA ABLOY

## Opción 1: GitHub Pages (Recomendado)

### Paso 1: Crear repositorio

```bash
git init
git add .
git commit -m "Initial commit: App Uniformes ASSA ABLOY v5.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/uniformes-assa-abloy.git
git push -u origin main
```

### Paso 2: Activar GitHub Pages

1. En GitHub, ir a Settings → Pages
2. Source: Seleccionar "main" branch
3. Folder: "/" (root)
4. Click "Save"

La app estará disponible en: `https://YOUR-USERNAME.github.io/uniformes-assa-abloy/`

### Paso 3 (Opcional): Configurar dominio personalizado

1. En GitHub Pages settings
2. Agregar dominio personalizado (ej: uniformes.tudominio.com)
3. Actualizar DNS records en tu registrador

---

## Opción 2: Vercel (Simple y rápido)

### Paso 1: Instalar y conectar

```bash
npm install -g vercel
vercel login
```

### Paso 2: Deploy

```bash
cd ./uniformes-assa-abloy
vercel
# Seguir prompts y confirmar
```

URL: `https://uniformes-assa-abloy.vercel.app/`

### Paso 3: Deploy automático

Conectar repositorio Git:
1. En vercel.com, ir a "Add New..." → "Project"
2. Seleccionar tu repositorio Git
3. Click "Import"
4. Vercel desplegará automáticamente en cada push a main

---

## Opción 3: Netlify (Interface amigable)

### Paso 1: Drag & Drop (más simple)

1. Ir a netlify.com/drop
2. Drag the entire folder aquí
3. Done! URL generada automáticamente

### Paso 2: Deploy automático

1. Conectar tu repositorio Git
2. En Netlify, "New site from Git"
3. Seleccionar proveedor (GitHub, GitLab, Bitbucket)
4. Seleccionar repositorio
5. Deploy automático en cada push

---

## Opción 4: Servidor propio (Apache/Nginx)

### Apache (.htaccess incluido)

1. Copiar archivos a `public_html/uniformes/`
2. Asegurar que `.htaccess` esté presente
3. Verificar que `mod_rewrite` está habilitado
4. Acceder a: `https://tudominio.com/uniformes/`

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name uniformes.tudominio.com;

    root /var/www/uniformes;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /sw.js {
        expires -1;
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    location = /manifest.json {
        add_header Content-Type "application/manifest+json";
    }

    # SSL configuration...
}
```

Luego: `systemctl restart nginx`

---

## Verificación Post-Deploy

### Checklist

- [ ] App carga en navegador (home)
- [ ] Navegación entre vistas funciona
- [ ] Service Worker se registra (DevTools → Application → Service Workers)
- [ ] manifest.json es válido (DevTools → Application → Manifest)
- [ ] Sin errores en consola
- [ ] Assets se cachean correctamente
- [ ] Funciona offline (desconectar internet y probar)
- [ ] PWA es installable (botón "Install" en navegador)

### Comandos de verificación

```bash
# Verificar que service worker funciona
curl -I https://tudominio.com/sw.js

# Verificar manifest
curl https://tudominio.com/manifest.json | python3 -m json.tool

# Verificar redirección SPA
curl -I https://tudominio.com/cualquierpagina

# Debería retornar 200 y index.html
```

---

## Problemas Comunes

### "Blank page" después de deploy

**Causa**: Rutas relativas incorrectas o service worker viejo en caché
**Solución**:
1. Limpiar cache del navegador (Ctrl+Shift+Del)
2. Desregistrar service worker: DevTools → App → Delete
3. Refrescar página

### Service Worker no se actualiza

**Causa**: Caché agresivo del navegador
**Solución**:
1. En vercel.json/netlify.toml, sw.js tiene `max-age=0`
2. Esperar 5 minutos o limpiar caché

### "CORS error" con recursos CDN

**Causa**: Navegador bloqueando cross-origin
**Solución**:
1. Verificar HTTPS está habilitado
2. CDN includes tienen CORS headers correctos (ya incluidos en index.html)
3. Si persiste, descargar librerías localmente

### localStorage vacío en otro dispositivo

**Solución esperada**: localStorage es local del navegador
**Workaround**: Usar función "Exportar" para descargar Excel, luego "Importar" en otro dispositivo

---

## Datos y Backup

### Exportar datos

```javascript
// En consola del navegador:
JSON.stringify(localStorage)
```

O usar la función "Exportar" en la app.

### Restaurar datos

```javascript
// En consola:
Object.entries(JSON.parse('...')).forEach(([k, v]) => {
  localStorage.setItem(k, v);
});
```

O usar "Importar" Excel.

---

## Performance

- App carga en <2s con buen internet
- Offline: Instantáneo (desde caché)
- Total assets: ~50KB minificado
- No require server-side

---

## Soporte HTTPS

Todos los servicios mencionados incluyen HTTPS gratis:
- ✓ GitHub Pages (automático)
- ✓ Vercel (automático)
- ✓ Netlify (automático)
- ✓ Servidor propio (Let's Encrypt gratis)

---

## Proximos pasos

1. Elegir plataforma de deploy
2. Seguir instrucciones de esa opción
3. Verificar con checklist
4. Compartir URL con equipo

---

**Última actualización**: 2026-04-17
**Versión app**: 5.0
