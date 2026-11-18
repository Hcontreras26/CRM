import { useEffect, useState, useCallback } from 'react';
import { Database, ArrowsClockwise, FloppyDisk, PlugsConnected } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';

/**
 * Supabase, para los proyectos IA (#44).
 *
 * Los proyectos IA guardan sus datos en Supabase: usuarios, suscripciones,
 * consumo. De ahí sale lo que el CRM necesita para tratarlos como una marca
 * más, y con más detalle que de Stripe — Stripe sabe que entró un cobro; la
 * app sabe además de quién, con qué plan y desde qué país.
 *
 * LO QUE NO SIRVE, Y CONVIENE QUE QUEDE ESCRITO: sacar de aquí las claves de
 * otros servicios. Los secrets de un proyecto vuelven como SHA-256 de 64
 * caracteres, no como su valor. Comprobado contra Tarot IA: los 19, incluido
 * `SUPABASE_URL`, que ni siquiera es secreta. La clave de Stripe hay que
 * sacarla del panel de Stripe.
 */

interface EstadoSupabase {
  active: boolean;
  has_secret: boolean;
  secret_preview: string | null;
  config_public: Record<string, string>;
  last_test_status: 'success' | 'error' | null;
  last_test_message: string | null;
}

interface Previo {
  suscripciones: number;
  conEmail: number;
  sinEmail: number;
  importe: number;
  otraMoneda: number;
  desde: string | null;
  hasta: string | null;
  conReferenciaStripe: number;
}

