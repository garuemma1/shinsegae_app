// Vercel Serverless Edge API for Instant Real-Time Cross-Device Data Sync
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbx3JgVr9e_wGnO6Bvp2uE_7lamAf_Ii22cLpCyo5OGquAiNypiWA1FCDJSHnw4qqFPMJg/exec';

  try {
    if (req.method === 'POST') {
      const payloadObj = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const bodyStr = 'payload=' + encodeURIComponent(JSON.stringify(payloadObj));

      const postRes = await fetch(CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: bodyStr
      });
      const txt = await postRes.text();
      return res.status(200).json({ success: true, result: txt });
    }

    // GET Request
    const getRes = await fetch(CLOUD_URL + '?t=' + Date.now());
    const rawText = await getRes.text();
    let parsedData = { data: {} };

    if (rawText && rawText.startsWith('payload=')) {
      const decoded = decodeURIComponent(rawText.substring(8));
      parsedData = JSON.parse(decoded);
    } else if (rawText) {
      parsedData = JSON.parse(rawText);
    }

    return res.status(200).json(parsedData);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
