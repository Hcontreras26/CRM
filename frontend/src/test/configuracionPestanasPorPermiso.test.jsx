import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * QA de /testeo del 18/11/2026 · Configuración vista por una gestora: las
 * pestañas que el servidor le niega (403) no salen, y la dirección a mano
 * (`?pestana=users`) no las abre. Lo demás, igual que antes.
 */

const permisos = vi.hoisted(() => ({ mapa: {} }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: (k) => permisos.mapa[k] === true }) }));
// Cada pestaña, sustituida por un marcador: aquí solo importa cuál se monta
// (montar la de Usuarios es lo que disparaba las peticiones con 403).
vi.mock('@/modules/settings/components/settings/UsersTab', () => ({ default: () => <p>contenido-usuarios</p> }));
vi.mock('@/modules/settings/components/settings/AvailabilityTab', () => ({ default: () => <p>contenido-disponibilidad</p> }));
vi.mock('@/modules/settings/components/settings/ApisTab', () => ({ default: () => <p>contenido-apis</p> }));
vi.mock('@/modules/settings/components/settings/ProjectsTab', () => ({ default: () => <p>contenido-proyectos</p> }));
vi.mock('@/modules/settings/components/settings/FormsTab', () => ({ default: () => <p>contenido-formularios</p> }));
vi.mock('@/modules/settings/components/settings/SecurityTab', () => ({ default: () => <p>contenido-seguridad</p> }));

const { default: SettingsPage } = await import('@/modules/settings/pages/SettingsPage');

function abrir(ruta = '/configuracion') {
  return render(<MemoryRouter initialEntries={[ruta]}><SettingsPage /></MemoryRouter>);
}

beforeEach(() => { permisos.mapa = {}; });

describe('Configuración · pestañas según los permisos', () => {
  it('sin users.view ni credentials.view no salen Usuarios, Disponibilidad ni APIs globales', () => {
    abrir();
    expect(screen.queryByRole('button', { name: 'Usuarios' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disponibilidad' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'APIs globales' })).toBeNull();
    // Lo que no pide permiso para leerse sigue ahí.
    expect(screen.getByRole('button', { name: 'Proyectos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Seguridad' })).toBeTruthy();
    expect(screen.getByText('contenido-proyectos')).toBeTruthy();
  });

  it('la dirección a mano a una pestaña sin permiso abre Proyectos y no monta la otra', () => {
    abrir('/configuracion?pestana=users');
    expect(screen.queryByText('contenido-usuarios')).toBeNull();
    expect(screen.getByText('contenido-proyectos')).toBeTruthy();
  });

  it('con los permisos salen las tres y la dirección a mano abre la pedida', () => {
    permisos.mapa = { 'users.view': true, 'credentials.view': true };
    abrir('/configuracion?pestana=apis');
    expect(screen.getByRole('button', { name: 'Usuarios' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disponibilidad' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'APIs globales' })).toBeTruthy();
    expect(screen.getByText('contenido-apis')).toBeTruthy();
  });

  it('con users.view pero sin credentials.view, Usuarios sí y APIs globales no', () => {
    permisos.mapa = { 'users.view': true };
    abrir();
    expect(screen.getByRole('button', { name: 'Usuarios' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'APIs globales' })).toBeNull();
  });
});
