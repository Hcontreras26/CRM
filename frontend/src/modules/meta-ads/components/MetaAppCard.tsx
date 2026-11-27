import { useCallback, useEffect, useState } from 'react';
import {
  AppWindow, CheckCircle, WarningCircle, FloppyDisk, PlugsConnected, Trash, ArrowSquareOut,
  Question, ArrowsClockwise, Eye, EyeSlash,
} from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog';

/**
 * LA APP DE META, DE TODO EL CRM (CRM#1209).
 *
 * Antes el ID y el secreto de la app, el interruptor de la renovación de los
 * tokens y sus días estaban en el `.env` del servidor. Aquí se ponen, se
 * prueban contra Meta y se quitan. El secreto va cifrado y no se vuelve a
 * enseñar (solo sus cuatro últimos caracteres). Mientras convivan, el `.env`
 * vale de reserva y la tarjeta dice de dónde sale cada valor.
 *
 * La pinta Meta Ads (pestaña Configuración) solo a quien tiene `meta_ads.app`;
 * el servidor pide además `meta_ads.edit`.
 */

type Origen = 'pantalla' | 'servidor' | 'defecto';
interface Ajuste<T> { valor: T; origen: Origen; por_defecto: T; variable: string }
type ClaveNumero = 'renovar_dias' | 'aviso_dias' | 'gasto_total_cada_horas';

interface TokenCampus {
  tipo: 'meta_ads' | 'instagram';
  cuenta_id: number;
  project_nombre: string | null;
  nombre: string | null;
  expires_at: string | null;
  sin_caducidad: boolean;
  renovado_at: string | null;
  revisado_at: string | null;
  estado: 'ok' | 'sin_caducidad' | 'error' | 'sin_revisar';
  error: string | null;
  caducado: boolean;
  caduca_pronto: boolean;
}

export interface EstadoAppMeta {
  falta_migracion: boolean;
  app: {
    configurada: boolean;
    origen: 'pantalla' | 'servidor' | null;
    guardada: boolean;
    app_id: string | null;
    secreto_cola: string | null;
    puesta_por: string | null;
    actualizada_at: string | null;
    ultima_prueba: { at: string; ok: boolean; mensaje: string | null } | null;
    servidor_tiene_app: boolean;
  };
  ajustes: {
    renovacion_activa: Ajuste<boolean>;
    renovar_dias: Ajuste<number>;
    aviso_dias: Ajuste<number>;
    gasto_total_cada_horas: Ajuste<number>;
  };
  ajustes_cambiados_por: string | null;
  ajustes_cambiados_at: string | null;
  ultima_vuelta: { at: string; resumen: { revisadas?: number; renovadas?: number; fallidas?: number; a_mano?: boolean; apagado?: boolean } | null } | null;
  tokens: TokenCampus[];
}

// Lo mismo que comprueba el servidor (Zod), para avisar antes de enviar.
export const APP_ID_VALIDO = /^\d{5,20}$/;
export const SECRETO_VALIDO = /^[a-f0-9]{32}$/i;

const ORIGEN_TEXTO: Record<Origen, string> = {
  pantalla: 'puesto aquí',
  servidor: 'del servidor (.env)',
  defecto: 'el de siempre',
};

function fecha(d: string | null | undefined, conHora = true): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

const mensajeDe = (e: unknown) => {
  const err = e as { data?: { error?: string }; message?: string };
  return err?.data?.error || err?.message || 'Error desconocido';
};

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-0.5 hover:underline">
      {children} <ArrowSquareOut size={10} weight="bold" />
    </a>
  );
}

