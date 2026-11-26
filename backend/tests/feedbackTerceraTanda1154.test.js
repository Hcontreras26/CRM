import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';

/**
 * Tercera tanda de la auditoría de Feedback (#1154, sigue de #593 y #1133).
 * Sin base: el modelo y Brevo van simulados, porque lo que se prueba es lo que
 * hace el servicio con lo que le devuelven.
 *
 *   1. el monitor de tareas ve los correos del 7.º día que no salen;
 *   2. el MCP da las mismas cifras que el panel;
 *   3. el correo lleva parte de texto plano (`multipart/alternative`);
 *   6. en producción, sin FEEDBACK_BASE_URL ni CRM_BASE_URL, no se arranca.
 */

// El programador solo manda dentro de su horario: aquí, a cualquier hora.
process.env.FEEDBACK_DIA7_DESDE = '0';
process.env.FEEDBACK_DIA7_HASTA = '24';

const { modelo, brevo } = vi.hoisted(() => ({
  modelo: {
    correosDeHoy: vi.fn(), reintentables: vi.fn(), candidatosDelDia7: vi.fn(), sigueTocandole: vi.fn(),
    datosDelLead: vi.fn(), porLead: vi.fn(), crearEnvio: vi.fn(), marcarEnvio: vi.fn(), panel: vi.fn(),
  },
  brevo: { sendEmail: vi.fn() },
}));

vi.mock('../src/modules/feedback/feedback.model.js', () => modelo);
vi.mock('../src/shared/services/brevo.service.js', () => brevo);
vi.mock('../src/modules/notifications/notifications.service.js', () => ({ notifyUsers: vi.fn() }));
vi.mock('../src/modules/leads/lead.model.js', () => ({ createInteraction: vi.fn() }));
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async () => ({ rows: [{ nombre: 'Ana' }] })),
  default: { query: vi.fn(async () => ({ rows: [] })) },
}));

const servicio = await import('../src/modules/feedback/feedback.service.js');
const { _vuelta } = await import('../src/jobs/feedbackDia7Scheduler.js');

const DATOS = {
  project_id: 3, proyecto: 'Psiko Aprende', nombre: 'MARÍA López', email: 'maria@ejemplo.com',
  producto: 'Máster en Psicología Clínica', responsable_id: 9, theme_color: '#1f4e79',
};

beforeEach(() => {
  vi.clearAllMocks();
  modelo.correosDeHoy.mockResolvedValue(0);
  modelo.reintentables.mockResolvedValue([]);
  modelo.candidatosDelDia7.mockResolvedValue([1, 2]);
  modelo.datosDelLead.mockResolvedValue(DATOS);
  modelo.porLead.mockResolvedValue(null);
  modelo.crearEnvio.mockImplementation(async ({ leadId }) => ({
    id: leadId * 10, lead_id: leadId, project_id: 3, gestora_id: 9, disparador: 'dia7', token: `tok${leadId}`, email: 'maria@ejemplo.com',
  }));
  modelo.marcarEnvio.mockImplementation(async (id, { estado, nota }) => ({ id, lead_id: id / 10, gestora_id: 9, estado, nota_envio: nota }));
});

describe('punto 3 · el correo lleva texto plano', () => {
  it('correoDe da también `texto`, sin HTML y con el enlace entero', () => {
    const { texto, html } = servicio.correoDe(DATOS, 'tokABC');
    expect(html).toContain('<a href=');
    expect(texto).not.toMatch(/<[a-z!/]/i);
    expect(texto).toContain('Hola, María:');
    expect(texto).toContain('Máster en Psicología Clínica');
    expect(texto).toContain(servicio.enlaceDe('tokABC'));
    expect(texto).toContain('el equipo de Psiko Aprende');
  });

  it('la vista previa lo dice también en el texto plano', () => {
    const { texto } = servicio.correoDe(DATOS, 'tokABC', { vista: true });
    expect(texto).toMatch(/^VISTA PREVIA/);
    expect(texto).toContain('?vista=1');
  });

  it('a Brevo le llegan las dos partes (htmlContent y textContent)', async () => {
    brevo.sendEmail.mockResolvedValue({ sent: true });
    await servicio.pedirFeedback(1, 'dia7');
    const correo = brevo.sendEmail.mock.calls[0][0];
    expect(correo.htmlContent).toContain('<html');
    expect(correo.textContent).toContain('Contestar: ');
    expect(correo.textContent).toContain('/feedback/tok1');
  });
});

