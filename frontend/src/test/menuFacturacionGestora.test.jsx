// La entrada «Facturación» del menú para una gestora que factura (Diego, 23/10/2026:
// «a Yolanda no le salen las funciones de facturación»).
//
// Desde el 07/10 el menú le preguntaba a `can('factura_manager')`, que es una casilla
// del usuario y no una clave del sistema de Roles: daba false y la entrada no salía a
// ninguna gestora, por mucho que tuviera la casilla puesta.
//
// Con #423 la casilla pasa a ser una excepción de la persona (migración 222):
// `factura_manager` → `facturas.emitir`, y la entrada pide esa clave del catálogo.
// Lo que se comprueba es lo mismo: quien factura la ve, quien no, no.
import { describe, it, expect } from 'vitest';

const { NAV_SECTIONS, canSeeItem, pasaPermisoDeRoles } = await import('@/shared/components/layout/Sidebar');

// Hay una entrada solo-IA con la misma ruta (projectType: 'ia'); aquí se prueba la del CRM normal.
const entrada = (to) => NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.to === to && !i.projectType);
// Como el `can` de verdad para una gestora: el mapa de Roles no tiene `factura_manager`.
const can = (lista) => (k) => lista.includes(k);
const seVe = (item, roles, user, permisos = []) =>
  pasaPermisoDeRoles(item, can(permisos)) && canSeeItem(item, roles, {}, 'crm', false, user, can(permisos));

describe('menú › Facturación', () => {
  const facturacion = entrada('/finanzas/facturas');
  const yolanda = { role: 'gestor', roles_extra: ['tutor'], factura_manager: true };

  it('existe y pide «facturas.emitir» (la casilla, ya como permiso: #423)', () => {
    expect(facturacion?.permiso).toBe('facturas.emitir');
  });

  it('a Yolanda (gestora + tutora, con la casilla → facturas.emitir) le sale', () => {
    expect(seVe(facturacion, ['gestor', 'tutor'], yolanda, ['facturas.emitir'])).toBe(true);
  });

  it('a Ana y Dayana (gestoras con la casilla → facturas.emitir) también', () => {
    expect(seVe(facturacion, ['gestor'], { role: 'gestor', factura_manager: true }, ['facturas.emitir'])).toBe(true);
  });

  it('a una gestora sin la casilla, no', () => {
    expect(seVe(facturacion, ['gestor'], { role: 'gestor', factura_manager: false })).toBe(false);
  });

  it('a admin, por su rol (facturas.emitir de serie)', () => {
    expect(seVe(facturacion, ['admin'], { role: 'admin' }, ['facturas.emitir'])).toBe(true);
  });
});

describe('las claves del sistema de Roles siguen pasando por `can`', () => {
  it('«Historial de tareas» (tasks.view_own) solo con el permiso; «Por revisar» ya no está (CRM#707)', () => {
    const item = entrada('/tareas/historial');
    expect(item?.permiso).toBe('tasks.view_own');
    expect(pasaPermisoDeRoles(item, can([]))).toBe(false);
    expect(pasaPermisoDeRoles(item, can(['tasks.view_own']))).toBe(true);
    expect(entrada('/tareas/revisar')).toBeFalsy();
  });

  it('una entrada sin permiso pasa siempre', () => {
    expect(pasaPermisoDeRoles({ to: '/x' }, can([]))).toBe(true);
  });
});
