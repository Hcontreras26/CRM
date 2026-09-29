import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, Checks, ArrowRight, Info } from '@phosphor-icons/react';
import {
  listarAvisos, marcarGrupoLeido, marcarTodasLeidas, type Aviso,
} from '../api/avisos.api';

/**
 * Todas las notificaciones (#111).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE CAMBIA Y POR QUE
 *
 * Diego, el 07/09: 98 sin leer y casi todas la misma —«Revisión diaria: hay
 * cosas sin atar»—. «Si todo avisa, nada avisa».
 *
 * Dos listas, no una. Arriba lo que pide hacer algo; abajo lo que solo hay que
 * saber. Mezclados, un aviso de «tienes un prospecto nuevo» se pierde entre
 * veinte copias del informe diario, y entonces la campana deja de mirarse.
 *
 * Y lo repetido va en una fila con su «×6». El número lo cuenta el servidor en
 * SQL, no esta pantalla: contándolo aquí, con `limit: 100`, un grupo de 200
 * diría «×100».
 * ─────────────────────────────────────────────────────────────────────────────
 */

function haceCuanto(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Fila({ n, alAbrir }: { n: Aviso; alAbrir: (n: Aviso) => void }) {
  const sinLeer = n.sin_leer > 0;
  return (
    <li>
      <button
        onClick={() => alAbrir(n)}
        className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/40 transition-colors ${sinLeer ? 'bg-primary/[0.03]' : ''}`}
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${sinLeer ? 'bg-primary' : 'border border-border'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${sinLeer ? 'font-bold' : 'font-medium'} text-foreground`}>
              {n.title}
            </span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0 tabular-nums">{haceCuanto(n.created_at)}</span>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{n.etiqueta}</span>
            {n.veces > 1 && (
              // El «desde» es lo que convierte «×6» en información: seis veces
              // en un día y seis en dos meses no son lo mismo.
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums"
                title={`${n.veces} avisos iguales, el primero ${haceCuanto(n.desde)}`}
              >
                ×{n.veces}
              </span>
            )}
          </div>

          {n.message && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.message}</p>}
        </div>

        {n.link_path
          ? <ArrowRight size={13} weight="bold" className="text-muted-foreground mt-1 flex-shrink-0" />
          : !sinLeer && <CheckCircle size={13} weight="fill" className="text-emerald-500 mt-1 flex-shrink-0" />}
      </button>
    </li>
  );
}

function Seccion({
  titulo, ayuda, avisos, alAbrir,
}: { titulo: string; ayuda: string; avisos: Aviso[]; alAbrir: (n: Aviso) => void }) {
  const sinLeer = avisos.filter((n) => n.sin_leer > 0).length;
  return (
    <section>
      <header className="flex items-center gap-2 px-4 h-10 bg-muted/30 border-b border-border">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{titulo}</h4>
        {sinLeer > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary tabular-nums">
            {sinLeer}
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto hidden sm:inline">{ayuda}</span>
      </header>
      {avisos.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">Nada por aquí.</p>
      ) : (
        <ul className="divide-y divide-border">
          {avisos.map((n) => <Fila key={n.grupo} n={n} alAbrir={alAbrir} />)}
        </ul>
      )}
    </section>
  );
}

export default function NotificationsList() {
  const [items, setItems] = useState<Aviso[] | null>(null);
  const [marcando, setMarcando] = useState(false);
  const navigate = useNavigate();

  async function cargar() { setItems(await listarAvisos(100)); }
  useEffect(() => { cargar(); }, []);

  async function abrir(n: Aviso) {
    // El grupo entero, no solo la última. Marcando una de seis quedan cinco y
    // el globo no baja: la agrupación sería maquillaje.
    if (n.sin_leer > 0) { try { await marcarGrupoLeido(n.grupo); } catch { /* no crítico */ } }
    if (n.link_path) navigate(n.link_path);
    else cargar();
  }

  async function marcarTodas() {
    setMarcando(true);
    try { await marcarTodasLeidas(); await cargar(); } catch { /* no crítico */ } finally { setMarcando(false); }
  }

  const lista = items || [];
  const hacer = lista.filter((n) => n.clase === 'accion');
  const saber = lista.filter((n) => n.clase !== 'accion');
  const sinLeer = lista.reduce((a, n) => a + n.sin_leer, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 h-12 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Bell size={16} weight="duotone" className="text-primary flex-shrink-0" />
          <h3 className="text-sm font-bold truncate">Todas las notificaciones</h3>
          {sinLeer > 0 && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0 tabular-nums">
              {sinLeer} sin leer
            </span>
          )}
        </div>
        {sinLeer > 0 && (
          <button
            onClick={marcarTodas} disabled={marcando}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-xs font-medium hover:bg-muted disabled:opacity-50 flex-shrink-0"
          >
            <Checks size={13} weight="bold" /> {marcando ? 'Marcando…' : 'Marcar todas como leídas'}
          </button>
        )}
      </div>

      {items === null ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No tienes notificaciones.</div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
          <Seccion
            titulo="Para hacer" ayuda="Piden que alguien actúe"
            avisos={hacer} alAbrir={abrir}
          />
          <Seccion
            titulo="Para saber" ayuda="Han pasado, no piden nada"
            avisos={saber} alAbrir={abrir}
          />
        </div>
      )}

      {items !== null && lista.some((n) => n.veces > 1) && (
        <p className="flex items-center gap-1.5 px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
          <Info size={12} weight="fill" />
          Los avisos que se repiten van juntos. El «×N» es el total, y al abrirlo se marcan todos.
        </p>
      )}
    </div>
  );
}
