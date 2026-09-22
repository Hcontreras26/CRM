import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Un corte de red leyendo el correo NO puede cerrar el backend.
 *
 * Pasó de verdad: el buzón de Hostinger cortó la conexión y la API entera se
 * fue abajo con `Error: read ECONNRESET at TLSWrap.onStreamRead`. El
 * `try/catch` de los servicios no lo veía pasar, porque ImapFlow avisa de los
 * cortes por el evento `'error'` y no rechazando la promesa que se espera. Sin
 * nadie escuchándolo, Node lo trata como excepción sin capturar y el manejador
 * de `app.js` cierra el proceso — lo correcto para un fallo de programación, y
 * éste no lo era.
 *
 * En producción lo tapaba PM2 reiniciando, así que el síntoma era la API
 * cayéndose unos segundos cada tanto sin nada en los registros de ninguna
 * petición: la causa estaba en un cron.
 *
 * Estas pruebas fijan las dos cosas que importan: que alguien escucha, y que
 * empieza a escuchar ANTES de `connect()`. El orden no es un detalle — puesto
 * después, un corte durante el propio connect vuelve a tumbarlo, y ésa es justo
 * la ventana que falla cuando el servidor de correo va mal.
 */

// El cliente de mentira: apunta en qué orden se le llama.
const llamadas = [];

class ImapFlowFalso {
  constructor() {
    this.escuchados = [];
  }

  on(evento) {
    this.escuchados.push(evento);
    llamadas.push(`on:${evento}`);
    return this;
  }

  async connect() { llamadas.push('connect'); }
  async mailboxOpen() { llamadas.push('mailboxOpen'); return { exists: 0 }; }
  async logout() { llamadas.push('logout'); }
  async search() { return []; }
  async fetchAll() { return []; }
  async list() { return []; }
  async append() { return { uid: 1 }; }
}

vi.mock('imapflow', () => ({ ImapFlow: ImapFlowFalso }));

// Con credenciales: sin ellas los servicios ni lo intentan, que es su primera
// defensa y ya está probada en sus propios ficheros.
vi.stubEnv('IMAP_HOST', 'imap.ejemplo.com');
vi.stubEnv('IMAP_USER', 'buzon@ejemplo.com');
vi.stubEnv('IMAP_PASSWORD', 'lo-que-sea');
vi.stubEnv('SMTP_USER', 'buzon@ejemplo.com');
vi.stubEnv('SMTP_PASSWORD', 'lo-que-sea');

beforeEach(() => { llamadas.length = 0; });

describe('el correo que entra', () => {
  it('escucha el evento de error del cliente IMAP', async () => {
    const { leerBuzon } = await import('../src/shared/services/correo-entrante.service.js');
    await leerBuzon();
    expect(llamadas).toContain("on:error");
  });

  it('empieza a escuchar ANTES de conectar, que es cuando más falla', async () => {
    const { leerBuzon } = await import('../src/shared/services/correo-entrante.service.js');
    await leerBuzon();
    expect(llamadas.indexOf("on:error")).toBeLessThan(llamadas.indexOf('connect'));
  });
});

describe('la copia en Enviados', () => {
  it('escucha el evento de error del cliente IMAP', async () => {
    const { guardarEnEnviados } = await import('../src/shared/services/copia-en-enviados.service.js');
    await guardarEnEnviados({ de: 'a@b.com', para: 'c@d.com', asunto: 'x', html: '<p>x</p>' });
    expect(llamadas).toContain("on:error");
  });

  it('empieza a escuchar ANTES de conectar', async () => {
    const { guardarEnEnviados } = await import('../src/shared/services/copia-en-enviados.service.js');
    await guardarEnEnviados({ de: 'a@b.com', para: 'c@d.com', asunto: 'x', html: '<p>x</p>' });
    expect(llamadas.indexOf("on:error")).toBeLessThan(llamadas.indexOf('connect'));
  });
});
