// Panel de asesoras: los NÚMEROS, no el listado.
//
// Por asesora y mes: cuántos leads le entraron, cuántas ventas cerró, su tasa
// de conversión, lo vendido y lo cobrado ESE mes.
//
// Cada número es pulsable: abre el detalle de los registros que lo componen,
// con buscador. Nació de dudar de los datos ("¿Daniela tiene 9 ventas nuevas o
// son cuotas?") — así se comprueba en el momento en vez de preguntar.
//
// Ojo con las tres fechas, que son distintas: los leads cuentan por su fecha de
// entrada, las ventas por su fecha de venta y los cobros por su fecha de cobro.
// Por eso una asesora puede cobrar en julio una venta que cerró en mayo.
//
// CIFRAS SEPARADAS (Diego, 19/10/2026). Diana salió la primera de la semana con
// 2.100 € cobrados y 0 ventas: era una venta del 30/09 cobrada el 16/10 y una
// cuota. No estaba mal contado —«eso no hay que acomodar, porque está en
// orden»—, pero la tabla no decía de dónde venía el dinero. Ahora:
//   · cada cabecera dice por qué fecha cuenta (y cambia con la base elegida);
//   · lo cobrado se parte en tres: de ventas del mes, de ventas anteriores (las
//     grandes, con su nº y su fecha) y cuotas — la regla está en
//     `claseDelCobro` (report.model.js) y el popup de cada parte la usa igual;
//   · Facturado y Pendiente van al lado;
//   · lo que no es de nadie sale como «Sin gestora», al final, y el «Total del
//     mes» suma todas las filas.
// Ninguna fecha ni ninguna base cambia; el Excel y el PDF siguen igual.
import { useEffect, useMemo, useState } from 'react';
import client from '@/shared/api/client';
import { useProjectContext } from '@/contexts/ProjectContext';
import { UsersThree, CaretDown, CaretRight } from '@phosphor-icons/react';
import DetalleMetricaDialog from '@/shared/components/DetalleMetricaDialog';
import { ponerAmbito } from '@/shared/lib/ambitoInforme';
import RankingGestoras from './RankingGestoras';

