import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ArrowsLeftRight, ArrowSquareOut, WebhooksLogo } from '@phosphor-icons/react';
import { useProjectContext } from '@/contexts/ProjectContext';
import usePermission from '@/shared/hooks/usePermission';
import { useProyectosDelAmbito } from '@/shared/hooks/useAmbito';
import { ponerAmbito, TODOS_LOS_PROYECTOS } from '@/shared/lib/ambitoInforme';
import { moduloEncendido } from '@/shared/lib/modulos';
import { formatDateTime } from '@/shared/lib/format';
import Card from '@/shared/components/ui/Card';
import PageHeader from '@/shared/components/ui/PageHeader';
import EmptyState from '@/shared/components/ui/EmptyState';
import StatusDot from '@/shared/components/ui/StatusDot';
import { rutaPermitida } from '@/shared/components/layout/Sidebar';
import { tipoDelMenu } from '@/shared/lib/proyectosIA';
import {
  GRUPOS, campusDelTipo, crearPedidor, enlaceDeFila, ordenarFilas, tiposVisibles,
  type Campus, type FilaWebhook, type TipoWebhook,
} from '../lib/resumen';

/** Peticiones a la vez entre todas las tarjetas. */
const A_LA_VEZ = 6;

/*
  Conexión › Webhooks › Resumen (#690). Todos los webhooks del ámbito de arriba
  —un campus, una empresa o «Todos»— agrupados por su función. Cada tarjeta
  dice qué hace, si entra o sale, de qué campus es, si está encendido, cuándo
  llegó o salió el último aviso y si falló, y lleva a la pantalla donde se
  configura. La lógica de qué se lee de cada uno está en ../lib/resumen.
*/

type Estado = { cargando: boolean; filas: FilaWebhook[]; error?: string };

