export class AppError extends Error {
  // `data`, opcional: lo que la pantalla necesita para ofrecer una salida, no
  // solo el motivo. Por ejemplo, el campus de una formacion cuando el tutor no
  // esta en el (#384): con el, el frontal pregunta «¿la añado a ese campus?» en
  // vez de enseñar un «no» sin salida. Viaja en la respuesta como `data`.
  constructor(message, statusCode, code, data) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    if (data !== undefined) this.data = data;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