function Insignia({ tono, children }: { tono: 'ok' | 'error' | 'aviso' | 'info' | 'nada'; children: React.ReactNode }) {
  const color = {
    ok: 'bg-success-soft text-success-soft-foreground',
    error: 'bg-destructive-soft text-destructive-soft-foreground',
    aviso: 'bg-warning-soft text-warning-soft-foreground',
    info: 'bg-info-soft text-info-soft-foreground',
    nada: 'bg-muted text-muted-foreground',
  }[tono];
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${color}`}>{children}</span>;
}

function EstadoToken({ t }: { t: TokenCampus }) {
  if (t.estado === 'error') return <Insignia tono="error">No se pudo renovar</Insignia>;
  if (t.caducado) return <Insignia tono="error">Caducado</Insignia>;
  if (t.caduca_pronto) return <Insignia tono="aviso">Caduca pronto</Insignia>;
  if (t.sin_caducidad) return <Insignia tono="ok">No caduca</Insignia>;
  if (t.estado === 'sin_revisar') return <Insignia tono="nada">Sin revisar</Insignia>;
  return <Insignia tono="ok">Al día</Insignia>;
}

function Pasos() {
  return (
    <ol className="list-decimal list-inside space-y-1.5 pl-1 text-muted-foreground">
      <li>Entra en <Enlace href="https://developers.facebook.com/apps/">developers.facebook.com › Mis apps</Enlace> y abre la app
        con la que se generaron los tokens de las cuentas (la que eliges en Business Manager › Usuarios del sistema › «Generar token»).</li>
      <li>En <strong>Configuración de la app › Básica</strong>, copia el <strong>«Identificador de la app»</strong> (solo números).</li>
      <li>En la misma página, en <strong>«Clave secreta de la app»</strong>, pulsa «Mostrar» (Meta te pide la contraseña) y cópiala: son 32 caracteres.</li>
      <li>Pega los dos aquí y pulsa <strong>Guardar</strong>: se prueba sola contra Meta y con el token de uno de los campus.</li>
      <li>Abajo, enciende <strong>«Renovar los tokens automáticamente»</strong>. Una vez al día el CRM renueva los que se acercan a su caducidad y avisa a los administradores si alguno falla.</li>
    </ol>
  );
}

export default function MetaAppCard() {
  const [data, setData] = useState<EstadoAppMeta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [appId, setAppId] = useState('');
  const [secreto, setSecreto] = useState('');
  const [verSecreto, setVerSecreto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const [quitarAbierto, setQuitarAbierto] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [verPasos, setVerPasos] = useState<boolean | null>(null);
  // Los ajustes que se están editando (se guardan aparte).
  const [activa, setActiva] = useState(false);
  const [numeros, setNumeros] = useState<Record<ClaveNumero, string>>({ renovar_dias: '', aviso_dias: '', gasto_total_cada_horas: '' });
  const [guardandoAjustes, setGuardandoAjustes] = useState(false);

  // Solo la parte de la renovación: guardarla no borra lo que se esté escribiendo arriba.
  const aplicarAjustes = useCallback((d: EstadoAppMeta) => {
    setData(d);
    setActiva(d.ajustes.renovacion_activa.valor === true);
    setNumeros({
      renovar_dias: String(d.ajustes.renovar_dias.valor),
      aviso_dias: String(d.ajustes.aviso_dias.valor),
      gasto_total_cada_horas: String(d.ajustes.gasto_total_cada_horas.valor),
    });
  }, []);

  const aplicar = useCallback((d: EstadoAppMeta) => {
    aplicarAjustes(d);
    setAppId(d.app.guardada ? (d.app.app_id || '') : '');
    setSecreto('');
  }, [aplicarAjustes]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await client.get<EstadoAppMeta>('/meta-ads/app');
      if (res?.data) aplicar(res.data);
      setErrorCarga(null);
    } catch (e) {
      setErrorCarga(mensajeDe(e));
    } finally { setCargando(false); }
  }, [aplicar]);
  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !data) return <div className="h-40 bg-muted/40 rounded-lg animate-pulse" aria-label="Cargando la app de Meta" />;
  if (!data) {
    return (
      <section aria-label="App de Meta" className="bg-card border border-border rounded-lg p-4 text-sm">
        <p className="text-destructive">No se ha podido cargar la app de Meta: {errorCarga}</p>
        <button type="button" onClick={cargar} className="mt-2 text-xs text-primary hover:underline">Reintentar</button>
      </section>
    );
  }

  const app = data.app;
  const errorAppId = appId && !APP_ID_VALIDO.test(appId.trim()) ? 'El ID de la app son solo números (entre 5 y 20).' : null;
  const errorSecreto = secreto && !SECRETO_VALIDO.test(secreto.trim()) ? 'El secreto son 32 caracteres: números y letras de la «a» a la «f».' : null;
  // La primera vez hace falta el secreto; después, solo para cambiarlo.
  const puedeGuardar = APP_ID_VALIDO.test(appId.trim())
    && (secreto ? SECRETO_VALIDO.test(secreto.trim()) : app.guardada)
    && (!!secreto || appId.trim() !== (app.app_id || ''));
  const probarFormulario = APP_ID_VALIDO.test(appId.trim()) && SECRETO_VALIDO.test(secreto.trim());
  const ultimo = resultado || (app.ultima_prueba?.mensaje ? { ok: app.ultima_prueba.ok, mensaje: app.ultima_prueba.mensaje } : null);
  const pasosAbiertos = verPasos ?? !app.configurada;

  async function guardar() {
    setGuardando(true);
    try {
      const body: Record<string, string> = { app_id: appId.trim() };
      if (secreto) body.app_secret = secreto.trim();
      const res = await client.put<{ prueba: { ok: boolean; mensaje: string }; estado: EstadoAppMeta }>('/meta-ads/app', body);
      if (res?.data) {
        aplicar(res.data.estado);
        setResultado(res.data.prueba);
        toast(res.data.prueba.ok
          ? { title: 'App de Meta guardada y probada', description: res.data.prueba.mensaje }
          : { title: 'Guardada, pero la prueba falla', description: res.data.prueba.mensaje, variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'No se ha guardado', description: mensajeDe(e), variant: 'destructive' });
    } finally { setGuardando(false); }
  }

  async function probar() {
    setProbando(true);
    try {
      const body = probarFormulario ? { app_id: appId.trim(), app_secret: secreto.trim() } : {};
      const res = await client.post<{ ok: boolean; mensaje: string; estado: EstadoAppMeta }>('/meta-ads/app/probar', body);
      if (res?.data) {
        setResultado({ ok: res.data.ok, mensaje: res.data.mensaje });
        if (!probarFormulario) setData(res.data.estado);
        toast(res.data.ok
          ? { title: 'La app de Meta funciona', description: res.data.mensaje }
          : { title: 'La app de Meta no funciona', description: res.data.mensaje, variant: 'destructive' });
      }
    } catch (e) {
      setResultado({ ok: false, mensaje: mensajeDe(e) });
    } finally { setProbando(false); }
  }

  async function quitar() {
    setQuitando(true);
    try {
      const res = await client.delete<EstadoAppMeta>('/meta-ads/app');
      if (res?.data) aplicar(res.data);
      setResultado(null);
      setQuitarAbierto(false);
      toast({ title: 'App de Meta quitada' });
    } catch (e) {
      toast({ title: 'No se ha podido quitar', description: mensajeDe(e), variant: 'destructive' });
    } finally { setQuitando(false); }
  }

  async function guardarAjustes(volverAlServidor = false) {
    const body: Record<string, boolean | number | null> = volverAlServidor
      ? { renovacion_activa: null, renovar_dias: null, aviso_dias: null, gasto_total_cada_horas: null }
      : {
        renovacion_activa: activa,
        renovar_dias: Number(numeros.renovar_dias),
        aviso_dias: Number(numeros.aviso_dias),
        gasto_total_cada_horas: Number(numeros.gasto_total_cada_horas),
      };
    setGuardandoAjustes(true);
    try {
      const res = await client.put<EstadoAppMeta>('/meta-ads/app/ajustes', body);
      if (res?.data) aplicarAjustes(res.data);
      toast({ title: volverAlServidor ? 'Ajustes devueltos a los del servidor' : 'Renovación guardada' });
    } catch (e) {
      toast({ title: 'No se han guardado los ajustes', description: mensajeDe(e), variant: 'destructive' });
    } finally { setGuardandoAjustes(false); }
  }

  async function renovarAhora() {
    setRenovando(true);
    try {
      const res = await client.post<{ resumen: { revisadas?: number; renovadas?: number; fallidas?: number }; estado: EstadoAppMeta }>('/meta-ads/app/renovar', {});
      if (res?.data) {
        setData(res.data.estado);
        const r = res.data.resumen || {};
        toast({
          title: r.fallidas ? 'Renovación con fallos' : 'Renovación hecha',
          description: `${r.revisadas ?? 0} revisados, ${r.renovadas ?? 0} renovados, ${r.fallidas ?? 0} con fallo.`,
          ...(r.fallidas ? { variant: 'destructive' as const } : {}),
        });
      }
    } catch (e) {
      toast({ title: 'No se ha podido renovar', description: mensajeDe(e), variant: 'destructive' });
    } finally { setRenovando(false); }
  }

  const n = (k: ClaveNumero) => Number(numeros[k]);
  const errorAjustes = (() => {
    if (!Number.isInteger(n('renovar_dias')) || n('renovar_dias') < 1 || n('renovar_dias') > 59) return 'Renovar: de 1 a 59 días.';
    if (!Number.isInteger(n('aviso_dias')) || n('aviso_dias') < 1 || n('aviso_dias') > 30) return 'Avisar: de 1 a 30 días.';
    if (n('aviso_dias') >= n('renovar_dias')) return 'El aviso tiene que ser con menos días que la renovación.';
    if (!Number.isInteger(n('gasto_total_cada_horas')) || n('gasto_total_cada_horas') < 1 || n('gasto_total_cada_horas') > 168) return 'Gasto de toda la vida: de 1 a 168 horas.';
    return null;
  })();
  const ajustesCambian = activa !== data.ajustes.renovacion_activa.valor
    || (['renovar_dias', 'aviso_dias', 'gasto_total_cada_horas'] as ClaveNumero[]).some((k) => n(k) !== data.ajustes[k].valor);
  const hayAjustesEnPantalla = Object.values(data.ajustes).some((a) => a.origen === 'pantalla');
  const vuelta = data.ultima_vuelta;

  // Una función y no un componente: definido aquí dentro, se volvería a montar en
  // cada tecla y el campo perdería el foco.
  const campoNumero = (k: ClaveNumero, etiqueta: string, unidad: string) => (
    <div key={k}>
      <label htmlFor={`meta-app-${k}`} className="text-[11px] font-semibold text-muted-foreground mb-1 block">{etiqueta}</label>
      <div className="flex items-center gap-1.5">
        <input id={`meta-app-${k}`} inputMode="numeric" value={numeros[k]}
          onChange={(e) => setNumeros((v) => ({ ...v, [k]: e.target.value.replace(/\D/g, '') }))}
          className="w-20 h-9 px-2 rounded-md border border-border bg-card text-sm font-mono" />
        <span className="text-xs text-muted-foreground">{unidad}</span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">{ORIGEN_TEXTO[data.ajustes[k].origen]}</p>
    </div>
  );

  return (
    <section aria-label="App de Meta" data-testid="meta-app" className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-info-soft text-info-soft-foreground flex items-center justify-center flex-shrink-0">
          <AppWindow size={22} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base">App de Meta</h3>
          <p className="text-xs text-muted-foreground">
            De todo el CRM, no de este campus: con ella se mira cuándo caduca el token de cada cuenta de Meta Ads y se renueva antes de que pase.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1" data-testid="meta-app-origen">
            Se está usando: <strong className="text-foreground">{app.origen === 'pantalla' ? 'la puesta aquí' : app.origen === 'servidor' ? 'la del servidor (.env), de reserva' : 'ninguna'}</strong>
            {app.origen === 'pantalla' && app.servidor_tiene_app && <> · el servidor también tiene una; si quitas esta, se usa aquella</>}
          </p>
        </div>
        {app.ultima_prueba && !app.ultima_prueba.ok ? <Insignia tono="error"><WarningCircle size={10} weight="fill" /> Error</Insignia>
          : app.configurada ? <Insignia tono="ok"><CheckCircle size={10} weight="fill" /> Configurada</Insignia>
          : <Insignia tono="nada">Sin configurar</Insignia>}
      </div>

      <div className="p-5 space-y-4 text-sm">
        {data.falta_migracion && (
          <p role="alert" className="text-xs p-2 rounded-md bg-warning-soft text-warning-soft-foreground">
            Este servidor aún no tiene la actualización de la base (migración 341): hasta entonces se usa lo del servidor y aquí no se puede guardar.
          </p>
        )}

        <div>
          <button type="button" onClick={() => setVerPasos(!pasosAbiertos)} aria-expanded={pasosAbiertos}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Question size={12} weight="bold" /> {pasosAbiertos ? 'Ocultar los pasos' : 'Dónde están el ID y el secreto, paso a paso'}
          </button>
          {pasosAbiertos && <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-xs"><Pasos /></div>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="meta-app-id" className="text-[11px] font-semibold text-muted-foreground mb-1 block">Identificador de la app</label>
            <input id="meta-app-id" inputMode="numeric" value={appId} onChange={(e) => setAppId(e.target.value.trim())}
              placeholder={app.origen === 'servidor' && app.app_id ? `${app.app_id} (del servidor)` : '1234567890123456'}
              aria-invalid={!!errorAppId}
              className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm font-mono" />
            {errorAppId && <p role="alert" className="text-[11px] text-destructive mt-1">{errorAppId}</p>}
          </div>
          <div>
            <label htmlFor="meta-app-secreto" className="text-[11px] font-semibold text-muted-foreground mb-1 block">Clave secreta de la app</label>
            <div className="relative">
              <input id="meta-app-secreto" type={verSecreto ? 'text' : 'password'} value={secreto} autoComplete="off" spellCheck={false}
                onChange={(e) => setSecreto(e.target.value.trim())}
                placeholder={app.guardada ? `guardada (…${app.secreto_cola || '····'}): escribe solo para cambiarla` : '32 caracteres'}
                aria-invalid={!!errorSecreto}
                className="w-full h-10 px-3 pr-9 rounded-md border border-border bg-card text-sm font-mono" />
              <button type="button" onClick={() => setVerSecreto(!verSecreto)} aria-label={verSecreto ? 'Ocultar el secreto' : 'Ver lo que escribo'}
                className="absolute top-1/2 -translate-y-1/2 right-2 text-muted-foreground hover:text-foreground">
                {verSecreto ? <EyeSlash size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {errorSecreto && <p role="alert" className="text-[11px] text-destructive mt-1">{errorSecreto}</p>}
            <p className="text-[10px] text-muted-foreground mt-0.5">Se guarda cifrada y no se vuelve a enseñar.</p>
          </div>
        </div>

        {app.guardada && (
          <p className="text-xs text-muted-foreground">
            Puesta por <strong className="text-foreground">{app.puesta_por || '—'}</strong> · {fecha(app.actualizada_at)}
          </p>
        )}

        {ultimo && (
          <div role="status" className={`text-xs p-2 rounded-md ${ultimo.ok ? 'bg-success-soft text-success-soft-foreground' : 'bg-destructive-soft text-destructive-soft-foreground'}`}>
            <div className="flex items-center gap-1.5">
              {ultimo.ok ? <CheckCircle size={12} weight="fill" /> : <WarningCircle size={12} weight="fill" />}
              <strong>{resultado ? 'Prueba' : 'Última prueba'}:</strong> <span>{resultado ? 'ahora' : fecha(app.ultima_prueba?.at)}</span>
            </div>
            <p className="mt-0.5 ml-5 break-words">{ultimo.mensaje}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <button type="button" onClick={guardar} disabled={guardando || !puedeGuardar || data.falta_migracion}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
            <FloppyDisk size={14} weight="bold" /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={probar} disabled={probando || (!probarFormulario && !app.configurada)}
            title={probarFormulario ? 'Prueba el ID y el secreto escritos, sin guardarlos' : 'Una llamada real a Meta con la app que se está usando'}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50">
            <PlugsConnected size={14} weight="bold" /> {probando ? 'Probando…' : 'Probar'}
          </button>
          {app.guardada && (
            <button type="button" onClick={() => setQuitarAbierto(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-destructive/30 bg-card text-sm font-semibold text-destructive hover:bg-destructive-soft ml-auto">
              <Trash size={14} weight="bold" /> Quitar
            </button>
          )}
        </div>

        {/* La renovación automática */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Renovación de los tokens</h4>
              <p className="text-[11px] text-muted-foreground">
                Los tokens de Meta caducan a los 60 días. Una vez al día se renuevan los que se acercan y se avisa a los administradores si alguno falla o va a caducar.
              </p>
            </div>
            <button type="button" onClick={renovarAhora} disabled={renovando || !app.configurada}
              title={app.configurada ? 'Una vuelta ahora, aunque la automática esté apagada' : 'Pon antes la app'}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50 flex-shrink-0">
              <ArrowsClockwise size={14} weight="bold" className={renovando ? 'animate-spin' : ''} /> {renovando ? 'Renovando…' : 'Renovar ahora'}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} aria-label="Renovar los tokens automáticamente" />
            Renovar los tokens automáticamente, una vez al día
            <span className="text-[10px] text-muted-foreground">({ORIGEN_TEXTO[data.ajustes.renovacion_activa.origen]})</span>
          </label>

          <div className="flex flex-wrap gap-4">
            {campoNumero('renovar_dias', 'Renovar cuando queden menos de', 'días')}
            {campoNumero('aviso_dias', 'Avisar cuando queden menos de', 'días')}
            {campoNumero('gasto_total_cada_horas', 'Pedir el gasto de toda la vida cada', 'horas')}
          </div>
          {errorAjustes && <p role="alert" className="text-[11px] text-destructive">{errorAjustes}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => guardarAjustes()} disabled={guardandoAjustes || !!errorAjustes || !ajustesCambian || data.falta_migracion}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
              <FloppyDisk size={12} weight="bold" /> {guardandoAjustes ? 'Guardando…' : 'Guardar la renovación'}
            </button>
            {hayAjustesEnPantalla && (
              <button type="button" onClick={() => guardarAjustes(true)} disabled={guardandoAjustes}
                className="h-8 px-3 rounded-md border border-border bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50">
                Volver a lo del servidor
              </button>
            )}
            {data.ajustes_cambiados_at && (
              <span className="text-[11px] text-muted-foreground">Cambiada por {data.ajustes_cambiados_por || '—'} · {fecha(data.ajustes_cambiados_at)}</span>
            )}
          </div>

          <p className="text-xs text-muted-foreground" data-testid="meta-app-ultima-vuelta">
            Última vuelta: <strong className="text-foreground">{fecha(vuelta?.at)}</strong>
            {vuelta?.resumen && !vuelta.resumen.apagado && (
              <> · {vuelta.resumen.revisadas ?? 0} revisados, {vuelta.resumen.renovadas ?? 0} renovados
                {vuelta.resumen.fallidas ? <span className="text-destructive">, {vuelta.resumen.fallidas} con fallo</span> : null}
                {vuelta.resumen.a_mano ? ' (a mano)' : ''}</>
            )}
          </p>

          {data.tokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no hay ninguna cuenta de Meta Ads conectada en ningún campus.</p>
          ) : (
            <div className="overflow-x-auto border border-border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Campus</th>
                    <th className="text-left px-3 py-2 font-medium">Cuenta</th>
                    <th className="text-left px-3 py-2 font-medium">Caduca</th>
                    <th className="text-left px-3 py-2 font-medium">Última renovación</th>
                    <th className="text-left px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tokens.map((t) => (
                    <tr key={`${t.tipo}-${t.cuenta_id}`} className="border-t border-border align-top">
                      <td className="px-3 py-2">{t.project_nombre || '—'}</td>
                      <td className="px-3 py-2">{t.tipo === 'instagram' ? 'Instagram ' : ''}{t.nombre || t.cuenta_id}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{t.sin_caducidad ? 'Nunca' : fecha(t.expires_at, false)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fecha(t.renovado_at)}</td>
                      <td className="px-3 py-2">
                        <EstadoToken t={t} />
                        {t.error && <p className="text-[11px] text-destructive mt-1 max-w-xs">{t.error}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={quitarAbierto}
        title="¿Quitar la app de Meta?"
        message={app.servidor_tiene_app
          ? 'Se dejará de usar la puesta aquí y se pasará a la del servidor (.env).'
          : 'Sin app, el CRM no podrá mirar ni renovar los tokens de Meta Ads de ningún campus: caducarán a los 60 días y habrá que volver a conectarlos a mano.'}
        confirmLabel="Quitar"
        tone="destructive"
        loading={quitando}
        onConfirm={quitar}
        onCancel={() => setQuitarAbierto(false)}
      />
    </section>
  );
}