describe('punto 1 · el monitor ve los fallos del 7.º día', () => {
  it('un correo que Brevo rechaza cuenta como fallido, no solo como pedido', async () => {
    brevo.sendEmail
      .mockResolvedValueOnce({ sent: true })
      .mockResolvedValueOnce({ sent: false, reason: 'ERROR', message: 'Brevo: 401 key not found' });
    const r = await servicio.vueltaDelDia7({ pila: 25, tope: 200 });
    expect(r).toMatchObject({ pedidos: 2, fallidos: 1, ultimoFallo: 'Brevo: 401 key not found' });
    expect(servicio.falloDeLaVuelta(r)).toBe('1 correo de feedback no salió: Brevo: 401 key not found');
  });

  it('si salen todos, no hay fallo', async () => {
    brevo.sendEmail.mockResolvedValue({ sent: true });
    const r = await servicio.vueltaDelDia7({ pila: 25, tope: 200 });
    expect(r.fallidos).toBe(0);
    expect(servicio.falloDeLaVuelta(r)).toBeNull();
  });

  it('el freno de pruebas no es un fallo: es lo esperado en /testeo', async () => {
    brevo.sendEmail.mockResolvedValue({ sent: false, reason: 'FRENO_DE_PRUEBAS' });
    const r = await servicio.vueltaDelDia7({ pila: 25, tope: 200 });
    expect(r.fallidos).toBe(0);
  });

  it('los reintentos que vuelven a fallar también cuentan', async () => {
    modelo.candidatosDelDia7.mockResolvedValue([]);
    modelo.reintentables.mockResolvedValue([{ id: 50, lead_id: 5, project_id: 3, disparador: 'dia7', token: 'tok5', email: 'x@y.es' }]);
    modelo.sigueTocandole.mockResolvedValue(true);
    brevo.sendEmail.mockRejectedValue(new Error('ECONNRESET'));
    const r = await servicio.vueltaDelDia7({ pila: 25, tope: 200 });
    expect(r).toMatchObject({ reintentos: 1, fallidos: 1, ultimoFallo: 'ECONNRESET' });
  });

  it('la vuelta del programador lanza, que es lo que `vigilar` apunta como fallo', async () => {
    brevo.sendEmail.mockResolvedValue({ sent: false, reason: 'ERROR', message: 'cuota agotada' });
    await expect(_vuelta()).rejects.toThrow('2 correos de feedback no salieron: cuota agotada');
    // Y aun así mandó la tanda entera: un correo malo no para al resto.
    expect(brevo.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('sin fallos, la vuelta devuelve su resumen como siempre', async () => {
    brevo.sendEmail.mockResolvedValue({ sent: true });
    await expect(_vuelta()).resolves.toMatchObject({ pedidos: 2, fallidos: 0 });
  });
});

describe('punto 6 · sin dirección, en producción no se arranca', () => {
  it('en producción y sin las dos variables, falla al arrancar', () => {
    expect(() => servicio.comprobarBaseDeLaEncuesta({ NODE_ENV: 'production' })).toThrow(/FEEDBACK_BASE_URL o CRM_BASE_URL/);
    expect(() => servicio.comprobarBaseDeLaEncuesta({ NODE_ENV: 'production', CRM_BASE_URL: '  ' })).toThrow();
  });

  it('con cualquiera de las dos, arranca', () => {
    expect(() => servicio.comprobarBaseDeLaEncuesta({ NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/crm' })).not.toThrow();
    expect(() => servicio.comprobarBaseDeLaEncuesta({ NODE_ENV: 'production', FEEDBACK_BASE_URL: 'https://360crm.tech/testeo' })).not.toThrow();
  });

  it('en desarrollo sigue el localhost de reserva', () => {
    expect(() => servicio.comprobarBaseDeLaEncuesta({ NODE_ENV: 'development' })).not.toThrow();
    expect(servicio.baseDeLaEncuesta({ NODE_ENV: 'development' })).toBe('http://localhost:5173/crm');
  });

  it('en producción nunca devuelve localhost: lanza', () => {
    expect(() => servicio.baseDeLaEncuesta({ NODE_ENV: 'production' })).toThrow();
    expect(servicio.baseDeLaEncuesta({ NODE_ENV: 'production', FEEDBACK_BASE_URL: 'https://360crm.tech/testeo/' }))
      .toBe('https://360crm.tech/testeo');
  });

  it('app.js lo comprueba antes de escuchar', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
    const comprobar = app.indexOf('comprobarBaseDeLaEncuesta();');
    expect(comprobar).toBeGreaterThan(-1);
    expect(comprobar).toBeLessThan(app.indexOf('app.listen('));
  });
});

describe('punto 2 · el MCP da las cifras del panel', () => {
  const PANEL = {
    contestadas: [{ respuestas: { motivo: 'precio', nota_atencion: 4 }, respondido_at: '2026-11-20T10:00:00Z', lead_id: 1, lead_nombre: 'María López', gestora: 'Ana' }],
    totales: { enviados: 8, respondidos: 1, en_revision: 0, bloqueados: 0, sin_correo: 0, fallidos: 0 },
    porMotivo: [{ clave: 'precio', n: 1 }], porDisparador: [], porCampus: [], porEmpresa: [], porGestora: [], porMes: [],
  };

  it('el informe «feedback» devuelve lo mismo que la pantalla: tasa y resumen por pregunta', async () => {
    modelo.panel.mockResolvedValue(PANEL);
    const { INFORMES } = await import('../src/modules/mcp/mcp.tools.js');
    const mcp = await INFORMES.feedback.ejecutar({ projectIds: [3, 4], asesoraId: undefined, from: '2026-11-01', to: '2026-11-30' });
    modelo.panel.mockResolvedValue(PANEL);
    const pantalla = await servicio.resumenDelPanel({ projectIds: [3, 4], desde: '2026-11-01', hasta: '2026-11-30' });
    expect(mcp).toEqual(pantalla);
    expect(mcp.totales.tasa).toBe(12.5);
    expect(mcp.preguntas.find((p) => p.clave === 'nota_atencion').media).toBe(4);
    // Las respuestas en bruto ya no salen: el resumen las trae contadas.
    expect(mcp).not.toHaveProperty('contestadas');
  });

  it('una fecha imposible se ignora en vez de llegar a la base', async () => {
    modelo.panel.mockResolvedValue(PANEL);
    const { INFORMES } = await import('../src/modules/mcp/mcp.tools.js');
    await INFORMES.feedback.ejecutar({ projectIds: [3], from: '2026-02-30', to: '2026-11-30' });
    expect(modelo.panel).toHaveBeenLastCalledWith(expect.objectContaining({ desde: null, hasta: '2026-11-30' }));
  });

  it('un campus concreto cuenta aunque sea de pruebas, como en la pantalla', async () => {
    modelo.panel.mockResolvedValue(PANEL);
    const { INFORMES } = await import('../src/modules/mcp/mcp.tools.js');
    await INFORMES.feedback.ejecutar({ projectIds: [3] });
    expect(modelo.panel).toHaveBeenLastCalledWith(expect.objectContaining({ conPruebas: true }));
    await INFORMES.feedback.ejecutar({ projectIds: [3, 4] });
    expect(modelo.panel).toHaveBeenLastCalledWith(expect.objectContaining({ conPruebas: false }));
  });
});

describe('detalle de la ficha · quién lo descartó', () => {
  it('«No enviar» apunta el nombre, no el número de usuario', async () => {
    modelo.porLead.mockResolvedValue({ id: 70, lead_id: 7, estado: 'revision' });
    await servicio.noEnviar(7, 12);
    expect(modelo.marcarEnvio).toHaveBeenCalledWith(70, expect.objectContaining({
      estado: 'cancelado', nota: 'lo descartó Ana tras revisarlo' }));
  });
});