export default function SupabaseCard({ projectId }: { projectId: number }) {
  const [data, setData] = useState<EstadoSupabase | null>(null);
  const [token, setToken] = useState('');
  const [ref, setRef] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [previo, setPrevio] = useState<Previo | null>(null);
  const [trayendo, setTrayendo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await client.get<EstadoSupabase>(`/integrations/supabase?projectId=${projectId}`);
      if (r.success) {
        setData(r.data);
        // LA REFERENCIA SOLO SE PISA SI VIENE UNA. Si la petición falla o
        // vuelve vacía y aquí se pusiera '', el siguiente «Guardar» escribiría
        // una referencia vacía encima de la buena y dejaría la conexión rota
        // con un SIN_REF — sin que nadie haya tocado ese campo.
        const guardada = r.data?.config_public?.project_ref as string | undefined;
        if (guardada) setRef(guardada);
      }
    } catch { /* sin configurar todavía: se deja lo que hubiera escrito */ }
  }, [projectId]);
  useEffect(() => { cargar(); setPrevio(null); }, [cargar]);

  async function guardar() {
    setGuardando(true);
    try {
      if (!ref.trim()) {
        toast({ title: 'Falta la referencia del proyecto', description: 'Sin ella no se puede consultar nada.', variant: 'destructive' });
        return;
      }
      const body: Record<string, unknown> = {
        projectId, provider: 'supabase', active: true,
        config_public: { project_ref: ref.trim() },
      };
      // Solo si ha escrito uno nuevo: vacío significa «no lo cambies».
      if (token.trim()) body.api_key = token.trim();
      const r = await client.put<EstadoSupabase>('/integrations', body);
      if (r.success) {
        setData(r.data); setToken('');
        toast({ title: 'Supabase guardado', description: 'Token cifrado en la base.' });
      }
    } catch (e: unknown) {
      const err = e as { data?: { error?: string }; message?: string };
      toast({ title: 'Error', description: err?.data?.error || err?.message, variant: 'destructive' });
    } finally { setGuardando(false); }
  }

  async function probar() {
    setProbando(true);
    try {
      const r = await client.post<{ message: string }>(`/integrations/supabase/test?projectId=${projectId}`);
      // EL MOTIVO VIENE EN `data.message`, TAMBIÉN CUANDO FALLA. El servidor
      // contesta 200 con `success:false` y el porqué dentro —«el token no
      // alcanza ese proyecto», «401»—. Leyendo `error`, que no existe, el
      // aviso salía sin explicación y el diagnóstico que el servidor se
      // molesta en construir no llegaba a nadie.
      const motivo = r.data?.message || (r as { error?: string }).error;
      toast({
        title: r.success ? 'Conexión OK' : 'La prueba falló',
        description: motivo,
        variant: r.success ? undefined : 'destructive',
      });
      await cargar();
    } catch (e: unknown) {
      // Sin este catch, un 403 o un corte de red no enseñaban nada: la promesa
      // se rechazaba y el botón volvía a su sitio como si no hubiera pasado.
      const err = e as { data?: { error?: string }; message?: string };
      toast({ title: 'No se pudo probar', description: err?.data?.error || err?.message, variant: 'destructive' });
    } finally { setProbando(false); }
  }

  /** Mirar sin tocar: qué hay al otro lado antes de traer nada. */
  async function mirar() {
    setTrayendo(true);
    try {
      const r = await client.get<Previo>(`/ia/supabase/previo/${projectId}`);
      if (r.success) setPrevio(r.data);
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      toast({ title: 'No se pudo consultar', description: err?.data?.error, variant: 'destructive' });
    } finally { setTrayendo(false); }
  }

  async function traer() {
    const aviso = `Se crearán en el CRM los clientes y las ventas de las suscripciones de la app.

Cada una se marca con su id, así que volver a pulsar no duplica nada.

¿Seguir?`;
    if (!confirm(aviso)) return;
    setTrayendo(true);
    try {
      const r = await client.post<{ ventasNuevas: number; clientesNuevos: number; yaEstaban: number }>(
        `/ia/supabase/importar/${projectId}`, {});
      if (r.success) {
        const d = r.data;
        toast({
          title: 'Traído de Supabase',
          description: `${d.ventasNuevas} ventas nuevas · ${d.clientesNuevos} clientes nuevos · ${d.yaEstaban} ya estaban`,
        });
      }
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      toast({ title: 'Error al traer', description: err?.data?.error, variant: 'destructive' });
    } finally { setTrayendo(false); }
  }

  const conectado = data?.last_test_status === 'success';

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-success-soft/30 text-success flex items-center justify-center flex-shrink-0">
          <Database size={22} weight="duotone" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-base">
            Supabase <span className="text-xs font-normal text-muted-foreground">— la base de la app IA</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Sus usuarios y suscripciones, con más detalle del que da Stripe: quién compró, qué plan
            y desde qué país.
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full h-fit whitespace-nowrap ${conectado
          ? 'bg-success-soft text-success-soft-foreground'
          : 'bg-muted text-muted-foreground'}`}
        >
          {conectado ? 'Conectado' : data?.has_secret ? 'Sin probar' : 'Sin configurar'}
        </span>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
              Access token{' '}
              {data?.has_secret && (
                <span className="font-normal">
                  (actual: <code className="bg-muted px-1 rounded text-[10px]">{data.secret_preview}</code>)
                </span>
              )}
            </label>
            <input
              type="password" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder={data?.has_secret ? 'Sin cambios' : 'sbp_…'}
              className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">
              Referencia del proyecto
            </label>
            <input
              value={ref} onChange={(e) => setRef(e.target.value)}
              placeholder="abcdefghijklmnopqrst"
              className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              No es secreta: sale en la dirección del proyecto en Supabase.
            </p>
          </div>
        </div>

        {/* Los tokens de Supabase caducan y no hay forma de dejarlos fijos. El
            día que venza, esto deja de traer datos. */}
        <p className="text-[11px] text-muted-foreground">
          Los tokens de Supabase <strong>caducan</strong>. Cuando venza, esto deja de traer datos —
          la fecha está en el panel de Supabase, al lado del token.
        </p>

        {previo && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-semibold">Al otro lado hay:</p>
            <p>
              <strong>{previo.suscripciones}</strong> suscripciones por{' '}
              <strong>{previo.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</strong>
              {previo.desde && <> · de {String(previo.desde).slice(0, 10)} a {String(previo.hasta).slice(0, 10)}</>}
            </p>
            <p className="text-muted-foreground">
              {previo.conEmail} con correo, que son las que se pueden traer
              {previo.sinEmail > 0 && <> · {previo.sinEmail} sin correo, que se quedan fuera</>}
              {previo.otraMoneda > 0 && (
                <> · <span className="text-warning">{previo.otraMoneda} en otra
                  moneda, que tampoco entran: no se convierten a euros a ojo</span></>
              )}
              {' '}· {previo.conReferenciaStripe} con referencia de Stripe, que serán las que se
              puedan cruzar el día que haya clave
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <button onClick={guardar} disabled={guardando}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
            <FloppyDisk size={14} weight="bold" /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={probar} disabled={probando || !data?.has_secret}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50">
            <PlugsConnected size={14} weight="bold" /> {probando ? 'Probando…' : 'Probar conexión'}
          </button>
          {/* «Ver qué hay» no escribe una fila: es para saber a qué se dice que
              sí antes de decirlo. */}
          <button onClick={mirar} disabled={trayendo || !conectado}
            title={!conectado ? 'Prueba antes la conexión' : 'Mira qué hay al otro lado, sin escribir nada'}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50">
            Ver qué hay
          </button>
          <button onClick={traer} disabled={trayendo || !conectado}
            title={!conectado ? 'Prueba antes la conexión' : 'Crea los clientes y las ventas en el CRM'}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-success/40 bg-card text-sm font-semibold text-success hover:bg-success-soft disabled:opacity-50 ml-auto">
            <ArrowsClockwise size={14} weight="bold" className={trayendo ? 'animate-spin' : ''} /> Traer al CRM
          </button>
        </div>
      </div>
    </div>
  );
}
