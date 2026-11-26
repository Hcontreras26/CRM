import { useCallback, useEffect, useRef, useState } from 'react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import usePermission from '@/shared/hooks/usePermission';
import {
  ChartLineUp, MagnifyingGlass, CheckCircle, WarningCircle, Copy, UploadSimple,
  FloppyDisk, PlugsConnected, Trash, ArrowSquareOut, Question, ArrowsClockwise,
} from '@phosphor-icons/react';
import { leerJsonCuenta, soloNumeros } from '../lib/cuentaServicioGoogle';

/**
 * GOOGLE ANALYTICS 4 Y SEARCH CONSOLE DEL CAMPUS (CRM#1099, Diego 25/11).
 *
 * Antes la credencial se pegaba a mano en «Configuración › Claves», añadiendo
 * `property_id` o `site_url` al JSON. Aquí se sube el JSON de la cuenta de
 * servicio (archivo o pegado), se elige la propiedad y se prueba contra Google.
 * Se guarda donde la leen los módulos de GA4 y Search Console.
 *
 * La clave privada no se vuelve a enseñar nunca: el servidor solo devuelve el
 * correo de la cuenta. Ver, quien ve Integraciones; cargar, probar y quitar,
 * `integrations.google` (admin y superadmin).
 */

export type ServicioGoogle = 'ga4' | 'gsc';

interface EstadoGoogle {
  servicio: ServicioGoogle;
  conectada: boolean;
  estado: 'conectado' | 'error' | 'sin_probar' | 'sin_conectar';
  client_email: string | null;
  property_id?: string | null;
  site_url?: string | null;
  puesta_por: string | null;
  actualizada_at: string | null;
  ultima_prueba: { at: string; ok: boolean; mensaje: string | null } | null;
  ultima_sincronizacion: { at: string | null; estado: string | null; error: string | null } | null;
  sincronizacion_activa: boolean;
  otra_cuenta: { servicio: ServicioGoogle; client_email: string } | null;
}

const SIN_CONECTAR = (servicio: ServicioGoogle): EstadoGoogle => ({
  servicio, conectada: false, estado: 'sin_conectar', client_email: null, puesta_por: null,
  actualizada_at: null, ultima_prueba: null, ultima_sincronizacion: null,
  sincronizacion_activa: false, otra_cuenta: null,
});

const TEXTOS = {
  ga4: {
    titulo: 'Google Analytics 4',
    subtitulo: 'Visitas por canal y por página de curso, para cruzarlas con los prospectos y las ventas.',
    otro: 'Search Console',
  },
  gsc: {
    titulo: 'Search Console',
    subtitulo: 'Búsquedas, clics, posición en Google e indexación de las páginas de formación.',
    otro: 'Google Analytics 4',
  },
} as const;

function fecha(d: string | null | undefined): string {
  if (!d) return 'Nunca';
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const mensajeDe = (e: unknown) => {
  const err = e as { data?: { error?: string }; message?: string };
  return err?.data?.error || err?.message || 'Error desconocido';
};

/** El texto del archivo elegido (con FileReader si el navegador no tiene `File.text`). */
function textoDeArchivo(f: File): Promise<string> {
  if (typeof f.text === 'function') return f.text();
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result || ''));
    lector.onerror = () => mal(lector.error);
    lector.readAsText(f);
  });
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast({ title: 'Correo copiado', description: texto });
  } catch {
    toast({ title: 'No se ha podido copiar', description: texto, variant: 'destructive' });
  }
}

function Estado({ data }: { data: EstadoGoogle }) {
  const base = 'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap';
  if (data.estado === 'conectado') return <span className={`${base} bg-success-soft text-success-soft-foreground`}><CheckCircle size={10} weight="fill" /> Conectado</span>;
  if (data.estado === 'error') return <span className={`${base} bg-destructive-soft text-destructive-soft-foreground`}><WarningCircle size={10} weight="fill" /> Error</span>;
  if (data.estado === 'sin_probar') return <span className={`${base} bg-info-soft text-info-soft-foreground`}>Guardado · sin probar</span>;
  return <span className={`${base} bg-muted text-muted-foreground`}>Sin conectar</span>;
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-0.5 hover:underline">
      {children} <ArrowSquareOut size={10} weight="bold" />
    </a>
  );
}

