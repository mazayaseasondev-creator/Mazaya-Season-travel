import { query } from './db.js';

// Record (and, in production, eventually deliver) an outbound message.
// Defensive: never throws, so a notification failure can't break a payment or
// booking flow that calls it.
export async function createNotification({ userId = null, channel, recipient = null, subject, body = '', status = 'sent' } = {}) {
  try {
    if (!recipient && userId) {
      const u = await query('select email, mobile from users where id = $1', [userId]);
      if (u.rows[0]) recipient = u.rows[0].email || u.rows[0].mobile;
    }
    if (!channel) channel = recipient && String(recipient).includes('@') ? 'email' : (recipient ? 'sms' : 'system');
    if (!subject) return null;
    const r = await query(
      `insert into notifications (user_id, channel, recipient, subject, body, status)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [userId, channel, recipient, subject, body, status],
    );
    return r.rows[0];
  } catch {
    return null;
  }
}

export async function listNotifications(status) {
  const params = [];
  let where = '';
  if (status) { params.push(String(status)); where = 'where status = $1'; }
  const r = await query(`select * from notifications ${where} order by created_at desc limit 200`, params);
  return r.rows.map((n) => ({
    id: n.id, channel: n.channel, recipient: n.recipient, subject: n.subject,
    body: n.body, status: n.status, createdAt: n.created_at,
  }));
}
