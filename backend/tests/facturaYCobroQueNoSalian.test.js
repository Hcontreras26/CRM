import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  LO QUE NO SALÍA (19/10, Diego: «revisa ambos, que aparezcan en la fila o donde quedó
  su proceso, y que soluciones eso»).

  1. ISEIE, venta 701 (Monica Estrada, de Fabiola): Adriana facturó el cobro a la
     empresa, «ETC Expert Techonology Consultants SAS» (2026/0892). La factura estaba,
     pero buscando «Monica» la lista de facturas salía vacía: el buscador solo miraba
     el nombre de la factura, el NIF y el número.
  2. 360, venta 595 de Psiko (Laura, de Dayana): cuota de 108,33 € por Stripe. Dayana
     la apuntó a mano (cobro 881), la sincronización enganchó el cargo a ese cobro, y
     ella lo borró y lo volvió a apuntar (882). El cargo se quedó con la venta y SIN
     cobro, y como solo se miraban los cargos sin venta, ya nadie lo enganchaba.
*/

const sqls = [];
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql, params) => { sqls.push({ sql, params }); return { rows: /COUNT\(\*\)/.test(sql) ? [{ total: 0 }] : [] }; }),
  getClient: vi.fn(),
}));

const linkPayment = vi.fn();
const findPagoDuplicado = vi.fn();
vi.mock('../src/modules/stripe-payments/stripe-payments.model.js', async (orig) => ({
  ...(await orig()),
  linkPayment: (...a) => linkPayment(...a),
  findPagoDuplicado: (...a) => findPagoDuplicado(...a),
}));

const { list } = await import('../src/modules/invoices/invoices.model.js');
const { reengancharCobro } = await import('../src/modules/stripe-payments/stripe-payments.service.js');

beforeEach(() => { sqls.length = 0; linkPayment.mockReset(); findPagoDuplicado.mockReset(); });

describe('la factura a nombre de una empresa se encuentra buscando al alumno', () => {
  it('el buscador mira también el nombre y el correo del alumno de la venta, y el correo de la factura', async () => {
    await list({ projectId: 10, tipo: 'normal', search: '  Monica ' });
    const { sql, params } = sqls.find((s) => /FROM invoices i/.test(s.sql) && !/COUNT/.test(s.sql));
    expect(sql).toMatch(/LOWER\(COALESCE\(l\.nombre, ''\)\) LIKE \$2/);
    expect(sql).toMatch(/LOWER\(COALESCE\(l\.email, ''\)\) LIKE \$2/);
    expect(sql).toMatch(/LOWER\(COALESCE\(i\.cliente_email, ''\)\) LIKE \$2/);
    expect(params).toContain('%monica%');
    // Y el total de la cuenta usa el mismo filtro (con la ficha unida), para que cuadre.
    const cuenta = sqls.find((s) => /COUNT\(\*\)/.test(s.sql));
    expect(cuenta.sql).toMatch(/LEFT JOIN leads l ON l\.id = COALESCE\(i\.lead_id, cv\.lead_id\)/);
    expect(cuenta.sql).toMatch(/LOWER\(COALESCE\(l\.nombre, ''\)\)/);
  });
});

describe('un cargo de Stripe con venta y sin cobro se vuelve a enganchar', () => {
  const cargo = { id: 160849, stripe_id: 'ch_3USJxAFsTdkKKUhQ0HjdQSTE', conversion_id: 595, conversion_payment_id: null, lead_id: 3732, link_method: 'auto_dedup', linked_by: null, amount: '108.33' };
  const pago = { status: 'succeeded', amount: 108.33, stripe_created_at: 1792429349, stripe_id: cargo.stripe_id };

  it('al cobro que ya está apuntado (el 882 de Dayana), sin crear otro', async () => {
    findPagoDuplicado.mockResolvedValue({ id: 882 });
    await reengancharCobro(pago, cargo);
    expect(findPagoDuplicado).toHaveBeenCalledWith(595, 108.33, '2026-10-19', cargo.stripe_id);
    expect(linkPayment).toHaveBeenCalledWith(160849, { leadId: 3732, conversionId: 595, conversionPaymentId: 882, userId: null, method: 'auto_dedup' });
  });

  it('si no hay cobro equivalente, no toca nada (nunca apunta uno: contaría el dinero dos veces)', async () => {
    findPagoDuplicado.mockResolvedValue(null);
    await reengancharCobro(pago, cargo);
    expect(linkPayment).not.toHaveBeenCalled();
  });

  it('un cargo que ya tiene su cobro, o que no se cobró, no se mira', async () => {
    await reengancharCobro(pago, { ...cargo, conversion_payment_id: 882 });
    await reengancharCobro({ ...pago, status: 'failed' }, cargo);
    expect(findPagoDuplicado).not.toHaveBeenCalled();
    expect(linkPayment).not.toHaveBeenCalled();
  });

  it('un enlace hecho a mano sigue siendo «manual» y de quien lo hizo', async () => {
    findPagoDuplicado.mockResolvedValue({ id: 900 });
    await reengancharCobro(pago, { ...cargo, link_method: 'manual', linked_by: 7 });
    expect(linkPayment.mock.calls[0][1]).toMatchObject({ conversionPaymentId: 900, method: 'manual', userId: 7 });
  });
});
