import * as service from './facturas.service.js';
import { AppError } from '../../shared/utils/AppError.js';
import {
  subidaSchema, delMesSchema, anularSchema, pagarSchema, deshacerPagoSchema, vistaSchema, costePorCampusSchema, zipSchema,
} from './facturas-colaborador.validation.js';

function validar(schema, datos) {
  const r = schema.safeParse(datos ?? {});
  if (!r.success) {
    throw new AppError(r.error.errors[0]?.message || 'Datos inválidos', 400, 'VALIDATION_ERROR');
  }
  return r.data;
}

function validarId(paramId) {
  const id = Number(paramId);
  if (!/^\d+$/.test(String(paramId)) || !Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    throw new AppError('ID inválido', 400, 'VALIDATION_ERROR');
  }
  return id;
}

// `req.ip`: con `trust proxy` (app.js) ya es la de verdad; `X-Forwarded-For` a
// pelo la puede escribir el cliente.
const ipDe = (req) => req.ip;

/** El código del enlace personal del colaborador, tal como llega en la dirección. */
function enlaceDe(req) {
  const t = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(t)) {
    throw new AppError('Este enlace no existe o ya no es válido', 404, 'NOT_FOUND');
  }
  return t;
}

const accion = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

// ─── El enlace (sin usuario) ───

export const verEnlace = accion(async (req, res) => {
  res.json({ success: true, data: await service.verEnlace(enlaceDe(req), ipDe(req)) });
});

export const subir = accion(async (req, res) => {
  const token = enlaceDe(req);
  const { importe, numero_factura: numeroFactura, horas, lineas } = validar(subidaSchema, req.body);
  const data = await service.subir(token, { archivo: req.file, importe, numeroFactura, desglose: { horas, lineas } }, ipDe(req));
  res.status(201).json({ success: true, data });
});

// ─── Administración ───
// Nunca se devuelve el enlace en claro: lo lleva el correo, y solo el correo.

export const delMes = accion(async (req, res) => {
  res.json({ success: true, data: await service.delMes(req.user, validar(delMesSchema, req.query)) });
});

// Las pestañas Enviadas, Por pagar, Pagadas e Historial, y el coste por campus (segunda parte).
export const deLaVista = accion(async (req, res) => {
  res.json({ success: true, data: await service.deLaVista(req.user, validar(vistaSchema, req.query)) });
});

export const costePorCampus = accion(async (req, res) => {
  const { periodo, issuerId } = validar(costePorCampusSchema, req.query);
  res.json({ success: true, data: await service.costePorCampus(req.user, periodo, issuerId) });
});

/** El ZIP del mes de una empresa, con su resumen.xlsx (segunda parte). */
export const zip = accion(async (req, res) => {
  const { periodo, issuerId } = validar(zipSchema, req.query);
  const z = await service.zipDelMes(req.user, periodo, issuerId);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${z.nombre}"`);
  res.send(z.buffer);
});

export const archivo = accion(async (req, res) => {
  res.json({ success: true, data: await service.urlDelArchivo(req.user, validarId(req.params.id)) });
});

export const anular = accion(async (req, res) => {
  const { motivo } = validar(anularSchema, req.body);
  const r = await service.anular(req.user, validarId(req.params.id), motivo, ipDe(req));
  res.json({ success: true, data: { anulada: r.anulada, nueva: r.nueva } });
});

export const reenviar = accion(async (req, res) => {
  const r = await service.reenviar(req.user, validarId(req.params.id), ipDe(req));
  res.json({ success: true, data: { id: r.id } });
});

export const registro = accion(async (req, res) => {
  res.json({ success: true, data: await service.registroDeFactura(req.user, validarId(req.params.id)) });
});

// ─── «Mi factura»: el colaborador con usuario, solo lo suyo ───

export const mias = accion(async (req, res) => {
  res.json({ success: true, data: await service.mias(req.user) });
});

export const subirMia = accion(async (req, res) => {
  const id = validarId(req.params.id);
  const { importe, numero_factura: numeroFactura, horas, lineas } = validar(subidaSchema, req.body);
  const data = await service.subirMia(req.user, id, { archivo: req.file, importe, numeroFactura, desglose: { horas, lineas } }, ipDe(req));
  res.status(201).json({ success: true, data });
});

export const archivoMio = accion(async (req, res) => {
  res.json({ success: true, data: await service.archivoMio(req.user, validarId(req.params.id)) });
});

// ─── El pago (segunda parte) ───

export const pagar = accion(async (req, res) => {
  const { ids, fecha, forma_pago: forma, referencia_pago: referencia } = validar(pagarSchema, req.body);
  const data = await service.pagar(req.user, { ids, fecha, forma, referencia, archivo: req.file }, ipDe(req));
  res.json({ success: true, data });
});

export const deshacerPago = accion(async (req, res) => {
  const { motivo } = validar(deshacerPagoSchema, req.body);
  const data = await service.deshacerPago(req.user, validarId(req.params.id), motivo, ipDe(req));
  res.json({ success: true, data });
});

export const justificante = accion(async (req, res) => {
  res.json({ success: true, data: await service.urlDelJustificante(req.user, validarId(req.params.id)) });
});
