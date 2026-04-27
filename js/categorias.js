/**
 * CATEGORIAS
 * CRUD simple para categorias del almacen unificado.
 */

import { esc } from './utils.js';
import { notify, modal, confirm } from './ui.js';
import { getCategorias, createCategoria, updateCategoria } from './almacen-api.js';

function sortedCategorias() {
  return [...getCategorias()].sort((a, b) => {
    const ordenA = Number(a.orden) || 0;
    const ordenB = Number(b.orden) || 0;
    if (ordenA !== ordenB) return ordenA - ordenB;
    return (a.nombre || '').localeCompare(b.nombre || '');
  });
}

export function render() {
  const categorias = sortedCategorias();
  let h = '<div class="page-head"><div class="page-title"><h1>Categorias</h1><p>Catalogo de categorias para productos del almacen</p></div>';
  h += '<button class="btn btn-primary" id="btnNewCategoria"><i class="fas fa-plus"></i> Nueva Categoria</button></div>';
  h += '<div class="card"><div class="table-wrap"><table class="dt"><thead><tr>';
  h += '<th>Categoria</th><th>Icono</th><th>Color</th><th>Orden</th><th>Estado</th><th>Acciones</th>';
  h += '</tr></thead><tbody>';

  if (!categorias.length) {
    h += '<tr><td colspan="6" class="empty-state"><i class="fas fa-tags"></i><p>Sin categorias registradas</p></td></tr>';
  }

  categorias.forEach(c => {
    const activa = c.activa !== false;
    const color = c.color || '#64748b';
    h += '<tr>';
    h += '<td class="font-bold">' + esc(c.nombre || '') + '</td>';
    h += '<td style="font-size:20px">' + esc(c.icono || '') + '</td>';
    h += '<td><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:18px;height:18px;border-radius:4px;border:1px solid var(--border);background:' + esc(color) + '"></span><span class="font-mono text-xs">' + esc(color) + '</span></span></td>';
    h += '<td>' + esc(String(c.orden || '')) + '</td>';
    h += '<td><span class="badge ' + (activa ? 'badge-success' : 'badge-neutral') + '">' + (activa ? 'ACTIVA' : 'INACTIVA') + '</span></td>';
    h += '<td><div class="flex gap-2">';
    h += '<button class="btn btn-ghost btn-sm edit-cat" data-id="' + esc(c.id) + '" title="Editar"><i class="fas fa-edit"></i></button>';
    h += '<button class="btn btn-ghost btn-sm toggle-cat" data-id="' + esc(c.id) + '" title="' + (activa ? 'Desactivar' : 'Activar') + '"><i class="fas ' + (activa ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>';
    h += '</div></td>';
    h += '</tr>';
  });

  h += '</tbody></table></div></div>';
  return h;
}

function openCategoriaModal(id) {
  const categoria = id ? getCategorias().find(c => c.id === id) : null;
  const isEdit = Boolean(categoria);
  const body = `
    <div class="form-row c2">
      <div class="form-group"><label class="form-label">Nombre *</label><input class="form-input" id="catNombre" value="${esc(categoria?.nombre || '')}" placeholder="Ej. Uniformes"></div>
      <div class="form-group"><label class="form-label">Icono</label><input class="form-input" id="catIcono" value="${esc(categoria?.icono || '')}" placeholder="Ej. fa-shirt o etiqueta"></div>
      <div class="form-group"><label class="form-label">Color</label><input class="form-input" type="color" id="catColor" value="${esc(categoria?.color || '#2563eb')}"></div>
      <div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="catActiva"><option value="1"${categoria?.activa !== false ? ' selected' : ''}>Activa</option><option value="0"${categoria?.activa === false ? ' selected' : ''}>Inactiva</option></select></div>
    </div>`;

  modal.open(isEdit ? 'Editar Categoria' : 'Nueva Categoria', body, '<button class="btn btn-ghost" id="mCancel">Cancelar</button><button class="btn btn-primary" id="mSaveCategoria"><i class="fas fa-save"></i> Guardar</button>', 'sm');
  document.getElementById('mCancel')?.addEventListener('click', () => modal.close());
  document.getElementById('mSaveCategoria')?.addEventListener('click', () => saveCategoria(categoria));
}

function saveCategoria(categoria) {
  const nombre = (document.getElementById('catNombre')?.value || '').trim();
  const icono = (document.getElementById('catIcono')?.value || '').trim();
  const color = document.getElementById('catColor')?.value || '#2563eb';
  const activa = document.getElementById('catActiva')?.value === '1';

  if (!nombre) {
    notify('El nombre es obligatorio', 'warning');
    return;
  }

  if (categoria) {
    const res = updateCategoria(categoria.id, { nombre, icono, color, activa });
    if (!res.ok) {
      notify(res.error || 'No se pudo actualizar la categoria', 'error');
      return;
    }
    notify('Categoria actualizada', 'success');
  } else {
    const nueva = createCategoria({ nombre, icono, color });
    if (!activa) updateCategoria(nueva.id, { activa: false });
    notify('Categoria creada', 'success');
  }

  modal.close();
  document.getElementById('mainContent').innerHTML = render();
  init();
}

function toggleCategoria(id) {
  const categoria = getCategorias().find(c => c.id === id);
  if (!categoria) return;
  const activa = categoria.activa !== false;
  const accion = activa ? 'desactivar' : 'activar';
  if (!confirm('¿' + accion.charAt(0).toUpperCase() + accion.slice(1) + ' categoria "' + categoria.nombre + '"?')) return;
  const res = updateCategoria(id, { activa: !activa });
  if (!res.ok) {
    notify(res.error || 'No se pudo cambiar el estado', 'error');
    return;
  }
  notify('Categoria ' + (!activa ? 'activada' : 'desactivada'), 'success');
  document.getElementById('mainContent').innerHTML = render();
  init();
}

export function init() {
  document.getElementById('btnNewCategoria')?.addEventListener('click', () => openCategoriaModal());
  const main = document.getElementById('mainContent');
  if (main) main.onclick = function(e) {
    const edit = e.target.closest('.edit-cat');
    const toggle = e.target.closest('.toggle-cat');
    if (edit) openCategoriaModal(edit.dataset.id);
    if (toggle) toggleCategoria(toggle.dataset.id);
  };
}
