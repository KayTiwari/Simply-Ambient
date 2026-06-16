// Vercel serverless proxy for the daily/monthly horoscope API. Same reason as
// api/tarot.js: freehoroscopeapi.com has no CORS, so the browser build proxies
// through here to get a same-origin, CORS-enabled response. Query params:
//   period = daily | monthly   sign = <zodiac name>   day = TODAY (daily only)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const period = req.query.period === 'monthly' ? 'monthly' : 'daily';
    const sign = String(req.query.sign || 'Aries');
    const day = String(req.query.day || 'TODAY');
    const base = 'https://freehoroscopeapi.com/api/v1/get-horoscope';
    const url =
      period === 'monthly'
        ? `${base}/monthly?sign=${encodeURIComponent(sign)}`
        : `${base}/daily?sign=${encodeURIComponent(sign)}&day=${encodeURIComponent(day)}`;
    const upstream = await fetch(url);
    const json = await upstream.json();
    res.status(upstream.status).json(json);
  } catch (e) {
    res.status(502).json({ error: 'horoscope_proxy_failed' });
  }
}
