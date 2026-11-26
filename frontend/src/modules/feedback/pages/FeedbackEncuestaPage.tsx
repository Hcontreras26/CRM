import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

/**
 * La encuesta de «¿por qué has desistido?» (#169), la que se abre desde el
 * correo.
 *
 * SIN CONTRASEÑA y fuera del CRM: la contesta alguien que no compró, y pedirle
 * que entre en algún sitio es garantizar que no conteste nadie. El enlace lleva
 * un token largo y aleatorio que solo sirve para contestar ESTA encuesta.
 *
 * Con la MARCA de su campus —logo y color—: preguntó en esa web y es lo que
 * reconoce. Nada de la estética del CRM.
 *
 * LAS PREGUNTAS LAS MANDA EL SERVIDOR (`modules/feedback/preguntas.js`), con el
 * nombre de su formación y de su asesor ya puestos. Todas van en DESPLEGABLE
 * (Diego, 28/09): una opción, varias o la nota de 1 a 5. Las opciones marcadas
 * como `escribir` («Otro motivo», «Otra cosa», o una nota de Regular para abajo)
 * abren un recuadro para escribir, y la de tipo `texto` («Deja tus comentarios»,
 * al final) es solo el recuadro. Cambiar o añadir preguntas no toca esta pantalla.
 *
 * `?vista=1` es la copia que recibe la gestora cuando pide «quiero verlo»: se
 * ve igual, pero no guarda nada. Si contestara ella, la respuesta sería de la
 * persona equivocada.
 */

const API_BASE = (import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '') + '/api';

type Opcion = { clave: string; texto: string };
type Pregunta = {
  clave: string; tipo: 'unica' | 'varias' | 'escala' | 'texto';
  texto: string; ayuda?: string; destacado?: string; obligatoria?: boolean;
  opciones: Opcion[];
  /** La opción (o las opciones) que abren el recuadro; su rótulo y lo que se ve dentro. */
  escribir?: string | string[]; escribirTexto?: string; pista?: string;
  /** La que sale después si contesta `cuando` («Sí» → «¿Cuándo te viene bien?»). */
  sub?: { cuando: string; clave: string; texto: string; opciones: Opcion[] };
};
type Encuesta = {
  marca: string | null; logo_url: string | null; color: string | null;
  /** Sobre qué va su logo («Configurar esta marca»); vacío = blanco. */
  fondo?: string | null;
  nombre: string; programa: string | null; preguntas: Pregunta[]; respondida: boolean;
};
type Respuestas = Record<string, string | number | string[]>;

const esHex = (v?: string | null): v is string => /^#[0-9a-f]{6}$/i.test(v || '');

/** Texto blanco u oscuro, el que más se lea sobre ese fondo (el mismo cálculo que el correo). */
function tintaSobre(fondo: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(fondo.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luz + 0.05) >= (luz + 0.05) / (0.0178 + 0.05) ? '#ffffff' : '#1d2530';
}

