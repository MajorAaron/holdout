// Holdout — /api/history
// Returns the last N post-mortems (species + relative time) for the Recent feed.
// Saga text is never returned. Region is omitted for privacy.

const tursoUrl = () => {
  const u = process.env.TURSO_DB_URL || '';
  return u.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
};

function relTime(iso) {
  if (!iso) return 'recently';
  const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - t.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

exports.handler = async (event) => {
  const limit = Math.min(parseInt(event.queryStringParameters?.limit || '5', 10) || 5, 20);

  try {
    const res = await fetch(`${tursoUrl()}/v2/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TURSO_DB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql: `SELECT species, created_at FROM holdout_postmortems ORDER BY id DESC LIMIT ${limit}` } },
          { type: 'close' }
        ]
      })
    });
    if (!res.ok) throw new Error(`Turso ${res.status}`);
    const data = await res.json();
    const rows = data.results?.[0]?.response?.result?.rows || [];
    const recent = rows.map(r => ({
      species: r[0]?.value,
      when: relTime(r[1]?.value)
    })).filter(x => x.species);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recent })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recent: [], note: 'history_unavailable' })
    };
  }
};
