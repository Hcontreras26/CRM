import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// Diego, 13/10: «esta factura del 12 que fue automática no salió en facturación».
// La 2026/0177 (pago inicial de 150 €, sin cobro enganchado) tapaba en la cola la
// cuota de 150 € del 12/10 de la misma venta. Una huérfana cubre UN solo cobro.

const consultas = [];
let filas = [];
vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async (sql, params) => { consultas.push({ sql, params }); return { rows: filas }; }),
}));

const INV = await import('../src/modules/invoices/invoices.model.js');

beforeEach(() => { consultas.length = 0; filas = []; });

describe('una factura sin cobro enganchado cubre un solo cobro', () => {
  it('la cola solo la da por buena para el cobro más cercano a su fecha', async () => {
    await INV.listPagosSinFactura(2);
    const { sql } = consultas[0];
    expect(sql).toMatch(/h\.payment_id IS NULL/);
    // el otro cobro del mismo importe, más cercano a la factura, se la queda
    expect(sql).toMatch(/\(ABS\(q\.fecha - h\.fecha_emision::date\), q\.id\)\s*<\s*\(ABS\(cp\.fecha - h\.fecha_emision::date\), cp\.id\)/);
    if (process.env.SQL_COLA_OUT) fs.writeFileSync(process.env.SQL_COLA_OUT, sql);
  });

  it('«Generar factura» solo engancha la huérfana si este cobro es el suyo', async () => {
    filas = [];
    await INV.emitirFacturaDePago(628, { paymentId: 849, importe: 150 }).catch(() => {});
    const q = consultas.find((c) => /payment_id IS NULL/.test(c.sql));
    expect(q.sql).toMatch(/JOIN conversion_payments cp ON cp\.id = \$3/);
    expect(q.sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM conversion_payments q/);
    expect(q.params).toEqual([628, 150, 849]);
  });
});
