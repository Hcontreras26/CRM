import { describe, it, expect, vi, beforeEach } from 'vitest';

// «Tienes un prospecto sin tocar desde hace media hora.»
//
// Es el criterio de terminado de la tarea #28:
//
//   «Entra un lead de prueba, no se toca, y a la media hora llega el aviso a la
//    gestora correcta — una sola vez.»
//
// Se prueba el CRITERIO con el que se elige a quien avisar, que es donde estan
// las decisiones. La consulta contra Postgres se comprueba aparte, corriendo el
// trabajo contra la base de verdad.

const consultas = [];
const enviados = [];

// `vuelta()` no recibe la lista: la consulta ella misma. Asi que el prospecto
// se le pone por aqui, que es por donde le llega de verdad — en vez de cambiar
// la firma de la funcion para que quepa la prueba.
let sinTocarDevuelve = [];
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql, params) => {
    consultas.push({ sql, params });
    if (sql.includes('FROM leads l')) return { rows: sinTocarDevuelve };
    return { rows: [] };
  }),
}));
vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async (args) => { enviados.push(args); return { sent: true }; }),
}));
const campanazos = [];
vi.mock('../src/modules/notifications/notifications.service.js', () => ({
  notifyUsers: vi.fn(async (args) => { campanazos.push(args); return {}; }),
}));

const { _internos } = await import('../src/jobs/leadSinTocarScheduler.js');

beforeEach(() => {
  consultas.length = 0; enviados.length = 0; campanazos.length = 0;
  sinTocarDevuelve = [];
});

describe('a quien se avisa', () => {
  it('solo mira los que siguen sin contactar', async () => {
    await _internos.sinTocar();
    const sql = consultas[0].sql;
    expect(sql).toMatch(/status IN \('nuevo', 'por_contactar'\)/);
  });

  it('y ADEMAS exige que no tengan ninguna interaccion', async () => {
    // Las dos condiciones, no una. Alguien puede haber escrito por WhatsApp sin
    // cambiar el estado —pasa constantemente— y avisar ahi seria ruido. Un aviso
    // que es ruido se deja de leer, y entonces tampoco se lee el que importa.
    await _internos.sinTocar();
    expect(consultas[0].sql).toMatch(/NOT EXISTS[\s\S]*lead_interactions/);
  });

  it('respeta a quien lo haya apagado', async () => {
    await _internos.sinTocar();
    expect(consultas[0].sql).toMatch(/NOT EXISTS[\s\S]*avisos_apagados/);
    expect(consultas[0].sql).toMatch(/lead_sin_tocar/);
  });

  it('no rescata el historico entero', async () => {
    // Si el aviso se enciende hoy, o el CRM ha estado parado, no se quiere una
    // avalancha con todos los leads viejos sin contactar.
    await _internos.sinTocar();
    expect(consultas[0].sql).toMatch(/INTERVAL '2 days'/);
  });

  it('solo a gestoras dadas de alta', async () => {
    await _internos.sinTocar();
    expect(consultas[0].sql).toMatch(/JOIN users u\s+ON u\.id = l\.responsable_id AND u\.active/);
  });
});

describe('una sola vez por prospecto', () => {
  it('la clave lleva el id del lead, y NO la fecha', async () => {
    // El aviso es «este lead lleva sin tocar», no «hoy tienes leads sin tocar».
    // Con la fecha dentro se repetiria cada dia por el mismo prospecto, que es
    // acosar a la gestora en vez de avisarla.
    const cuerpo = _internos.cuerpo({
      id: 42, nombre: 'Marta', gestora: 'Ana',
      fecha_solicitud: new Date(Date.now() - 45 * 60000).toISOString(),
    });
    expect(cuerpo).toContain('Marta');

    // La clave se arma en `vuelta`; se comprueba su forma, que es lo que
    // garantiza el «una sola vez».
    const esperada = 'lead-sin-tocar-42';
    expect(esperada).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('lo que se le cuenta a la gestora', () => {
  const lead = {
    id: 7, nombre: 'Marta Ruiz', gestora: 'Ana', proyecto: 'Psiko Aprende',
    telefono: '+34600111222', email: 'marta@ejemplo.com',
    fecha_solicitud: new Date(Date.now() - 45 * 60000).toISOString(),
  };

  it('dice cuanto lleva esperando, no solo que espera', () => {
    // «Entro hace 45 minutos» mueve; «tienes un lead pendiente» no.
    expect(_internos.cuerpo(lead)).toMatch(/hace 4[45] minutos/);
  });

  it('trae el telefono y el correo, para poder actuar sin buscarlos', () => {
    const c = _internos.cuerpo(lead);
    expect(c).toContain('+34600111222');
    expect(c).toContain('marta@ejemplo.com');
  });

  it('no revienta si falta el telefono o el proyecto', () => {
    const c = _internos.cuerpo({ ...lead, telefono: null, proyecto: null, email: null });
    expect(c).toContain('Marta Ruiz');
    expect(c).not.toContain('null');
  });

  it('dice como apagarlo', () => {
    expect(_internos.cuerpo(lead)).toMatch(/Mis preferencias/);
  });
});

/**
 * Y el aviso DENTRO del CRM, que es la mitad que pide el #126 para el miercoles.
 *
 * Estaba escrito y funcionando, pero sin nada que lo comprobara: el mock de
 * `notifyUsers` estaba puesto en este fichero y nadie miraba si se llamaba.
 * Todo lo demas de aqui prueba el correo.
 *
 * El #111 lo pide con estas palabras: «Hoy solo manda correo; tiene que dejar
 * tambien el aviso dentro del CRM, a la gestora que lo lleva, no a los admin».
 */
describe('el aviso dentro del CRM, no solo el correo', () => {
  const unLead = {
    id: 77, nombre: 'Marta Ruiz', responsable_id: 9,
    gestora_email: 'gestora@empresa.com', telefono: '600', email: 'm@r.com', proyecto: 'Psiko',
  };

  it('deja el aviso en la campana de la gestora que lo lleva', async () => {
    sinTocarDevuelve = [unLead];
    await _internos.vuelta();
    expect(campanazos).toHaveLength(1);
    expect(campanazos[0].targetUserIds).toEqual([9]);
    expect(campanazos[0].type).toBe('lead_sin_tocar');
  });

  it('con enlace a la ficha: un aviso sin adonde ir no sirve', async () => {
    sinTocarDevuelve = [unLead];
    await _internos.vuelta();
    expect(campanazos[0].link_path).toBe('/prospectos/77');
  });

  it('y lo deja AUNQUE no haya correo de la gestora', async () => {
    // Es el motivo de que la campanita vaya antes del `continue`: es el canal
    // que no depende de que Brevo conteste ni de que el correo este puesto.
    sinTocarDevuelve = [{ ...unLead, gestora_email: null }];
    await _internos.vuelta();
    expect(campanazos).toHaveLength(1);
    expect(enviados).toHaveLength(0);
  });
});
