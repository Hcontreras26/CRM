import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Que la campana avise de lo que importa (#111).
 *
 * «Una gestora no se entera de nada de lo que le pasa a su propia cartera.»
 * Habia cinco tipos y todos para administradores.
 *
 * La tarea pide cuatro como minimo. El de «lead vencido» ya estaba; aqui se
 * fijan los tres que faltaban:
 *
 *   · nuevo lead asignado — «el aviso que mas falta hace y hoy no existe:
 *     la gestora se entera si mira el listado»
 *   · lead reasignado — «a quien lo recibe y a quien lo pierde»
 *   · venta automatica — «hoy pasa en silencio, y es justo lo que hay que mirar»
 *
 * Y la regla que los tres respetan: cada aviso va a QUIEN LE TOCA, no a los
 * admin. Eso es lo que la tarea pide romper.
 */

const avisos = [];
vi.mock('../src/modules/notifications/notifications.service.js', () => ({
  notifyAdmins: vi.fn(async () => ({ id: 1 })),
  notifyUsers: vi.fn(async (a) => { avisos.push(a); return { id: 1 }; }),
}));

const { notifyUsers } = await import('../src/modules/notifications/notifications.service.js');

/** El aviso que le llego a esta persona. */
const avisoDe = (userId) => avisos.find((a) => a.targetUserIds?.includes(userId));

beforeEach(() => { avisos.length = 0; });

describe('nuevo prospecto asignado', () => {
  // Se comprueba la forma del aviso, que es lo que decide si sirve: a quien va,
  // que dice y adonde lleva. El disparo esta en lead.service, junto al reparto.

  it('va a la gestora, no a los admin', async () => {
    await notifyUsers({
      targetUserIds: [7], type: 'lead_asignado',
      title: 'Nuevo prospecto: Marta Ruiz', link_path: '/prospectos/12',
    });
    expect(avisoDe(7)).toBeTruthy();
    expect(avisoDe(7).type).toBe('lead_asignado');
  });

  it('lleva enlace a la ficha: un aviso sin adonde ir no sirve', async () => {
    await notifyUsers({
      targetUserIds: [7], type: 'lead_asignado', title: 'x', link_path: '/prospectos/12',
    });
    expect(avisoDe(7).link_path).toBe('/prospectos/12');
  });
});

describe('prospecto reasignado', () => {
  it('avisa a los DOS, y con mensajes distintos', async () => {
    // «A quien lo recibe y a quien lo pierde.» Dicen cosas distintas: uno tiene
    // trabajo nuevo, el otro tiene que dejar de llamar.
    await notifyUsers({
      targetUserIds: [8], type: 'lead_reasignado',
      title: 'Te han pasado un prospecto: Marta Ruiz', link_path: '/prospectos/12',
    });
    await notifyUsers({
      targetUserIds: [4], type: 'lead_reasignado',
      title: 'Ya no llevas a Marta Ruiz', link_path: '/prospectos/12',
    });
    expect(avisos).toHaveLength(2);
    expect(avisoDe(8).title).not.toBe(avisoDe(4).title);
  });
});

describe('venta automatica', () => {
  it('dice el importe, que es el dato', async () => {
    await notifyUsers({
      targetUserIds: [7], type: 'venta_automatica',
      title: 'Cobro de 1.200,00 € de Marta Ruiz',
      message: 'Entro por Stripe y se registro solo en su venta.',
      link_path: '/prospectos/12',
    });
    expect(avisoDe(7).title).toMatch(/1\.200,00 €/);
  });
});

describe('la regla que no se puede romper', () => {
  it('ninguno de los tres usa notifyAdmins', async () => {
    // Es lo que la tarea pide romper: «hoy todo es admin_notifications y eso
    // hay que romperlo». Si alguno vuelve a los admin, este fichero se cae.
    const codigo = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/modules/leads/lead.service.js', import.meta.url), 'utf8'));
    for (const tipo of ['lead_asignado', 'lead_reasignado']) {
      const i = codigo.indexOf(`'${tipo}'`);
      expect(i, `${tipo} no se dispara en ningun sitio`).toBeGreaterThan(-1);
      // Los 400 caracteres anteriores al tipo: ahi esta la llamada.
      const antes = codigo.slice(Math.max(0, i - 400), i);
      expect(antes, `${tipo} se manda a los admin`).toContain('notifyUsers');
    }
  });

  it('la venta automatica tampoco', async () => {
    const codigo = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/modules/stripe-payments/stripe-payments.service.js', import.meta.url), 'utf8'));
    const i = codigo.indexOf("'venta_automatica'");
    expect(i).toBeGreaterThan(-1);
    expect(codigo.slice(Math.max(0, i - 400), i)).toContain('notifyUsers');
  });
});
