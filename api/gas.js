// Vercel serverless proxy: ซ่อน GAS_URL / API_KEY ไว้ใน Environment Variables
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const r = await fetch(process.env.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ ...body, key: process.env.API_KEY }),
      redirect: 'follow'
    });
    res.status(200).json(await r.json());
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
