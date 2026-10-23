import { describe, it, expect, vi, beforeEach } from 'vitest';

// Si alguien USA el WhatsApp del CRM (#128, punto 1), desde #423 con el permiso
// «Usar su WhatsApp» del catálogo y no con la casilla `usa_whatsapp` de la
// ficha (QA de Diego, punto 8: `roles.js` seguía mirando la casilla). La 222
// convirtió la casilla apagada en una excepción «no».
//
// Diego, 07/09: «Ni Vanesa, ni Adriana, sus WhatsApp apareceran ahi. Debe ser
// una opcion para activar o no». Lo que se prueba aqui es la REGLA: que sean
// dos preguntas separadas —puede / usa— es justamente lo que evita que quitar
// el permiso desvincule el numero de alguien.

const mapas = new Map();
vi.mock('../src/modules/permissions/permissions.service.js', () => ({
  explicarPermisosRecordados: vi.fn(async (id) => (mapas.has(id) ? { mapa: mapas.get(id) } : null)),
}));

const { porQueNoPuede, porQueNoUsa, usaWhatsapp, tienePermisoDeUsar } = await import('../src/modules/whatsapp/roles.js');

const gestora = { id: 1, role: 'gestor', active: true, gestor_colaboraciones: false };

beforeEach(() => {
  mapas.clear();
  mapas.set(1, { 'whatsapp.usar': true });
});

describe('«Usar su WhatsApp» (#423, punto 8)', () => {
  it('sin el permiso, no lo usa — y se dice donde se enciende', async () => {
    mapas.set(1, { 'whatsapp.usar': false });
    const motivo = await porQueNoUsa(gestora);
    expect(motivo).toBeTruthy();
    // El motivo no es adorno: sin la segunda frase, quien lo lea no sabe que
    // hacer con ello. Es lo mismo que se aprendio en la #68.
    expect(motivo).toMatch(/ficha de usuario/i);
  });

  it('con el permiso, lo usa', async () => {
    expect(await usaWhatsapp(gestora)).toBe(true);
    expect(await tienePermisoDeUsar(1)).toBe(true);
  });

  it('la casilla vieja ya no cuenta: manda el permiso', async () => {
    expect(await usaWhatsapp({ ...gestora, usa_whatsapp: false })).toBe(true);
    mapas.set(1, { 'whatsapp.usar': false });
    expect(await usaWhatsapp({ ...gestora, usa_whatsapp: true })).toBe(false);
  });

  it('si esa persona no existe, no se inventa un permiso', async () => {
    expect(await tienePermisoDeUsar(404)).toBe(false);
  });

  it('no tenerlo NO es lo mismo que no poder: `porQueNoPuede` no se entera', () => {
    // Esta es LA prueba de este fichero.
    //
    // `user.controller` compara `puedeTenerWhatsapp` antes y despues de cada
    // cambio y, si se pierde, DESVINCULA el numero. Si el permiso entrara en esa
    // funcion, quitarlo soltaria la sesion de la gestora y habria que volver a
    // enlazar el movil con ella delante — por una decision de reparto.
    mapas.set(1, { 'whatsapp.usar': false });
    expect(porQueNoPuede(gestora)).toBeNull();
  });

  it('lo que no puede, tampoco lo usa — y manda el motivo del rol', async () => {
    // Un tutor no tiene WhatsApp aunque alguien le diera el permiso. Y el motivo
    // que se enseña es el suyo, no «no tiene activado», que mandaria a quien
    // manda a pulsar algo que no arregla nada.
    mapas.set(2, { 'whatsapp.usar': true });
    expect(await porQueNoUsa({ id: 2, role: 'tutor', active: true })).toMatch(/tutores/i);
  });

  it('de baja, tampoco', async () => {
    expect(await usaWhatsapp({ ...gestora, active: false })).toBe(false);
  });
});
