import { describe, it, expect, vi, beforeEach } from 'vitest';

// El origen del prospecto al entrar y sus categorías fijas (#48, 2.ª reposición,
// Diego 25/11/2026):
//   · por formulario (webhook de Elementor/Make) y por el formulario incrustado
//     se guardan las UTM reales, el referrer, el gclid y el fbclid (como fbc), y
//     se deduce el canal (antes estas dos altas no lo deducían);
//   · «ChatGPT» también cuando el referrer es otra IA;
//   · gclid/fbclid valen también como campo suelto, no solo pegados a la dirección;
//   · las categorías fijas: Pago Google, Pago Meta, Orgánico, IA, Directo,
//     Referido y Otros (y «sin origen» aparte);
//   · el recálculo hacia atrás pasa a IA lo que entró como «referido» desde otra IA.
// Sin base: todo mockeado, como captacionFbclid474.test.js.
//
//   cd backend && npx vitest run tests/origenYCategorias48.test.js

vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}));

const FORM_WIDGET = { id: 1, kind: 'form', destination: 'lead', project_id: 8, embed_id: 'widget48', url_match_enabled: false };
const FORM_WEBHOOK = {
  id: 2, kind: 'webhook', webhook_mode: 'json', awaiting_sample: false,
  project_id: 8, embed_id: 'webhook48', field_mapping: {}, config: {}, default_product_id: null,
};

vi.mock('../src/modules/forms/form.model.js', () => ({
  findByEmbed: vi.fn(async () => FORM_WIDGET),
  incrementSubmissions: vi.fn(async () => {}),
  logEvent: vi.fn(async () => {}),
  saveSample: vi.fn(async () => {}),
}));
vi.mock('../src/modules/leads/lead.model.js', () => ({
  createLeadWithRoundRobin: vi.fn(async (d) => ({ id: 91, project_id: d.projectId, nombre: d.nombre })),
  findDuplicateByEmailOrPhone: vi.fn(async () => null),
  createInteraction: vi.fn(async () => {}),
}));
vi.mock('../src/modules/leads/dup-queue.service.js', () => ({ enqueue: vi.fn(async () => null) }));
vi.mock('../src/modules/leads/lead-products.service.js', () => ({ autoAddFromReincidente: vi.fn(async () => {}) }));
vi.mock('../src/modules/proceso/proceso.model.js', () => ({ planificarPasosDeLead: vi.fn(async () => 0) }));
vi.mock('../src/modules/asignacion/asignacion.service.js', () => ({
  decidirFormulario: vi.fn(async () => null),
  apuntarFormulario: vi.fn(async () => {}),
}));

const forms = await import('../src/modules/forms/form.controller.js');
const formModel = await import('../src/modules/forms/form.model.js');
const leadModel = await import('../src/modules/leads/lead.model.js');
const db = await import('../src/shared/config/db.js');
const {
  deducirCanal, categoriaDelCanal, categoriaEnSql, CATEGORIAS, CANAL_DE_LAS_OTRAS_IA, clicsDelOrigen, planearRecalculo,
} = await import('../src/modules/leads/canal.js');
const { guardarOrigenDeLaPagina } = await import('../src/modules/widget/widget.pulsaciones.js');
const { webhookLeadSchema } = await import('../src/modules/leads/lead.validation.js');

async function llamar(fn, { body = {}, headers = {}, ip = '203.0.113.5' } = {}) {
  let salida = null;
  const res = { json: (d) => { salida = d; return res; }, status() { return res; } };
  await fn({ params: {}, body, headers, ip }, res, (e) => { throw e; });
  return salida;
}
const utmsDelAlta = () => leadModel.createLeadWithRoundRobin.mock.calls.at(-1)[0].utms;

beforeEach(() => { vi.clearAllMocks(); });

describe('las categorías fijas (Diego, 25/11/2026)', () => {
  it('son siete, en este orden', () => {
    expect(CATEGORIAS.map((c) => c.texto)).toEqual(['Pago Google', 'Pago Meta', 'Orgánico', 'IA', 'Directo', 'Referido', 'Otros']);
  });

  it('cada canal guardado cae en la suya; lo que no está en ninguna, en «Otros»', () => {
    expect(categoriaDelCanal('google_ads')).toBe('pago_google');
    expect(categoriaDelCanal('meta_ads')).toBe('pago_meta');
    expect(categoriaDelCanal('organico')).toBe('organico');
    expect(categoriaDelCanal('chatgpt_ia')).toBe('ia');
    expect(categoriaDelCanal('directo')).toBe('directo');
    expect(categoriaDelCanal('referido')).toBe('referido');
    for (const c of ['tiktok_ads', 'whatsapp', 'instagram', 'uno_que_aun_no_existe']) expect(categoriaDelCanal(c)).toBe('otros');
    expect(categoriaDelCanal('sin_origen')).toBe('sin_origen');
  });

  it('la versión SQL sale de la misma tabla', () => {
    const sql = categoriaEnSql('x.canal');
    expect(sql).toContain("WHEN 'google_ads' THEN 'pago_google'");
    expect(sql).toContain("WHEN 'chatgpt_ia' THEN 'ia'");
    expect(sql).toContain("ELSE 'otros'");
  });
});

