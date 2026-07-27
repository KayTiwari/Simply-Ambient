// Vercel serverless proxy for the tarot API. freehoroscopeapi.com sends no
// CORS headers, so the browser build cannot call it directly. This runs
// server-side (no CORS between servers) and re-serves the response same-origin
// with an Access-Control-Allow-Origin header. Native calls the API directly and
// never hits this. Response shape is passed through unchanged.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const n = Math.max(1, Math.min(10, parseInt(req.query.n, 10) || 1));
    const includeMinor = req.query.minor === 'true';
    const upstream = await fetch(
      `https://freehoroscopeapi.com/api/v1/tarot/cards/random?n=${n}${includeMinor ? '&minor=true' : ''}`,
    );
    const json = await upstream.json();
    res.status(upstream.status).json(json);
  } catch (e) {
    res.status(502).json({ error: 'tarot_proxy_failed' });
  }
}
