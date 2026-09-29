import * as model from './chat.model.js';
import { query } from '../../shared/config/db.js';
import { AppError } from '../../shared/utils/AppError.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { logger } from '../../shared/utils/logger.js';
import * as gasto from '../../shared/services/gastoIA.service.js';

const RATE_LIMIT = parseInt(process.env.CHAT_MAX_MESSAGES_PER_HOUR || '20');
const MODELO = () => process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

async function getAnthropicKey(projectId = null) {
  try {
    if (projectId) {
      const v = await getDecryptedValue('anthropic', projectId);
      if (v) return v;
    }
    const g = await getDecryptedValue('anthropic', null);
    if (g) return g;
  } catch {}
  return process.env.ANTHROPIC_API_KEY || null;
}

async function buildSystemContext(projectId) {
  if (!projectId) return 'Eres un asistente CRM. Responde de forma concisa.';
  const { rows: pjRows } = await query(`SELECT nombre, type FROM projects WHERE id = $1`, [projectId]);
  const { rows: leadsRows } = await query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as ultimos30
       FROM leads WHERE project_id = $1`, [projectId]);
  const { rows: convRows } = await query(
    `SELECT COUNT(*) as total, COALESCE(SUM(importe_total),0) as facturado
       FROM conversions WHERE project_id = $1 AND fecha_conversion > NOW() - INTERVAL '30 days'`, [projectId]);
  const pj = pjRows[0] || {};
  return `Eres un analista CRM para el proyecto "${pj.nombre}" (tipo: ${pj.type}).
Datos rapidos (ultimos 30 dias):
- Leads totales en BD: ${leadsRows[0]?.total || 0}, nuevos ultimos 30d: ${leadsRows[0]?.ultimos30 || 0}
- Conversiones ultimos 30d: ${convRows[0]?.total || 0}, facturado: €${Number(convRows[0]?.facturado || 0).toFixed(2)}

Responde siempre en español, conciso, con datos concretos. Cuando el usuario pida un dato que no tienes, dilo abiertamente y sugiere donde mirar en el CRM.`;
}

// SSE wrapper helpers
function sseInit(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}
function sseSend(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

export async function chat(req, res, next) {
  try {
    const { message, projectId, conversationId } = req.body || {};
    if (!message) throw new AppError('message requerido', 400, 'VALIDATION_ERROR');
    // `ai_conversations.project_id` es NOT NULL, y aqui abajo se creaba la
    // conversacion con `projectId || null`: sin proyecto, el chat contestaba el
    // error de Postgres en crudo —«null value in column project_id violates
    // not-null constraint»— con un 500. Se dice antes y en castellano.
    //
    // Ademas el contexto que se le da al modelo sale ENTERO de un proyecto
    // (sus leads, sus conversiones): sin proyecto no habria nada que
    // consultar, asi que pedirlo no es una limitacion tecnica, es la pregunta.
    if (!projectId) {
      throw new AppError(
        'Elige un proyecto antes de preguntar: el chat responde sobre los datos de uno concreto.',
        400, 'PROJECT_REQUIRED'
      );
    }

    // Rate limit
    const used = await model.countUserMessagesLastHour(req.user.userId);
    if (used >= RATE_LIMIT) {
      throw new AppError(`Limite ${RATE_LIMIT} msg/hora alcanzado`, 429, 'RATE_LIMITED');
    }

    // Conversation
    let conv;
    if (conversationId) conv = await model.findConversation(conversationId);
    if (!conv) conv = await model.createConversation(projectId || null, req.user.userId, message.slice(0, 80));
    await model.addMessage({ conversation_id: conv.id, role: 'user', content: message });

    sseInit(res);
    sseSend(res, 'start', { messageId: conv.id });

    const apiKey = await getAnthropicKey(projectId);
    if (!apiKey) {
      const fallback = '⚠️ El chat IA no esta disponible aun. Falta configurar `ANTHROPIC_API_KEY` en Settings > APIs (proyecto) o en variables de entorno del servidor.';
      sseSend(res, 'delta', { content: fallback });
      await model.addMessage({ conversation_id: conv.id, role: 'assistant', content: fallback });
      sseSend(res, 'done', { messageId: conv.id, warning: 'NO_API_KEY' });
      res.end();
      return;
    }

    // El tope (#22) se mira ANTES de llamar, nunca despues: la llamada que se
    // pasa ya esta pagada cuando vuelve. Y se para diciendo por que — «avisar y
    // parar, no fallar en silencio», que es lo que pide el issue.
    const permiso = await gasto.compruebaAntesDeGastar();
    if (!permiso.permitido) {
      const aviso = `⚠️ ${permiso.motivo}`;
      sseSend(res, 'delta', { content: aviso });
      await model.addMessage({ conversation_id: conv.id, role: 'assistant', content: aviso });
      sseSend(res, 'done', {
        messageId: conv.id, warning: 'TOPE_AGOTADO', gasto: permiso.estado,
      });
      res.end();
      return;
    }

    // Llamar Anthropic con stream
    const system = await buildSystemContext(projectId);
    const history = await model.listMessages(conv.id);
    const messages = history.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));

    let fullContent = '';
    let inputTokens = 0; let outputTokens = 0;
    // La cache se cobra distinto (leer ~0.1x, escribir ~1.25x). Vienen en el
    // mismo `usage` que ya se estaba leyendo, asi que contarlas es gratis y sin
    // ellas la cuenta del mes se aleja de la factura.
    let cacheLectura = 0; let cacheEscritura = 0;

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
          max_tokens: 2048,
          system,
          messages,
          stream: true,
        }),
      });
      if (!upstream.ok) {
        const body = await upstream.text();
        throw new Error(`Anthropic ${upstream.status}: ${body.slice(0, 200)}`);
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              fullContent += evt.delta.text;
              sseSend(res, 'delta', { content: evt.delta.text });
            } else if (evt.type === 'message_delta' && evt.usage) {
              outputTokens = evt.usage.output_tokens || 0;
            } else if (evt.type === 'message_start' && evt.message?.usage) {
              inputTokens = evt.message.usage.input_tokens || 0;
              cacheLectura = evt.message.usage.cache_read_input_tokens || 0;
              cacheEscritura = evt.message.usage.cache_creation_input_tokens || 0;
            }
          } catch {}
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Claude SSE error');
      // Se apunta igual. Una respuesta que se corta a medias ya gasto los
      // tokens de entrada y Anthropic los cobra; si solo se apuntaran las que
      // salen bien, el contador iria por debajo de la factura.
      await gasto.registrar({
        projectId: projectId || null,
        userId: req.user.userId,
        origen: 'chat',
        modelo: MODELO(),
        entrada: inputTokens,
        salida: outputTokens,
        cacheLectura,
        cacheEscritura,
        fallo: String(err.message).slice(0, 300),
      });
      sseSend(res, 'delta', { content: `\n\n[Error consultando Claude: ${err.message}]` });
      sseSend(res, 'done', { messageId: conv.id, error: true });
      res.end();
      return;
    }

    await model.addMessage({
      conversation_id: conv.id,
      role: 'assistant',
      content: fullContent,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
    });

    await gasto.registrar({
      projectId: projectId || null,
      userId: req.user.userId,
      origen: 'chat',
      modelo: MODELO(),
      entrada: inputTokens,
      salida: outputTokens,
      cacheLectura,
      cacheEscritura,
    });
    // Se relee despues de apuntar: asi el aviso de «queda poco» cuenta ya la
    // respuesta que el usuario acaba de recibir, y no va siempre una tarde.
    const despues = await gasto.estado();

    sseSend(res, 'done', {
      messageId: conv.id,
      usage: { promptTokens: inputTokens, completionTokens: outputTokens },
      gasto: despues,
      warning: despues.cerca
        ? `Queda poco del tope de IA de este mes: ${despues.gastado} de ${despues.tope} USD.`
        : undefined,
    });
    res.end();
  } catch (err) { next(err); }
}

export async function listConversations(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 30`,
      [req.user.userId]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

export async function getMessages(req, res, next) {
  try {
    const conv = await model.findConversation(req.params.conversationId);
    if (!conv || conv.user_id !== req.user.userId) throw new AppError('No encontrada', 404, 'NOT_FOUND');
    const messages = await model.listMessages(conv.id);
    res.json({ success: true, data: { conversation: conv, messages } });
  } catch (err) { next(err); }
}

export async function status(req, res, next) {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId) : null;
    const apiKey = await getAnthropicKey(projectId);
    // El gasto va aqui y no en otra llamada: la pantalla pregunta «¿puedo
    // escribir ahora?», y la clave sin el tope no contesta esa pregunta —
    // se puede tener clave y estar agotado, y son avisos distintos.
    const gastoAhora = await gasto.estado();
    res.json({
      success: true,
      data: {
        api_configured: !!apiKey,
        rate_limit_per_hour: RATE_LIMIT,
        used_last_hour: await model.countUserMessagesLastHour(req.user.userId),
        gasto: gastoAhora,
        warning: apiKey ? null : 'ANTHROPIC_API_KEY no configurada. Configura en Settings > APIs.',
      },
    });
  } catch (err) { next(err); }
}
