import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Lo que la pantalla manda marcar en Stripe es lo que el CRM atiende (#44).
 *
 * La pantalla de Integraciones le dice a quien conecta un proyecto qué eventos
 * marcar en Stripe. Decía estos cuatro:
 *
 *     checkout.session.completed   invoice.paid
 *     payment_intent.succeeded     payout.paid
 *
 * De los cuatro, el CRM procesa UNO. Los otros tres caen en el `default` de
 * `handleWebhookEvent` y se descartan. Y los `charge.*` —que son los que traen
 * el dinero— no aparecían en la lista, así que no se marcaban.
 *
 * Quien lo siguiera configuraba el webhook a medias y NO SE ENTERABA: los
 * cobros siguen entrando por el sondeo cada cinco minutos, así que la pantalla
 * de pagos se ve bien. Solo se pierde la inmediatez, en silencio.
 *
 * Las dos listas no se pueden compartir —una vive en el servidor y la otra en
 * el navegador— así que se comparan aquí. Si alguien añade un `case` y no toca
 * la pantalla, esto se cae.
 */

const leer = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Los `case 'x':` del switch de `handleWebhookEvent`. */
function eventosDelServidor() {
  const src = leer('../src/modules/stripe-payments/stripe-payments.service.js');
  const desde = src.indexOf('export async function handleWebhookEvent');
  expect(desde, 'no se encontró handleWebhookEvent').toBeGreaterThan(-1);
  // Hasta el cierre de la función: el `default` del switch marca el final útil.
  const hasta = src.indexOf('default:', desde);
  return [...src.slice(desde, hasta).matchAll(/case '([^']+)'/g)].map((m) => m[1]);
}

/** Lo que la pantalla dice que hay que marcar. */
function eventosDeLaPantalla() {
  const src = leer('../../frontend/src/modules/accounting/pages/IntegrationsPage.tsx');
  const m = src.match(/const EVENTOS_DEL_WEBHOOK = \[([\s\S]*?)\] as const;/);
  expect(m, 'no se encontró EVENTOS_DEL_WEBHOOK en la pantalla').toBeTruthy();
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('los eventos del webhook de Stripe', () => {
  it('el servidor atiende alguno, o esta prueba no comprueba nada', () => {
    expect(eventosDelServidor().length).toBeGreaterThan(0);
  });

  it('la pantalla no manda marcar nada que el CRM descarte', () => {
    // Marcar de más no rompe, pero hace creer que se procesa algo que no.
    const sobran = eventosDeLaPantalla().filter((e) => !eventosDelServidor().includes(e));
    expect(sobran, `la pantalla pide eventos que el CRM no procesa: ${sobran.join(', ')}`).toEqual([]);
  });

  it('y no se deja fuera ninguno de los que sí atiende', () => {
    // Este es el que dolía: sin los `charge.*` marcados, el webhook no trae el
    // dinero y todo parece bien porque el sondeo lo recoge cinco minutos después.
    const faltan = eventosDelServidor().filter((e) => !eventosDeLaPantalla().includes(e));
    expect(faltan, `el CRM atiende eventos que la pantalla no manda marcar: ${faltan.join(', ')}`).toEqual([]);
  });
});

describe('la dirección del webhook', () => {
  it('la pantalla no enseña la ruta que no existe', () => {
    // `/api/integrations/stripe/webhook` no está montada en ningún sitio. La
    // buena es `/api/stripe-webhook/<projectId>`, pública y aparte.
    const src = leer('../../frontend/src/modules/accounting/pages/IntegrationsPage.tsx');
    const malas = src.split('\n')
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => l.includes('integrations/stripe/webhook') && !l.trimStart().startsWith('//'));
    expect(malas.map(([n]) => n), 'líneas con la ruta vieja').toEqual([]);
  });

  it('y el prefijo que arma coincide con el que monta el servidor', () => {
    const front = leer('../../frontend/src/modules/accounting/pages/IntegrationsPage.tsx');
    const back = leer('../src/modules/stripe-payments/index.js');
    expect(front).toContain('/stripe-webhook/');
    expect(back).toContain("prefix: '/api/stripe-webhook'");
  });
});
