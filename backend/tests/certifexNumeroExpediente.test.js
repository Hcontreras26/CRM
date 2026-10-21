import { describe, it, expect } from 'vitest';
import { NEXP } from '../src/modules/certifex/certifex.emisiones.js';
import { revocarSchema, avisosSchema } from '../src/modules/certifex/certifex.validation.js';

// Certifex numera por EMPRESA desde el 19/10/2026 (su migración 0035): CEDIA-2026-000001-…,
// ISEIE-…, ICTESS-…, LTS-…. Los antiguos siguen siendo CTF-…. El CRM solo aceptaba tres
// letras: un diploma de CEDIA o de ICTESS no se habría podido enviar, revocar ni corregir.
// No toca la base: es la validación pura.

const VALIDOS = ['CTF-2026-000486-GKAV', 'CEDIA-2026-000001-K7QP', 'ISEIE-2026-000001-M2XA', 'ICTESS-2026-000001-AB12', 'LTS-2026-000001-AB12'];
const MALOS = ['C-2026-000001-AB12', 'ACADEMIA-2026-000001-AB12', 'CEDIA-26-000001-AB12', 'CEDIA-2026-1-AB12', 'CEDIA-2026-000001-AB1', 'cedia 2026 000001 ab12'];

describe('nº de expediente con el prefijo de la empresa', () => {
  it('la ruta del PDF acepta los prefijos de 2 a 6 letras y rechaza lo demás', () => {
    for (const v of VALIDOS) expect(NEXP.test(v), v).toBe(true);
    for (const v of MALOS) expect(NEXP.test(v), v).toBe(false);
  });

  it('revocar, avisar y corregir aceptan los nuevos (y en minúsculas, los normalizan)', () => {
    for (const v of VALIDOS) {
      expect(revocarSchema.safeParse({ nexpediente: v, motivo: 'Prueba de formato' }).success, v).toBe(true);
    }
    const r = avisosSchema.safeParse({ nexpedientes: ['cedia-2026-000001-k7qp'] });
    expect(r.success).toBe(true);
    expect(r.data.nexpedientes).toEqual(['CEDIA-2026-000001-K7QP']);
    expect(revocarSchema.safeParse({ nexpediente: 'ACADEMIA-2026-000001-AB12', motivo: 'x' }).success).toBe(false);
  });
});
