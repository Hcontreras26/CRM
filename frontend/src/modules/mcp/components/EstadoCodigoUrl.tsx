import { useState } from 'react';
import { CheckCircle, Clock, LockKey, LockKeyOpen, Prohibit, XCircle } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import { mcpApi, type McpConexionClaude, type McpEstadoCodigo } from '../api/mcp.api';

/**
 * El estado de una URL con el código para Claude, y cada Claude conectado con
 * ella (#192, Diego 05/10; #326, 13/10).
 *
 * #326: cada Claude que se conecta con la URL aparece aquí debajo. Queda
 * PENDIENTE hasta que el dueño lo autoriza: si la URL se ha colado y otra
 * persona la conecta en su Claude, no puede consultar nada aunque la URL esté
 * desbloqueada y aunque tenga un código. Se rechaza desde aquí. El desbloqueo
 * ya no caduca por horas (Carlos, 13/10).
 *
 * «Desbloquear desde aquí» desbloquea los Claude ya autorizados, sin código:
 * claude.ai guarda la lista de herramientas al conectar y a veces no tiene
 * `desbloquear`. Los textos los calcula el servidor; con el código apagado no
 * llega nada y aquí no se pinta nada.
 */
export default function EstadoCodigoUrl({ codigo, tokenId, onCambio }: {
  codigo: McpEstadoCodigo | null | undefined;
  tokenId: number;
  onCambio: () => void;
}) {
  const [desbloqueando, setDesbloqueando] = useState(false);
  if (!codigo) return null;

  async function desbloquear() {
    setDesbloqueando(true);
    try {
      await mcpApi.desbloquearUrl(tokenId);
      toast({ title: 'Desbloqueado', description: 'Dile a Claude que vuelva a consultar.' });
      onCambio();
    } catch (e) {
      toast({ title: 'No se pudo desbloquear', description: (e as Error).message, variant: 'destructive' });
    } finally { setDesbloqueando(false); }
  }

  const conexiones = codigo.conexiones || [];
  const hayAutorizadaCerrada = conexiones.some((c) => c.estado === 'autorizada' && !c.desbloqueada);
  const Icono = codigo.estado === 'desbloqueada' ? LockKeyOpen
    : codigo.estado === 'bloqueada' ? Prohibit
      : codigo.estado === 'pendiente' ? Clock : LockKey;
  const color = codigo.estado === 'desbloqueada'
    ? 'text-success-soft-foreground'
    : codigo.estado === 'bloqueada' ? 'text-destructive' : 'text-warning-soft-foreground';

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex items-start gap-1 text-[11px] ${color}`}>
          <Icono size={12} weight="bold" className="mt-0.5 shrink-0" /> {codigo.texto}
        </span>
        {codigo.estado !== 'bloqueada' && hayAutorizadaCerrada && (
          <button
            type="button"
            onClick={desbloquear}
            disabled={desbloqueando}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-bold hover:bg-muted disabled:opacity-50"
          ><LockKeyOpen size={12} weight="bold" /> Desbloquear desde aquí</button>
        )}
      </div>
      {conexiones.length > 0 && (
        <ul className="space-y-1">
          {conexiones.map((c) => <FilaConexion key={c.id} conexion={c} onCambio={onCambio} />)}
        </ul>
      )}
    </div>
  );
}

const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

const nombreCliente = (c: McpConexionClaude) => (c.cliente === 'claude_code' ? 'Claude Code' : 'Claude');

/**
 * Un Claude conectado: autorizarlo (solo el dueño) o rechazarlo (el dueño o el
 * super admin). `deOtraPersona`: en la lista del super admin, sin «Autorizar».
 */
export function FilaConexion({ conexion: c, onCambio, deOtraPersona = false }: {
  conexion: McpConexionClaude;
  onCambio: () => void;
  deOtraPersona?: boolean;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function decidir(decision: 'autorizar' | 'rechazar') {
    if (decision === 'rechazar' && !window.confirm(
      `¿Rechazar este ${nombreCliente(c)}? No podrá consultar el CRM con esta URL. Si eres tú, tendrás que volver a conectar Claude.`,
    )) return;
    setOcupado(true);
    try {
      await mcpApi.decidirConexion(c.id, decision);
      toast(decision === 'autorizar'
        ? { title: 'Conexión autorizada', description: 'Si aún no lo has hecho, dale el código a Claude.' }
        : { title: 'Conexión rechazada', description: 'Ese Claude ya no puede consultar el CRM con esta URL.' });
      onCambio();
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: (e as Error).message, variant: 'destructive' });
    } finally { setOcupado(false); }
  }

  const pendiente = c.estado === 'pendiente';
  return (
    <li className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1 text-[11px] ${
      pendiente ? 'border-warning bg-warning-soft' : 'border-border bg-card'}`}
    >
      <span className="inline-flex items-center gap-1 font-semibold">
        {pendiente
          ? <Clock size={12} weight="bold" className="text-warning-soft-foreground" />
          : <CheckCircle size={12} weight="bold" className="text-success-soft-foreground" />}
        {deOtraPersona ? `${c.persona} · ${c.url} · ` : ''}{nombreCliente(c)}
      </span>
      <span className="text-muted-foreground">
        conectado el {fecha(c.created_at)}
        {pendiente ? ' · pendiente de autorizar' : c.desbloqueada ? ' · autorizado y desbloqueado' : ' · autorizado, pedirá el código'}
        {c.last_used_at ? ` · último uso ${fecha(c.last_used_at)}` : ''}
      </span>
      <span className="ml-auto inline-flex gap-1">
        {pendiente && !deOtraPersona && (
          <button
            type="button"
            onClick={() => decidir('autorizar')}
            disabled={ocupado}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          ><CheckCircle size={12} weight="bold" /> Autorizar</button>
        )}
        <button
          type="button"
          onClick={() => decidir('rechazar')}
          disabled={ocupado}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 font-bold text-destructive hover:bg-muted disabled:opacity-50"
        ><XCircle size={12} weight="bold" /> {pendiente ? 'Rechazar' : 'Quitar'}</button>
      </span>
    </li>
  );
}
