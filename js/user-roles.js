/**
 * MÓDULO DE ROLES Y PERMISOS
 * Gestiona operador vs administrador y permisos específicos
 */

const ROLES = {
  OPERADOR: 'operador',
  ADMIN: 'admin',
  CONSULTA: 'consulta',
};

const PERMISSIONS = {
  operador: [
    'entrega.ver',
    'entrega.crear',
    'entrega.firmar',
    'empleado.buscar',
    'inventario.ver_basico',
  ],
  consulta: [
    'entrega.ver',
    'empleado.ver',
    'inventario.ver',
    'reportes.ver',
    'metricas.ver',
  ],
  admin: [
    'entrega.ver',
    'entrega.crear',
    'entrega.editar',
    'entrega.eliminar',
    'empleado.gestionar',
    'inventario.gestionar',
    'reportes.ver',
    'metricas.ver',
    'config.gestionar',
  ],
};

let currentUser = null;

export function initUserRoles() {
  const stored = localStorage.getItem('_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
    } catch {
      currentUser = null;
    }
  }
  if (!currentUser) {
    currentUser = { role: ROLES.ADMIN, name: 'Sistema', id: 'system' };
    saveUser();
  }
}

export function setUser(role, name, operadorId) {
  currentUser = { role, name, id: operadorId || Date.now().toString() };
  saveUser();
}

export function getUser() {
  return currentUser;
}

export function getUserRole() {
  return currentUser?.role || ROLES.ADMIN;
}

export function hasPermission(permission) {
  const role = getUserRole();
  const perms = PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function isOperador() {
  return getUserRole() === ROLES.OPERADOR;
}

export function isAdmin() {
  return getUserRole() === ROLES.ADMIN;
}

export function isConsulta() {
  return getUserRole() === ROLES.CONSULTA;
}

export function saveUser() {
  localStorage.setItem('_user', JSON.stringify(currentUser));
}

export function logout() {
  currentUser = null;
  localStorage.removeItem('_user');
}
