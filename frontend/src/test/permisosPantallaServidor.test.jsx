import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/*
  La pantalla decide por el PERMISO que mira el servidor, no por el rol ni por
  otra clave parecida (descuadres encontrados al escribir el manual, 17/11/2026).

  Aquí, lo que no necesita montar una pantalla entera: el menú y la ruta de
  Captación › Webhooks, el texto de «No volver a escribir», quién configura el
  proceso comercial y el tablero del tutor.
*/

const auth = vi.hoisted(() => ({ user: null, permissions: null, isAuthenticated: false, loading: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS, canSeeItem, rutaPermitida } = await import('@/shared/components/layout/Sidebar');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { rolesDe } = await import('@/shared/lib/roles');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');
const { puedeEditar } = await import('@/modules/proceso/pages/ProcesoPage');
const { default: ProtectedRoute } = await import('@/shared/components/layout/ProtectedRoute');

const mapaDe = (role, excepciones = {}) => resolverPermisos({ role, roles_extra: [], excepciones }).mapa;
const canDe = (role, excepciones) => crearCan({ id: 1, role, roles_extra: [] }, mapaDe(role, excepciones));

function entrada(to) {
  let hallada = null;
  const recorrer = (items) => {
    for (const it of items || []) {
      if (it.to === to && !hallada) hallada = it;
      if (it.children) recorrer(it.children);
    }
  };
  for (const s of NAV_SECTIONS) recorrer(s.items);
  return hallada;
}

// Desde la #690, Captación › Webhooks es la pestaña Prospectos de Conexión ›
// Webhooks (`/conexion/webhooks/prospectos`), y la entrada del menú junta tres.
describe('Los webhooks de captación piden lo que pide el servidor (/api/forms)', () => {
  const PESTANA = '/conexion/webhooks/prospectos';
  const webhooks = entrada('/conexion/webhooks');
  const ve = (role, excepciones) => canSeeItem(webhooks, rolesDe({ role }), undefined, 'educacion', false, { role }, canDe(role, excepciones));
  // Sin las otras dos partes de la entrada (Make y transferencias), para mirar solo esta.
  const soloCaptacion = { 'make.view': false, 'webhooks_salientes.view': false };

  it('la entrada vieja ya no está en el menú: se movió, no se duplicó', () => {
    expect(entrada('/captacion/webhooks')).toBeNull();
    expect(webhooks).toBeTruthy();
  });

  it('el admin y el project manager, con sus permisos de serie, la siguen viendo y abriendo', () => {
    expect(ve('admin')).toBe(true);
    expect(ve('project_manager')).toBe(true);
    expect(ve('admin', soloCaptacion)).toBe(true);
    expect(rutaPermitida(PESTANA, canDe('admin'))).toBe(true);
    expect(rutaPermitida(PESTANA, canDe('project_manager'))).toBe(true);
  });

  it('con «Ver webhooks» pero sin «Ver formularios» no sale ni se abre: la lista es /api/forms y daba 403', () => {
    const sinFormularios = { 'forms.view': false };
    expect(mapaDe('admin', sinFormularios)['webhooks.view']).toBe(true);
    // La pestaña, cerrada. La entrada solo sale si le queda otra de sus partes.
    expect(rutaPermitida(PESTANA, canDe('admin', sinFormularios))).toBe(false);
    expect(ve('admin', { ...soloCaptacion, ...sinFormularios })).toBe(false);
    expect(ve('admin', sinFormularios)).toBe(true);
  });

  it('sigue pidiendo «Ver webhooks», como aprobó Diego: soporte no entra a los de captación', () => {
    // Soporte tiene «Ver formularios» pero no «Ver webhooks»: la pestaña, cerrada.
    expect(mapaDe('soporte')['forms.view']).toBe(true);
    expect(mapaDe('soporte')['webhooks.view']).toBe(false);
    expect(rutaPermitida(PESTANA, canDe('soporte'))).toBe(false);
    // La entrada conjunta le sale por Make, que ya veía; por esta parte, no.
    expect(ve('soporte', soloCaptacion)).toBe(false);
  });
});

describe('«No volver a escribir» no promete lo que no hay', () => {
  it('no dice «Se puede quitar después»: no hay ruta ni botón para quitarlo', () => {
    const chat = fs.readFileSync(path.resolve(__dirname, '../modules/whatsapp/pages/ChatPage.tsx'), 'utf8');
    const rutas = fs.readFileSync(path.resolve(__dirname, '../../../backend/src/modules/whatsapp/whatsapp.routes.js'), 'utf8');
    // Si algún día hay forma de quitarlo, esta prueba avisa para cambiar el texto.
    expect(rutas).not.toMatch(/delete\(['"]\/chats\/:id\/no-escribir/);
    expect(chat).not.toMatch(/Se puede quitar después/);
    expect(chat).toMatch(/Desde el CRM no se puede deshacer/);
  });
});

describe('Proceso comercial: configura los pasos quien tiene `proceso.configurar_pasos`', () => {
  it('soporte lo trae de serie y puede (antes se le escondía por el rol)', () => {
    expect(puedeEditar(canDe('soporte'))).toBe(true);
  });
  it('admin sí; al admin al que se le quita, no; la gestora, no', () => {
    expect(puedeEditar(canDe('admin'))).toBe(true);
    expect(puedeEditar(canDe('admin', { 'proceso.configurar_pasos': false }))).toBe(false);
    expect(puedeEditar(canDe('gestor'))).toBe(false);
  });
});

describe('El tutor abre «Mi tablero», que el menú le enseña', () => {
  const abrir = (ruta) => render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/tareas" element={<ProtectedRoute><p>El tablero</p></ProtectedRoute>} />
        <Route path="/prospectos" element={<ProtectedRoute><p>Prospectos</p></ProtectedRoute>} />
        <Route path="/mis-cursos/campus" element={<p>Mi campus</p>} />
      </Routes>
    </MemoryRouter>,
  );

  it('el menú se lo enseña (tasks.view_own) y la ruta le deja entrar', () => {
    const tablero = entrada('/tareas');
    const tutor = { id: 1, role: 'tutor', roles_extra: [] };
    expect(canSeeItem(tablero, rolesDe(tutor), undefined, 'educacion', false, tutor, canDe('tutor'))).toBe(true);
    Object.assign(auth, { user: tutor, permissions: mapaDe('tutor'), isAuthenticated: true });
    abrir('/tareas');
    expect(screen.getByText('El tablero')).toBeTruthy();
  });

  it('lo que no es suyo sigue llevándole a «Mi campus»', () => {
    Object.assign(auth, { user: { id: 1, role: 'tutor', roles_extra: [] }, permissions: mapaDe('tutor'), isAuthenticated: true });
    abrir('/prospectos');
    expect(screen.getByText('Mi campus')).toBeTruthy();
  });
});
