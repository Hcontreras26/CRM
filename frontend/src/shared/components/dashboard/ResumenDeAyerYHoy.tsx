import { useEffect, useState } from 'react';
import { getResumenDelDia, type DiaDelResumen } from '@/modules/reports/api/resumenDelDia.api';

/**
 * «Ayer y hoy», con datos (#130).
 *
 * Diego lo subrayo en el ticket: «pero datos, no algo con IA». Cuatro numeros
 * que se pueden comprobar, y que salen de las mismas definiciones que Reportes
 * —lo garantiza `resumenCuadraConReportes.test.js`—, porque dos pantallas que
 * cuentan lo mismo y dicen distinto no las cree nadie.
 *
 * Va aparte de `DashboardPage` a proposito: Fabian esta pasando el CRM a sus
 * primitivas (#78/#79) y el dashboard es la pantalla que mas le toca. Asi, su
 * rediseño cambia el envoltorio y esto sigue sirviendo los mismos numeros.
 */

/** Las cuatro filas, en el orden del ticket. «Sin tocar» va la ultima porque es
 *  la que duele: se lee despues de haber visto lo que entro. */
const FILAS: { clave: keyof Omit<DiaDelResumen, 'dia'>; rotulo: string; duele?: boolean }[] = [
  { clave: 'leads', rotulo: 'Leads' },
  { clave: 'contactados', rotulo: 'Contactados' },
  { clave: 'ventas', rotulo: 'Ventas' },
  { clave: 'sin_tocar', rotulo: 'Sin tocar', duele: true },
];

export default function ResumenDeAyerYHoy({ projectIds }: { projectIds: number[] }) {
  const [dias, setDias] = useState<DiaDelResumen[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setFallo(false);
    getResumenDelDia(projectIds)
      .then((d) => { if (vivo) setDias(d); })
      .catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [projectIds?.join(',')]);

  // Callado si falla: es un bloque de apoyo, y tumbar el dashboard entero por
  // no poder contar los leads de ayer seria peor que no enseñarlos.
  if (fallo || !dias) return null;

  const de = (dia: 'ayer' | 'hoy') => dias.find((d) => d.dia === dia);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="font-semibold text-base">Ayer y hoy</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Lo que entro y lo que se hizo. Los mismos numeros que Reportes.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-medium pb-1.5" scope="col">&nbsp;</th>
            <th className="text-right font-medium pb-1.5 w-20" scope="col">Ayer</th>
            <th className="text-right font-medium pb-1.5 w-20" scope="col">Hoy</th>
          </tr>
        </thead>
        <tbody>
          {FILAS.map(({ clave, rotulo, duele }) => {
            const hoy = Number(de('hoy')?.[clave] ?? 0);
            return (
              <tr key={clave} className="border-t border-border">
                <th scope="row" className="text-left font-normal py-1.5">{rotulo}</th>
                <td className="text-right tabular-nums py-1.5 text-muted-foreground">
                  {Number(de('ayer')?.[clave] ?? 0)}
                </td>
                <td
                  className={`text-right tabular-nums py-1.5 font-medium ${
                    duele && hoy > 0 ? 'text-orange-600 dark:text-orange-400' : ''
                  }`}
                >
                  {hoy}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
