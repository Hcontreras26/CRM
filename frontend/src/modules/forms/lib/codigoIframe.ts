/**
 * El código para incrustar un formulario como iframe (#48).
 *
 * Lleva el referrer de la visita en el `src`: desde dentro, el iframe solo ve
 * la página que lo incrusta, no de dónde llegó la persona (ChatGPT, Google…).
 *
 * El iframe va SIN `src` y el script se lo pone una sola vez, con o sin
 * referrer: si llevaba `src` y el script lo cambiaba, el formulario se pedía
 * dos veces (revisión de Diego en la #1181). El script busca el iframe por su
 * id, no con `document.currentScript`, porque Elementor mete el HTML con jQuery
 * y ahí `currentScript` es null. Sin JavaScript, el <noscript>.
 */
export function codigoIframe(iframeSrc: string, embedId: string): string {
  const id = `crm-form-${embedId}`;
  return `<iframe id="${id}" width="100%" height="500" frameborder="0"></iframe>\n`
    + `<script>(function(){var f=document.getElementById('${id}');if(f){f.src='${iframeSrc}'+(document.referrer?'?referrer='+encodeURIComponent(document.referrer):'');}})();</script>\n`
    + `<noscript><iframe src="${iframeSrc}" width="100%" height="500" frameborder="0"></iframe></noscript>`;
}
