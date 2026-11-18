import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import { proyectosIAActivos } from '../../shared/config/soloEnPruebas.js';
import * as ctrl from './ia.controller.js';

const router = Router();
router.use(verifyToken);
// Estas dos ya estaban en producción antes del #44 y siguen siempre montadas:
// el «Monitor SaaS» del Dashboard y la pestaña Stripe de un proyecto IA leen
// `/metrics`, y `/gasto` es el tope de gasto de la IA del propio CRM (#22).
router.get('/metrics/:projectId', puede('ia.view'), ctrl.getMetrics);
router.get('/gasto', puede('ia.view'), ctrl.getGasto);

/*
  LO DEL #44, SOLO EN PRUEBAS (PR #386 y #387).

  Los cobros de un proyecto IA y su Supabase aún no están aprobados para
  producción. Como el tablero de tareas y las facturas de colaborador, con
  NODE_ENV=production no se montan —responden 404— salvo en /testeo o con
  PROYECTOS_IA_EN_PRODUCCION=1. Se decide al cargar, igual que en `app.js`.
*/
if (proyectosIAActivos()) {
  router.get('/cobros/:projectId', puede('ia.view'), ctrl.cobros);

  /*
    Lo que la app de IA guarda en su Supabase (#44).

    LAS TRES PIDEN LO MISMO, aunque una solo lea. `previo` no escribe nada, pero
    dice cuanto factura el proyecto y desde cuando: es la cifra de negocio de una
    marca entera, no un detalle tecnico. Dejarla detras de `verifyToken` a secas
    significaba que cualquier gestora podia pedirla por URL, mientras la
    credencial con la que se obtiene vive en un modulo que solo abren los
    administradores.

    Las tres piden `ia.importar` (solo administracion, #423): el catalogo dice quien
    entra y no entra nadie mas (#80).
  */
  router.get('/supabase/previo/:projectId', puede('ia.importar'), ctrl.previoSupabase);
  router.post('/supabase/importar/:projectId', puede('ia.importar'), ctrl.importarSupabase);
  // Quitar las que eran pruebas. Borra ventas, asi que solo admin/superadmin
  // y con `?soloProbar=true` para verlo antes.
  router.post('/supabase/quitar-pruebas/:projectId', puede('ia.importar'), ctrl.quitarPruebasSupabase);
}
export default router;
