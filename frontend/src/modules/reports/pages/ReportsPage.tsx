import { useEffect, useState } from 'react';
import RangoRapido from '@/shared/components/ui/RangoRapido';
import { useProjectContext } from '@/contexts/ProjectContext';
import client from '@/shared/api/client';
import PageHeader from '@/shared/components/ui/PageHeader';
import KpiCard from '@/shared/components/ui/KpiCard';
import EmptyState from '@/shared/components/ui/EmptyState';
import { toast } from '@/shared/hooks/useToast';
import {
  Users, CurrencyEur, Wallet, TrendUp, ChartBar, Package, Megaphone, UserList, DownloadSimple,
  FilePdf, ChartLineUp, Sparkle,
  Buildings,
} from '@phosphor-icons/react';
import ReportsIAView from '@/modules/reports-ia/components/ReportsIAView';
import { exportReportPDF } from '../lib/exportPdf';
import ReportsDownloadSection from '../components/ReportsDownloadSection';
import AsesorasPanel from '../components/AsesorasPanel';
import RankingsPanel from '@/shared/components/RankingsPanel';
import PanelResumen from '@/shared/components/PanelResumen';
import PanelSeguimiento from '@/shared/components/PanelSeguimiento';
import FeedbackEnReportes, { feedbackEnCsv } from '@/modules/feedback/components/FeedbackEnReportes';

