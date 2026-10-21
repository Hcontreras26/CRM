import { useEffect, useState } from 'react';
import { Copy, LockKey } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import { mcpApi, type McpCodigo, type McpEstado } from '../api/mcp.api';

/**
 * «Código para Claude» (#192): el segundo factor del MCP.
 *
 * Con el interruptor MCP_CODIGO_OBLIGATORIO encendido, Claude no saca datos
 * hasta que la persona le da este código. Desde la #326 el desbloqueo es de
 * cada Claude conectado (autorizado por su dueño) y ya no caduca por horas.
 *
 * El código vive solo en este estado y se olvida al caducar: el servidor no lo
 * guarda, solo su huella.
 */

export default function CodigoParaClaude({ config }: {
  config: NonNullable<McpEstado['codigo']>;
  /** Ya no se usa aquí (#326): los botones van debajo de cada URL. */
  onCambio?: () => void;
}) {
  const [codigo, setCodigo] = useState<McpCodigo | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [quedan, setQuedan] = useState(0);

  // Cuenta atrás. Al llegar a cero el código se borra de la pantalla: ya no vale.
  useEffect(() => {
    if (!codigo) return undefined;
    const tic = () => {
      const s = Math.max(0, Math.round((new Date(codigo.caducaAt).getTime() - Date.now()) / 1000));
      setQuedan(s);
      if (s === 0) setCodigo(null);
    };
    tic();
    const t = setInterval(tic, 1000);
    return () => clearInterval(t);
  }, [codigo]);

  async function pedir() {
    setPidiendo(true);
    try {
      const r = await mcpApi.crearCodigo();
      setCodigo(r.data as McpCodigo);
    } catch (e) {
      toast({ title: 'No se pudo sacar el código', description: (e as Error).message, variant: 'destructive' });
    } finally { setPidiendo(false); }
  }

  const mmss = `${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, '0')}`;

  return (
    <div className="bg-card border border-primary/30 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <LockKey size={18} weight="bold" className="text-primary" />
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-semibold text-sm">Código para Claude</h2>
          <p className="text-xs text-muted-foreground">
            Claude te lo pedirá la primera vez que lo conectes con tu URL; después no vuelve a pedirlo. Además, cada Claude que se
            conecte con tu URL tienes que autorizarlo debajo de ella: si no eres tú, recházalo. Vale {config.minutosCodigo} minutos y una sola vez.
          </p>
        </div>
        <button
          onClick={pedir}
          disabled={pidiendo}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
        ><LockKey size={14} weight="bold" /> {codigo ? 'Sacar otro' : 'Sacar código para Claude'}</button>
      </div>

      {/* El estado actual en una línea (#192, Diego 05/10): el de su URL o, si tiene varias,
          un resumen de todas. El detalle y el botón de cada una, en su tabla. */}
      {/* #326: solo la línea; cada Claude conectado, con «Autorizar», sale debajo de su URL. */}
      {config.resumen && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {config.resumen.una && <span>Tu URL ({config.resumen.una.nombre}):</span>}
          <span className="inline-flex items-start gap-1"><LockKey size={12} weight="bold" className="mt-0.5 shrink-0" /> {config.resumen.texto}</span>
        </div>
      )}

      {codigo && (
        <div className="flex flex-wrap items-center gap-4 rounded-md bg-muted p-4">
          <code className="text-2xl font-bold tracking-[0.2em]">{codigo.codigo}</code>
          <button
            onClick={() => { navigator.clipboard?.writeText(codigo.codigo); toast({ title: 'Código copiado' }); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          ><Copy size={12} weight="bold" /> Copiar</button>
          <span className="text-xs text-muted-foreground">Caduca en {mmss}. Díselo a Claude: «mi código es {codigo.codigo}».</span>
        </div>
      )}
    </div>
  );
}
