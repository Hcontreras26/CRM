import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/*
  #850: en la ficha del tutor, «Responder en su nombre» decía «ISSLOGG: falta su token»
  aunque ISSLOGG va por el plugin y la respuesta ya sale en su nombre sin su token.
  Con el campus por el plugin no se avisa de que falta ni se ofrece para poner token.
*/

const api = vi.hoisted(() => ({ ver: vi.fn(), tokensDelTutor: vi.fn(), guardarToken: vi.fn(), toast: vi.fn() }));
vi.mock('@/modules/tutores/api/campusTutor.api', () => ({ campusTutorApi: { ver: api.ver } }));
vi.mock('@/modules/consultas/api/consultas.api', () => ({
  consultasApi: { tokensDelTutor: api.tokensDelTutor, guardarToken: api.guardarToken },
}));
vi.mock('@/shared/hooks/useToast', () => ({ toast: api.toast }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({ projects: [] }) }));

import ConsultasDelTutor from '@/modules/tutores/components/ConsultasDelTutor';

const campus = (project_id, nombre) => ({
  project_id, campus: nombre, via: 'campus', issuer_id: 10, empresa: 'CEDIA', campus_conectado: true,
  estado: 'activa', comprobado_at: '2026-11-18T10:00:00Z', error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.ver.mockResolvedValue({ success: true, data: {
    campus: [campus(7, 'ISSLOGG'), campus(1, 'Psiko Aprende')], empresas: [],
    disponible: true, motivo_no_disponible: null, no_disponible_desde: null, avisos: [],
  } });
});

describe('Ficha del tutor: campus por el plugin (#850)', () => {
  it('el campus por el plugin no dice «falta su token» ni se ofrece para poner token', async () => {
    api.tokensDelTutor.mockResolvedValue({ success: true, data: [
      { project_id: 7, campus: 'ISSLOGG', estado: 'activa', tiene_token: false, por_plugin: true },
      { project_id: 1, campus: 'Psiko Aprende', estado: 'activa', tiene_token: false, por_plugin: false },
    ] });
    render(<ConsultasDelTutor tutorId={173} puedeGestionar />);
    expect(await screen.findByText('ISSLOGG: responde por el plugin')).toBeTruthy();
    expect(screen.queryByText('ISSLOGG: falta su token')).toBeNull();
    // El que no va por el plugin sigue pidiendo su token, como siempre.
    expect(screen.getByText('Psiko Aprende: falta su token')).toBeTruthy();
    fireEvent.click(screen.getByRole('combobox', { name: 'Campus del token' }));
    expect(screen.queryAllByRole('option').map((o) => o.textContent)).toEqual(['Elige el campus…', 'Psiko Aprende']);
  });

  it('si todos sus campus van por el plugin, no se pide ningún token', async () => {
    api.tokensDelTutor.mockResolvedValue({ success: true, data: [
      { project_id: 7, campus: 'ISSLOGG', estado: 'activa', tiene_token: false, por_plugin: true },
    ] });
    render(<ConsultasDelTutor tutorId={173} puedeGestionar />);
    expect(await screen.findByText('ISSLOGG: responde por el plugin')).toBeTruthy();
    expect(screen.queryByText(/falta su token/)).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Campus del token' })).toBeNull();
    expect(screen.queryByLabelText('Token del tutor en ese campus')).toBeNull();
  });
});