describe('«ChatGPT» también cuando el referrer es otra IA', () => {
  it('Perplexity, Gemini, Copilot y Claude van a chatgpt_ia, y en el informe a «IA»', () => {
    expect(CANAL_DE_LAS_OTRAS_IA).toBe('chatgpt_ia');
    for (const referrer of ['https://www.perplexity.ai/search', 'https://gemini.google.com/app', 'https://copilot.microsoft.com/', 'https://claude.ai/chat']) {
      expect(deducirCanal({ referrer })).toBe('chatgpt_ia');
      expect(categoriaDelCanal(deducirCanal({ referrer }))).toBe('ia');
    }
  });
});

describe('gclid y fbclid también como campo suelto', () => {
  it('cuentan como pago aunque la dirección llegue sin ellos', () => {
    expect(deducirCanal({ landing_url: 'https://web.test/curso/', gclid: 'G-1' })).toBe('google_ads');
    expect(deducirCanal({ landing_url: 'https://web.test/curso/', fbclid: 'F-1' })).toBe('meta_ads');
    expect(deducirCanal({ ttclid: 'T-1' })).toBe('tiktok_ads');
    expect(deducirCanal({ gclid: '   ' })).toBe('directo');
  });

  it('se guardan: el gclid tal cual y el fbclid como fbc; primero el de la dirección', () => {
    expect(clicsDelOrigen({ landing_url: 'https://web.test/?gclid=URL', gclid: 'SUELTO' }).gclid).toBe('URL');
    expect(clicsDelOrigen({ gclid: 'SUELTO' }).gclid).toBe('SUELTO');
    expect(clicsDelOrigen({ fbclid: 'FB9' }).fbc).toMatch(/^fb\.1\.\d+\.FB9$/);
    expect(clicsDelOrigen({})).toEqual({ gclid: null, ttclid: null, fbc: null });
    // #1246: el ttclid también se guarda, primero el de la dirección y recortado a 500.
    expect(clicsDelOrigen({ landing_url: 'https://web.test/?ttclid=URL', ttclid: 'SUELTO' }).ttclid).toBe('URL');
    expect(clicsDelOrigen({ ttclid: ` ${'t'.repeat(600)} ` }).ttclid).toBe('t'.repeat(500));
  });

  it('el webhook los acepta (lead.validation)', () => {
    const r = webhookLeadSchema.safeParse({ nombre: 'A', email: 'a@a.test', gclid: 'G', fbclid: 'F', ttclid: 'T' });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ gclid: 'G', fbclid: 'F', ttclid: 'T' });
  });
});

describe('el webhook de formularios guarda el origen y deduce el canal', () => {
  beforeEach(() => { formModel.findByEmbed.mockResolvedValue(FORM_WEBHOOK); });

  it('con referrer de ChatGPT: canal IA, y el referrer guardado', async () => {
    await llamar(forms.publicWebhook, {
      body: { nombre: 'Ana', email: 'ana@example.com', landing_url: 'https://web.test/curso/', referrer: 'https://chatgpt.com/' },
    });
    expect(utmsDelAlta()).toMatchObject({ canal_detectado: 'chatgpt_ia', referrer: 'https://chatgpt.com/' });
  });

  it('con gclid como campo suelto: Google Ads, y el gclid guardado', async () => {
    await llamar(forms.publicWebhook, {
      body: { nombre: 'Bea', email: 'bea@example.com', landing_url: 'https://web.test/curso/', gclid: 'Cj0KCQ' },
    });
    expect(utmsDelAlta()).toMatchObject({ canal_detectado: 'google_ads', gclid: 'Cj0KCQ' });
  });

  it('las UTM pegadas a la dirección cuentan y se guardan (no el relleno «webhook»/«api»)', async () => {
    await llamar(forms.publicWebhook, {
      body: { nombre: 'Carla', email: 'carla@example.com', landing_url: 'https://web.test/curso/?utm_source=fb&utm_medium=paid&utm_campaign=otono' },
    });
    expect(utmsDelAlta()).toMatchObject({ canal_detectado: 'meta_ads', utm_source: 'fb', utm_medium: 'paid', utm_campaign: 'otono' });
  });

  it('el «referrer» que es la propia página (Elementor) no la hace «referido»', async () => {
    await llamar(forms.publicWebhook, {
      body: { nombre: 'Dani', email: 'dani@example.com', landing_url: 'https://web.test/curso/', referrer: 'https://web.test/curso/' },
    });
    expect(utmsDelAlta().canal_detectado).toBe('directo');
  });
});

