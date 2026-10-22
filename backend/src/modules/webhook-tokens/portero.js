import { AppError } from '../../shared/utils/AppError.js';
import * as model from './token.model.js';

/**
 * EL PORTERO DEL WEBHOOK PÚBLICO (#198): va delante de leer el envío.
 *
 * El envío puede pesar 25 MB (JSON con imágenes en texto, o archivos en
 * multipart) y se lee entero en memoria. Antes se leía primero y el token se
 * miraba después: con tokens inventados —cada uno con su propio límite por
 * minuto— unas decenas de envíos a la vez llenaban la memoria del servidor sin
 * tener ningún token de verdad. Ahora el token tiene que existir y estar activo
 * ANTES de leer nada; si no, 404.
 *
 * Sin límite por IP a propósito: es la pregunta 7 de Diego en
 * docs/PARIDAD-ENTRE-CRMS.md (los envíos de Make salen de las mismas IP y un
 * límite por IP podría frenar una ráfaga legítima de nueve campus), y la decide
 * él. El límite por token (60/min) sigue en token.routes.js.
 */
export async function porteroDelWebhook(req, _res, next) {
  try {
    const tok = await model.findByToken(req.params.token);
    if (!tok) throw new AppError('Token invalido o inactivo', 404, 'INVALID_TOKEN');
    req.webhookToken = tok;
    next();
  } catch (err) { next(err); }
}