function exportReportCSV(data, project, range, panel, seguimiento, feedback = null) {
  const sections = [];
  const sep = row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');

  sections.push(sep([`Reporte CRM — ${project || 'Todos los proyectos'}`]));
  sections.push(sep([`Período: ${range.from} → ${range.to}`]));
  sections.push('');

  sections.push(sep(['KPIs generales']));
  sections.push(sep(['Total prospectos', 'Tasa conversión', 'Ventas cobradas (€)', 'Por cobrar (€)']));
  sections.push(sep([data.leads.total, data.tasa_conversion + '%', Number(data.conversions.cobrado).toFixed(2), Number(data.conversions.por_cobrar).toFixed(2)]));
  sections.push('');

  sections.push(sep(['Pipeline de prospectos']));
  sections.push(sep(['Estado', 'Total']));
  const estados = { nuevo: 'Nuevo', por_contactar: 'Por contactar', contactado: 'Contactado', en_seguimiento: 'En seguimiento', convertido: 'Convertido', no_interesado: 'No interesado' };
  Object.entries(estados).forEach(([k, label]) => sections.push(sep([label, data.leads[k] || 0])));
  sections.push('');

  if ((data.leads_por_canal || []).length) {
    sections.push(sep(['Prospectos por canal']));
    sections.push(sep(['Canal', 'Total']));
    data.leads_por_canal.forEach(r => sections.push(sep([r.canal, r.total])));
    sections.push('');
  }

  if ((data.leads_por_gestor || []).length) {
    sections.push(sep(['Prospectos por gestor']));
    sections.push(sep(['Gestor', 'Total', 'Convertidos', 'Tasa (%)']));
    data.leads_por_gestor.forEach(r => {
      const tasa = r.total > 0 ? Math.round((r.convertidos / r.total) * 100) : 0;
      sections.push(sep([r.gestor, r.total, r.convertidos, tasa]));
    });
    sections.push('');
  }

  // Va justo detras de los KPI, en el mismo orden que la pantalla: lo que se
  // baja tiene que poder leerse al lado de lo que se ve.
  if ((data.por_proyecto || []).length > 1) {
    sections.push(sep(['Cuánto pone cada proyecto']));
    sections.push(sep(['Proyecto', 'Prospectos', 'Ventas', 'Facturado (€)', 'Cobrado (€)']));
    data.por_proyecto.forEach(f => sections.push(sep([
      f.nombre, f.leads, f.ventas, Number(f.facturado).toFixed(2), Number(f.cobrado).toFixed(2),
    ])));
    sections.push(sep([
      'TOTAL',
      data.por_proyecto.reduce((a, f) => a + Number(f.leads || 0), 0),
      data.por_proyecto.reduce((a, f) => a + Number(f.ventas || 0), 0),
      data.por_proyecto.reduce((a, f) => a + Number(f.facturado || 0), 0).toFixed(2),
      data.por_proyecto.reduce((a, f) => a + Number(f.cobrado || 0), 0).toFixed(2),
    ]));
    sections.push('');
  }

  if ((data.top_productos || []).length) {
    sections.push(sep(['Top productos']));
    sections.push(sep(['Producto', 'Ventas', 'Facturado (€)', 'Cobrado (€)']));
    data.top_productos.forEach(p => sections.push(sep([p.producto, p.ventas, Number(p.total).toFixed(2), Number(p.cobrado).toFixed(2)])));
    sections.push('');
  }

  // El Resumen del periodo y las metricas de seguimiento. Vienen de otros dos
  // endpoints, asi que los paneles los pasan hacia arriba (`onDatos`) en vez de
  // pedirlos por segunda vez.
  if (panel?.kpis) {
    const k = panel.kpis;
    const v = (x) => Number(k?.[x]?.value ?? 0);
    sections.push(sep(['Resumen del periodo']));
    sections.push(sep(['Métrica', 'Valor', 'Periodo anterior', 'Variación (%)']));
    for (const [campo, etiqueta] of [
      ['prospectos', 'Prospectos'], ['ventas', 'Ventas'], ['vendido', 'Vendido (€)'],
      ['ingresos', 'Ingresos — dinero que entró (€)'],
      ['ingresos_venta', '· de ventas (€)'], ['ingresos_cuotas', '· de cuotas (€)'],
      ['mensualidades', 'Cobros de cuotas'], ['tasa', 'Tasa conversión (%)'],
    ]) {
      if (!k[campo]) continue;
      sections.push(sep([etiqueta, v(campo), Number(k[campo].prev ?? 0), k[campo].trend ?? '—']));
    }
    sections.push('');
    if ((panel.serie || []).length) {
      sections.push(sep(['Resumen del periodo · serie']));
      sections.push(sep(['Periodo', 'Prospectos', 'Ventas', 'Vendido (€)', 'Ingresos (€)', 'Tasa (%)']));
      panel.serie.forEach(r => sections.push(sep([
        r.periodo, r.prospectos, r.ventas, Number(r.vendido).toFixed(2),
        Number(r.ingresos).toFixed(2), r.tasa,
      ])));
      sections.push('');
    }
  }

  if (seguimiento?.cohorte) {
    const co = seguimiento.cohorte;
    const ac = seguimiento.actividad || {};
    sections.push(sep(['Seguimiento y tiempos · de los que ENTRARON en el periodo']));
    sections.push(sep(['Métrica', 'Valor']));
    sections.push(sep(['Entraron', co.entraron]));
    sections.push(sep(['Con seguimiento', `${co.con_seguimiento} (${co.pct_con_seguimiento}%)`]));
    sections.push(sep(['Contactados (sin notas internas)', `${co.contactados} (${co.pct_contactados}%)`]));
    sections.push(sep(['Compraron', `${co.compraron} (${co.pct_compraron}%)`]));
    sections.push(sep(['Mediana hasta el 1er contacto (segundos)', co.mediana_primer_contacto_seg ?? '—']));
    sections.push(sep(['Mediana hasta la venta (días)', co.mediana_dias_venta ?? '—']));
    sections.push('');
    if ((co.embudo || []).length) {
      sections.push(sep(['Hasta qué seguimiento llega cada uno']));
      sections.push(sep(['Seguimiento', 'Llegaron', '% de los que entraron', 'Compraron', 'Tasa (%)', 'Desde el anterior (segundos)']));
      co.embudo.forEach(f => sections.push(sep([
        f.nivel, f.personas, f.pct, f.compraron, f.tasa, f.mediana_desde_anterior_seg ?? '—',
      ])));
      sections.push('');
    }
    sections.push(sep(['Trabajo hecho en el periodo']));
    sections.push(sep(['Contactos', 'Personas', 'Por persona', 'WhatsApp', 'Llamadas', 'Correos', 'Notas']));
    const t = ac.por_tipo || {};
    sections.push(sep([ac.toques, ac.personas, ac.toques_por_persona, t.whatsapp, t.llamada, t.email, t.nota]));
    // Escrito contra voz (#128). Va en su propia fila y no en la de arriba: no
    // son toques, son mensajes, y sumarlos con las llamadas seria mezclar dos
    // unidades en la misma linea.
    const vs = ac.whatsapp_saliente;
    if (vs) {
      sections.push('');
      sections.push(sep(['De lo que sale por WhatsApp']));
      sections.push(sep(['Escrito', 'De voz', '% de voz', 'Con archivo']));
      sections.push(sep([vs.escrito, vs.voz, vs.pct_voz, vs.adjunto]));
    }
    sections.push('');
  }

  if ((data.ingresos_mensual || []).length) {
    sections.push(sep(['Ingresos mensuales']));
    sections.push(sep(['Mes', 'Ingresos (€)']));
    data.ingresos_mensual.forEach(r => sections.push(sep([r.mes, Number(r.ingresos).toFixed(2)])));
  }

  // El feedback: las mismas cifras que su panel, con este rango y este ámbito.
  if (feedback?.totales) {
    sections.push('');
    sections.push(...feedbackEnCsv(feedback, sep));
  }

  const csv = sections.join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte-${project || 'crm'}-${range.from}_${range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';

import { ponerAmbito, sociedadSinCampus } from '@/shared/lib/ambitoInforme';
import { ATAJOS, rangoPorDefecto, atajoDe } from '@/shared/lib/rangosDeFecha';

function fmt(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n || 0));
}