export default function FeedbackEncuestaPage() {
  const { token } = useParams();
  const [query] = useSearchParams();
  const vista = query.get('vista') === '1';
  const [datos, setDatos] = useState<Encuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<Respuestas>({});
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  // Pulsó «Enviar» sin la obligatoria: se marca la que falta (#1154).
  const [intentoSinObligatoria, setIntentoSinObligatoria] = useState(false);
  // Al terminar, el foco va al «¡Gracias!»: el botón que tenía desaparece y,
  // sin esto, el lector de pantalla se quedaba callado en ninguna parte.
  const final = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (hecho || datos?.respondida) final.current?.focus(); }, [hecho, datos?.respondida]);

  useEffect(() => {
    fetch(`${API_BASE}/f/${token}`)
      .then((r) => r.json().catch(() => ({
        success: false,
        error: r.status === 429
          ? 'Has hecho demasiados intentos seguidos. Espera un minuto y vuelve a abrir el enlace.'
          : 'No hemos podido cargar la encuesta. Vuelve a intentarlo en un rato.',
      })))
      .then((r) => { if (r?.success) setDatos(r.data); else setError(r?.error || 'Este enlace no es válido.'); })
      .catch(() => setError('No hemos podido cargar la encuesta. Vuelve a intentarlo en un rato.'));
  }, [token]);

  // El color de la marca (botón, filete, marcas) y el fondo de su logo.
  const color = esHex(datos?.color) ? datos!.color! : '#1f4e79';
  const fondo = esHex(datos?.fondo) ? datos!.fondo! : '#ffffff';
  const tintaBoton = tintaSobre(color);
  // Un color claro (el rosa de Psiko) no se lee como texto sobre blanco.
  const colorTexto = tintaBoton === '#ffffff' ? color : '#1d2530';
  const faltaObligatoria = (datos?.preguntas || []).some((p) => p.obligatoria && !resp[p.clave]);
  const poner = (clave: string, valor: string | number | string[]) => setResp((r) => ({ ...r, [clave]: valor }));
  const quitar = (clave: string) => setResp((r) => {
    const resto = { ...r };
    delete resto[clave];
    return resto;
  });
  const alternar = (clave: string, opcion: string) => setResp((r) => {
    const antes = Array.isArray(r[clave]) ? (r[clave] as string[]) : [];
    return { ...r, [clave]: antes.includes(opcion) ? antes.filter((x) => x !== opcion) : [...antes, opcion] };
  });
  // La nota se guarda como número y la opción es «2»: se comparan como texto.
  const eligioOtro = (p: Pregunta) => Boolean(p.escribir)
    && [resp[p.clave] ?? []].flat().some((v) => [p.escribir!].flat().includes(String(v)));
  const recuadro = 'w-full rounded-lg border border-[#d8dee6] px-3 py-2 text-base focus:outline-none focus:ring-2';

  async function enviar() {
    if (vista) return;
    if (faltaObligatoria) {
      // Con el teclado: a la primera obligatoria sin contestar.
      setIntentoSinObligatoria(true);
      const falta = datos?.preguntas.find((p) => p.obligatoria && !resp[p.clave]);
      if (falta) document.getElementById(`p-${falta.clave}`)?.focus();
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      // Quien contesta es un cliente, no alguien del equipo: si la red falla o
      // el servidor no devuelve JSON (el límite de intentos), un mensaje que se
      // entienda y no «Failed to fetch» o «… is not valid JSON» (#593).
      const r = await fetch(`${API_BASE}/f/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: resp }),
      }).then((x) => x.json().catch(() => ({
        success: false,
        error: x.status === 429
          ? 'Has hecho demasiados intentos seguidos. Espera un minuto y vuelve a enviarla.'
          : 'No hemos podido guardar tu respuesta. Vuelve a intentarlo en un rato.',
      }))).catch(() => ({ success: false, error: 'No hay conexión. Comprueba tu internet y vuelve a enviarla.' }));
      if (!r?.success) throw new Error(r?.error || 'No hemos podido guardar tu respuesta. Vuelve a intentarlo en un rato.');
      // Ya estaba contestada (otra pestaña, o el enlace reenviado): no se ha
      // guardado nada nuevo, y se le dice así.
      if (r.data?.ya) setDatos((d) => (d ? { ...d, respondida: true } : d));
      else setHecho(true);
      window.scrollTo(0, 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // El desplegable: nativo (en el móvil abre el selector del sistema), con la
  // flecha dibujada para que se vea igual en todos.
  const desplegable = 'block w-full cursor-pointer appearance-none rounded-lg border bg-white py-3 pl-4 pr-10 text-left text-base focus:outline-none focus:ring-2';
  const borde = (elegido: boolean) => ({ borderColor: elegido ? color : '#d8dee6' });
  const flecha = (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#5b6572]">
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f8] px-4 py-10 text-[#1d2530]">
      <main className="mx-auto max-w-lg overflow-hidden rounded-xl bg-white shadow-sm">
        {/* La cabecera de la marca: su logo sobre SU fondo (el de la mayoría es
            para fondo claro; el de ACADEMIA IA o ISAEG es blanco y va sobre
            oscuro) y un filete de su color. Sin logo, el nombre. */}
        <header className="flex min-h-[76px] items-center px-6 py-4 sm:px-8"
          style={{ background: fondo, borderBottom: `4px solid ${color}`, color: tintaSobre(fondo) }}>
          {datos?.logo_url
            ? <img src={datos.logo_url} alt={datos.marca || ''} className="max-h-12 max-w-[220px]" />
            : datos?.marca && <span className="text-lg font-bold">{datos.marca}</span>}
        </header>
        <div className="p-6 sm:p-8">
          {vista && (
            <p className="mb-5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              Vista previa: así la verá la persona. Lo que marques aquí no se guarda.
            </p>
          )}
          {error && !datos && <p className="text-base">{error}</p>}
          {!datos && !error && <p className="text-sm text-[#5b6572]">Cargando…</p>}

          {/* UN ENLACE, UNA RESPUESTA (Diego, 28/09): el enlace es único de esa
              persona y solo vale para contestar una vez —el servidor guarda la
              primera y no deja pisarla—. Si vuelve a entrar, se le dice que ya
              participó, en vez de enseñarle un formulario que no guardaría. */}
          {datos && hecho && (
            <div>
              <h1 ref={final} tabIndex={-1} className="text-xl font-bold focus:outline-none">¡Gracias{datos.nombre ? `, ${datos.nombre}` : ''}!</h1>
              <p className="mt-2 text-base leading-relaxed text-[#3b4450]">Nos lo apuntamos: nos ayuda de verdad a mejorar.</p>
            </div>
          )}
          {datos && datos.respondida && !hecho && (
            <div>
              <h1 ref={final} tabIndex={-1} className="text-xl font-bold focus:outline-none">Ya has participado{datos.nombre ? `, ${datos.nombre}` : ''}</h1>
              <p className="mt-2 text-base leading-relaxed text-[#3b4450]">
                Esta encuesta ya está contestada y solo se puede responder una vez. ¡Gracias por tu tiempo!
              </p>
            </div>
          )}

          {datos && !datos.respondida && !hecho && (
            <div>
              <h1 className="text-xl font-bold leading-snug">
                {datos.nombre ? `${datos.nombre}, ¿nos` : '¿Nos'} ayudas con unas preguntas?
              </h1>
              <p className="mt-2 text-base leading-relaxed text-[#3b4450]">
                {datos.programa
                  ? <>Nos pediste información sobre <strong>{datos.programa}</strong> y no seguiste adelante. Es un minuto, y solo la primera es obligatoria.</>
                  : 'Es un minuto, y solo la primera es obligatoria.'}
              </p>

              <div className="mt-6 space-y-6">
                {datos.preguntas.map((p, i) => {
                  const id = `p-${p.clave}`;
                  const elegidas = Array.isArray(resp[p.clave]) ? (resp[p.clave] as string[]) : [];
                  // Lo que se lee debajo de la pregunta, enlazado al campo para
                  // que el lector de pantalla lo diga al llegar (#1154).
                  const ayudas = [p.destacado && `${id}-destacado`, p.ayuda && `${id}-ayuda`].filter(Boolean).join(' ') || undefined;
                  // «Varias» son casillas: van en un grupo con su leyenda. Una
                  // <label> apuntando al <summary> no nombraba nada (#1154).
                  const Bloque = p.tipo === 'varias' ? 'fieldset' : 'div';
                  const Titulo = p.tipo === 'varias' ? 'legend' : 'label';
                  return (
                    <Bloque key={p.clave} className="min-w-0" aria-describedby={p.tipo === 'varias' ? ayudas : undefined}>
                      <Titulo {...(p.tipo === 'varias' ? {} : { htmlFor: id })} className="block text-base font-semibold leading-snug">
                        {/* «Deja tus comentarios» cierra la encuesta: sin número. */}
                        {p.tipo !== 'texto' && <span className="mr-1 text-[#8a939e]">{i + 1}.</span>} {p.texto}
                        {/* El asterisco se ve; lo que se OYE es «obligatoria»
                            (un aria-label en un <span> no lo leía nadie). */}
                        {p.obligatoria && <><span className="ml-1" style={{ color: colorTexto }} aria-hidden="true">*</span><span className="sr-only"> (obligatoria)</span></>}
                      </Titulo>
                      {p.destacado && <p id={`${id}-destacado`} className="mt-1 text-sm font-semibold" style={{ color: colorTexto }}>{p.destacado}</p>}
                      {p.ayuda && <p id={`${id}-ayuda`} className="mt-0.5 text-sm text-[#5b6572]">{p.ayuda}</p>}

                      {(p.tipo === 'unica' || p.tipo === 'escala') && (
                        <div className="relative mt-2">
                          <select id={id} aria-describedby={ayudas} aria-required={p.obligatoria || undefined}
                            aria-invalid={(intentoSinObligatoria && p.obligatoria && !resp[p.clave]) || undefined}
                            value={resp[p.clave] === undefined ? '' : String(resp[p.clave])}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) quitar(p.clave);
                              else poner(p.clave, p.tipo === 'escala' ? Number(v) : v);
                            }}
                            className={desplegable} style={borde(resp[p.clave] !== undefined)}>
                            <option value="">Elige una opción</option>
                            {p.opciones.map((o) => (
                              <option key={o.clave} value={o.clave}>{p.tipo === 'escala' ? `${o.clave} · ${o.texto}` : o.texto}</option>
                            ))}
                          </select>
                          {flecha}
                        </div>
                      )}

                      {/* Varias: un desplegable que al abrirse deja marcar las que quiera. */}
                      {p.tipo === 'varias' && (
                        <details className="mt-2">
                          <summary id={id} aria-describedby={ayudas} className={`relative ${desplegable} list-none [&::-webkit-details-marker]:hidden`} style={borde(elegidas.length > 0)}>
                            <span className={elegidas.length ? '' : 'text-[#5b6572]'}>
                              {elegidas.length
                                ? p.opciones.filter((o) => elegidas.includes(o.clave)).map((o) => o.texto).join(', ')
                                : 'Elige una o varias'}
                            </span>
                            {flecha}
                          </summary>
                          <div className="mt-1 space-y-0.5 rounded-lg border border-[#d8dee6] bg-white p-2 shadow-sm">
                            {p.opciones.map((o) => (
                              <label key={o.clave} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-base hover:bg-[#f4f6f8]">
                                <input type="checkbox" checked={elegidas.includes(o.clave)} onChange={() => alternar(p.clave, o.clave)}
                                  className="h-4 w-4" style={{ accentColor: color }} />
                                {o.texto}
                              </label>
                            ))}
                          </div>
                        </details>
                      )}

                      {p.sub && resp[p.clave] === p.sub.cuando && (
                        <div className="mt-3">
                          <label htmlFor={`p-${p.sub.clave}`} className="block text-sm font-semibold">{p.sub.texto}</label>
                          <div className="relative mt-1.5">
                            <select id={`p-${p.sub.clave}`} value={(resp[p.sub.clave] as string) || ''}
                              onChange={(e) => (e.target.value ? poner(p.sub!.clave, e.target.value) : quitar(p.sub!.clave))}
                              className={desplegable} style={borde(Boolean(resp[p.sub.clave]))}>
                              <option value="">Elige cuándo</option>
                              {p.sub.opciones.map((o) => <option key={o.clave} value={o.clave}>{o.texto}</option>)}
                            </select>
                            {flecha}
                          </div>
                        </div>
                      )}

                      {p.tipo === 'texto' && (
                        <textarea id={id} aria-describedby={ayudas} value={(resp[p.clave] as string) || ''}
                          onChange={(e) => (e.target.value ? poner(p.clave, e.target.value) : quitar(p.clave))}
                          maxLength={2000} rows={4} placeholder={p.pista || ''} className={`mt-2 ${recuadro}`} />
                      )}

                      {eligioOtro(p) && (
                        <div className="mt-3">
                          {p.escribirTexto && (
                            <label htmlFor={`${id}-otro`} className="block text-sm font-semibold">{p.escribirTexto}</label>
                          )}
                          <textarea id={`${id}-otro`} value={(resp[`${p.clave}_otro`] as string) || ''} onChange={(e) => poner(`${p.clave}_otro`, e.target.value)}
                            maxLength={1000} rows={p.escribirTexto ? 3 : 2} placeholder={p.pista || 'Cuéntanos cuál'}
                            aria-label={p.escribirTexto ? undefined : `${p.texto}: escríbelo`}
                            className={`${p.escribirTexto ? 'mt-1.5' : ''} ${recuadro}`} />
                        </div>
                      )}
                    </Bloque>
                  );
                })}
              </div>

              {/* Anunciado al aparecer: si no, quien usa lector de pantalla
                  pulsaba «Enviar» y no se enteraba de que había fallado (#1154). */}
              <p role="alert" className="mt-4 text-sm text-destructive empty:hidden">{error || ''}</p>

              {/* Sin `disabled` mientras falta la obligatoria: un botón
                  desactivado se salta con el tabulador, y con el teclado no
                  había forma de saber por qué no se podía enviar. Ahora se
                  puede pulsar: lleva a la pregunta que falta y lo dice (#1154). */}
              <button type="button" onClick={enviar} disabled={enviando || vista}
                aria-disabled={faltaObligatoria || undefined}
                aria-describedby={faltaObligatoria && !vista ? 'falta-obligatoria' : undefined}
                className="mt-7 w-full rounded-lg px-5 py-3 text-base font-bold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
                style={{ background: color, color: tintaBoton, outlineColor: colorTexto }}>
                {vista ? 'Vista previa: no se envía' : (enviando ? 'Enviando…' : 'Enviar')}
              </button>
              {faltaObligatoria && !vista && (
                <p id="falta-obligatoria" className={`mt-2 text-center text-sm ${intentoSinObligatoria ? 'font-semibold text-destructive' : 'text-[#5b6572]'}`}>
                  Contesta al menos la primera para poder enviarla.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
