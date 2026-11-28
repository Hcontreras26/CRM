import type { Diploma, MotivoSinEnviar } from '../api/certifex.api';

/**
 * #1201 · Diplomas › Emitidos: «Enviar al alumno (n)» en lote.
 *
 * Como «Aprobar y emitir (n)» en Pendientes: de lo elegido, lo que no se puede enviar se queda
 * fuera y la barra dice cuántos y por qué. La regla es la del servidor (`motivoSinEnviar`,
 * backend/src/modules/certifex/certifex.envios.js), que es la que manda: esto solo lo dice
 * antes de pulsar. Lo ya enviado, lo revocado, lo revertido y lo emitido fuera del CRM se
 * reenvían, si hace falta, de uno en uno («Reenviar» en su fila). Lo que se aprobó y no salió
 * (correo apagado, error) sí entra: es volver a intentarlo.
 */

/** Por qué no entra en el lote; null = entra. */
export function motivoSinEnviar(d: Pick<Diploma, 'revocada' | 'anulada' | 'aviso' | 'emitidoEnCrm' | 'sinCorreo' | 'entregado'>): MotivoSinEnviar | null {
  if (d.revocada) return 'revocado';
  if (d.anulada) return 'anulado';
  if (d.aviso?.resultado === 'enviado') return 'ya_enviado';
  // Entregado sin aviso del CRM: lo mandó Certifex por su cuenta (su panel o su cola).
  if (d.entregado === true && !d.aviso) return 'entregado';
  // Un Certifex/CRM anterior no manda la marca: se da por hecho que es del CRM (como `delCrm`).
  if (d.emitidoEnCrm === false) return 'fuera_del_crm';
  if (d.sinCorreo) return 'sin_correo';
  return null;
}

/**
 * Lo más grande que se manda de una vez desde el panel: una página (50). El servidor acepta 10
 * por llamada (Certifex genera el PDF y manda un correo por cada uno, y Certifex#146 frena lo
 * que pide a Moodle), así que son hasta 5 tandas seguidas.
 */
export const TOPE_ENVIO_LOTE = 50;
/** Por llamada: lo mismo que `TANDA_AVISOS_LOTE` del servidor. */
export const TANDA_ENVIO_LOTE = 10;

type Cuenta = Partial<Record<MotivoSinEnviar, number>>;

/** Cuántos se quedan fuera, por motivo. */
export function contarFuera(ds: Parameters<typeof motivoSinEnviar>[0][]): Cuenta {
  const c: Cuenta = {};
  for (const d of ds) {
    const m = motivoSinEnviar(d);
    if (m) c[m] = (c[m] ?? 0) + 1;
  }
  return c;
}

/** En el orden en que se dicen. */
const ORDEN: MotivoSinEnviar[] = ['ya_enviado', 'entregado', 'sin_correo', 'fuera_del_crm', 'revocado', 'anulado', 'en_curso', 'no_encontrado'];
const ROTULO: Record<MotivoSinEnviar, [string, string]> = {
  ya_enviado: ['ya enviado', 'ya enviados'],
  entregado: ['ya entregado por Certifex', 'ya entregados por Certifex'],
  sin_correo: ['sin correo en la ficha', 'sin correo en la ficha'],
  fuera_del_crm: ['emitido fuera del CRM', 'emitidos fuera del CRM'],
  revocado: ['revocado', 'revocados'],
  anulado: ['revertido', 'revertidos'],
  en_curso: ['enviándose ya', 'enviándose ya'],
  no_encontrado: ['que Certifex no tiene', 'que Certifex no tiene'],
};

/**
 * Una tanda que falla sin respuesta clara (Certifex no contestó a tiempo, nginx cortó, la red):
 * puede que alguno sí haya salido. Se dice así, no «no responde», para que nadie lo reintente a
 * ciegas y lo mande dos veces (QA de la #1201). Un 4xx sí es claro: se enseña tal cual.
 */
export const TANDA_SIN_CONFIRMAR = 'Puede que algunos se hayan enviado: refresca la lista antes de volver a enviar.';
/**
 * Sin red, el navegador rechaza con «TypeError: Failed to fetch» (Chrome), «NetworkError…»
 * (Firefox) o «Load failed» (Safari), en inglés: se dice en castellano (QA en navegador).
 */
export const SIN_CONEXION = 'No hay conexión con el servidor: refresca la lista antes de volver a enviar.';
const ES_DE_RED = /failed to fetch|networkerror|load failed|network request failed/i;
export function errorDeTanda(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) return (e as Error).message || 'No se pudo enviar';
  if (typeof status !== 'number' && (e instanceof TypeError || ES_DE_RED.test(String((e as Error)?.message ?? '')))) return SIN_CONEXION;
  return TANDA_SIN_CONFIRMAR;
}

/** «2 ya enviados · 1 sin correo en la ficha»; vacío si no queda ninguno fuera. */
export function textoMotivos(c: Cuenta): string {
  return ORDEN.filter((m) => (c[m] ?? 0) > 0).map((m) => `${c[m]} ${ROTULO[m][c[m] === 1 ? 0 : 1]}`).join(' · ');
}

/** Lo que dice la barra: «3 se quedan fuera: 2 ya enviados · 1 sin correo en la ficha». */
export function textoFuera(c: Cuenta): string {
  const n = Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
  if (!n) return '';
  return `${n} ${n === 1 ? 'se queda' : 'se quedan'} fuera: ${textoMotivos(c)}`;
}
