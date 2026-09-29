import { useEffect, useMemo, useState } from 'react';
import { accountingApi } from '@/modules/accounting/api/accounting.api';
import { diasHasta } from '@/shared/lib/fechas';

/**
 * Lo que está pendiente de cobrar, para la cabecera de Clientes.
 *
 * Sale de `/accounting/receivable`, que ya existía y ya une las dos cosas que
 * se deben: las cuotas sin cobrar y las ventas de pago único que aún no se han
 * pagado. Viene sin paginar y con su propio resumen, así que las cifras son de
 * todo lo que hay y no de la página que se esté viendo — que era el motivo por
 * el que no se podían calcular en la pantalla.
 *
 * OJO CON LOS FILTROS. Este endpoint entiende proyecto y gestora, y nada más.
 * Sus `from`/`to` son un rango de VENCIMIENTO, no de fecha de compra, así que
 * las fechas de la lista no se le pasan: significarían otra cosa. Por eso las
 * cifras de dinero se anuncian por lo que son y no como «con los filtros
 * puestos», que sería mentira.
 */

export interface FilaCobro {
  tipo: 'cuota' | 'venta';
  ref_id: number;
  conversion_id: number;
  lead_id: number;
  cliente: string;
  producto: string;
  gestora_nombre: string | null;
  responsable_id: number | null;
  cuota_numero: number | null;
  importe: number;
  vence: string | null;
  vencido: boolean;
}

export interface ResumenCobro {
  total_pendiente: number;
  total_vencido: number;
  count: number;
  count_vencidas: number;
}

export default function useCobrosClientes({
  projectId,
  responsableId,
}: {
  /** Null para «todos los proyectos»: el servidor los da todos. */
  projectId: number | null;
  /** La gestora del filtro, si hay una puesta. */
  responsableId?: string | number | null;
}) {
  const [items, setItems] = useState<FilaCobro[]>([]);
  const [resumen, setResumen] = useState<ResumenCobro | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const params: Record<string, string | number> = {};
    if (projectId) params.projectId = projectId;
    // «unassigned» no es una gestora: el endpoint no sabe filtrar por eso.
    if (responsableId && responsableId !== 'unassigned') params.responsableId = Number(responsableId);

    accountingApi.receivable(params)
      .then((res) => {
        if (!vivo) return;
        if (res.success) {
          setItems((res.data?.items as FilaCobro[]) || []);
          setResumen((res.data?.resumen as ResumenCobro) || null);
        }
      })
      // Un fallo aquí no puede tumbar la lista de clientes, que es lo que se
      // viene a ver: los bloques de arriba se quedan sin pintar y ya está.
      .catch(() => { if (vivo) { setItems([]); setResumen(null); } })
      .finally(() => { if (vivo) setCargando(false); });

    return () => { vivo = false; };
  }, [projectId, responsableId]);

  /** Cuánto se debe según lo cerca que esté de vencer. En euros, no en filas:
      lo que importa de un cobro es el importe, no cuántos recibos son. */
  const tramos = useMemo(() => {
    const t = { vencido: 0, semana: 0, mes: 0, despues: 0, sinFecha: 0 };
    for (const f of items) {
      const dias = diasHasta(f.vence);
      if (dias === null) t.sinFecha += f.importe;
      else if (dias < 0) t.vencido += f.importe;
      else if (dias <= 7) t.semana += f.importe;
      else if (dias <= 30) t.mes += f.importe;
      else t.despues += f.importe;
    }
    return t;
  }, [items]);

  /** Cuántos cobros vencen en los próximos siete días (sin contar los ya vencidos). */
  const venceEstaSemana = useMemo(
    () => items.filter((f) => { const d = diasHasta(f.vence); return d !== null && d >= 0 && d <= 7; }).length,
    [items],
  );

  return { items, resumen, tramos, venceEstaSemana, cargando };
}
