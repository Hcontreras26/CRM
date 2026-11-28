import { describe, it, expect, vi, afterEach } from 'vitest';
import { codigoIframe } from './codigoIframe';

// #48, revisión de Diego en la #1181: el formulario incrustado como iframe se
// pedía dos veces (el iframe ya cargaba su `src` y el script se lo cambiaba).

const SRC = 'https://360crm.tech/crm/embed/form/abc123';

/** Pega el código como lo pegaría una web y ejecuta su script; devuelve cada `src` que se puso. */
function pegar(referrer: string) {
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
  const puestos: string[] = [];
  const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!;
  vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLIFrameElement, v: string) {
    puestos.push(v);
    original.set!.call(this, v);
  });
  const html = codigoIframe(SRC, 'abc123');
  document.body.innerHTML = html; // innerHTML no ejecuta el <script>: se ejecuta a mano, como haría la página
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  new Function(script)();
  return { html, puestos, iframe: document.getElementById('crm-form-abc123') as HTMLIFrameElement };
}

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('el código del iframe', () => {
  it('el iframe va sin src: lo pone el script, una sola vez, con el referrer', () => {
    const { html, puestos, iframe } = pegar('https://chatgpt.com/');
    expect(html).toMatch(/<iframe id="crm-form-abc123" width/);
    expect(html.split('<noscript>')[0]).not.toMatch(/<iframe[^>]* src=/);
    expect(puestos).toEqual([`${SRC}?referrer=${encodeURIComponent('https://chatgpt.com/')}`]);
    expect(iframe.src).toBe(puestos[0]);
  });

  it('sin referrer, también una sola vez y sin parámetro', () => {
    const { puestos } = pegar('');
    expect(puestos).toEqual([SRC]);
  });

  it('sin JavaScript queda el <noscript> con el src de siempre', () => {
    expect(codigoIframe(SRC, 'abc123')).toContain(`<noscript><iframe src="${SRC}"`);
  });
});
