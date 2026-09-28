import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, WarningCircle, ImageSquare, EnvelopeSimple, Plus, X } from '@phosphor-icons/react';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { toast } from '@/shared/hooks/useToast';
import { whatsappApi, type PlantillaWhatsapp } from '@/modules/whatsapp/api/whatsapp.api';
import { rellenar, huecosSinRellenar, type DatosParaRellenar } from '@/modules/whatsapp/lib/plantilla';
import { emailTemplatesApi, type EmailTemplate } from '@/modules/email-templates/api/templates.api';

/**
 * El mensaje de ESTE paso, ya escrito, donde se trabaja (#88 · #89 · #90).
 *
 * Las plantillas del documento llevaban meses cargadas y el motor que las
 * rellena también, pero solo se llegaba a ellas desde el chat de WhatsApp: en
 * la cola del día y en la ficha no había ninguna. La gestora sabía que a esta
 * persona le tocaba el paso 2 y aun así tenía que ir a buscar el texto a otra
 * pantalla, o escribirlo de memoria.
 *
 * Lo que las ata al paso es `paso_clave` (migración 172), no el nombre: el
 * nombre lo lee una persona, la clave la entiende el CRM.
 *
 * SE COPIA, NO SE MANDA. El documento comercial es explícito —«Natural antes
 * que literal. La plantilla marca el orden; las palabras las pones tú»—, así
 * que aquí solo hay un botón de copiar. Si el CRM lo enviara solo, todos los
 * mensajes saldrían iguales y dejarían de funcionar.
 *
 * LAS PROPIAS TAMBIÉN. Diego, 24/09: «también poder usar las plantillas
 * personalizadas». Cada una tiene la suya para según qué persona, y hasta ahora
 * solo existían en el chat: al crear una no se guardaba de qué paso era, así
 * que nacía suelta y no aparecía nunca aquí, que es donde se trabaja. Ahora se
 * ven las de este paso mezcladas con las de la casa, las sueltas se pueden
 * desplegar aparte, y se puede escribir una nueva sin salir de la ficha.
 *
 * SE GUARDA CON LOS HUECOS SIN RELLENAR. Guardar «Hola Marta» convierte la
 * plantilla en un mensaje para Marta y mañana no sirve para nadie. Por eso el
 * cuadro de escribir parte del texto CRUDO, con sus {huecos}, y no del que se
 * ve ya relleno encima.
 */
