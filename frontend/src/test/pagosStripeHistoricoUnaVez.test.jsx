// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  Pagos Stripe: el botón «Histórico absoluto» salía DOS veces en la cabecera
  cuando ya había cobros (una copia suelta y otra dentro de «solo cuando ya hay
  cobros»). Queda una, y solo con cobros: antes del primer sincronizado no hay
  nada que cuadrar con Stripe.
*/

const { datos, get } = vi.hoisted(() => {
  const datos = { pagos: [] };
  const get = vi.fn(async (url) => {
    if (url.startsWith('/stripe-payments/stats')) {
      return { success: true, data: { total_cobrado: 100, failed: 0, disputed: 0, unlinked: 0, sync: null } };
    }
    if (url.startsWith('/stripe-payments/corte')) return { success: true, data: { corte: null } };
    if (url.startsWith('/stripe-payments')) return { success: true, data: datos.pagos };
    if (url.startsWith('/integrations/stripe')) return { success: true, data: { has_secret: true } };
    return { success: true, data: null };
  });
  return { datos, get };
});

vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: { id: 3, nombre: 'Campus' }, activeIssuerId: null }),
}));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true, llevaEquipo: false }) }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: StripePaymentsPage } = await import('@/modules/accounting/pages/StripePaymentsPage');

const PAGO = {
  id: 1, stripe_id: 'ch_123456789012345', stripe_created_at: '2026-11-10T10:00:00Z', amount: 100,
  status: 'succeeded', disputed: false, refunded: false, conversion_id: 9, lead_nombre: 'Ana',
  customer_name: 'Ana', customer_email: 'ana@test.com', link_method: 'auto',
};

async function abrir() {
  render(<MemoryRouter><StripePaymentsPage /></MemoryRouter>);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => { localStorage.clear(); datos.pagos = []; });
afterEach(() => cleanup());

describe('Pagos Stripe · «Histórico absoluto»', () => {
  it('con cobros, una sola vez', async () => {
    datos.pagos = [PAGO];
    await abrir();
    expect(await screen.findByText('ana@test.com')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Histórico absoluto/ })).toHaveLength(1);
  });

  it('sin cobros, ninguna', async () => {
    await abrir();
    expect(await screen.findByText('Sin cobros todavía')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Histórico absoluto/ })).toBeNull();
  });
});
