// CRM#708 · El menú del «Tutor redactor»: solo lo suyo. Su tablero y su factura del
// mes, como un colaborador, y Consultas y Mis cursos, como un tutor. Nada de
// prospectos, ventas ni finanzas. Con el menú de verdad (NAV_SECTIONS), no con una copia.
import { describe, it, expect } from 'vitest';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/modules/users/lib/usersUi';
import { soloEsTutorRedactor, ROLES_DE_TUTOR } from '@/shared/lib/roles';

const { NAV_SECTIONS, canSeeItem, pasaPermisoDeRoles } = await import('@/shared/components/layout/Sidebar');

const can = (lista) => (k) => lista.includes(k);
function loQueVe(roles, user, permisos) {
  const c = can(permisos);
  const pasa = (item) => pasaPermisoDeRoles(item, c) && canSeeItem(item, roles, {}, 'crm', false, user, c);
  return NAV_SECTIONS.flatMap((s) => s.items).filter(pasa).flatMap((it) => (it.children ? it.children.filter(pasa) : [it]))
    .map((it) => it.to).filter(Boolean);
}
// Lo que trae de serie (catalogo.js del servidor).
const REDACTOR = ['tasks.view_own', 'tasks.create', 'tasks.edit', 'facturas_colaborador.subir', 'tutores.mis_cursos', 'consultas.atender'];

describe('menú · tutor redactor (CRM#708)', () => {
  it('ve su tablero, «Mi factura», Consultas, Mi campus y sus preferencias', () => {
    const ve = loQueVe(['tutor_redactor'], { role: 'tutor_redactor' }, REDACTOR);
    expect(ve).toEqual(expect.arrayContaining(['/tareas', '/tareas/historial', '/mi-factura', '/consultas', '/mis-cursos/campus', '/preferencias']));
  });

  it('nada de prospectos, ventas, finanzas ni administración de tutores', () => {
    const ve = loQueVe(['tutor_redactor'], { role: 'tutor_redactor' }, REDACTOR);
    for (const no of ['/', '/prospectos', '/finanzas', '/finanzas/facturas', '/finanzas/conversiones', '/finanzas/facturas-colaboradores',
      '/tutores', '/tutores/comisiones', '/productos/pendientes', '/tareas/configurar', '/meta-ads', '/whatsapp']) {
      expect(ve, no).not.toContain(no);
    }
  });

  it('aunque se le dé un permiso de otra pantalla, el menú no le abre nada más', () => {
    const ve = loQueVe(['tutor_redactor'], { role: 'tutor_redactor' }, [...REDACTOR, 'leads.view', 'diplomas.view', 'meta_ads.view']);
    expect(ve).not.toContain('/prospectos');
    expect(ve.some((r) => r.includes('diplomas') || r.includes('meta-ads'))).toBe(false);
  });

  it('se puede dar en la ficha del usuario, con su nombre', () => {
    expect(ASSIGNABLE_ROLES.map((r) => r.value)).toContain('tutor_redactor');
    expect(ROLE_LABELS.tutor_redactor).toBe('Tutor redactor');
  });

  it('cuenta como tutor para Consultas y Mis cursos, y el recorte es solo para quien es SOLO redactor', () => {
    expect(ROLES_DE_TUTOR).toEqual(['tutor', 'tutor_redactor']);
    expect(soloEsTutorRedactor({ role: 'tutor_redactor' })).toBe(true);
    expect(soloEsTutorRedactor({ role: 'gestor', roles_extra: ['tutor_redactor'] })).toBe(false);
  });
});