export default function WebhooksResumenPage() {
  const { activeProject, activeIssuerId, activeIssuer, switchProject } = useProjectContext() as {
    activeProject: { id?: number | null; nombre?: string; modules?: Campus['modules']; sociedad_emisora_id?: number | null; type?: string | null } | null;
    activeIssuerId: number | null;
    activeIssuer: { nombre?: string } | null;
    switchProject?: (id: number) => void;
  };
  // `llevaEquipo`: quien lleva un equipo comercial ve las decisiones de
  // asignación recortadas a su equipo (#704).
  const { can, tieneRol, llevaEquipo } = usePermission();
  const gestionaConsultas = can('consultas.gestionar');
  const delAmbito = useProyectosDelAmbito<Campus & { sociedad_emisora_id?: number | null; type?: string | null }>();

  const campusFijo = !activeIssuerId && activeProject?.id && activeProject.id !== TODOS_LOS_PROYECTOS
    ? { id: activeProject.id, nombre: activeProject.nombre || '', modules: activeProject.modules, empresaId: activeProject.sociedad_emisora_id ?? null, tipo: tipoDelMenu(activeProject.type) }
    : null;
  const campus = useMemo<Campus[]>(
    () => (campusFijo ? [campusFijo] : delAmbito.map((c) => ({
      id: c.id, nombre: c.nombre, modules: c.modules, empresaId: c.sociedad_emisora_id ?? null, tipo: tipoDelMenu(c.type),
    }))),
    [campusFijo?.id, campusFijo?.nombre, campusFijo?.modules, campusFijo?.empresaId, campusFijo?.tipo, delAmbito], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nombreAmbito = activeIssuerId ? (activeIssuer?.nombre || 'esta empresa')
    : campusFijo ? (campusFijo.nombre || 'este campus') : 'todos los campus';

  // Un tipo cuyo módulo está apagado en todos los campus del ámbito (o que no
  // sale en su tipo de proyecto, `salvoTipo`) no sale.
  const porPermiso = useMemo(() => tiposVisibles(can, moduloEncendido, undefined, tieneRol), [can, tieneRol]);
  const tipos = useMemo(
    () => porPermiso.filter((t) => (!t.moduloCampus && !t.salvoTipo) || campusDelTipo(t, campus).length > 0),
    [porPermiso, campus],
  );
  const [estados, setEstados] = useState<Record<string, Estado>>({});

  // Los campus y sus módulos: si cambia cualquiera, se vuelve a pedir.
  // También su tipo: un campus que pasa a IA deja de pedir lo de Captación.
  const claveCampus = campus.map((c) => `${c.id}:${c.tipo || ''}:${JSON.stringify(c.modules || {})}`).join(',');
  useEffect(() => {
    let vivo = true;
    // Al cambiar de ámbito (o salir), lo pendiente se cancela: no se sigue
    // pidiendo lo de un ámbito que ya no se mira.
    const corte = new AbortController();
    const pedir = crearPedidor(A_LA_VEZ, corte.signal);
    const ambito = ponerAmbito(new URLSearchParams(), { activeIssuerId, activeProject });
    setEstados(Object.fromEntries(tipos.map((t) => [t.id, { cargando: true, filas: [] }])));
    for (const t of tipos) {
      t.cargar({ campus: campusDelTipo(t, campus), ambito, pedir, llevaEquipo, can })
        .then((filas) => { if (vivo) setEstados((e) => ({ ...e, [t.id]: { cargando: false, filas } })); })
        .catch((err: any) => {
          if (vivo) setEstados((e) => ({ ...e, [t.id]: { cargando: false, filas: [], error: err?.data?.error || 'No se pudo leer' } }));
        });
    }
    return () => { vivo = false; corte.abort(); };
    // `gestionaConsultas`: si cambia, se vuelve a pedir (decide si se lee el
    // estado del plugin de Moodle). `can` cambia en cada render y no sirve.
  }, [claveCampus, activeIssuerId, activeProject?.id, llevaEquipo, gestionaConsultas, tipos.map((t) => t.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // La ficha de un webhook es de un campus: con «Todos» o una empresa, el muro
  // pararía el enlace. Se elige arriba ese campus y se entra.
  const alAbrir = (fila: FilaWebhook) => {
    if (fila.campusId && !campusFijo && switchProject) switchProject(fila.campusId);
  };

  // Un ámbito sin campus (una empresa sin ellos, o mientras llegan): lo que se
  // ve depende de los campus, no del tipo de tarjeta. Antes solo salía si todas
  // las tarjetas visibles iban por módulo, o sea casi nunca, y se veía una
  // pantalla llena de «Ninguno en este ámbito» sin decir por qué.
  if (porPermiso.length && !campus.length) {
    return (
      <EmptyState
        icon={WebhooksLogo}
        title="Sin campus que mirar"
        description="El ámbito elegido arriba no tiene campus (o todavía se están cargando). Prueba con otro campus o empresa."
      />
    );
  }

  // Por qué no sale nada de lo que se puede ver, con TODAS sus causas: que venía
  // de Captación y hay campus IA (`salvoTipo`), que su módulo está apagado en
  // algún campus, o que sencillamente no hay ninguno.
  const sinModulo = (t: TipoWebhook) => !!t.moduloCampus && campus.some((c) => c.modules?.[t.moduloCampus!] === false);
  const enIA = (t: TipoWebhook) => !!t.salvoTipo && campus.some((c) => !!c.tipo && t.salvoTipo!.includes(c.tipo));
  const causas = [
    porPermiso.some(enIA) && 'lo que venía de Captación (webhooks de prospectos, Make, formularios) no existe en los proyectos IA',
    porPermiso.some(sinModulo) && 'algunos tienen su módulo apagado en estos campus',
  ].filter(Boolean) as string[];
  const porque = causas.length
    ? `${causas.join(', y ')}, o no hay ninguno.`.replace(/^./, (l) => l.toUpperCase())
    : 'No hay ninguno en estos campus.';
  const sinNadaQueVer = (
    <EmptyState
      icon={WebhooksLogo}
      title="Sin webhooks en estos campus"
      description={`${porque} Prueba con otro campus o empresa.`}
    />
  );

  if (!tipos.length) {
    // Por qué no hay nada: los permisos, o lo de arriba.
    return porPermiso.length ? sinNadaQueVer : (
      <EmptyState
        icon={WebhooksLogo}
        title="No tienes webhooks que ver"
        description="Ningún tipo de webhook está en tus permisos. Si lo necesitas, pídelo a quien gestiona los roles."
      />
    );
  }

  // Las pantallas relacionadas del pie, solo las que se pueden abrir. «Sus
  // avisos están arriba» solo si su tarjeta sale de verdad.
  // «Asignación de leads» sale en el pie con el mismo permiso que su tarjeta
  // (`webhooks_salientes.view`): quien la ve en el pie, ve sus avisos arriba.
  const relacionados = [
    { to: '/conexion/conectores', label: 'Conectores', detalle: 'mapeo de campos' },
    { to: '/prospectos/revision-duplicados', label: 'Revisión de duplicados', detalle: 'repetidos por webhook' },
    { to: '/conexion/asignacion-leads', label: 'Asignación de leads', detalle: 'sus avisos están arriba; se configura en su pantalla' },
  ].filter((r) => rutaPermitida(r.to, can));

  // Lo que falla y lo que no se pudo leer, por separado: un campus que no
  // contesta no es un webhook que falla.
  const fallan = Object.values(estados).reduce((n, e) => n + e.filas.filter((f) => f.fallo).length, 0);

  // Lo que solo sale si tiene algo (los tokens antiguos) no ocupa sitio vacío; si
  // no queda ninguna otra tarjeta, se dice por qué en vez de dejar la página en blanco.
  const seVe = (t: TipoWebhook) => !(t.ocultarSiVacio && estados[t.id] && !estados[t.id].cargando
    && !estados[t.id].error && !estados[t.id].filas.length);
  if (!tipos.some(seVe)) return sinNadaQueVer;
  const sinLeer = Object.values(estados).reduce((n, e) => n + (e.error ? 1 : 0) + e.filas.filter((f) => f.sinLeer && !f.fallo).length, 0);

  return (
    <div className="space-y-6 pb-8">
      {/* El subtítulo de la cabecera se recorta (`truncate`) y con un ámbito de
          nombre largo («CEDIA Investigación y Desarrollo SL») el «1 con fallos»
          del final no se veía. Los contadores van en las acciones, que no se
          recortan; el subtítulo, corto. */}
      <PageHeader
        title="Webhooks"
        subtitle={`Todos los de ${nombreAmbito}, por lo que hacen`}
        actions={(fallan > 0 || sinLeer > 0) ? (
          <span role="status" className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {fallan > 0 && (
              <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">{fallan} con fallos</span>
            )}
            {sinLeer > 0 && (
              <span className="rounded-full border border-warning/40 px-2 py-0.5 text-warning">{sinLeer} sin poder leer</span>
            )}
          </span>
        ) : null}
      />
      <p className="text-xs text-muted-foreground">Cada uno se configura en su pantalla: el enlace de su tarjeta.</p>

      {GRUPOS.map((g) => {
        const suyos = tipos.filter((t) => t.grupo === g.id && seVe(t));
        if (!suyos.length) return null;
        return (
          <section key={g.id} aria-labelledby={`grupo-${g.id}`} className="space-y-3">
            <div>
              <h2 id={`grupo-${g.id}`} className="text-base font-bold">{g.titulo}</h2>
              <p className="text-xs text-muted-foreground">{g.detalle}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {/* La `key` lleva el ámbito: al cambiarlo, cada tarjeta empieza de
                  cero (plegada), no con el «Ver los N» del ámbito anterior. */}
              {suyos.map((t) => (
                <TarjetaTipo
                  key={`${t.id}|${activeIssuerId ?? ''}|${activeProject?.id ?? ''}`}
                  tipo={t}
                  estado={estados[t.id]}
                  alAbrir={alAbrir}
                  conCampus={!!campusFijo}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Solo los que esa persona puede abrir (la misma regla que el menú): a
          soporte se le enseñaba «Asignación de leads (sus avisos están arriba)»
          sin poder abrirla ni ver su tarjeta (prueba por perfiles, 11/11). */}
      {relacionados.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Relacionado:{' '}
          {relacionados.map((r, i) => (
            <span key={r.to}>
              {i > 0 && ' · '}
              <Link to={r.to} className="text-primary hover:underline">{r.label}</Link> ({r.detalle})
            </span>
          ))}.
        </p>
      )}
    </div>
  );
}

/** Filas que se ven de entrada; el resto, al pulsar (formularios: pueden ser cientos). */
const A_LA_VISTA = 8;

function TarjetaTipo({ tipo, estado, alAbrir, conCampus }: {
  tipo: TipoWebhook; estado?: Estado; alAbrir: (f: FilaWebhook) => void; conCampus: boolean;
}) {
  const [todas, setTodas] = useState(false);
  const filas = estado ? ordenarFilas(estado.filas) : [];
  // Lo que falla va primero (`ordenarFilas`): recortar nunca esconde un fallo.
  const aLaVista = todas ? filas : filas.slice(0, Math.max(A_LA_VISTA, filas.filter((f) => f.fallo).length));
  const Flecha = tipo.direccion === 'entra' ? ArrowDownLeft : tipo.direccion === 'sale' ? ArrowUpRight : ArrowsLeftRight;
  const direccion = { entra: 'Entra al CRM', sale: 'Sale del CRM', ambos: 'Entra y sale' }[tipo.direccion];
  return (
    <Card className="flex flex-col gap-3" data-testid={`tipo-${tipo.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold leading-tight">{tipo.titulo}</h3>
          <p className="text-sm text-muted-foreground">{tipo.queHace}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-semibold">
          <Flecha size={12} weight="bold" aria-hidden />
          {direccion}
        </span>
      </div>

      {/* Para el lector de pantalla, solo el estado de la tarjeta, en una frase:
          con la lista entera dentro, al cargar se leían todas las filas de todas
          las tarjetas. */}
      <p className="sr-only" role="status" aria-live="polite">
        {`${tipo.titulo}: ${!estado || estado.cargando ? 'cargando'
          : estado.error ? 'no se pudo leer'
            : `${filas.length} ${filas.length === 1 ? 'webhook' : 'webhooks'}${filas.some((f) => f.fallo) ? `, ${filas.filter((f) => f.fallo).length} con fallos` : ''}`}`}
      </p>
      <div>
        {!estado || estado.cargando ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : estado.error ? (
          <p className="text-sm text-destructive">No se pudo leer: {estado.error}</p>
        ) : !filas.length ? (
          <p className="text-sm text-muted-foreground">Ninguno en este ámbito.</p>
        ) : (
          <>
            <ul className="divide-y divide-border text-sm">
              {aLaVista.map((f) => <FilaDeWebhook key={f.clave} fila={f} alAbrir={alAbrir} conCampus={conCampus} />)}
            </ul>
            {filas.length > aLaVista.length && (
              <button type="button" onClick={() => setTodas(true)} className="mt-1 text-xs font-semibold text-primary hover:underline">
                Ver los {filas.length} ({filas.length - aLaVista.length} más)
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{tipo.nota}</span>
        {/* Su pantalla es de un campus y no hay uno elegido: el muro pararía el
            enlace. Se dice qué hacer; cada fila ya entra eligiendo el suyo. */}
        {!tipo.enlace ? null : tipo.deUnCampus && !conCampus ? (
          <span className="text-muted-foreground">
            {filas.length ? 'Para configurarlo, pulsa uno o elige un campus arriba.' : 'Para configurarlo, elige un campus arriba.'}
          </span>
        ) : (
          <Link to={tipo.enlace} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            aria-label={`Configurar ${tipo.titulo}`}>
            Configurar <ArrowSquareOut size={12} aria-hidden />
          </Link>
        )}
      </div>
    </Card>
  );
}


function FilaDeWebhook({ fila, alAbrir, conCampus }: { fila: FilaWebhook; alAbrir: (f: FilaWebhook) => void; conCampus: boolean }) {
  const navigate = useNavigate();
  const estado = fila.activo === null ? null
    : <StatusDot tono={fila.activo ? 'success' : 'neutral'}>{fila.activo ? 'Activo' : 'Apagado'}</StatusDot>;
  const ultimo = fila.ultimo === undefined ? null
    : fila.ultimo ? `Último aviso: ${formatDateTime(fila.ultimo)}` : 'Sin avisos todavía';
  // Solo un clic normal elige el campus: Ctrl/Cmd/Mayús + clic o el botón
  // central abren otra pestaña, y no deben cambiar el selector de esta.
  const nombre = fila.enlace
    ? (
      <Link
        to={enlaceDeFila(fila, conCampus)}
        // Clic normal: elige el campus aquí y entra por la dirección LIMPIA. El
        // `?projectId=` del href es solo para abrir en otra pestaña; si se
        // quedara en esta, un F5 después de cambiar el selector volvería al
        // campus de la fila y borraría la empresa elegida.
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          alAbrir(fila);
          navigate(fila.enlace);
        }}
        className="font-semibold hover:underline"
      >
        {fila.nombre}
      </Link>
    )
    : <span className="font-semibold">{fila.nombre}</span>;
  const corto = fila.fallo && fila.fallo.length > 80 ? `${fila.fallo.slice(0, 80)}…` : fila.fallo;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="min-w-0 flex-1">
        {nombre}
        {fila.campus && <span className="text-muted-foreground"> · {fila.campus}</span>}
      </span>
      {estado}
      {ultimo && <span className="text-xs text-muted-foreground">{ultimo}</span>}
      {/* Lo que explica la fila (aclaraciones, avisos, fallos) va en su propia
          línea, debajo: en la misma, un texto largo dejaba el nombre en una
          columna de una palabra (Stripe sin firma, prueba manual del 10/11). */}
      {(fila.detalle || fila.sinLeer || fila.aviso || fila.fallo) && (
        <div className="flex basis-full flex-col gap-0.5 text-xs">
          {fila.detalle && <span className="text-muted-foreground">{fila.detalle}</span>}
          {fila.sinLeer && <span className="text-warning">{fila.sinLeer}</span>}
          {fila.aviso && <span className="text-warning">{fila.aviso}</span>}
          {/* El texto entero, para el lector de pantalla; el recortado, a la vista. */}
          {fila.fallo && (corto === fila.fallo ? (
            <StatusDot tono="danger" title={fila.fallo}>Falló: {fila.fallo}</StatusDot>
          ) : (
            <StatusDot tono="danger" title={fila.fallo}>
              <span aria-hidden>Falló: {corto}</span>
              <span className="sr-only">Falló: {fila.fallo}</span>
            </StatusDot>
          ))}
        </div>
      )}
    </li>
  );
}