function fmtMoney(n) {
  // Con decimales: sin ellos los importes no cuadraban con las facturas.
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(n || 0));
}
function nombreMes(mes) {
  const [a, m] = String(mes).split('-');
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[Number(m) - 1] || mes} ${a}`;
}
/** «30/09» a partir de '2026-09-30'. */
function diaMes(iso) {
  const [, m, d] = String(iso || '').slice(0, 10).split('-');
  return d && m ? `${d}/${m}` : '';
}

// POR QUÉ FECHA CUENTA CADA COLUMNA, según la base. Solo se dice: no cambia
// ninguna (Diego, 19/10/2026). `corta` va bajo la cabecera; `larga`, en su
// tooltip.
const FECHAS = {
  cobro: {
    venta: { corta: 'por fecha de venta', larga: 'Por la fecha de la venta.' },
    cobro: { corta: 'por fecha de cobro', larga: 'Por la fecha en que entró el dinero.' },
  },
  factura: {
    venta: { corta: 'por su 1.ª factura', larga: 'Por la fecha de la factura de su primer cobro.' },
    cobro: { corta: 'por fecha de factura', larga: 'Por la fecha de la factura de cada cobro.' },
  },
};

// Un mes vacío, con todas las sumas que se pintan en su fila de total.
const MES_VACIO = (mes) => ({
  mes, asesoras: [], leads: 0, convertidos: 0, ventas: 0, vendido: 0, facturado: 0, pendiente: 0,
  cobrado: 0, cobradoPeriodo: 0, cobradoAnteriores: 0, cobradoEnCuotas: 0, cuotas: 0,
});

export default function AsesorasPanel({ from, to }) {
  const { activeProject, activeIssuerId } = useProjectContext();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);
  const [detalle, setDetalle] = useState(null);
  // Este panel es 'mes a mes': si sigue el filtro de arriba y ese filtro es una
  // semana, solo se ve un mes. Por eso trae su propio ambito, y por defecto
  // enseña el año entero.
  const [ambito, setAmbito] = useState('anio');
  // El mismo pago cae en meses distintos segun por donde se mire, asi que hay que
  // poder elegir: 'factura' es el de contabilidad y el que manda; 'cobro'
  // responde a cuanto dinero entro, que es otra pregunta.
  const [base, setBase] = useState('factura');
  const anio = new Date().getFullYear();
  const desde = ambito === 'anio' ? `${anio}-01-01` : from;
  const hasta = ambito === 'anio' ? new Date().toISOString().slice(0, 10) : to;
  const fechas = FECHAS[base] || FECHAS.cobro;

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const p = new URLSearchParams();
        ponerAmbito(p, { activeIssuerId, activeProject });
        if (desde) p.set('from', desde);
        if (hasta) p.set('to', hasta);
        // Solo se manda cuando no es el criterio por defecto.
        if (base === 'cobro') p.set('base', 'cobro');
        const r = await client.get(`/informes/asesoras-mes?${p.toString()}`);
        if (vivo) setFilas(r.success ? (r.data || []) : []);
      } catch {
        if (vivo) setFilas([]);
      } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [activeProject?.id, activeIssuerId, desde, hasta, base]);

  // Agrupado por mes, con el total del mes calculado sobre sus asesoras.
  const meses = useMemo(() => {
    const acc = {};
    for (const f of filas) {
      acc[f.mes] = acc[f.mes] || MES_VACIO(f.mes);
      const m = acc[f.mes];
      m.asesoras.push(f);
      m.leads += Number(f.leads || 0);
      m.convertidos += Number(f.leads_convertidos || 0);
      m.ventas += Number(f.ventas || 0);
      m.vendido += Number(f.vendido || 0);
      m.facturado += Number(f.facturado || 0);
      m.pendiente += Number(f.pendiente || 0);
      m.cobrado += Number(f.cobrado || 0);
      m.cobradoPeriodo += Number(f.cobrado_del_periodo || 0);
      m.cobradoAnteriores += Number(f.cobrado_anteriores || 0);
      m.cobradoEnCuotas += Number(f.cobrado_en_cuotas || 0);
      m.cuotas += Number(f.cobros_en_cuotas || 0);
    }
    // «Sin gestora» al final: no compite, pero cuenta en el total.
    for (const m of Object.values(acc)) {
      m.asesoras.sort((a, b) => (a.asesora_id == null) - (b.asesora_id == null));
    }
    return Object.values(acc).sort((a, b) => b.mes.localeCompare(a.mes));
  }, [filas]);

  // El mes más reciente arranca desplegado: es el que se mira a diario.
  useEffect(() => {
    if (meses.length && abierto === null) setAbierto(meses[0].mes);
  }, [meses, abierto]);

  // asesora === null -> todas las del mes.
  function abrir(tipo, mes, asesora) {
    setDetalle({
      consulta: {
        tipo,
        mes,
        ...(activeIssuerId ? { issuerId: activeIssuerId } : { projectId: activeProject?.id || '' }),
        asesoraId: asesora ? (asesora.asesora_id ?? 'sin') : '',
        // El popup cuenta con el mismo criterio que la tabla: si no, se ve 18
        // fuera y 16 dentro.
        base,
        // El rango del panel: las tres partes de lo cobrado deciden «del
        // periodo» con el mes RECORTADO al rango, como la fila.
        from: desde || '',
        to: hasta || '',
      },
      subtitulo: `${nombreMes(mes)} · ${asesora ? nombreDe(asesora) : 'todas las asesoras'}`,
    });
  }

  // Número pulsable. Si vale 0 no abre nada: no hay nada que enseñar.
  function Num({ tipo, mes, asesora, children, className = '', title = 'Ver los registros que hay detrás' }) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); abrir(tipo, mes, asesora); }}
        className={`tabular-nums underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:decoration-primary hover:text-primary transition-colors ${className}`}
        title={title}
      >
        {children}
      </button>
    );
  }

  // Una cabecera con su fecha debajo y la explicación entera en el tooltip.
  function Th({ children, fecha, title, left = false }) {
    return (
      <th className={`${left ? 'text-left' : 'text-right'} px-3 py-2 font-bold align-bottom`} title={title}>
        {children}
        {fecha && <span className="block text-[9px] font-normal normal-case">{fecha}</span>}
      </th>
    );
  }

  if (cargando) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Cargando datos de asesoras…</p>
      </section>
    );
  }
  if (!meses.length) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Asesoras</h2>
        <p className="text-xs text-muted-foreground mt-1">No hay datos en el rango seleccionado.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <UsersThree size={18} weight="regular" /> Asesoras, mes a mes
        </h2>
        <p className="text-xs text-muted-foreground">
          Leads que le entraron, ventas cerradas y dinero cobrado. Cada columna dice debajo por
          qué fecha cuenta: los leads, por fecha de entrada; lo facturado, por fecha de factura;
          las ventas y lo cobrado, según el botón de abajo. La tasa es leads convertidos sobre
          leads recibidos, ambos del periodo: quien solo pagó una mensualidad no cuenta como conversión.
        </p>
        <p className="text-xs text-primary font-medium mt-1">
          Pulsa cualquier número para ver los registros que hay detrás, con buscador.
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-success" /> de ventas del mes</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-warning" /> de ventas anteriores</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-info" /> cuotas (plan de pago o mensualidad)</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {[['anio', `Todo ${anio}`], ['rango', 'Solo el rango de arriba']].map(([k, etiqueta]) => (
              <button
                key={k}
                type="button"
                onClick={() => { setAmbito(k); setAbierto(null); }}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  ambito === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {[['cobro', 'Por cobro'], ['factura', 'Por factura']].map(([k, etiqueta]) => (
              <button
                key={k}
                type="button"
                onClick={() => { setBase(k); setAbierto(null); }}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  base === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          «Por cobro» cuenta el dinero en el mes en que entró. «Por factura», en el mes en que
          se emitió la factura, que es como cuadra contabilidad. Un mismo pago puede caer en un
          mes o en otro según cuál mires.
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Lo cobrado se parte en tres. <strong>De ventas del mes</strong>: cobros de ventas hechas
          ese mismo mes. <strong>De ventas anteriores</strong>: cobros de ventas de antes, sin las
          cuotas; los de 300 € o más salen con su nº de venta y su fecha. <strong>Cuotas</strong>:
          las de un plan de pago y las mensualidades (una cuota de una venta del mismo mes cuenta
          como de ventas del mes). <strong>Pendiente</strong>: lo que aún les falta por cobrar, a día
          de hoy, a las ventas del mes.
        </p>
      </div>

      <div className="space-y-2">
        {meses.map((m) => {
          const open = abierto === m.mes;
          // Tasa = de los leads que entraron ese mes, cuantos convirtieron.
          // No se divide por ventas: ahi se colaba quien solo pago una mensualidad.
          const tasa = m.leads > 0 ? (m.convertidos * 100 / m.leads) : 0;
          return (
            <div key={m.mes} className="rounded-lg border border-border overflow-hidden">
              {/* La cabecera es pulsable para plegar; los números de dentro
                  abren su detalle y paran la propagación. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setAbierto(open ? null : m.mes)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto(open ? null : m.mes); } }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 text-left cursor-pointer"
              >
                {open ? <CaretDown size={13} weight="bold" /> : <CaretRight size={13} weight="bold" />}
                <span className="font-semibold text-sm capitalize flex-1">{nombreMes(m.mes)}</span>
                <span className="hidden sm:inline text-[11px] text-muted-foreground">
                  <Num tipo="leads" mes={m.mes}>{m.leads.toLocaleString('es-ES')}</Num> leads
                </span>
                <span className="text-[11px] text-muted-foreground">
                  <Num tipo="ventas" mes={m.mes}>{m.ventas.toLocaleString('es-ES')}</Num> ventas
                </span>
                <span className="text-[11px] text-info">
                  <Num tipo="cobros-cuotas" mes={m.mes}>{m.cuotas.toLocaleString('es-ES')}</Num> cuotas
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{tasa.toFixed(2)}%</span>
                {/* De dónde viene lo cobrado del mes: ventas del mes, ventas
                    anteriores y cuotas. */}
                {m.cobrado > 0 && (
                  <span className="hidden md:flex h-2 w-28 rounded-full overflow-hidden bg-muted"
                    title={`${fmtMoney(m.cobradoPeriodo)} de ventas del mes · ${fmtMoney(m.cobradoAnteriores)} de ventas anteriores · ${fmtMoney(m.cobradoEnCuotas)} de cuotas`}>
                    <span className="bg-success" style={{ width: `${Math.max(0, m.cobradoPeriodo / m.cobrado) * 100}%` }} />
                    <span className="bg-warning" style={{ width: `${Math.max(0, m.cobradoAnteriores / m.cobrado) * 100}%` }} />
                    <span className="bg-info" style={{ width: `${Math.max(0, m.cobradoEnCuotas / m.cobrado) * 100}%` }} />
                  </span>
                )}
                <span className="text-sm font-bold text-success w-28 text-right">
                  <Num tipo="cobros" mes={m.mes}>{fmtMoney(m.cobrado)}</Num>
                </span>
              </div>

              {open && (
                <div className="border-t border-border p-3 sm:p-4">
                  {/* Quien va primero, de un vistazo. La tabla de abajo tiene
                      once columnas y lo dice todo, pero para saber el orden
                      hay que recorrerlas con el dedo. */}
                  <RankingGestoras asesoras={m.asesoras} mes={nombreMes(m.mes)} />
                </div>
              )}

              {open && (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <Th left>Asesora</Th>
                        <Th fecha="por fecha de entrada" title="Los leads, por su fecha de solicitud.">Leads recibidos</Th>
                        <Th fecha={fechas.venta.corta} title={`Las ventas del mes. ${fechas.venta.larga}`}>Convertidos</Th>
                        <Th fecha={fechas.venta.corta} title={`${fechas.venta.larga} Sin mensualidades ni ventas sin ningún cobro (proformas sin pagar); una compartida cuenta su parte.`}>Ventas</Th>
                        <Th title="Convertidos sobre leads recibidos.">Tasa</Th>
                        <Th fecha={fechas.venta.corta} title={`Importe de las ventas del mes. ${fechas.venta.larga}`}>Vendido</Th>
                        <Th fecha="por fecha de factura" title="Facturas y abonos emitidos ese mes, IVA incluido. Siempre por la fecha de emisión, sea cual sea el botón de arriba.">Facturado</Th>
                        <Th fecha={fechas.cobro.corta} title={`Los pagos registrados. ${fechas.cobro.larga} Es la suma de las tres columnas de la derecha.`}>Cobrado</Th>
                        <Th fecha="ventas del mes" title="Cobros de ventas cuya fecha de venta cae en ese mismo mes (dentro del rango).">· de ventas del mes</Th>
                        <Th fecha="ventas de antes" title="Cobros de ventas de meses anteriores, sin las cuotas. Los de 300 € o más salen con su nº de venta y su fecha.">· de ventas anteriores</Th>
                        <Th fecha="plan o mensualidad" title="Cobros que saldan una cuota de un plan de pago, o de una ficha marcada como mensualidad.">· cuotas</Th>
                        <Th fecha="de las ventas del mes" title="De las ventas del mes, su importe menos todo lo cobrado de ellas hasta hoy. Una venta cobrada de más cuenta 0.">Pendiente</Th>
                        <Th title="Vendido entre ventas.">Ticket medio</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.asesoras.map((a) => {
                        const sin = a.asesora_id == null;
                        const grandes = Array.isArray(a.anteriores_grandes) ? a.anteriores_grandes : [];
                        return (
                          <tr key={`${m.mes}-${a.asesora_id ?? 'sin'}`} className={`border-b border-border/50 last:border-0 ${sin ? 'text-muted-foreground' : ''}`}>
                            <td className={`px-3 py-2 font-medium ${sin ? 'italic' : ''}`}
                              title={sin ? 'Ventas sin vendedora de prospectos sin responsable: no compiten, pero cuentan en el total.' : undefined}>
                              {nombreDe(a)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Num tipo="leads" mes={m.mes} asesora={a}>{Number(a.leads).toLocaleString('es-ES')}</Num>
                            </td>
                            <td className="px-3 py-2 text-right text-success">
                              <Num tipo="leads-convertidos" mes={m.mes} asesora={a}>{Number(a.leads_convertidos || 0).toLocaleString('es-ES')}</Num>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              <Num tipo="ventas" mes={m.mes} asesora={a}>{Number(a.ventas || 0).toLocaleString('es-ES')}</Num>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(a.tasa_conversion).toFixed(2)}%</td>
                            <td className="px-3 py-2 text-right">
                              <Num tipo="ventas" mes={m.mes} asesora={a}>{fmtMoney(a.vendido)}</Num>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(a.facturado)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-success">
                              <Num tipo="cobros" mes={m.mes} asesora={a}>{fmtMoney(a.cobrado)}</Num>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Num tipo="cobros-periodo" mes={m.mes} asesora={a}>{fmtMoney(a.cobrado_del_periodo)}</Num>
                            </td>
                            <td className="px-3 py-2 text-right text-warning-soft-foreground">
                              <Num tipo="cobros-anteriores" mes={m.mes} asesora={a}>{fmtMoney(a.cobrado_anteriores)}</Num>
                              {grandes.map((g) => (
                                <span key={g.venta_id} className="block whitespace-nowrap text-[10px] text-muted-foreground">
                                  {fmtMoney(g.importe)} · venta #{g.venta_id} del {diaMes(g.fecha_venta)}
                                </span>
                              ))}
                            </td>
                            <td className="px-3 py-2 text-right text-info">
                              <Num tipo="cobros-cuotas" mes={m.mes} asesora={a}>{fmtMoney(a.cobrado_en_cuotas)}</Num>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Num tipo="ventas" mes={m.mes} asesora={a} title="Las ventas del mes, con lo cobrado de cada una">{fmtMoney(a.pendiente)}</Num>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtMoney(a.ticket_medio)}</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-muted/40 font-bold">
                        <td className="px-3 py-2"
                          title="Suma de todas las filas, «Sin gestora» incluida. Con «Por cobro» y «Solo el rango de arriba», los meses suman la tarjeta «Ingresos» de «Resumen del periodo» (no «Ventas cobradas», que es lo cobrado de las ventas del periodo, por fecha de venta); con «Por factura» un mismo cobro puede caer en otro mes. Con ventas compartidas puede haber un céntimo de redondeo.">
                          Total del mes
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Num tipo="leads" mes={m.mes}>{m.leads.toLocaleString('es-ES')}</Num>
                        </td>
                        <td className="px-3 py-2 text-right text-success">
                          <Num tipo="leads-convertidos" mes={m.mes}>{m.convertidos.toLocaleString('es-ES')}</Num>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Num tipo="ventas" mes={m.mes}>{m.ventas.toLocaleString('es-ES')}</Num>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{tasa.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right">
                          <Num tipo="ventas" mes={m.mes}>{fmtMoney(m.vendido)}</Num>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(m.facturado)}</td>
                        <td className="px-3 py-2 text-right text-success">
                          <Num tipo="cobros" mes={m.mes}>{fmtMoney(m.cobrado)}</Num>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Num tipo="cobros-periodo" mes={m.mes}>{fmtMoney(m.cobradoPeriodo)}</Num>
                        </td>
                        <td className="px-3 py-2 text-right text-warning-soft-foreground">
                          <Num tipo="cobros-anteriores" mes={m.mes}>{fmtMoney(m.cobradoAnteriores)}</Num>
                        </td>
                        <td className="px-3 py-2 text-right text-info">
                          <Num tipo="cobros-cuotas" mes={m.mes}>{fmtMoney(m.cobradoEnCuotas)}</Num>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Num tipo="ventas" mes={m.mes}>{fmtMoney(m.pendiente)}</Num>
                        </td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">
        El detalle venta a venta —cliente, contacto, importe y estado del cobro— también se
        descarga entero en «Ventas por asesora (detalle)», justo debajo.
      </p>

      <DetalleMetricaDialog
        abierto={!!detalle}
        onClose={() => setDetalle(null)}
        consulta={detalle?.consulta}
        subtitulo={detalle?.subtitulo}
      />
    </section>
  );
}

/** «Sin gestora» para lo que no es de nadie; si no, su nombre. */
function nombreDe(a) {
  return a.asesora_id == null ? 'Sin gestora' : a.asesora;
}