const CANAL_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#ef4444', '#94a3b8'];
const PIPELINE_COLORS = {
  nuevo: '#3b82f6',
  por_contactar: '#f59e0b',
  contactado: '#10b981',
  en_seguimiento: '#eab308',
  convertido: '#8b5cf6',
  no_interesado: '#ef4444',
};


export default function ReportsPage() {
  const { activeProject, activeIssuerId, activeIssuer, projects } = useProjectContext();

  // ARRANCA EN LA SOCIEDAD, no en el campus (#125 · 5).
  //
  // Es local a esta pantalla a proposito: `switchIssuer` cambia el ambito de
  // TODO el CRM, y entrar en Reportes no puede dejarte en «todos los
  // proyectos» al salir. Aqui solo cambia lo que este informe pide.
  const [soloCampus, setSoloCampus] = useState(false);
  const socDelProyecto = activeProject?.sociedad_emisora_id
    ? Number(activeProject.sociedad_emisora_id) : null;
  // La sociedad elegida a mano manda sobre el arranque automatico.
  const issuerEfectivo = activeIssuerId ?? (soloCampus ? null : socDelProyecto);
  // Con una sociedad por medio, el proyecto no acota: acota la sociedad.
  const proyectoEfectivo = issuerEfectivo && !activeIssuerId ? { id: -1 } : activeProject;
  // Cuantos campus tiene, para poder decirlo sin recontar.
  const campusDeLaSociedad = issuerEfectivo
    ? (projects || []).filter((x) => Number(x.sociedad_emisora_id) === issuerEfectivo)
    : [];
  const nombreDeLaSociedad = activeIssuer?.nombre
    || campusDeLaSociedad[0]?.sociedad_nombre
    || 'la sociedad';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Arranca en el MES en curso. Antes era el ano entero, que es lo que casi
  // nadie quiere mirar al abrir: se venia a ver como va el mes y habia que
  // acotar a mano cada vez.
  const [range, setRange] = useState(() => rangoPorDefecto());
  const atajoActivo = atajoDe(range);
  const [tab, setTab] = useState('crm');
  // Lo que traen los dos paneles que piden sus datos aparte. Se guarda aqui
  // solo para que la descarga se lo pueda llevar: sin esto, el CSV enseñaba
  // los KPI y el desglose pero no el Resumen ni las metricas de seguimiento,
  // que es media pantalla.
  const [panelResumen, setPanelResumen] = useState(null);
  const [panelSeguimiento, setPanelSeguimiento] = useState(null);
  const [panelFeedback, setPanelFeedback] = useState(null);


  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const p = new URLSearchParams({ from: range.from, to: range.to });
        ponerAmbito(p, { activeIssuerId: issuerEfectivo, activeProject: proyectoEfectivo });
        const qs = p.toString();
        const res = await client.get(`/informes/overview?${qs}`);
        if (res.success) setData(res.data);
      } catch (err) {
        toast({ title: 'Error cargando reportes', description: err?.data?.error || err.message, variant: 'destructive' });
      } finally { setLoading(false); }
    }
    load();
  }, [activeProject?.id, issuerEfectivo, range.from, range.to]);

  // Una sociedad sin campus asignados da un informe vacio A PROPOSITO. Sin
  // decirlo, una tabla en blanco se lee como una averia y alguien acaba
  // buscando el fallo donde no esta.
  if (sociedadSinCampus(activeIssuer)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Reportes" subtitle={activeIssuer.nombre} />
        <EmptyState
          icon={Buildings}
          title={`${activeIssuer.nombre} no tiene campus asignados`}
          description="Por eso no hay cifras que enseñar. En cuanto se le asigne alguno, el informe las sumará todas."
        />
      </div>
    );
  }

  // Como se llama lo que se esta mirando. Con una sociedad elegida el informe
  // decia «Todos los proyectos» mientras enseñaba las cifras de CEDIA, que es
  // la peor combinacion posible: cifras de una cosa con el nombre de otra.
  const nombreAmbito = issuerEfectivo
    ? `${nombreDeLaSociedad} · ${campusDeLaSociedad.length} campus`
    : (activeProject?.nombre || 'Todos los proyectos');

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Reportes" subtitle="Cargando…" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted/50 rounded-md animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const pipelineData = [
    { estado: 'Nuevo', total: Number(data.leads.nuevo), color: PIPELINE_COLORS.nuevo },
    { estado: 'Por contactar', total: Number(data.leads.por_contactar), color: PIPELINE_COLORS.por_contactar },
    { estado: 'Contactado', total: Number(data.leads.contactado), color: PIPELINE_COLORS.contactado },
    { estado: 'En seguimiento', total: Number(data.leads.en_seguimiento), color: PIPELINE_COLORS.en_seguimiento },
    { estado: 'Convertido', total: Number(data.leads.convertido), color: PIPELINE_COLORS.convertido },
    { estado: 'No interesado', total: Number(data.leads.no_interesado), color: PIPELINE_COLORS.no_interesado },
  ];

  const isIaProject = activeProject?.type === 'ia';

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Reportes"
        subtitle={nombreAmbito}
        actions={
          tab === 'crm' ? (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Los atajos por calendario. «La semana pasada» es la semana
                  pasada, de lunes a domingo — no los siete dias anteriores,
                  que pedidos un martes mezclan media semana con media de la
                  otra y no cuadran con lo que dice nadie. */}
              {/* Se puede bajar al campus, pero hay que pedirlo: el que
                  manda es el conjunto. Solo sale cuando hay mas de uno. */}
              {socDelProyecto && !activeIssuerId && campusDeLaSociedad.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSoloCampus((v) => !v)}
                  className={
                    'h-8 px-2.5 rounded-md border text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ' +
                    (soloCampus
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground')
                  }
                  title={soloCampus
                    ? `Ver ${nombreDeLaSociedad} entera`
                    : `Ver solo ${activeProject?.nombre}`}
                >
                  {soloCampus ? `Solo ${activeProject?.nombre}` : 'Solo este campus'}
                </button>
              )}
              <div className="inline-flex items-center gap-1 flex-wrap" role="group" aria-label="Periodos rapidos">
                {ATAJOS.map((a) => (
                  <button
                    key={a.clave}
                    type="button"
                    onClick={() => setRange(a.calcular(new Date()))}
                    aria-pressed={atajoActivo === a.clave}
                    className={
                      'h-8 px-2.5 rounded-md border text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ' +
                      (atajoActivo === a.clave
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground')
                    }
                  >
                    {a.etiqueta}
                  </button>
                ))}
              </div>
              <RangoRapido valor={range} alElegir={(r) => setRange(r)} />
              <input
                type="date"
                value={range.from}
                onChange={e => setRange({ ...range, from: e.target.value })}
                aria-label="Fecha desde"
                className="h-9 px-3 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-xs text-muted-foreground">hasta</span>
              <input
                type="date"
                value={range.to}
                onChange={e => setRange({ ...range, to: e.target.value })}
                aria-label="Fecha hasta"
                className="h-9 px-3 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {data && (
                <>
                  <button
                    type="button"
                    onClick={() => exportReportCSV(data, nombreAmbito, range, panelResumen, panelSeguimiento, panelFeedback)}
                    aria-label="Exportar reporte a CSV"
                    title="Exportar CSV"
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <DownloadSimple size={14} weight="bold" /> <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await exportReportPDF({ ...data, _panel: panelResumen, _seguimiento: panelSeguimiento }, nombreAmbito, range);
                      } catch (err) {
                        toast({ title: 'Error generando PDF', description: err?.message || 'Inesperado', variant: 'destructive' });
                      }
                    }}
                    aria-label="Exportar reporte a PDF"
                    title="Exportar PDF"
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <FilePdf size={14} weight="bold" /> <span className="hidden sm:inline">PDF</span>
                  </button>
                </>
              )}
            </div>
          ) : null
        }
      />

      {/* Tabs — solo mostrar Análisis IA si es proyecto IA */}
      {isIaProject && (
        <div className="flex border-b border-border" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'crm'}
            onClick={() => setTab('crm')}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${tab === 'crm' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <ChartLineUp size={14} /> Datos CRM
          </button>
          <button
            role="tab"
            aria-selected={tab === 'ia'}
            onClick={() => setTab('ia')}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${tab === 'ia' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Sparkle size={14} /> Análisis IA
          </button>
        </div>
      )}

      {tab === 'ia' && isIaProject && <ReportsIAView project={activeProject} />}

      {tab === 'crm' && <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Total prospectos" value={data.leads.total} />
        <KpiCard icon={TrendUp} label="Tasa conversión" value={`${data.tasa_conversion}%`} tone="success" />
        <KpiCard icon={CurrencyEur} label="Ventas cobradas" value={fmt(data.conversions.cobrado)} tone="success" />
        <KpiCard icon={Wallet} label="Por cobrar" value={fmt(data.conversions.por_cobrar)} tone="warning" />
      </div>
      {/* Que cuenta esta fila, escrito.
          La misma pantalla daba tres cifras de «ingresos» sin decir que cada
          una cuenta una cosa: aqui las ventas cerradas en el periodo, en
          «Resumen del periodo» el dinero que entro, y en «Asesoras» lo que
          diga su propio interruptor. Las tres pueden ser correctas a la vez;
          lo que no puede es no saberse cual es cual. */}
      <p className="text-xs text-muted-foreground -mt-1">
        Cuenta las <strong className="text-foreground">ventas cerradas en el periodo</strong>, por su fecha de
        venta. «Ventas cobradas» es lo que se ha cobrado <em>de esas</em> ventas — no el dinero que entró en el
        periodo, que es lo que mide «Resumen del periodo» más abajo.
      </p>

      {/* Cuanto pone cada campus (#120).
          Con una sociedad elegida, «82.395 EUR» no dice de donde salen. Solo
          aparece cuando el ambito abarca mas de un proyecto: con uno solo, la
          tabla seria una fila repitiendo el KPI de arriba. */}
      {(data.por_proyecto || []).length > 1 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Buildings size={16} /> Cuánto pone cada proyecto
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Proyecto</th>
                  <th className="py-2 px-3 font-medium text-right">Prospectos</th>
                  <th className="py-2 px-3 font-medium text-right">Ventas</th>
                  <th className="py-2 px-3 font-medium text-right">Facturado</th>
                  <th className="py-2 pl-3 font-medium text-right">Cobrado</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.por_proyecto.map((f) => (
                  <tr key={f.project_id} className="border-b border-border/50 last:border-0">
                    {/* Un campus sin ventas sale igual, con ceros y apagado: si
                        no apareciera se leeria como que no existe, y lo que
                        pasa es que no vendio. */}
                    <td className={'py-2 pr-3' + (Number(f.ventas) === 0 ? ' text-muted-foreground' : '')}>{f.nombre}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{Number(f.leads).toLocaleString('es-ES')}</td>
                    <td className="py-2 px-3 text-right">{Number(f.ventas).toLocaleString('es-ES')}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{fmt(f.facturado)}</td>
                    <td className="py-2 pl-3 text-right font-semibold">{fmt(f.cobrado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* El total va escrito para que se pueda comprobar contra los
                    KPI de arriba: si no cuadra, no se cree ninguno de los dos. */}
                <tr className="border-t-2 border-border font-semibold tabular-nums">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 px-3 text-right">{data.por_proyecto.reduce((a, f) => a + Number(f.leads || 0), 0).toLocaleString('es-ES')}</td>
                  <td className="py-2 px-3 text-right">{data.por_proyecto.reduce((a, f) => a + Number(f.ventas || 0), 0).toLocaleString('es-ES')}</td>
                  <td className="py-2 px-3 text-right">{fmt(data.por_proyecto.reduce((a, f) => a + Number(f.facturado || 0), 0))}</td>
                  <td className="py-2 pl-3 text-right">{fmt(data.por_proyecto.reduce((a, f) => a + Number(f.cobrado || 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* La tarta solo con los que han cobrado algo: un trozo de 0 EUR no
              se ve y solo ensucia la leyenda. Si no ha cobrado nadie, no hay
              tarta que pintar. */}
          {data.por_proyecto.some((f) => Number(f.cobrado) > 0) && (
            <div>
              <ResponsiveContainer width="100%" height={230} minHeight={200}>
                <PieChart>
                  <Pie
                    data={data.por_proyecto.filter((f) => Number(f.cobrado) > 0)}
                    dataKey="cobrado"
                    nameKey="nombre"
                    cx="50%" cy="45%" innerRadius={45} outerRadius={78} paddingAngle={2}
                  >
                    {data.por_proyecto.filter((f) => Number(f.cobrado) > 0).map((f, i) => (
                      <Cell key={f.project_id} fill={CANAL_COLORS[i % CANAL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={36} iconSize={9}
                    wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          </div>
        </div>
      )}

      <PanelSeguimiento projectId={proyectoEfectivo?.id} issuerId={issuerEfectivo}
        from={range.from} to={range.to} onDatos={setPanelSeguimiento} />

      {/* El mismo panel de resumen que el CRM hermano: KPIs comparados con el
          periodo anterior y la grafica con selector de serie. */}
      {/* AQUÍ ESTABA «De dónde vienen estas cifras», y se ha ido.
          Diego, 24/09: «en informes está esto duplicado, hay muchos datos
          duplicados y llamados varias veces».

          Era la misma tabla que «Cuánto pone cada proyecto», de arriba: mismas
          columnas, mismas cifras. Y la de arriba sale gratis --`por_proyecto`
          viene en la respuesta del informe-- mientras que esta pedía
          `/informes/overview` UNA VEZ POR CAMPUS: con CEDIA, siete peticiones
          para recomponer algo que ya estaba servido.

          Lo único suyo que no está arriba es el aviso de descuadre, que
          comparaba la suma de los campus con el cobrado de la sociedad. El
          componente sigue en el repo sin montar, por si se quiere recuperar esa
          comprobación dentro de la tabla que se queda. */}

      <PanelResumen
        projectId={activeProject?.id}
        issuerId={issuerEfectivo}
        projectName={nombreAmbito}
        from={range.from}
        to={range.to}
      onDatos={setPanelResumen} />

      {/* Descargable combinado prospectos + ventas (para análisis del owner) */}
      {/* Los numeros por asesora. El detalle se baja en la seccion de abajo. */}
      <AsesorasPanel from={range.from} to={range.to} />

      {/* Paises y formaciones: en pantalla, no solo descargables. */}
      <RankingsPanel from={range.from} to={range.to} />

      {/* Por qué no compran: las cifras de «Análisis → Feedback», con este rango y ámbito. */}
      <FeedbackEnReportes from={range.from} to={range.to} issuerId={issuerEfectivo}
        project={proyectoEfectivo} onDatos={setPanelFeedback} />

      <ReportsDownloadSection projectId={proyectoEfectivo?.id} issuerId={issuerEfectivo} projectName={nombreAmbito} from={range.from} to={range.to} />

      {/* AQUI ESTABA «Reportes disponibles», el catalogo de reportes PREVISTOS.
          No descargaba nada y repetia los temas de «Reportes descargables», que
          esta justo encima y si funciona. Diego, 28/09: «siguen saliendo varias
          tablas repetidas». */}

      {/* Pipeline de leads + ingresos mensual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><UserList size={16} /> Prospectos por estado</h3>
          {data.leads.total === 0 ? (
            <EmptyState icon={Users} title="Sin prospectos" description="No hay prospectos en el rango seleccionado." />
          ) : (
            <ResponsiveContainer width="100%" height={220} minHeight={200}>
              <BarChart data={pipelineData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="estado" stroke="#6b7280" fontSize={12} width={100} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {pipelineData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><ChartBar size={16} /> Ingresos mensuales (12 meses)</h3>
          {(data.ingresos_mensual || []).length === 0 ? (
            <EmptyState icon={CurrencyEur} title="Sin ingresos" description="No hay ingresos registrados." />
          ) : (
            <ResponsiveContainer width="100%" height={220} minHeight={200}>
              <LineChart data={data.ingresos_mensual} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" />
                <XAxis dataKey="mes" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v?.slice(5) || v} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${v/1000}k` : v} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Line type="monotone" dataKey="ingresos" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Por canal + por gestor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Megaphone size={16} /> Prospectos por canal</h3>
          {(data.leads_por_canal || []).length === 0 ? (
            <EmptyState icon={Megaphone} title="Sin datos" description="No hay prospectos clasificados por canal." />
          ) : (
            <ResponsiveContainer width="100%" height={220} minHeight={200}>
              <PieChart>
                <Pie data={data.leads_por_canal} dataKey="total" nameKey="canal" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {data.leads_por_canal.map((e, i) => <Cell key={i} fill={CANAL_COLORS[i % CANAL_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* AQUI ESTABA «Prospectos por gestor»: prospectos, convertidos y tasa por
            gestora, que es lo que ya da el panel «Asesoras» de arriba, mes a mes y
            con el detalle de cada numero. (28/09) */}
      </div>

      {/* AQUI ESTABA «Top productos por ventas»: el mismo ranking que
          «Formaciones más vendidas», en el panel de rankings de arriba. (28/09) */}
      </>}
    </div>
  );
}