function Instrucciones({ servicio, correo }: { servicio: ServicioGoogle; correo: string | null }) {
  const elCorreo = correo
    ? <code className="px-1 rounded bg-card break-all">{correo}</code>
    : <>el correo de la cuenta (sale aquí al subir el JSON)</>;
  return (
    <ol className="list-decimal list-inside space-y-1.5 pl-1 text-muted-foreground">
      {servicio === 'ga4' ? (
        <li>En Google Cloud, elige o crea un proyecto y <strong>activa la «Google Analytics Data API»</strong>:{' '}
          <Enlace href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com">APIs y servicios › Biblioteca</Enlace>.</li>
      ) : (
        <li>En Google Cloud, en el mismo proyecto, <strong>activa la «Google Search Console API»</strong>:{' '}
          <Enlace href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com">APIs y servicios › Biblioteca</Enlace>.</li>
      )}
      <li><strong>Crea una cuenta de servicio</strong> (sin roles):{' '}
        <Enlace href="https://console.cloud.google.com/iam-admin/serviceaccounts">IAM y administración › Cuentas de servicio</Enlace> › Crear cuenta de servicio.
        {servicio === 'gsc' && <> Puede ser la misma que la de Google Analytics.</>}</li>
      <li>En esa cuenta: <strong>Claves › Agregar clave › Crear clave nueva › JSON</strong>. Se descarga un archivo .json: súbelo aquí o pega su contenido.</li>
      {servicio === 'ga4' ? (
        <>
          <li><strong>Dale acceso de Lector:</strong> en GA4, Administrar › Gestión de acceso a la propiedad › «+» › Añadir usuarios. Pega {elCorreo} con el rol <strong>«Lector»</strong>.</li>
          <li><strong>Copia el ID de propiedad:</strong> GA4 › Administrar › Detalles de la propiedad (arriba a la derecha). Son solo números; no es el «G-…» de la web.</li>
        </>
      ) : (
        <>
          <li><strong>Dale acceso:</strong> en Search Console, Configuración › Usuarios y permisos › Añadir usuario. Pega {elCorreo} con el permiso <strong>«Restringido»</strong> (basta para leer).</li>
          <li><strong>Elige la propiedad:</strong> «sc-domain:web.com» si es de dominio, o la dirección exacta con la barra final («https://web.com/») si es de prefijo de URL. Con la clave cargada, «Buscar mis propiedades» las lista.</li>
        </>
      )}
      <li><strong>Guarda</strong>: se prueba solo. Puedes repetir la prueba con «Probar».</li>
    </ol>
  );
}

export default function GoogleCredencialCard({ projectId, servicio }: { projectId: number; servicio: ServicioGoogle }) {
  const { can } = usePermission();
  const puedeConectar = can('integrations.google');
  const t = TEXTOS[servicio];
  const etiqueta = servicio === 'ga4' ? 'google-analytics' : 'search-console';

  const [data, setData] = useState<EstadoGoogle>(SIN_CONECTAR(servicio));
  const [cargando, setCargando] = useState(true);
  // El JSON subido y aún sin guardar. Solo se enseña el correo.
  const [pendiente, setPendiente] = useState<{ correo: string; texto: string } | null>(null);
  const [misma, setMisma] = useState(false);
  const [pegado, setPegado] = useState('');
  const [errorJson, setErrorJson] = useState<string | null>(null);
  const [propiedad, setPropiedad] = useState('');
  const [sitios, setSitios] = useState<Array<{ site_url: string; permiso: string | null }> | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [verPasos, setVerPasos] = useState<boolean | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const aplicar = useCallback((d: EstadoGoogle) => {
    setData(d);
    setPropiedad((servicio === 'ga4' ? d.property_id : d.site_url) || '');
  }, [servicio]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await client.get<EstadoGoogle>(`/integrations/google/${servicio}?projectId=${projectId}`);
      const d = res?.data;
      aplicar(d && typeof d === 'object' && !Array.isArray(d) && 'estado' in d ? d : SIN_CONECTAR(servicio));
    } catch { aplicar(SIN_CONECTAR(servicio)); } finally { setCargando(false); }
  }, [projectId, servicio, aplicar]);
  useEffect(() => {
    setPendiente(null); setMisma(false); setPegado(''); setErrorJson(null); setSitios(null); setResultado(null);
    cargar();
  }, [cargar]);

  function tomarJson(texto: string) {
    const r = leerJsonCuenta(texto);
    if (r.ok === true) {
      const bien = r as { correo: string; texto: string };
      setPendiente({ correo: bien.correo, texto: bien.texto });
      setMisma(false);
      setErrorJson(null);
      setPegado(''); // el texto con la clave no se queda en pantalla
      setSitios(null);
    } else {
      setPendiente(null);
      setErrorJson((r as { error: string }).error);
    }
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > 20000) { setErrorJson('El archivo es demasiado grande para ser la clave de una cuenta de servicio.'); return; }
    try {
      tomarJson(await textoDeArchivo(f));
    } catch {
      setErrorJson('No se ha podido leer el archivo.');
    } finally {
      try { input.value = ''; } catch { /* para poder volver a elegir el mismo */ }
    }
  }

  function alPegar(texto: string) {
    setPegado(texto);
    if (!texto.trim()) { setErrorJson(null); return; }
    // Mientras escribe a mano no se le riñe: se comprueba cuando ya parece un JSON entero.
    if (texto.trim().endsWith('}')) tomarJson(texto);
    else setErrorJson(null);
  }

  const correoVisible = pendiente?.correo
    || (misma ? data.otra_cuenta?.client_email : null)
    || data.client_email;
  const hayCuenta = !!pendiente || misma || data.conectada;
  const propiedadValida = servicio === 'ga4'
    ? /^\d+$/.test(propiedad)
    : /^sc-domain:[a-z0-9.-]+\.[a-z]{2,}$/i.test(propiedad.trim()) || /^https?:\/\/[^/\s]+/i.test(propiedad.trim());
  const cambiaAlgo = !!pendiente || misma
    || (propiedad.trim() !== ((servicio === 'ga4' ? data.property_id : data.site_url) || ''));

  async function probar(silencioso = false) {
    setProbando(true);
    try {
      const res = await client.post<{ ok: boolean; mensaje: string; estado: EstadoGoogle }>(
        `/integrations/google/${servicio}/probar`, { projectId });
      if (res.data) {
        setResultado({ ok: res.data.ok, mensaje: res.data.mensaje });
        if (res.data.estado) aplicar(res.data.estado);
        if (!silencioso) {
          toast(res.data.ok
            ? { title: `${t.titulo}: conectado`, description: res.data.mensaje }
            : { title: `${t.titulo}: no funciona`, description: res.data.mensaje, variant: 'destructive' });
        }
      }
    } catch (e) {
      setResultado({ ok: false, mensaje: mensajeDe(e) });
    } finally { setProbando(false); }
  }

  async function guardar() {
    setGuardando(true);
    try {
      const body: Record<string, unknown> = { projectId };
      if (pendiente) body.json = pendiente.texto;
      else if (misma) body.misma_cuenta = true;
      if (servicio === 'ga4') body.property_id = propiedad; else body.site_url = propiedad.trim();
      const res = await client.put<EstadoGoogle>(`/integrations/google/${servicio}`, body);
      if (res.data) aplicar(res.data);
      setPendiente(null); setMisma(false); setSitios(null); setResultado(null);
      toast({ title: `${t.titulo} guardado`, description: 'La clave va cifrada. Ahora se prueba con Google.' });
      await probar(true);
    } catch (e) {
      toast({ title: 'No se ha guardado', description: mensajeDe(e), variant: 'destructive' });
    } finally { setGuardando(false); }
  }

  async function quitar() {
    if (!confirm(`¿Quitar la conexión de ${t.titulo} de este campus? Lo ya traído se queda, pero dejarán de llegar datos nuevos.`)) return;
    try {
      const res = await client.delete<EstadoGoogle>(`/integrations/google/${servicio}?projectId=${projectId}`);
      aplicar(res?.data && 'estado' in res.data ? res.data : SIN_CONECTAR(servicio));
      setPendiente(null); setMisma(false); setResultado(null); setSitios(null);
      toast({ title: `${t.titulo} quitado` });
    } catch (e) {
      toast({ title: 'No se ha podido quitar', description: mensajeDe(e), variant: 'destructive' });
    }
  }

  async function buscarSitios() {
    setBuscando(true);
    try {
      const body: Record<string, unknown> = { projectId };
      if (pendiente) body.json = pendiente.texto;
      else if (misma) body.misma_cuenta = true;
      const res = await client.post<Array<{ site_url: string; permiso: string | null }>>('/integrations/google/gsc/sitios', body);
      const lista = Array.isArray(res.data) ? res.data : [];
      setSitios(lista);
      if (lista.length === 1 && !propiedad) setPropiedad(lista[0].site_url);
    } catch (e) {
      setSitios(null);
      toast({ title: 'No se han podido buscar las propiedades', description: mensajeDe(e), variant: 'destructive' });
    } finally { setBuscando(false); }
  }

  const ultimo = resultado || (data.ultima_prueba?.mensaje ? { ok: data.ultima_prueba.ok, mensaje: data.ultima_prueba.mensaje } : null);
  const pasosAbiertos = verPasos ?? !data.conectada;
  const Icono = servicio === 'ga4' ? ChartLineUp : MagnifyingGlass;

  return (
    <section aria-label={t.titulo} data-testid={`integracion-${etiqueta}`} className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-info-soft text-info-soft-foreground flex items-center justify-center flex-shrink-0">
          <Icono size={22} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base">{t.titulo}</h3>
          <p className="text-xs text-muted-foreground">{t.subtitulo}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Última sincronización: <strong>{fecha(data.ultima_sincronizacion?.at)}</strong>
            {data.ultima_sincronizacion?.estado === 'error' && data.ultima_sincronizacion.error && (
              <span className="text-destructive"> · falló: {data.ultima_sincronizacion.error}</span>
            )}
            {data.conectada && !data.sincronizacion_activa && (
              <span> · la sincronización automática está apagada en este servidor</span>
            )}
          </p>
        </div>
        <Estado data={data} />
      </div>

      <div className="p-5 space-y-4 text-sm">
        {/* La cuenta: su correo, con copiar (es lo que se pega en GA4 / Search Console). */}
        {correoVisible ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Cuenta de servicio:</span>
            <code className="px-1.5 py-0.5 rounded bg-muted break-all" data-testid="correo-cuenta">{correoVisible}</code>
            <button type="button" onClick={() => copiar(correoVisible)} aria-label="Copiar el correo de la cuenta"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-card font-semibold hover:bg-muted">
              <Copy size={12} weight="bold" /> Copiar
            </button>
            {pendiente && <span className="text-info">(subido, sin guardar)</span>}
          </div>
        ) : null}

        {data.conectada && (
          <div className="text-xs text-muted-foreground">
            {servicio === 'ga4' ? 'Propiedad' : 'Sitio'}: <strong className="text-foreground">{(servicio === 'ga4' ? data.property_id : data.site_url) || '—'}</strong>
            {data.puesta_por && <> · puesta por {data.puesta_por}</>}
            {data.actualizada_at && <> · {fecha(data.actualizada_at)}</>}
          </div>
        )}

        <div>
          <button type="button" onClick={() => setVerPasos(!pasosAbiertos)} aria-expanded={pasosAbiertos}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Question size={12} weight="bold" /> {pasosAbiertos ? 'Ocultar los pasos' : 'Cómo conectarlo, paso a paso'}
          </button>
          {pasosAbiertos && (
            <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
              <Instrucciones servicio={servicio} correo={correoVisible || null} />
            </div>
          )}
        </div>

        {puedeConectar ? (
          <>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground">
                JSON de la cuenta de servicio {data.conectada && <span className="font-normal">(ya guardado: sube otro solo para cambiarlo)</span>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={archivo} type="file" accept=".json,application/json" className="hidden"
                  aria-label="Archivo JSON de la cuenta de servicio" onChange={alElegirArchivo} />
                <button type="button" onClick={() => archivo.current?.click()}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted">
                  <UploadSimple size={14} weight="bold" /> Subir archivo .json
                </button>
                {!data.conectada && data.otra_cuenta && !pendiente && (
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={misma} onChange={(e) => { setMisma(e.target.checked); setSitios(null); }} />
                    Usar la misma cuenta que {t.otro} ({data.otra_cuenta.client_email})
                  </label>
                )}
              </div>
              <textarea value={pegado} onChange={(e) => alPegar(e.target.value)} rows={2} spellCheck={false}
                aria-label="Pegar el JSON de la cuenta de servicio"
                placeholder="…o pega aquí el contenido del archivo JSON"
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-xs font-mono" />
              {errorJson && <p role="alert" className="text-xs text-destructive">{errorJson}</p>}
            </div>

            {servicio === 'ga4' ? (
              <div>
                <label htmlFor={`propiedad-${projectId}`} className="text-[11px] font-semibold text-muted-foreground mb-1 block">ID de propiedad</label>
                <input id={`propiedad-${projectId}`} inputMode="numeric" value={propiedad}
                  onChange={(e) => setPropiedad(soloNumeros(e.target.value))} placeholder="123456789"
                  className="w-full sm:w-64 h-10 px-3 rounded-md border border-border bg-card text-sm font-mono" />
                <p className="text-[11px] text-muted-foreground mt-1">Solo números: GA4 › Administrar › Detalles de la propiedad.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor={`sitio-${projectId}`} className="text-[11px] font-semibold text-muted-foreground block">Propiedad de Search Console</label>
                <div className="flex flex-wrap gap-2">
                  <input id={`sitio-${projectId}`} value={propiedad} onChange={(e) => setPropiedad(e.target.value)}
                    placeholder="sc-domain:web.com o https://web.com/"
                    className="flex-1 min-w-[220px] h-10 px-3 rounded-md border border-border bg-card text-sm font-mono" />
                  <button type="button" onClick={buscarSitios} disabled={!hayCuenta || buscando}
                    title={hayCuenta ? 'Las propiedades que ve la cuenta' : 'Sube primero el JSON'}
                    className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50">
                    <ArrowsClockwise size={14} weight="bold" /> {buscando ? 'Buscando…' : 'Buscar mis propiedades'}
                  </button>
                </div>
                {sitios && sitios.length > 0 && (
                  <select aria-label="Propiedades que ve la cuenta" value={sitios.some((s) => s.site_url === propiedad) ? propiedad : ''}
                    onChange={(e) => e.target.value && setPropiedad(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm">
                    <option value="">Elige una propiedad…</option>
                    {sitios.map((s) => <option key={s.site_url} value={s.site_url}>{s.site_url}</option>)}
                  </select>
                )}
                {sitios && sitios.length === 0 && (
                  <p className="text-xs text-warning-soft-foreground">
                    La cuenta todavía no ve ninguna propiedad: dale acceso en Search Console (paso 4) y vuelve a buscar.
                  </p>
                )}
              </div>
            )}
          </>
        ) : !data.conectada ? (
          <p className="text-xs text-muted-foreground">Sin conectar. La conecta un administrador del campus.</p>
        ) : null}

        {ultimo && (
          <div role="status" className={`text-xs p-2 rounded-md ${ultimo.ok ? 'bg-success-soft text-success-soft-foreground' : 'bg-destructive-soft text-destructive-soft-foreground'}`}>
            <div className="flex items-center gap-1.5">
              {ultimo.ok ? <CheckCircle size={12} weight="fill" /> : <WarningCircle size={12} weight="fill" />}
              <strong>Última prueba:</strong> <span>{fecha(data.ultima_prueba?.at)}</span>
            </div>
            <p className="mt-0.5 ml-5 break-words">{ultimo.mensaje}</p>
          </div>
        )}

        {puedeConectar && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <button type="button" onClick={guardar} disabled={guardando || !hayCuenta || !propiedadValida || !cambiaAlgo}
              title={!hayCuenta ? 'Sube primero el JSON de la cuenta de servicio' : !propiedadValida ? 'Falta la propiedad' : undefined}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              <FloppyDisk size={14} weight="bold" /> {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => probar()} disabled={probando || !data.conectada}
              title={!data.conectada ? 'Guarda primero la cuenta' : 'Una llamada real a Google con la cuenta guardada'}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <PlugsConnected size={14} weight="bold" /> {probando ? 'Probando…' : 'Probar'}
            </button>
            {data.conectada && (
              <button type="button" onClick={quitar}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-destructive/30 bg-card text-sm font-semibold text-destructive hover:bg-destructive-soft ml-auto">
                <Trash size={14} weight="bold" /> Quitar
              </button>
            )}
          </div>
        )}
      </div>
      {cargando && <div className="px-5 py-3 text-xs text-muted-foreground border-t border-border">Cargando…</div>}
    </section>
  );
}
