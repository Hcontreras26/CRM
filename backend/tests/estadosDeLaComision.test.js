import { describe, it, expect } from 'vitest';
import { query } from '../src/shared/config/db.js';
import { SE_LE_DEBE, ESTADOS_COMISION } from '../src/modules/tutores/tutor.model.js';

/**
 * Los estados de la comisión del tutor (Diego, 14/09).
 *
 *     «Ahí que pone pendiente deben aparecer los siguientes estados: Pendiente,
 *      Notificada, Falta Factura.»
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTO VIGILA NO ES LA LISTA, ES LA RESTA
 *
 * Los dos estados nuevos no mueven el dinero de sitio: dicen por dónde va el
 * trámite. Un tutor notificado sigue sin cobrar.
 *
 * Por eso «lo que se le debe» se dice por lo que NO es —ni pagada ni
 * revertida— en vez de listar los que sí. Si alguien lo cambiara por
 * `estado = 'pendiente'`, avisar a un tutor lo sacaría de «Por pagar» y la
 * pantalla diría que no se le debe nada. Es el fallo caro, y no se ve: la
 * cifra baja y parece que alguien cobró.
 */

describe('la definición de lo que se debe', () => {
  it('se dice por lo que NO es', () => {
    expect(SE_LE_DEBE).toContain('NOT IN');
    expect(SE_LE_DEBE).toContain('pagada');
    expect(SE_LE_DEBE).toContain('revertida');
  });

  it('y por tanto los tres que deben entran sin nombrarlos', () => {
    // Lo importante: un estado futuro cuenta como deuda sin que nadie venga a
    // apuntarlo aquí. Listándolos habría que acordarse, y no se acuerda nadie.
    for (const e of ['pendiente', 'notificada', 'falta_factura']) {
      expect(SE_LE_DEBE).not.toContain(e);
    }
  });
});

describe('los cinco estados', () => {
  it('son los que dijo Diego, más los dos del dinero', () => {
    expect(ESTADOS_COMISION).toEqual(
      ['pendiente', 'notificada', 'falta_factura', 'pagada', 'revertida']);
  });
});

describe('la base los acepta, y solo esos', () => {
  // Contra el esquema de verdad: la nota del documento avisaba de mirar si era
  // un CHECK o un ENUM, porque buscar solo el CHECK cuando era ENUM ya rompió
  // las conversiones en los dos CRM una vez. Aquí se comprueba el resultado, sea
  // lo que sea por dentro.
  it('el CHECK conoce los cinco', async () => {
    const { rows } = await query(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
        WHERE conname = 'tutor_commissions_estado_check'`);
    expect(rows[0], 'no existe el CHECK: ¿se aplicó la migración 163?').toBeDefined();
    for (const e of ESTADOS_COMISION) {
      expect(rows[0].d, `falta «${e}»`).toContain(e);
    }
  });

  it('y la consulta de lo que se debe corre contra el esquema real', async () => {
    // Que la cadena esté bien escrita no lo dice ninguna prueba de texto: lo
    // dice Postgres aceptándola.
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM tutor_commissions WHERE ${SE_LE_DEBE}`);
    expect(rows[0].n).toBeGreaterThanOrEqual(0);
  });
});
