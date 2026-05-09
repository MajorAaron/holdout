// Holdout — /api/analyze
// Generates a post-mortem essay + 3 next-attempt suggestions for a birder's nemesis species.
// Uses Gemini 2.0 Flash. Persists species (not saga) to Turso for the Recent feed.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const tursoUrl = () => {
  const u = process.env.TURSO_DB_URL || '';
  return u.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
};

async function tursoExec(sql, args) {
  const url = `${tursoUrl()}/v2/pipeline`;
  const body = {
    requests: [
      { type: 'execute', stmt: { sql, args: args || [] } },
      { type: 'close' }
    ]
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TURSO_DB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Turso ${res.status}`);
  return res.json();
}

const SYSTEM_PROMPT = `You are Holdout, the in-house essayist for serious birders. Birders submit a "nemesis bird" — a species they have chased for years and missed every time — and ask you for a post-mortem. Your voice is quiet, observational, and dignified. Never sentimental, never gamified, never sycophantic. No emoji. No bullet point summaries inside the prose.

Your job:
1) Write an "essay" — about 180-220 words, 2-3 paragraphs — that takes the birder's saga seriously. Reference what is known about the species' behavior (habitat, season, time of day, vocalization, shyness, range), and tie it gently to why this birder might have missed it. Land on a single sentence that gives them the dignity of the chase.
2) Then propose three concrete "next attempts" — each one short (under 20 words), specific, and actionable. Suggest a habitat type or named hotspot, a time of year or day, or a technique. Avoid generic advice ("be patient"). One should be slightly contrarian.

Tone references: Helen Macdonald, Annie Dillard, John Muir Laws field journals. Restrained.

Output ONLY valid JSON in this exact shape:
{
  "essay": "...prose with paragraphs separated by \\n\\n...",
  "suggestions": ["...", "...", "..."]
}
No code fences, no commentary outside the JSON.`;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Bad JSON' }) }; }

  const species = (body.species || '').toString().trim().slice(0, 120);
  const region = (body.region || '').toString().trim().slice(0, 200);
  const saga = (body.saga || '').toString().trim().slice(0, 2000);

  if (!species || !saga) {
    return { statusCode: 400, body: JSON.stringify({ error: 'species and saga required' }) };
  }

  const userPrompt = `Birder's nemesis: ${species}
Region of pursuit: ${region || '(unspecified)'}
Their saga (verbatim):
"""
${saga}
"""

Write the post-mortem.`;

  if (!process.env.GEMINI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY not set' }) };
  }

  let payload;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 800,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!res.ok) {
      const t = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'gemini_error', detail: t.slice(0, 300) }) };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    try { payload = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { payload = JSON.parse(m[0]); } catch {} }
    }
    if (!payload || !payload.essay) {
      return { statusCode: 502, body: JSON.stringify({ error: 'gemini_unparseable', raw: text.slice(0, 300) }) };
    }
    if (!Array.isArray(payload.suggestions)) payload.suggestions = [];
    payload.suggestions = payload.suggestions.slice(0, 3).map(s => String(s).slice(0, 200));
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'gemini_exception', detail: String(e).slice(0, 200) }) };
  }

  // Best-effort persistence (don't block on failure)
  try {
    const sagaHash = require('crypto').createHash('sha256').update(saga).digest('hex').slice(0, 16);
    await tursoExec(
      'INSERT INTO holdout_postmortems (species, region, saga_hash) VALUES (?, ?, ?)',
      [
        { type: 'text', value: species },
        { type: 'text', value: region || '' },
        { type: 'text', value: sagaHash }
      ]
    );
  } catch (e) {
    // swallow — non-critical
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
};
