// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';

/*
  CRM#1220 · Raquel (ISEIE, user 5), líder de equipo con `leads.delete`, no
  veía «Eliminar» en el prospecto 22553, de Christine (user 51), de su equipo.
  La pantalla lo decidía por ROL (admin/superadmin) o por «el responsable soy
  yo». Ahora, por permiso y con lo que dice el servidor en cada fila
  (`puede_eliminar`, el mismo alcance que el borrado).

  Gemela de `frontend/src/__smoke__/liderEliminaLeads1220.test.jsx` de CRM-ISEIE.
*/

const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { puedeEliminarLead } = await import('@/modules/leads/lib/puedeEliminar');
const { default: QuickActions } = await import('@/modules/leads/components/QuickActions');

afterEach(cleanup);

/** El `can` de alguien con su rol y, encima, las excepciones que le dio un admin. */
function canDe(role, extra = {}, id = 77) {
  const user = { id, role, roles_extra: [] };
  return crearCan(user, { ...resolverPermisos({ role, roles_extra: [] }).mapa, ...extra });
}

const RAQUEL = 5;
const canRaquel = canDe('lider_equipo', { 'leads.delete': true }, RAQUEL);

/** La fila con su botón, como la pinta Prospectos. */
function fila(lead, can, userId) {
  render(
    <MemoryRouter>
      <QuickActions lead={lead} onSoftDelete={puedeEliminarLead(lead, can, userId) ? () => {} : undefined} />
    </MemoryRouter>,
  );
  return screen.queryByRole('button', { name: 'Eliminar' });
}

describe('la líder de equipo', () => {
  it('ve «Eliminar» en un prospecto de una gestora de su equipo (el 22553, de Christine)', () => {
    const lead = { id: 22553, responsable_id: 51, status: 'nuevo', puede_eliminar: true };
    expect(fila(lead, canRaquel, RAQUEL)).toBeInTheDocument();
  });

  it('no lo ve en uno de fuera de su equipo', () => {
    const lead = { id: 22555, responsable_id: 99, status: 'nuevo', puede_eliminar: false };
    expect(fila(lead, canRaquel, RAQUEL)).toBeNull();
  });

  it('sin el permiso leads.delete, ni en los de su equipo', () => {
    const sinPermiso = canDe('lider_equipo', { 'leads.delete': false }, RAQUEL);
    expect(puedeEliminarLead({ responsable_id: 51, puede_eliminar: true }, sinPermiso, RAQUEL)).toBe(false);
  });
});

describe('la gestora con leads.delete (#204)', () => {
  const GESTORA = 12;
  const can = canDe('gestor', { 'leads.delete': true }, GESTORA);

  it('los suyos sin convertir, sí; los convertidos y los de otra, no (lo que diga el servidor)', () => {
    expect(fila({ id: 1, responsable_id: GESTORA, status: 'nuevo', puede_eliminar: true }, can, GESTORA)).toBeInTheDocument();
    cleanup();
    expect(fila({ id: 2, responsable_id: GESTORA, status: 'convertido', puede_eliminar: false }, can, GESTORA)).toBeNull();
    cleanup();
    expect(fila({ id: 3, responsable_id: 51, status: 'nuevo', puede_eliminar: false }, can, GESTORA)).toBeNull();
  });

  it('sin el dato del servidor, la regla de siempre: solo los suyos sin convertir', () => {
    expect(puedeEliminarLead({ responsable_id: GESTORA, status: 'nuevo' }, can, GESTORA)).toBe(true);
    expect(puedeEliminarLead({ responsable_id: GESTORA, status: 'convertido' }, can, GESTORA)).toBe(false);
    expect(puedeEliminarLead({ responsable_id: 51, status: 'nuevo' }, can, GESTORA)).toBe(false);
  });

  it('sin el permiso, ninguno', () => {
    const sinPermiso = canDe('gestor', { 'leads.delete': false }, GESTORA);
    expect(puedeEliminarLead({ responsable_id: GESTORA, status: 'nuevo', puede_eliminar: true }, sinPermiso, GESTORA)).toBe(false);
  });
});

describe('quien puede borrar cualquiera', () => {
  it('con leads.delete_cualquiera, también sin el dato del servidor', () => {
    const can = canDe('admin', { 'leads.delete': true, 'leads.delete_cualquiera': true }, 3);
    expect(puedeEliminarLead({ responsable_id: 51, status: 'convertido' }, can, 3)).toBe(true);
  });
});

describe('Prospectos ya no lo decide por rol', () => {
  const SRC = path.resolve(__dirname, '..');
  const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

  it('LeadsPage usa la regla y no compara el rol para eliminar', () => {
    const page = leer('modules/leads/pages/LeadsPage.tsx');
    expect(page).toMatch(/const puedeEliminar = \(l: LeadParaEliminar\) => puedeEliminarLead\(l, can, user\?\.id\)/);
    const linea = page.split('\n').find((l) => l.includes('const puedeEliminar'));
    expect(linea).not.toMatch(/role\s*===/);
  });

  it('el diálogo de borrar ofrece todos los motivos por permiso, no por rol', () => {
    const dialogo = leer('modules/leads/components/SoftDeleteDialog.tsx');
    expect(dialogo).toMatch(/const esJefe = can\('leads\.delete_cualquiera'\);/);
    expect(dialogo).not.toMatch(/role\s*===/);
  });
});
