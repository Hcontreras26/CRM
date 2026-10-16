import net from 'node:net';
import { lookup } from 'node:dns/promises';
import { revisarUrl, esIpPrivada } from './webhooks-salientes.validation.js';

/**
 * Un destino al que no se manda nada. No se reintenta: volver a probar dentro
 * de cinco minutos no va a cambiar que la URL apunte dentro de la casa.
 */
export class DestinoNoPermitido extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.permanente = true;
  }
}

/**
 * La última comprobación antes de enviar, ya con el DNS.
 *
 * Al guardar se mira la URL tal cual (`revisarUrl`): https, sin «localhost» y
 * sin IPs de dentro. Pero un nombre público puede resolver a una IP privada, y
 * eso solo se ve resolviéndolo. Se hace aquí, en cada envío, para que cambiar
 * el DNS después de guardar no sirva de atajo.
 *
 * Vive en su propio fichero para poder sustituirlo en las pruebas sin tocar la
 * red de verdad.
 */
export async function comprobarDestino(url) {
  const problema = revisarUrl(url);
  if (problema) throw new DestinoNoPermitido(problema);
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return;
  let direcciones;
  try {
    direcciones = await lookup(host, { all: true });
  } catch (err) {
    // Que el nombre no resuelva AHORA puede ser pasajero: este sí se reintenta.
    throw new Error(`No se encuentra el servidor ${host} (${err.code || err.message})`);
  }
  if (!direcciones.length) throw new Error(`No se encuentra el servidor ${host}`);
  if (direcciones.some((d) => esIpPrivada(d.address))) {
    throw new DestinoNoPermitido(`${host} apunta a una dirección de la red interna`);
  }
}