describe('el formulario incrustado (widget) guarda el origen y deduce el canal', () => {
  beforeEach(() => { formModel.findByEmbed.mockResolvedValue(FORM_WIDGET); });

  it('el referrer que la web pasa en el src, y las UTM de la página que lo incrusta', async () => {
    await llamar(forms.publicSubmit, {
      body: {
        nombre: 'Eva', email: 'eva@example.com',
        landing_url: 'https://web.test/curso/?utm_source=google&utm_medium=cpc', referrer: 'https://www.google.com/',
      },
    });
    expect(utmsDelAlta()).toMatchObject({ canal_detectado: 'google_ads', utm_source: 'google', utm_medium: 'cpc', referrer: 'https://www.google.com/' });
  });

  it('desde una IA que no es ChatGPT: IA', async () => {
    await llamar(forms.publicSubmit, {
      body: { nombre: 'Fran', email: 'fran@example.com', landing_url: 'https://web.test/curso/', referrer: 'https://www.perplexity.ai/' },
    });
    expect(utmsDelAlta().canal_detectado).toBe('chatgpt_ia');
  });

  it('sin ninguna pista: «directo» y entra igual', async () => {
    const salida = await llamar(forms.publicSubmit, { body: { nombre: 'Gael', email: 'gael@example.com' } });
    expect(salida.success).toBe(true);
    expect(utmsDelAlta()).toMatchObject({ canal_detectado: 'directo', referrer: null, gclid: null });
  });
});

describe('el botón de WhatsApp: las UTM y el gclid de la página, sin tocar el canal', () => {
  it('rellena solo lo vacío y no cambia canal_detectado', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const hecho = await guardarOrigenDeLaPagina(7, 'https://web.test/curso/?utm_source=fb&gclid=G9');
    expect(hecho).toBe(true);
    const [sql, params] = db.query.mock.calls.at(-1);
    expect(sql).not.toMatch(/canal_detectado/);
    expect(sql).toMatch(/COALESCE\(NULLIF\(utm_source, ''\), \$2\)/);
    expect(params).toEqual([7, 'fb', null, null, null, null, 'G9', 'https://web.test/curso/?utm_source=fb&gclid=G9', null]);
  });

  it('una página sin UTM ni gclid no escribe nada', async () => {
    expect(await guardarOrigenDeLaPagina(7, 'https://web.test/curso/')).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('el recálculo hacia atrás pasa a IA lo que entró como «referido» desde otra IA', () => {
  it('la IA sí; cualquier otro referido se respeta', () => {
    const { cambios, respetadas } = planearRecalculo([
      { lead_id: 1, canal_detectado: 'referido', referrer: 'https://www.perplexity.ai/' },
      { lead_id: 2, canal_detectado: 'referido', referrer: 'https://un-blog.example/' },
      { lead_id: 3, canal_detectado: 'meta_ads', referrer: 'https://claude.ai/' },
    ]);
    expect(cambios).toEqual([{ lead_id: 1, canal_antes: 'referido', canal_nuevo: 'chatgpt_ia', utms_nuevas: {} }]);
    expect(respetadas).toBe(2);
  });
});

describe('una UTM larga se recorta a su columna y no tumba el alta (revisión de Diego, 27/11)', () => {
  // lead_utms: utm_source y utm_medium VARCHAR(100); campaign, content y term VARCHAR(255).
  const largo = (n, c = 'x') => c.repeat(n);
  const pagina = `https://web.test/curso/?utm_source=${largo(150, 's')}&utm_medium=${largo(120, 'm')}`
    + `&utm_campaign=${largo(260, 'c')}&utm_content=${largo(300, 'a')}&utm_term=${largo(400, 't')}`;

  it('las de la dirección, en el formulario incrustado', async () => {
    formModel.findByEmbed.mockResolvedValue(FORM_WIDGET);
    const salida = await llamar(forms.publicSubmit, { body: { nombre: 'Hugo', email: 'hugo@example.com', landing_url: pagina } });
    expect(salida.success).toBe(true);
    const u = utmsDelAlta();
    expect([u.utm_source, u.utm_medium, u.utm_campaign, u.utm_content, u.utm_term].map((v) => v.length)).toEqual([100, 100, 255, 255, 255]);
  });

  it('las que llegan como campo, en el webhook de formularios', async () => {
    formModel.findByEmbed.mockResolvedValue(FORM_WEBHOOK);
    const salida = await llamar(forms.publicWebhook, {
      body: { nombre: 'Inés', email: 'ines@example.com', utm_source: largo(150), utm_content: largo(300) },
    });
    expect(salida.success).toBe(true);
    expect(utmsDelAlta().utm_source).toHaveLength(100);
    expect(utmsDelAlta().utm_content).toHaveLength(255);
  });

  it('las de la página del botón de WhatsApp', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await guardarOrigenDeLaPagina(7, pagina)).toBe(true);
    const [, params] = db.query.mock.calls.at(-1);
    expect(params.slice(1, 6).map((v) => v.length)).toEqual([100, 100, 255, 255, 255]);
  });
});
