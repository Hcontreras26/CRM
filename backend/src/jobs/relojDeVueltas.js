/**
 * Cuándo toca la próxima vuelta de una tarea de `vigilar()` (CRM#1210).
 *
 * `vigilar` programa una vuelta a los `alArrancarMs` de arrancar y, además, una
 * cada `cadaMs` desde el arranque (`setInterval`). La tarjeta de Integraciones
 * enseña «próxima vuelta»: es la más cercana de esas dos que aún no ha pasado.
 *
 * Vive en memoria del proceso, como el latido: se rehace al reiniciar.
 */
export function reloj(cadaMs, alArrancarMs = null) {
  let arranque = null;
  return {
    arranca(ahora = Date.now()) { arranque = ahora instanceof Date ? ahora.getTime() : ahora; },
    proxima(ahora = Date.now()) {
      if (arranque === null) return null;
      const t = ahora instanceof Date ? ahora.getTime() : ahora;
      const k = Math.floor((t - arranque) / cadaMs) + 1;
      let proxima = arranque + k * cadaMs;
      if (alArrancarMs !== null && arranque + alArrancarMs > t) proxima = Math.min(proxima, arranque + alArrancarMs);
      return new Date(proxima);
    },
  };
}
