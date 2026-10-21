import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * #423 · Los botones que reflejan un permiso del servidor también obedecen al
 * mapa. Regla estricta (Hugo, 21/10): el botón sale si salía antes Y la persona
 * tiene el permiso. Nadie ve nada nuevo; quitarle el permiso lo esconde.
 *
 * Con la ficha del prospecto: «Reasignar» (`leads.assign`) y «Fusionar»
 * (`leads.edit`), que antes miraban solo si era admin.
 */
const auth = vi.hoisted(() => ({ user: null, permissions: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const { default: LeadSidebar } = await import('@/modules/leads/components/lead-detail/LeadSidebar');

const pintar = (isAdmin) => render(
  <LeadSidebar
    lead={{ id: 1, nombre: 'Ana', status: 'nuevo' }}
    interacciones={[]} reminders={[]} isAdmin={isAdmin}
    selectedEstado="" onSelectedEstadoChange={() => {}} statusLoading={false} onEstadoUpdate={() => {}}
    onOpenInteraction={() => {}} onOpenReminder={() => {}} onOpenReassign={() => {}} onOpenMerge={() => {}}
  />,
);

describe('botones por permiso (#423)', () => {
  beforeEach(() => { auth.user = { id: 3, role: 'admin' }; });

  it('el admin, con sus permisos de serie, los ve como siempre', () => {
    auth.permissions = { 'leads.assign': true, 'leads.edit': true };
    pintar(true);
    expect(screen.getByText('Reasignar')).toBeTruthy();
    expect(screen.getByTitle(/Fusionar este prospecto/)).toBeTruthy();
  });

  it('al admin al que se le quita «Asignar prospectos» ya no le sale «Reasignar»', () => {
    auth.permissions = { 'leads.assign': false, 'leads.edit': true };
    pintar(true);
    expect(screen.queryByText('Reasignar')).toBeNull();
    expect(screen.getByTitle(/Fusionar este prospecto/)).toBeTruthy();
  });

  it('a quien no es admin no le aparece aunque tenga el permiso: nada nuevo en pantalla', () => {
    auth.user = { id: 4, role: 'gestor' };
    auth.permissions = { 'leads.assign': true, 'leads.edit': true };
    pintar(false);
    expect(screen.queryByText('Reasignar')).toBeNull();
    expect(screen.queryByTitle(/Fusionar este prospecto/)).toBeNull();
  });
});
