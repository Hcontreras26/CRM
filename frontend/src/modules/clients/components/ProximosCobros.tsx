import { useState } from 'react';
import ListaDeVencimientos from '@/shared/components/ui/ListaDeVencimientos';
import { VENTANAS } from '@/shared/lib/vencimientos';
import { formatCurrency } from '@/shared/lib/format';
import type { FilaCobro } from '../hooks/useCobrosClientes';

/**
 * Qué se cobra ahora, en orden.
 *
 * El equivalente de «Siguientes acciones» de Prospectos: allí son seguimientos
 * y aquí cuotas. Pero la pregunta NO es la misma, y ahí estaba el fallo.
 *
 * Diego, repaso del 15/09 por la noche:
 *
 *   «"Próximos cobros" no sirve como está: dice "venció hace 285 días", que es
 *    mirar atrás. Tiene que decir cuándo va a vencer. Y faltan filtros de qué
 *    vence en X días y qué vence mañana.»
 *
 * La tarjeta ordenaba por atraso y se quedaba con cinco, así que cinco deudas
 * viejas —de datos importados— tapaban siempre lo que venía. Se llamaba
 * «Próximos» y no enseñaba ni uno. Ahora mira hacia delante; lo vencido se
 * cuenta aparte y tiene su propio botón.
 */

const BOTON = 'rounded-md border px-2 py-1 text-secundario font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40';

export default function ProximosCobros({
  cobros, onAbrir, onVerTodos,
}: {
  cobros: FilaCobro[];
  onAbrir?: (leadId: number) => void;
  onVerTodos?: () => void;
}) {
  // Siete días de arranque: es lo que se mira al empezar la semana. Las otras
  // ventanas están a un clic.
  const [ventana, setVentana] = useState('semana');
  const elegida = VENTANAS.find((v) => v.clave === ventana) || VENTANAS[1];

  return (
    <ListaDeVencimientos
      titulo="Próximos cobros"
      descripcion={
        elegida.orden === 'vencidas'
          ? 'Lo que ya venció, de lo más antiguo a lo más reciente.'
          : 'Lo que viene, de lo más cercano en adelante.'
      }
      orden={elegida.orden}
      ventanaDias={elegida.dias}
      items={cobros.map((c) => ({
        // El id es el del cliente y no el del recibo: al pulsar se abre la
        // ficha de quien debe, que es lo que hace falta para reclamarlo.
        id: c.lead_id,
        titulo: c.cliente,
        subtitulo: c.cuota_numero ? `${c.producto} · cuota ${c.cuota_numero}` : c.producto,
        fecha: c.vence,
        // El importe, a la derecha: «cuándo» sin «cuánto» no alcanza para
        // decidir a quién se llama primero, y en el subtítulo se cortaba.
        detalle: formatCurrency(c.importe),
      }))}
      filtros={VENTANAS.map((v) => (
        <button
          key={v.clave}
          type="button"
          aria-pressed={v.clave === ventana}
          onClick={() => setVentana(v.clave)}
          className={`${BOTON} ${
            v.clave === ventana
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:bg-muted'
          }`}
        >
          {v.texto}
        </button>
      ))}
      onVerVencidas={() => setVentana('vencidas')}
      onAbrir={onAbrir}
      onVerTodos={onVerTodos}
      textoVacio={
        elegida.orden === 'vencidas'
          ? 'No hay ninguna cuota vencida.'
          : `Nada que cobrar ${elegida.dias === 1 ? 'mañana' : `en los próximos ${elegida.dias} días`}.`
      }
    />
  );
}
