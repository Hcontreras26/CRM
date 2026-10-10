import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowClockwise, ArrowCounterClockwise, ClockCounterClockwise, CurrencyEur, FileText, Receipt } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import usePermission from '@/shared/hooks/usePermission';
import EmptyState from '@/shared/components/ui/EmptyState';
import { Button } from '@/shared/components/ui/button';
import Select from '@/shared/components/ui/Select';
import { inputClass } from '@/shared/lib/ui';
import {
  ESTADO, FORMA_PAGO_ES, diaDelPago, empresaCorta, euros, facturasColaboradorApi, fechaHora, primeraMayuscula,
  type CosteDeCampus, type EmpresaDelGrupo, type EstadoFactura, type FacturaDelMes, type VistaDeFacturas,
} from '../api/facturasColaborador.api';
import { DeshacerPagoDialog, PagarDialog, RegistroDialog, esMes } from './DialogosFacturas';

/*
  Las pestañas de la segunda parte (#202, «Añadido 01/10 (tarde)»):
  Enviadas · Por pagar (con el total pendiente) · Pagadas · Historial,
  filtrables por colaborador, empresa, mes y estado. El estado de la factura
  (recibida, no cuadra, anulada) y el del pago (por pagar, pagada con su fecha)
  no se mezclan: van en columnas distintas.
*/

const errorDe = (err: any) => err?.data?.error || err?.message || 'Inténtalo de nuevo';
const VACIO: Record<VistaDeFacturas, string> = {
  enviadas: 'Ninguna factura enviada con estos filtros',
  por_pagar: 'Nada por pagar con estos filtros',
  pagadas: 'Ninguna pagada con estos filtros',
  historial: 'Nada con estos filtros',
};
/** «2026-09» → «Septiembre 2026». */
const nombreDelMes = (periodo: string) => primeraMayuscula(
  new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
).replace(' de ', ' ');

