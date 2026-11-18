import { AppError } from '../../shared/utils/AppError.js';
import { tienePermiso } from '../../shared/middleware/permissions.js';
import { equipoComercialSchema } from './user.validation.js';
import { exigirPersonaDeSusCampus, campusDeLaLista } from './user.controller.js';
import * as equipo from './user.equipo.js';

// Lo que ve la pantalla: el equipo y si quien mira lo puede cambiar (lo decide
// el servidor, no la pantalla).
async function respuesta(req, id) {
  return {
    ...(await equipo.leerEquipo(id, { campus: await campusDeLaLista(req) })),
    puede_cambiar: await tienePermiso(req, 'equipos.gestionar'),
  };
}

function idDeLaRuta(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('ID invalido', 400, 'INVALID_ID');
  return id;
}

// GET /api/users/:id/equipo-comercial — las gestoras a su cargo y las que se le
// pueden poner. Lo ve quien puede ver usuarios (y solo de sus campus).
export async function ver(req, res, next) {
  try {
    const id = idDeLaRuta(req);
    await exigirPersonaDeSusCampus(req, id);
    res.json({ success: true, data: await respuesta(req, id) });
  } catch (err) { next(err); }
}

// PUT /api/users/:id/equipo-comercial { gestoraIds } — la lista entera, nueva.
// La ruta pide `equipos.gestionar` (de serie, solo el super admin).
export async function guardar(req, res, next) {
  try {
    const id = idDeLaRuta(req);
    const parsed = equipoComercialSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    // Nadie cambia su PROPIO equipo (QA del 09/11/2026), ni con
    // «equipos.gestionar»: sería ampliarse a sí misma lo que ve. Lo decide otra
    // persona.
    if (id === Number(req.user.userId)) {
      throw new AppError('Tu propio equipo te lo cambia otra persona', 403, 'EQUIPO_PROPIO');
    }
    await exigirPersonaDeSusCampus(req, id);
    await equipo.guardarEquipo(id, parsed.data.gestoraIds, { quienId: req.user.userId });
    res.json({ success: true, data: await respuesta(req, id) });
  } catch (err) { next(err); }
}