export default function PlantillaDelPaso({
  projectId,
  issuerId = null,
  pasoClave,
  datos,
  nombreProyecto,
  alCopiar,
  alCorreo,
  compacto = false,
}: {
  projectId: number | null;
  issuerId?: number | null;
  /** La clave del paso, no su nombre: el nombre se puede editar. */
  pasoClave: string;
  datos: DatosParaRellenar;
  nombreProyecto?: string | null;
  /** Se avisa al copiar, para que quien llame lo deje apuntado en su ficha. */
  alCopiar?: (plantilla: PlantillaWhatsapp, texto: string) => void;
  /**
   * Abrir el correo de este paso, ya elegido.
   *
   * Solo donde se puede escribir uno —la ficha—. Sin esto no se ofrece: en la
   * cola no hay ventana de correo y un boton que no lleva a ninguna parte es
   * peor que no tenerlo.
   */
  alCorreo?: (plantilla: EmailTemplate) => void;
  /** En la ficha hay menos sitio que en la cola. */
  compacto?: boolean;
}) {
  const [todas, setTodas] = useState<PlantillaWhatsapp[] | null>(null);
  // Las propias que no son de ningun paso: se enseñan plegadas, porque son de
  // quien las escribio y no tienen por que valer para este momento.
  const [verMias, setVerMias] = useState(false);
  // El cuadro de escribir una nueva. `null` = cerrado.
  const [nueva, setNueva] = useState<{ label: string; body: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Cuál se acaba de copiar, para cambiarle el botón un momento. Sin esa
  // respuesta no se sabe si el clic ha hecho algo, y se copia dos veces.
  const [copiada, setCopiada] = useState<number | null>(null);

  // Sube uno al crear una plantilla: es la forma de volver a pedir la lista sin
  // duplicar la peticion ni inventarse la fila a mano.
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setTodas(null);
    whatsappApi.plantillas(projectId, issuerId)
      .then((r) => { if (vivo) setTodas(r?.success ? (r.data || []) : []); })
      // Si el CRM no lleva WhatsApp instalado, este endpoint no existe. No es
      // un error que haya que enseñar: sencillamente no hay plantillas.
      .catch(() => { if (vivo) setTodas([]); });
    return () => { vivo = false; };
  }, [projectId, issuerId, recarga]);

  useEffect(() => { setCopiada(null); }, [pasoClave, datos.nombre]);

  /**
   * El correo de este paso, si lo tiene.
   *
   * El proceso no es solo WhatsApp: el dia 1 manda el dossier por correo, y
   * los dias 3 y 4 llevan el suyo. Solo se pide donde se puede escribir uno.
   */
  const [correos, setCorreos] = useState<EmailTemplate[]>([]);
  // Del `alCorreo` solo interesa SI lo hay, no cual es: si se pusiera la
  // funcion en las dependencias, una flecha escrita en el JSX de quien llama
  // seria distinta en cada pintada y esto pediria los correos sin parar.
  const hayDondeEscribir = Boolean(alCorreo);
  useEffect(() => {
    if (!hayDondeEscribir || !projectId) { setCorreos([]); return; }
    let vivo = true;
    emailTemplatesApi.list(projectId, false)
      .then((r) => { if (vivo) setCorreos(r?.success ? (r.data || []) : []); })
      .catch(() => { if (vivo) setCorreos([]); });
    return () => { vivo = false; };
  }, [projectId, hayDondeEscribir]);

  const correoDelPaso = useMemo(
    () => correos.find((t) => t.paso_clave === pasoClave) || null,
    [correos, pasoClave],
  );

  const suyas = useMemo(
    () => (todas || [])
      .filter((p) => p.paso_clave === pasoClave)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.id - b.id),
    [todas, pasoClave],
  );

  /**
   * Mias y sin paso. Las que SI son de este paso ya salen arriba, con las de la
   * casa: separarlas ahi obligaria a mirar en dos sitios el mismo momento.
   */
  const miasSueltas = useMemo(
    () => (todas || [])
      .filter((p) => p.ambito === 'personal' && !p.paso_clave)
      .sort((a, b) => a.label.localeCompare(b.label)),
    [todas],
  );

  async function guardarLaNueva() {
    if (!nueva || !projectId) return;
    const label = nueva.label.trim();
    const body = nueva.body.trim();
    if (!label || !body) {
      toast({ title: 'Ponle un nombre y un texto', variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      const r = await whatsappApi.crearPlantilla({
        projectId, label, body, ambito: 'personal',
        // SIN usuarioId: la propia es de quien la escribe. Aqui se mandaba el
        // id de la EMPRESA como si fuera una persona: sin empresa llegaba vacio
        // y rompia («Number must be greater than 0»); con CEDIA puesta se habria
        // guardado a nombre de quien tuviera ese mismo numero. Diego, 28/09.
        // Atada a ESTE paso: es lo que hace que mañana salga sola aqui.
        paso_clave: pasoClave,
      });
      if (!r?.success) throw new Error(r?.error || 'no se pudo guardar');
      setNueva(null);
      setRecarga((n) => n + 1);
      toast({ title: 'Guardada', description: 'Es tuya y sale en este paso.' });
    } catch (e) {
      toast({ title: 'No se ha podido guardar',
              description: (e as Error)?.message || '', variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function copiar(p: PlantillaWhatsapp) {
    const texto = rellenar(p.body, datos, nombreProyecto);
    const ok = await copyToClipboard(texto);
    if (!ok) {
      toast({
        title: 'No se ha podido copiar',
        description: 'Selecciona el texto y cópialo a mano.',
        variant: 'destructive',
      });
      return;
    }
    setCopiada(p.id);
    setTimeout(() => setCopiada((x) => (x === p.id ? null : x)), 2000);
    toast({ title: 'Copiado', description: 'Pégalo y ajústalo antes de mandarlo.' });
    alCopiar?.(p, texto);
  }

  if (todas === null) return null;

  // El correo del paso va debajo de los mensajes, y tambien cuando no hay
  // ninguno: hay pasos que son solo correo.
  const elCorreo = correoDelPaso && alCorreo ? (
    <button
      type="button"
      onClick={() => alCorreo(correoDelPaso)}
      className="flex w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-[11px] font-semibold hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
    >
      <EnvelopeSimple size={13} weight="bold" className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">Escribir el correo: {correoDelPaso.name}</span>
    </button>
  ) : null;

  /**
   * El pie: las mias sueltas y el cuadro de escribir una nueva.
   *
   * Va en los dos caminos --haya plantillas de este paso o no--, porque el paso
   * que no tiene ninguna es justo donde mas falta hace poder escribirla.
   */
  const pie = (
    <div className="space-y-1.5 pt-0.5">
      {miasSueltas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerMias((v) => !v)}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {verMias ? 'Ocultar' : 'Ver'} mis plantillas sueltas ({miasSueltas.length})
          </button>
          {verMias && (
            <div className="mt-1 space-y-1">
              {miasSueltas.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-2 rounded-md border border-dashed border-border px-2 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold">{m.label}</p>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">
                      {rellenar(m.body, datos, nombreProyecto)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiar(m)}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    {copiada === m.id
                      ? <><Check size={12} weight="bold" className="text-success" /> Copiado</>
                      : <><Copy size={12} weight="bold" /> Copiar</>}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {nueva === null ? (
        <button
          type="button"
          onClick={() => setNueva({
            label: '',
            // El texto CRUDO de la primera de este paso, con sus {huecos}: es
            // el punto de partida honrado. Si se copiara el de arriba, ya
            // relleno, la plantilla nacería escrita para esta persona.
            body: suyas[0]?.body || '',
          })}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          <Plus size={11} weight="bold" /> Escribir una plantilla mía para este paso
        </button>
      ) : (
        <div className="space-y-1.5 rounded-md border border-border bg-card p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold">Tuya, y solo para este paso</p>
            <button type="button" onClick={() => setNueva(null)} aria-label="Cerrar"
              className="text-muted-foreground hover:text-foreground">
              <X size={13} weight="bold" />
            </button>
          </div>
          <input
            value={nueva.label}
            onChange={(e) => setNueva({ ...nueva, label: e.target.value })}
            placeholder="Cómo la llamas: «Día 4 · mi versión»"
            className="w-full rounded border border-border bg-background px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <textarea
            value={nueva.body}
            onChange={(e) => setNueva({ ...nueva, body: e.target.value })}
            rows={5}
            placeholder="El texto, con sus huecos: {nombre}, {producto}..."
            className="w-full rounded border border-border bg-background px-2 py-1 text-[12px] leading-snug focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <p className="text-[10px] leading-snug text-muted-foreground">
            Déjale los huecos entre llaves. El CRM los rellena con los datos de cada
            persona; si los escribes ya rellenos, mañana no sirve para nadie más.
          </p>
          <button
            type="button"
            disabled={guardando}
            onClick={guardarLaNueva}
            className="w-full rounded-md bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );

  // Un paso sin plantilla no pinta una caja vacía: dice dónde se crea y ya.
  if (suyas.length === 0) {
    return (
      <div className="space-y-2">
        {elCorreo}
        {!compacto && (
          <p className="text-secundario text-muted-foreground">
            Este paso no tiene mensaje de la casa.{' '}
            <Link to="/whatsapp/plantillas" className="text-primary hover:underline">
              Verlas todas
            </Link>
          </p>
        )}
        {pie}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {suyas.map((p, i) => {
        const texto = rellenar(p.body, datos, nombreProyecto);
        const huecos = huecosSinRellenar(p.body, datos, nombreProyecto);
        return (
          <div key={p.id} className="rounded-md border border-border bg-muted/30">
            <div className="flex items-start justify-between gap-2 border-b border-border/60 px-2.5 py-1.5">
              <p className="min-w-0 truncate text-[11px] font-semibold">
                {/* Los días 2 y 3 son TRES mensajes seguidos, no uno largo, y
                    el orden es parte de la instrucción. */}
                {suyas.length > 1 && (
                  <span className="mr-1 tabular-nums text-muted-foreground">{i + 1} de {suyas.length}</span>
                )}
                {p.label}
              </p>
              <button
                type="button"
                onClick={() => copiar(p)}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                {copiada === p.id
                  ? <><Check size={12} weight="bold" className="text-success" /> Copiado</>
                  : <><Copy size={12} weight="bold" /> Copiar</>}
              </button>
            </div>

            <p className="whitespace-pre-wrap px-2.5 py-2 text-[12px] leading-snug">{texto}</p>

            {/* La letra pequeña del documento: se lee mientras se elige y NO se
                manda. Antes solo estaba en el PDF, que nadie tiene abierto. */}
            {(p.pista || p.pide_adjunto) && (
              <p className="flex items-start gap-1 px-2.5 pb-1.5 text-[11px] text-muted-foreground">
                {p.pide_adjunto && <ImageSquare size={11} weight="bold" className="mt-0.5 shrink-0" />}
                {p.pista}
              </p>
            )}

            {/* Con icono además del color: un texto ámbar a secas no lo
                distingue quien no ve bien el color. */}
            {huecos.length > 0 && (
              <p className="flex items-start gap-1 px-2.5 pb-2 text-[11px] font-medium text-warning-soft-foreground">
                <WarningCircle size={12} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>Falta {huecos.map((h) => `{${h}}`).join(', ')} — complétalo antes de mandarlo</span>
              </p>
            )}
          </div>
        );
      })}
      {elCorreo}
      {pie}
    </div>
  );
}
