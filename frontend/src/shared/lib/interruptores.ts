import client from '@/shared/api/client';
import type { Interruptor } from '@/shared/lib/recorridosDePrueba';

/**
 * ¿Está encendida esta función en el servidor? (CRM#856)
 *
 * Cada interruptor del .env del backend ya tiene su forma de decirlo; aquí se
 * pregunta a la que corresponde. Si no contesta (sin red, sin el módulo), se
 * toma como APAGADA: mejor decir «la enciende Diego» que abrir un recorrido
 * por una pantalla vacía.
 */
type Respuesta<T> = { success?: boolean; data?: T };

const PREGUNTAS: Record<Interruptor, () => Promise<boolean>> = {
  FACTURA_AUTOMATICA_ACTIVA: async () =>
    !!((await client.get('/factura-automatica/interruptor')) as Respuesta<{ activa: boolean }>).data?.activa,
  FACTURACION_AUDITORIA_ACTIVA: async () =>
    !!((await client.get('/facturacion-auditoria/estado')) as Respuesta<{ activa: boolean }>).data?.activa,
  PAYPAL_COBROS_ACTIVO: async () =>
    !!((await client.get('/cobros-externos/estado')) as Respuesta<{ paypal: boolean }>).data?.paypal,
  SANTANDER_EXTRACTOS_ACTIVO: async () =>
    !!((await client.get('/cobros-externos/estado')) as Respuesta<{ santander: boolean }>).data?.santander,
  // Apagado, /monitask/estado contesta 404 (y cae en el catch).
  MONITASK_ACTIVO: async () =>
    !!((await client.get('/monitask/estado')) as Respuesta<unknown>).data,
  BREVO_BLOQUEADOS_ACTIVO: async () =>
    !!((await client.get('/users/brevo-bloqueos')) as Respuesta<{ activo: boolean }>).data?.activo,
};

export async function estaEncendido(interruptor: Interruptor): Promise<boolean> {
  try {
    return await PREGUNTAS[interruptor]();
  } catch {
    return false;
  }
}
