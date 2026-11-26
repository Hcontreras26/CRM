/**
 * La clave JSON de una cuenta de servicio de Google (CRM#1099), comprobada en el
 * navegador ANTES de mandarla: así se dice al momento si se ha subido otra cosa
 * (lo más común, el JSON del cliente OAuth). El servidor vuelve a comprobarlo.
 *
 * De aquí solo sale el correo de la cuenta para enseñarlo; el texto entero se
 * guarda aparte para mandarlo y no se pinta nunca.
 */
export type LecturaCuenta =
  | { ok: true; correo: string; texto: string }
  | { ok: false; error: string };

export function leerJsonCuenta(texto: string): LecturaCuenta {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(String(texto || '').trim());
  } catch {
    return { ok: false, error: 'No es un JSON válido. Sube el archivo .json tal cual lo descargaste de Google Cloud.' };
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    return { ok: false, error: 'El JSON no es la clave de una cuenta de servicio.' };
  }
  if (o.installed || o.web) {
    return { ok: false, error: 'Ese JSON es de un «ID de cliente de OAuth», no de una cuenta de servicio.' };
  }
  if (o.type !== 'service_account') {
    return { ok: false, error: `El JSON no es de una cuenta de servicio (su «type» debe ser «service_account»).` };
  }
  const faltan = ['client_email', 'private_key'].filter((k) => typeof o[k] !== 'string' || !(o[k] as string).trim());
  if (faltan.length) return { ok: false, error: `Al JSON le falta: ${faltan.join(', ')}.` };
  if (!String(o.private_key).includes('PRIVATE KEY')) {
    return { ok: false, error: 'La clave privada del JSON está incompleta. Descarga una clave nueva y súbela entera.' };
  }
  return { ok: true, correo: String(o.client_email).trim(), texto: String(texto).trim() };
}

/** «properties/123», «12 3» → «123»: solo los números. */
export const soloNumeros = (v: string) => String(v || '').replace(/^\s*properties\//i, '').replace(/\D/g, '');