export default function ListaDeFacturas({ vista, empresas }: { vista: VistaDeFacturas; empresas: EmpresaDelGrupo[] }) {
  const [issuerId, setIssuerId] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [estado, setEstado] = useState('');
  const [colaboradores, setColaboradores] = useState<{ id: number; nombre: string }[]>([]);
  const [datos, setDatos] = useState<{ resumen: { total: number; importe: number; pendiente: number }; facturas: FacturaDelMes[] } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [pagar, setPagar] = useState<FacturaDelMes[] | null>(null);
  const [deshacer, setDeshacer] = useState<FacturaDelMes | null>(null);
  const [registro, setRegistro] = useState<FacturaDelMes | null>(null);
  const { can } = usePermission();
  const puedePagar = can('facturas_colaborador.pagar');

  // El filtro por colaborador: la lista la da «Colaboradores» (si no se puede pedir, no sale).
  useEffect(() => {
    facturasColaboradorApi.colaboradores({ estado: 'todos' })
      .then((r) => setColaboradores(r.data.map((c) => ({ id: c.id, nombre: c.nombre }))))
      .catch(() => setColaboradores([]));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await facturasColaboradorApi.vista({ vista, issuerId, colaboradorId, periodo, estado });
      setDatos(r.data);
      setMarcadas(new Set());
    } catch (err) {
      toast({ title: 'No se pudo cargar la lista', description: errorDe(err), variant: 'destructive' });
    } finally { setCargando(false); }
  }, [vista, issuerId, colaboradorId, periodo, estado]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function abrir(f: FacturaDelMes, que: 'archivo' | 'justificante') {
    try {
      const r = que === 'archivo' ? await facturasColaboradorApi.archivo(f.id) : await facturasColaboradorApi.justificante(f.id);
      window.open(r.data.url, '_blank', 'noopener');
    } catch (err) {
      toast({ title: `No se pudo abrir el ${que}`, description: errorDe(err), variant: 'destructive' });
    }
  }

  const cargarRegistro = useCallback(
    () => facturasColaboradorApi.registroDeLaFactura(registro!.id).then((r) => r.data),
    [registro],
  );

  // En «Por pagar» se marcan varias para pagarlas a la vez.
  const conCasillas = vista === 'por_pagar' && puedePagar;
  const filas = useMemo(() => datos?.facturas ?? [], [datos]);
  const todas = conCasillas && filas.length > 0 && filas.every((f) => marcadas.has(f.id));
  const alternar = (id: number) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const quien = (f: FacturaDelMes) => `${f.colaborador_nombre} · ${empresaCorta(f.empresa)} · ${nombreDelMes(f.periodo)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {colaboradores.length > 0 && (
          <div className="w-56 flex-none">
            <Select<string> value={colaboradorId} onChange={setColaboradorId} ariaLabel="Colaborador"
              options={[{ value: '', label: 'Todos los colaboradores' }, ...colaboradores.map((c) => ({ value: String(c.id), label: c.nombre }))]} />
          </div>
        )}
        <div className="w-56 flex-none">
          <Select<string> value={issuerId} onChange={setIssuerId} ariaLabel="Empresa"
            options={[{ value: '', label: 'Todas las empresas' }, ...empresas.map((e) => ({ value: String(e.id), label: e.razon_social }))]} />
        </div>
        <div className="w-48 flex-none">
          <input type="month" aria-label="Mes" value={periodo} title="Vacío: todos los meses"
            onChange={(e) => (e.target.value === '' || esMes(e.target.value)) && setPeriodo(e.target.value)} className={inputClass} />
        </div>
        <div className="w-44 flex-none">
          <Select<string> value={estado} onChange={setEstado} ariaLabel="Estado"
            options={[
              { value: '', label: 'Todos los estados' },
              ...(Object.keys(ESTADO) as EstadoFactura[]).map((e) => ({ value: e, label: ESTADO[e].rotulo })),
              { value: 'no_cuadra', label: 'No cuadra' },
            ]} />
        </div>
        {periodo && <Button variant="ghost" size="sm" onClick={() => setPeriodo('')}>Todos los meses</Button>}
        <Button variant="outline" size="sm" onClick={cargar} disabled={cargando} className="ml-auto">
          <ArrowClockwise size={13} weight="bold" className="mr-1.5" /> {cargando ? 'Cargando…' : 'Actualizar'}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {datos && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-border text-sm">
            <span>
              <strong>{datos.resumen.total} {datos.resumen.total === 1 ? 'factura' : 'facturas'}</strong>
              <span className="text-muted-foreground"> · {euros(datos.resumen.importe)}</span>
            </span>
            {vista === 'por_pagar' && (
              <span>Pendiente de pagar: <strong className="tabular-nums">{euros(datos.resumen.pendiente)}</strong></span>
            )}
            {conCasillas && marcadas.size > 0 && (
              <Button size="sm" className="ml-auto" onClick={() => setPagar(filas.filter((f) => marcadas.has(f.id)))}>
                <CurrencyEur size={13} className="mr-1.5" /> Marcar pagadas ({marcadas.size})
              </Button>
            )}
          </div>
        )}
        {filas.length === 0 ? (
          <EmptyState icon={FileText} title={cargando ? 'Cargando…' : VACIO[vista]} description="Prueba con otro mes, otra empresa u otro estado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-tabla">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {conCasillas && (
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox" aria-label="Marcarlas todas" checked={todas}
                        onChange={() => setMarcadas(todas ? new Set() : new Set(filas.map((f) => f.id)))} />
                    </th>
                  )}
                  <th className="px-2 py-2">Colaborador</th><th className="px-2 py-2">Empresa</th><th className="px-2 py-2">Mes</th>
                  <th className="px-2 py-2">Factura</th><th className="px-2 py-2 text-right">Importe</th><th className="px-2 py-2">Pago</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => (
                  <tr key={f.id} className={f.estado === 'anulada' ? 'opacity-60' : ''}>
                    {conCasillas && (
                      <td className="px-2 py-2">
                        <input type="checkbox" aria-label={`Marcar ${quien(f)}`} checked={marcadas.has(f.id)} onChange={() => alternar(f.id)} />
                      </td>
                    )}
                    <td className="px-2 py-2 font-medium">{f.colaborador_nombre}</td>
                    <td className="px-2 py-2 whitespace-nowrap" title={f.empresa}>{empresaCorta(f.empresa)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{nombreDelMes(f.periodo)}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${ESTADO[f.estado].clase}`}>{ESTADO[f.estado].rotulo}</span>
                      {f.cuadra === false && f.estado !== 'anulada' && (
                        <div className="mt-0.5">
                          <span title={`El desglose da ${euros(f.total)}`}
                            className="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap bg-warning-soft text-warning-soft-foreground">No cuadra</span>
                        </div>
                      )}
                      {f.numero_recepcion && (
                        <div className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">{f.numero_recepcion}<br />{fechaHora(f.subida_at)}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{euros(f.importe)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {f.pagada_at ? (
                        <>
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-success-soft text-success-soft-foreground">Pagada {diaDelPago(f.pagada_at)}</span>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {f.forma_pago ? FORMA_PAGO_ES[f.forma_pago] : ''}{f.referencia_pago ? ` · ref. ${f.referencia_pago}` : ''}
                          </div>
                        </>
                      ) : f.subida_at && !f.anulada_at ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-warning-soft text-warning-soft-foreground">Por pagar</span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5">
                        {f.nombre_original && (
                          <Button variant="ghost" size="sm" className="px-2" title="Ver el archivo" aria-label="Ver el archivo" onClick={() => abrir(f, 'archivo')}><FileText size={15} /></Button>
                        )}
                        <Button variant="ghost" size="sm" className="px-2" title="Ver el registro" aria-label="Ver el registro" onClick={() => setRegistro(f)}><ClockCounterClockwise size={15} /></Button>
                        {puedePagar && f.subida_at && !f.anulada_at && !f.pagada_at && (
                          <Button variant="ghost" size="sm" className="px-2" title="Marcar pagada" aria-label="Marcar pagada" onClick={() => setPagar([f])}><CurrencyEur size={15} /></Button>
                        )}
                        {f.pagada_at && f.con_justificante && (
                          <Button variant="ghost" size="sm" className="px-2" title="Ver el justificante" aria-label="Ver el justificante" onClick={() => abrir(f, 'justificante')}><Receipt size={15} /></Button>
                        )}
                        {puedePagar && f.pagada_at && (
                          <Button variant="ghost" size="sm" className="px-2" title="Deshacer el pago" aria-label="Deshacer el pago" onClick={() => setDeshacer(f)}><ArrowCounterClockwise size={15} /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagar && (
        <PagarDialog facturas={pagar.map((f) => ({ id: f.id, quien: quien(f), importe: f.importe }))}
          alCerrar={() => setPagar(null)} alGuardar={() => { setPagar(null); void cargar(); }} />
      )}
      {deshacer && (
        <DeshacerPagoDialog facturaId={deshacer.id} quien={quien(deshacer)}
          alCerrar={() => setDeshacer(null)} alGuardar={() => { setDeshacer(null); void cargar(); }} />
      )}
      {registro && (
        <RegistroDialog titulo={`Registro · ${registro.colaborador_nombre} · ${registro.empresa}`}
          cargar={cargarRegistro} alCerrar={() => setRegistro(null)} />
      )}
    </div>
  );
}

