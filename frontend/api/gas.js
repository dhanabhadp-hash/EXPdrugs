// Vercel Serverless Function: proxy ไปยัง Google Apps Script Web App
// ตั้งค่า Environment Variable ใน Vercel:  GAS_URL = https://script.google.com/macros/s/XXXXXXXX/exec
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const url = process.env.GAS_URL;
  if (!url) return res.status(500).json({ ok: false, error: 'GAS_URL ยังไม่ได้ตั้งค่าใน Vercel Environment Variables' });
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
    const text = await r.text();
    try { JSON.parse(text); } catch (e) { return res.status(502).json({ ok: false, error: 'Apps Script ตอบกลับผิดรูปแบบ (ตรวจสอบว่า Deploy เป็น Web app และให้สิทธิ์ Anyone)' }); }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'เชื่อมต่อ Apps Script ไม่ได้: ' + String(e && e.message || e) });
  }
};
