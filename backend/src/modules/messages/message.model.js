import { query, getClient } from '../../shared/config/db.js';

export async function findDirectConversation(userA, userB) {
  const { rows } = await query(
    `SELECT c.id FROM conversations c
     WHERE c.type = 'direct'
       AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $1)
       AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $2)
     LIMIT 1`,
    [userA, userB],
  );
  return rows[0]?.id || null;
}

export async function createConversation(type, participantIds, leadId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO conversations (type, lead_id) VALUES ($1, $2) RETURNING *`,
      [type, leadId || null],
    );
    const conv = rows[0];
    for (const uid of participantIds) {
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)`,
        [conv.id, uid],
      );
    }
    await client.query('COMMIT');
    return conv;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function insertMessage(conversationId, senderId, body, referencedLeadId) {
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, sender_id, body, referenced_lead_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [conversationId, senderId, body, referencedLeadId || null],
  );
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
  return rows[0];
}

export async function getMessages(conversationId, { page, limit, after }) {
  const offset = (page - 1) * limit;
  let whereExtra = '';
  const params = [conversationId, limit, offset];

  if (after) {
    whereExtra = 'AND m.id > $4';
    params.push(after);
  }

  const { rows } = await query(
    `SELECT m.*, u.nombre AS sender_nombre, u.avatar_url AS sender_avatar
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1 ${whereExtra}
     ORDER BY m.created_at ASC
     LIMIT $2 OFFSET $3`,
    params,
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM messages WHERE conversation_id = $1`,
    [conversationId],
  );

  return { messages: rows, total: Number(countRows[0].count) };
}

export async function getConversationsForUser(userId, { page, limit }) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT c.*,
       (SELECT json_build_object('id', u2.id, 'nombre', u2.nombre, 'email', u2.email, 'avatar_url', u2.avatar_url)
        FROM conversation_participants cp2
        JOIN users u2 ON u2.id = cp2.user_id
        WHERE cp2.conversation_id = c.id AND cp2.user_id != $1
        LIMIT 1
       ) AS other_user,
       (SELECT json_build_object('body', lm.body, 'sender_id', lm.sender_id, 'created_at', lm.created_at)
        FROM messages lm
        WHERE lm.conversation_id = c.id
        ORDER BY lm.created_at DESC LIMIT 1
       ) AS last_message,
       (SELECT COUNT(*)
        FROM messages m2
        WHERE m2.conversation_id = c.id
          AND m2.created_at > cp.last_read_at
          AND m2.sender_id != $1
       )::int AS unread_count
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
     ORDER BY c.updated_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*) FROM conversation_participants WHERE user_id = $1`,
    [userId],
  );

  return { conversations: rows, total: Number(countRows[0].count) };
}

export async function getTotalUnreadCount(userId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(sub.cnt), 0)::int AS count FROM (
       SELECT COUNT(*) AS cnt
       FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = $1
       WHERE m.created_at > cp.last_read_at
         AND m.sender_id != $1
     ) sub`,
    [userId],
  );
  return rows[0].count;
}

export async function markConversationRead(conversationId, userId) {
  await query(
    `UPDATE conversation_participants SET last_read_at = NOW()
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
}

export async function getMessageById(msgId) {
  const { rows } = await query(`SELECT * FROM messages WHERE id = $1`, [msgId]);
  return rows[0] || null;
}

export async function deleteMessage(msgId) {
  await query(`DELETE FROM messages WHERE id = $1`, [msgId]);
}

export async function isParticipant(conversationId, userId) {
  const { rows } = await query(
    `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return rows.length > 0;
}

export async function getActiveUsers(search) {
  const params = [];
  let where = 'WHERE u.active = true';
  const termino = typeof search === 'string' ? search.trim() : '';
  if (termino) {
    where += ` AND (u.nombre ILIKE $1 OR u.email ILIKE $1)`;
    params.push(`%${termino}%`);
  }
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.role, u.avatar_url FROM users u ${where} ORDER BY u.nombre`,
    params,
  );
  return rows;
}