/**
 * Coste por campus del mes («Añadido 01/10 (tarde)»): con las líneas del
 * desglose, cuántas horas y cuánto dinero (la base, sin IVA ni IRPF) de
 * colaboradores se va a cada campus. Sin líneas en el mes, no se pinta.
 */
export function CostePorCampus({ periodo }: { periodo: string }) {
  const [filas, setFilas] = useState<CosteDeCampus[]>([]);
  useEffect(() => {
    facturasColaboradorApi.costePorCampus(periodo).then((r) => setFilas(r.data.campus)).catch(() => setFilas([]));
  }, [periodo]);
  if (!filas.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-4 py-2.5 border-b border-border text-sm">
        <strong>Coste por campus</strong>
        <span className="text-muted-foreground"> · base de los desgloses del mes, sin IVA ni IRPF</span>
      </div>
      <table className="w-full text-tabla">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-3 py-2">Campus</th><th className="px-3 py-2 text-right">Horas</th><th className="px-3 py-2 text-right">Importe</th><th className="px-3 py-2 text-right">Facturas</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filas.map((c) => (
            <tr key={c.project_id ?? 'sin'}>
              <td className="px-3 py-2">{c.campus ?? <span className="text-muted-foreground">Sin campus</span>}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.horas === null ? '—' : c.horas.toLocaleString('es-ES')}</td>
              <td className="px-3 py-2 text-right tabular-nums">{euros(c.importe)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{c.facturas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
