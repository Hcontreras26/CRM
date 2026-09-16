import { UserCheck, Receipt, CheckCircle, Wallet } from '@phosphor-icons/react';
import { Cifra, FilaDeCifras } from '@/shared/components/ui/Cifra';

/**
 * Las cuatro cifras de la pantalla de Clientes.
 *
 * Son el espejo de las de Prospectos —la misma tarjeta y la misma fila— con lo
 * que se pregunta aquí: cuánta gente ha comprado y cómo va el dinero.
 *
 * Aquí había tres recuadros hechos a mano, con su propio tamaño de letra y sus
 * colores sueltos (`text-success`, `text-warning`), que no se parecían a
 * los de Prospectos. Los números son los mismos; lo que cambia es que ahora son
 * la misma pieza.
 *
 * LAS CUATRO SALEN DE LA MISMA LISTA que la tabla, así que responden a los
 * filtros igual que ella. No se mezclan con las de cobros —que son del proyecto
 * entero— porque entonces unas dirían una cosa y otras otra sin avisar.
 */

function euros(n: number): string {
  // Con centimos: facturado, cobrado y pendiente tienen que cuadrar al centimo.
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);
}

export default function CifrasClientes({
  totalClientes, facturado, cobrado, pendiente,
}: {
  totalClientes: number;
  facturado: number;
  cobrado: number;
  pendiente: number;
}) {
  // Sin clientes no se pinta una fila de ceros, igual que en Prospectos.
  if (totalClientes === 0) return null;

  const pctCobrado = facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0;

  return (
    <FilaDeCifras>
      <Cifra
        icon={UserCheck}
        etiqueta="Clientes"
        valor={totalClientes}
        detalle="con los filtros puestos"
      />
      <Cifra
        icon={Receipt}
        etiqueta="Facturado"
        valor={euros(facturado)}
        detalle="lo vendido a estos clientes"
      />
      <Cifra
        icon={CheckCircle}
        etiqueta="Cobrado"
        valor={euros(cobrado)}
        detalle={facturado > 0 ? `${pctCobrado}% de lo facturado` : 'todavía nada'}
        tono="bien"
      />
      <Cifra
        icon={Wallet}
        etiqueta="Pendiente"
        valor={euros(pendiente)}
        detalle={pendiente > 0 ? `${100 - pctCobrado}% sin cobrar` : 'todo al día'}
        tono={pendiente > 0 ? 'aviso' : 'bien'}
      />
    </FilaDeCifras>
  );
}
