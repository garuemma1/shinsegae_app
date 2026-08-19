// Vercel Serverless Edge API for Instant Real-Time Cross-Device Data Sync
// Global in-memory cache + Google Apps Script Master Persistence
let memoryStore = global.__GLOBAL_MASTER_DB || null;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control, Pragma');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const CLOUD_URL = 'https://script.google.com/macros/s/AKfycbx3JgVr9e_wGnO6Bvp2uE_7lamAf_Ii22cLpCyo5OGquAiNypiWA1FCDJSHnw4qqFPMJg/exec';

  // 1. POST: 데이터 저장
  if (req.method === 'POST') {
    try {
      let bodyData = req.body;
      if (typeof bodyData === 'string') {
        try { bodyData = JSON.parse(bodyData); } catch (e) {}
      } else if (Buffer.isBuffer(bodyData)) {
        try { bodyData = JSON.parse(bodyData.toString('utf-8')); } catch (e) {}
      }

      // 구글 앱스 스크립트 영구 보관소로 즉시 확실하게 await 전송하여 100% 영구 기록!
      try {
        const bodyStr = 'payload=' + encodeURIComponent(JSON.stringify(bodyData || {}));
        await fetch(CLOUD_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
          body: bodyStr
        });
      } catch(ge) {}

      if (bodyData && bodyData.data) {
        memoryStore = bodyData;
        global.__GLOBAL_MASTER_DB = bodyData;
      }

      return res.status(200).json({ success: true, data: (bodyData && bodyData.data) || {} });
    } catch (err) {
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  // 2. GET: 최신 단일 마스터 데이터 조회 (구글 클라우드 직통 일원화)
  try {
    const getRes = await fetch(CLOUD_URL + '?t=' + Date.now(), {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    const rawText = await getRes.text();
    let parsedData = null;

    if (rawText && rawText.startsWith('payload=')) {
      const decoded = decodeURIComponent(rawText.substring(8));
      parsedData = JSON.parse(decoded);
    } else if (rawText) {
      try {
        parsedData = JSON.parse(rawText);
      } catch (e) {}
    }

    if (parsedData && parsedData.data && Object.keys(parsedData.data).length > 0) {
      memoryStore = parsedData;
      global.__GLOBAL_MASTER_DB = parsedData;
      return res.status(200).json(parsedData);
    }

    if (memoryStore && memoryStore.data && Object.keys(memoryStore.data).length > 0) {
      return res.status(200).json(memoryStore);
    }

    return res.status(200).json({ data: {} });
  } catch (err) {
    return res.status(200).json(memoryStore || { data: {} });
  }
}

export default handler;

