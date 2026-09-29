import ListaDeVencimientos from '@/shared/components/ui/ListaDeVencimientos';
import type { FilaCobro } from '../hooks/useCobrosClientes';

/**
 * Qué se cobra ahora, en orden.
 *
 * El equivalente de «Siguientes acciones» de Prospectos: allí son seguimientos
 * y aquí cuotas, pero la pregunta es la misma —¿por dónde empiezo?— y la pieza
 * también, `ListaDeVencimientos`.
 */

export default function ProximosCobros({
  cobros, onAbrir, onVerTodos,
}: {
  cobros: FilaCobro[];
  onAbrir?: (leadId: number) => void;
  onVerTodos?: () => void;
}) {
  return (
    <ListaDeVencimientos
      titulo="Próximos cobros"
      descripcion="Las cuotas que tocan, de la más vencida a la que viene."
      items={cobros.map((c) => ({
        // El id es el del cliente y no el del recibo: al pulsar se abre la
        // ficha de quien debe, que es lo que hace falta para reclamarlo.
        id: c.lead_id,
        titulo: c.cliente,
        subtitulo: c.cuota_numero ? `${c.producto} · cuota ${c.cuota_numero}` : c.producto,
        fecha: c.vence,
      }))}
      onAbrir={onAbrir}
      onVerTodos={onVerTodos}
      textoVacio="Nada que cobrar en los próximos siete días."
    />
  );
}
