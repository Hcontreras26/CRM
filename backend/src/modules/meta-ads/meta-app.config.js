import { query } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { appDeMeta } from '../../shared/services/metaTokens.service.js';

/**
 * DE DÓNDE SALE LA APP DE META Y LOS AJUSTES DE SUS TOKENS (CRM#1209).
 *
 * Primero lo que se puso en la pantalla (Meta Ads › Configuración › App de
 * Meta); si no hay nada, el `.env` del servidor, que queda de reserva mientras
 * convivan; y si tampoco, el valor de siempre. Cada lectura dice de dónde sale
 * (`origen`), para que la pantalla lo enseñe.
 *
 * Este fichero no importa nada de `meta-ads.service.js`: lo leen él y la tarea
 * de renovación, y así no hay importaciones en círculo.
 */

export const SERVICIO_APP = 'meta_app';

/** Lo que dice la pantalla, en castellano, cuando falta la app. */
export const FALTA_LA_APP = 'Falta la app de Meta: pon su ID y su secreto en Meta Ads › Configuración › App de Meta.';

export const POR_DEFECTO = Object.freeze({
  renovacion_activa: false,
  renovar_dias: 40,
  aviso_dias: 7,
  gasto_total_cada_horas: 12,
});

/** Qué variable del servidor hace de reserva para cada ajuste. */
export const VARIABLES = Object.freeze({
  renovacion_activa: 'META_TOKENS_RENOVACION_ACTIVA',
  renovar_dias: 'META_TOKENS_RENOVAR_DIAS',
  aviso_dias: 'META_TOKENS_AVISO_DIAS',
  gasto_total_cada_horas: 'META_GASTO_TOTAL_CADA_HORAS',
});

const enteroPositivo = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const siONo = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const t = String(v).trim().toLowerCase();
  return t === '1' || t === 'true';
};

/** El valor del `.env` de un ajuste, o null si no está. */
export function delServidor(clave, env = process.env) {
  const v = env[VARIABLES[clave]];
  return clave === 'renovacion_activa' ? siONo(v) : enteroPositivo(v);
}

/** La fila de ajustes, o null (sin migración o sin nada guardado). */
export async function filaDeAjustes() {
  try {
    const { rows } = await query(
      `SELECT a.*, u.nombre AS cambiado_por
         FROM meta_app_ajustes a
         LEFT JOIN users u ON u.id = a.updated_by
        WHERE a.id = 1`
    );
    return rows[0] || null;
  } catch (err) {
    // 42P01: la migración 341 aún no está. Se sigue con el servidor, como antes.
    if (err?.code !== '42P01') logger.warn({ err: err.message }, 'App de Meta: no se pudieron leer los ajustes');
    return null;
  }
}

/**
 * Los cuatro ajustes, cada uno `{ valor, origen }` con origen
 * 'pantalla' | 'servidor' | 'defecto'.
 */
export async function leerAjustes({ fila, env = process.env } = {}) {
  const f = fila === undefined ? await filaDeAjustes() : fila;
  const out = {};
  for (const clave of Object.keys(POR_DEFECTO)) {
    const enPantalla = f?.[clave];
    if (enPantalla !== null && enPantalla !== undefined) {
      out[clave] = { valor: enPantalla, origen: 'pantalla' };
      continue;
    }
    const enServidor = delServidor(clave, env);
    out[clave] = enServidor !== null
      ? { valor: enServidor, origen: 'servidor' }
      : { valor: POR_DEFECTO[clave], origen: 'defecto' };
  }
  return out;
}

/** Solo los valores: `{ renovacion_activa, renovar_dias, aviso_dias, gasto_total_cada_horas }`. */
export async function valoresDeAjustes(opciones) {
  const a = await leerAjustes(opciones);
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.valor]));
}

/** El JSON guardado → { appId, appSecret } (o null si no es una app de Meta). */
export function leerValorApp(texto) {
  try {
    const o = JSON.parse(String(texto || ''));
    const appId = String(o?.app_id || '').trim();
    const appSecret = String(o?.app_secret || '').trim();
    return appId && appSecret ? { appId, appSecret } : null;
  } catch {
    return null;
  }
}

/**
 * La app con la que se habla con Meta: `{ appId, appSecret, origen }`, con
 * origen 'pantalla' | 'servidor' | null (no hay ninguna).
 *
 * `leer` y `env` solo los cambian las pruebas.
 */
export async function appEnUso({ leer = getDecryptedValue, env = process.env, marcar = true } = {}) {
  try {
    const guardada = leerValorApp(await leer(SERVICIO_APP, null, { marcar, soloProduccion: true }));
    if (guardada) return { ...guardada, origen: 'pantalla' };
  } catch (err) {
    // Sin la migración (el enum no tiene `meta_app`) o sin poder descifrar: se
    // dice y se sigue con la del servidor.
    logger.warn({ err: err.message }, 'App de Meta: no se pudo leer la guardada');
  }
  const { appId, appSecret } = appDeMeta(env);
  if (appId && appSecret) return { appId, appSecret, origen: 'servidor' };
  return { appId: '', appSecret: '', origen: null };
}

/** Cada cuántas horas se vuelve a pedir a Meta el gasto de toda la vida. */
export async function horasGastoTotal() {
  return (await leerAjustes()).gasto_total_cada_horas.valor;
}
