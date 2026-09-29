import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown pintado de verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE NO VALEN LAS CLASES `prose-*`
 *
 * El chat las llevaba puestas y NO HACEN NADA: `@tailwindcss/typography` no está
 * instalado, así que `prose`, `prose-sm` y `prose-invert` son nombres de clase
 * que no existen. (Siguen puestas, igual de inertes, en `EmailTemplatesPage` y
 * en `LeadEmailsCard`; ahí pintan HTML, no markdown, y no es cosa de esto.)
 *
 * No es un detalle estético. Con el reset de Tailwind por medio, el resultado
 * era:
 *
 *   - las tablas sin rejilla, con las columnas pegadas — «6» y «21,4 %» se
 *     leían como «621,4 %»,
 *   - las listas numeradas sin números, o sea párrafos sueltos,
 *   - las citas sin marca, indistinguibles del texto normal.
 *
 * Y una respuesta de IA sobre datos del CRM es casi siempre una tabla. Es el
 * caso principal, no el raro.
 *
 * QUE PASA CON `.markdown-body`
 *
 * En `index.css` hay un `.markdown-body` que sí existe y sí pinta markdown, y
 * es lo que usa el reporte mensual. No se toca: funciona. Esto vive aparte
 * porque hace dos cosas que aquel no puede —la tabla dentro de su propio
 * scroll, y respetar la alineación que manda GFM en vez de forzar
 * `text-align: left`— y porque un componente se puede pasar por props.
 *
 * Si algún día conviene unificarlos, se unifican. Hoy duplicar veinte líneas de
 * estilo cuesta menos que reestilar una pantalla de producción que nadie pidió
 * tocar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed space-y-3 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => <h3 className="text-base font-bold mt-4 first:mt-0">{c}</h3>,
          h2: ({ children: c }) => <h4 className="text-sm font-bold mt-4 first:mt-0">{c}</h4>,
          h3: ({ children: c }) => (
            <h5 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mt-4 first:mt-0">{c}</h5>
          ),
          p: ({ children: c }) => <p className="leading-relaxed">{c}</p>,
          strong: ({ children: c }) => <strong className="font-bold text-foreground">{c}</strong>,
          em: ({ children: c }) => <em className="italic">{c}</em>,

          // Los marcadores se ponen a mano: el reset de Tailwind los quita, y
          // una lista numerada sin numeros es una lista de parrafos.
          ul: ({ children: c }) => <ul className="list-disc pl-5 space-y-1 marker:text-muted-foreground">{c}</ul>,
          ol: ({ children: c }) => <ol className="list-decimal pl-5 space-y-1 marker:text-muted-foreground marker:font-semibold">{c}</ol>,
          li: ({ children: c }) => <li className="leading-relaxed pl-0.5">{c}</li>,

          // La tabla, dentro de su propio scroll: una de seis columnas en el
          // ancho de un chat no cabe, y sin esto empuja la pagina entera de
          // lado.
          table: ({ children: c }) => (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs border-collapse">{c}</table>
            </div>
          ),
          thead: ({ children: c }) => <thead className="bg-muted/60">{c}</thead>,
          // `style` se reenvia a proposito. GFM traduce el `|---:|` de la
          // cabecera a `text-align: right`, y al poner componentes propios se
          // perdia: los numeros quedaban pegados a la izquierda de columnas muy
          // anchas, que es justo lo que hace que una tabla parezca sin acabar.
          // La alineacion la decide quien escribe la tabla, no esto.
          th: ({ children: c, style }) => (
            <th style={style} className="border-b border-border px-2.5 py-1.5 text-left font-bold whitespace-nowrap">{c}</th>
          ),
          td: ({ children: c, style }) => (
            <td style={style} className="border-b border-border/60 px-2.5 py-1.5 align-top tabular-nums">{c}</td>
          ),
          tr: ({ children: c }) => <tr className="last:[&>td]:border-0">{c}</tr>,

          blockquote: ({ children: c }) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground italic">{c}</blockquote>
          ),

          code: ({ className, children: c }) => {
            // Sin `language-*` es codigo dentro de una linea; con el, un bloque.
            const enBloque = /language-/.test(className || '');
            if (enBloque) return <code className="block">{c}</code>;
            return (
              <code className="rounded bg-muted px-1 py-0.5 text-[12px] font-mono">{c}</code>
            );
          },
          pre: ({ children: c }) => (
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-[12px] font-mono">{c}</pre>
          ),

          a: ({ href, children: c }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              {c}
            </a>
          ),
          hr: () => <hr className="border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
