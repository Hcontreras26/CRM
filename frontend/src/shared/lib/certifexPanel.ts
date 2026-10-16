import { SOLO_EN_PRUEBAS } from './soloEnPruebas';

/**
 * ¿Se ven las pantallas de Certifex (Matrículas → Certificaciones y Diplomas)?
 *
 * Es un interruptor de CONFIGURACIÓN del frontal, como `VITE_BETA_MODE` o
 * `VITE_MODULOS_APAGADOS`: se lee al compilar (`npm run build`), así que cambiarlo pide
 * volver a construir el frontal de ese entorno.
 *
 *   VITE_CERTIFEX_PANEL=1   encendido (producción, cuando Certifex ya está enlazado)
 *   VITE_CERTIFEX_PANEL=0   apagado, también en pruebas
 *   (sin poner)             apagado en producción; encendido en local y en /testeo
 *
 * Solo enseña u oculta las pantallas. Lo que de verdad conecta es el `.env` del backend
 * (CERTIFEX_API_URL, CERTIFEX_CRM_CLAVE, CERTIFEX_WEBHOOK_SECRETO): con el panel
 * encendido y el backend sin configurar, la pantalla dice «Certifex no está conectado».
 * Guía de enlace: docs/README.md, «Certifex: enlace en producción».
 */
const valor = String(import.meta.env.VITE_CERTIFEX_PANEL ?? '').trim().toLowerCase();

export const CERTIFEX_PANEL: boolean = ['1', 'true', 'si', 'sí'].includes(valor)
  ? true
  : ['0', 'false', 'no'].includes(valor)
    ? false
    : SOLO_EN_PRUEBAS;
