// Holdout — /api/subscribe
// Captures emails for the Pro waitlist and writes to the shared subscribers table.

const tursoUrl = () => {
  const u = process.env.TURSO_DB_URL || '';
  return u.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
};

async function tursoExec(sql, args) {
  const res = await fetch(`${tursoUrl()}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TURSO_DB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args: args || [] } },
        { type: 'close' }
      ]
    })
  });
  if (!res.ok) throw new Error(`Turso ${res.status}`);
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const email = (body.email || '').toString().trim().toLowerCase();
  const source = (body.source || 'tool').toString().slice(0, 40);
  const slug = process.env.IDEA_SLUG || 'holdout';

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_email' }) };
  }

  try {
    await tursoExec(
      'INSERT OR IGNORE INTO subscribers (email, idea_slug, source, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
      [
        { type: 'text', value: email },
        { type: 'text', value: slug },
        { type: 'text', value: source }
      ]
    );
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'db_error', detail: String(e).slice(0, 200) })
    };
  }
};
