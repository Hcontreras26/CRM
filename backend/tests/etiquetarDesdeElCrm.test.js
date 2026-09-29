import { describe, it, expect, vi, beforeEach } from 'vitest';

// Poner una etiqueta de WhatsApp desde el CRM (#128, punto 2).
//
// Diego: «poder extraer las etiquetas de WhatsApp Y NOSOTROS PONER etiquetas
// para ese funcionamiento». Traerlas llega por los avisos; ponerlas va por este
// endpoint.
//
// Lo que se fija aqui es el ORDEN, que es lo unico que puede dejar al CRM
// mintiendo: primero WhatsApp, y solo si lo acepta se apunta en la base.

const asociarEtiqueta = vi.fn(async () => ({ conversacionId: 55, puesta: true }));
const porId = vi.fn(async () => ({ id: 55, instancia: 'crm-u4', jid: '34600111222@s.whatsapp.net' }));
const ponerEtiqueta = vi.fn(async () => ({ ok: true, motivo: null }));

// La casilla del #128 se pregunta a la base al resolver la sesion propia: si
// contestara vacio, el controlador negaria el paso antes de llegar a la
// etiqueta y estas pruebas comprobarian otra cosa.
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql) => (/usa_whatsapp/.test(sql) ? { rows: [{ usa: true }] } : { rows: [] })),
}));

vi.mock('../src/modules/whatsapp/chat.model.js', () => ({
  asociarEtiqueta: (...a) => asociarEtiqueta(...a),
  porId: (...a) => porId(...a),
  etiquetasDeConversaciones: vi.fn(async () => new Map()),
  etiquetasDe: vi.fn(async () => []),
  etiquetasDeLead: vi.fn(async () => []),
  guardarEtiqueta: vi.fn(), marcarEtiquetaBorrada: vi.fn(),
  listar: vi.fn(async () => []), mensajes: vi.fn(async () => []),
  marcarLeida: vi.fn(), apuntarMirada: vi.fn(async () => true),
}));

vi.mock('../src/modules/whatsapp/evolution.client.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    configurado: () => false,
    ponerEtiqueta: (...a) => ponerEtiqueta(...a),
  };
});
vi.mock('../src/modules/whatsapp/chat.service.js', () => ({
  marcarLeida: vi.fn(async () => {}),
  tieneSesion: vi.fn(async () => true),
}));

const ctrl = await import('../src/modules/whatsapp/chat.controller.js');
const modelo = await import('../src/modules/whatsapp/chat.model.js');

/** Llama al endpoint y devuelve lo que salio: respuesta o error. */
async function etiquetar(cuerpo) {
  const res = { codigo: 200, cuerpo: null };
  res.status = (c) => { res.codigo = c; return res; };
  res.json = (c) => { res.cuerpo = c; return res; };
  let error = null;
  await ctrl.etiquetarChat(
    { user: { userId: 4, role: 'gestor' }, params: { id: '55' }, query: {}, body: cuerpo },
    res,
    (e) => { error = e; },
  );
  return { res, error };
}

describe('etiquetar un chat desde el CRM', () => {
  beforeEach(() => {
    asociarEtiqueta.mockClear();
    ponerEtiqueta.mockClear();
    ponerEtiqueta.mockResolvedValue({ ok: true, motivo: null });
  });

  it('si WhatsApp la acepta, tambien se apunta en el CRM', async () => {
    // Se apunta sin esperar al eco: WhatsApp no te reenvia tu propia accion, y
    // esperando el aviso la etiqueta recien puesta no se veria nunca.
    const { error, res } = await etiquetar({ waId: '12', poner: true });
    expect(error).toBeNull();
    expect(res.cuerpo?.success).toBe(true);
    expect(ponerEtiqueta).toHaveBeenCalled();
    expect(asociarEtiqueta).toHaveBeenCalledWith(
      expect.objectContaining({ waIdEtiqueta: '12', poner: true })
    );
  });

  it('si WhatsApp la RECHAZA, el CRM no se la apunta', async () => {
    // La importante. Apuntandola igual, el CRM diria que la etiqueta esta
    // puesta y en el movil no lo estaria — y eso no se descubre hasta que
    // alguien mira el telefono.
    ponerEtiqueta.mockResolvedValue({ ok: false, motivo: 'Number is not on WhatsApp' });
    const { error } = await etiquetar({ waId: '12', poner: true });
    expect(error?.statusCode).toBe(400);
    expect(asociarEtiqueta).not.toHaveBeenCalled();
  });

  it('quitarla tambien se manda a WhatsApp', async () => {
    await etiquetar({ waId: '12', poner: false });
    expect(ponerEtiqueta).toHaveBeenCalledWith(
      '34600111222@s.whatsapp.net', '12', 'remove', 'crm-u4'
    );
  });

  it('sin etiqueta no se molesta a WhatsApp', async () => {
    const { error } = await etiquetar({ poner: true });
    expect(error?.statusCode).toBe(400);
    expect(ponerEtiqueta).not.toHaveBeenCalled();
  });

  it('no se puede etiquetar la conversacion de otra persona', async () => {
    // El mismo candado que el resto del chat: la conversacion tiene que ser de
    // la sesion de quien pregunta, o no existe para el.
    porId.mockResolvedValueOnce({ id: 55, instancia: 'crm-u9', jid: '34600111222@s.whatsapp.net' });
    const { error } = await etiquetar({ waId: '12', poner: true });
    expect(error?.statusCode).toBe(404);
    expect(ponerEtiqueta).not.toHaveBeenCalled();
  });
});

// ── Filtrar por etiqueta, y verlas en la ficha (#138) ────────────────────────

describe('el filtro y la ficha', () => {
  it('el filtro llega del endpoint al modelo', async () => {
    // Si se quedara por el camino, la pantalla filtraria y la lista vendria
    // entera: el usuario ve que «el filtro no hace nada».
    const res = { json: vi.fn(), status: () => res };
    await ctrl.chats(
      { user: { userId: 4, role: 'gestor' }, query: { etiquetaWa: '12' }, body: {} },
      res,
      () => {},
    );
    expect(modelo.listar).toHaveBeenCalledWith(expect.objectContaining({ etiquetaWa: '12' }));
  });

  it('y el estado del CRM sigue siendo otro filtro distinto', async () => {
    // «Se enseñan las dos, no se pisa ninguna» — del ticket. Se pueden combinar.
    const res = { json: vi.fn(), status: () => res };
    await ctrl.chats(
      { user: { userId: 4, role: 'gestor' }, query: { etiquetaWa: '12', estado: 'en_seguimiento' }, body: {} },
      res,
      () => {},
    );
    expect(modelo.listar).toHaveBeenCalledWith(
      expect.objectContaining({ etiquetaWa: '12', estado: 'en_seguimiento' })
    );
  });
});
