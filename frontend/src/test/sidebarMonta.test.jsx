import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Que el menu lateral SE MONTE.
//
// Existe por un fallo concreto del 21/08/2026: se subio un `moduloApagado(...)`
// sin su import en `Sidebar.jsx`. No se rompio WhatsApp, se rompio el CRM —al
// abrirlo salia «moduloApagado is not defined» y ni menu ni pantallas.
//
// Y paso lint, typecheck y build: TypeScript no mira los `.jsx`, y `no-undef`
// estaba apagado. Ya se encendio para `.js`/`.jsx`, pero una regla comprueba
// nombres sueltos; esto comprueba que la pieza entera se monta de verdad, que es
// otra cosa. `Sidebar`, `AppLayout` y `App` son `.jsx` y salen en TODAS las
// pantallas: si uno de los tres revienta al pintar, no hay CRM.

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 3, nombre: 'Angel M.', email: 'angel@empresa.com', role: 'admin' },
    // El mapa de permisos que llega con el login (#423): sin él, el menú no
    // enseña nada (cada entrada pide su permiso).
    permissions: { '*': true },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({
    activeProject: { id: 1, nombre: 'Psiko Aprende', tipo: 'educacion' },
    projects: [{ id: 1, nombre: 'Psiko Aprende' }],
    setActiveProject: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
  // El avatar de proyecto (#222) lee el tema con useOptionalTheme.
  useOptionalTheme: () => 'dark',
}));
vi.mock('@/shared/api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ success: true, data: [] }), post: vi.fn() },
}));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

import Sidebar from '@/shared/components/layout/Sidebar';

const montar = () => render(<MemoryRouter><Sidebar /></MemoryRouter>);

describe('el menu lateral', () => {
  it('se monta sin lanzar', () => {
    // Si falta un import o hay un nombre mal escrito, esto revienta aqui en vez
    // de en la cara de una gestora.
    expect(() => montar()).not.toThrow();
  });

  it('enseña WhatsApp cuando el modulo esta encendido', () => {
    montar();
    expect(screen.getByText('WhatsApp')).toBeTruthy();
  });

  it('y las pantallas de siempre siguen ahi', () => {
    montar();
    // Que el menu se monte pero se haya quedado vacio tambien seria un fallo.
    expect(screen.getByText('Prospectos')).toBeTruthy();
  });
});
