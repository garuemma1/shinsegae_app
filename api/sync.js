// Vercel Serverless Edge API for Instant Real-Time Cross-Device Data Sync
// Global in-memory cache for ultra-low latency & zero CORS issues across all devices
let memoryStore = global.__GLOBAL_MASTER_DB || null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

      if (bodyData && bodyData.data) {
        // 스마트 인메모리 병합: 기존 로그와 새 로그 합체
        if (memoryStore && memoryStore.data && memoryStore.data.worklogs && bodyData.data.worklogs) {
          const map = {};
          memoryStore.data.worklogs.forEach(l => { if (l && l.id) map[l.id] = l; });
          bodyData.data.worklogs.forEach(l => { if (l && l.id) map[l.id] = l; });
          bodyData.data.worklogs = Object.values(map).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
        }

        memoryStore = bodyData;
        global.__GLOBAL_MASTER_DB = bodyData;
      }

      // 구글 앱스 스크립트 영구 보관소로 백그라운드 전송
      try {
        const bodyStr = 'payload=' + encodeURIComponent(JSON.stringify(bodyData || {}));
        fetch(CLOUD_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
          body: bodyStr
        }).catch(() => {});
      } catch(ge) {}

      return res.status(200).json({ success: true, data: memoryStore ? memoryStore.data : {} });
    } catch (err) {
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  // 2. GET: 최신 데이터 조회
  try {
    if (memoryStore && memoryStore.data) {
      return res.status(200).json(memoryStore);
    }

    // 인메모리에 없으면 구글 클라우드에서 조회
    const getRes = await fetch(CLOUD_URL + '?t=' + Date.now());
    const rawText = await getRes.text();
    let parsedData = { data: {} };

    if (rawText && rawText.startsWith('payload=')) {
      const decoded = decodeURIComponent(rawText.substring(8));
      parsedData = JSON.parse(decoded);
    } else if (rawText) {
      try {
        parsedData = JSON.parse(rawText);
      } catch (e) {
        parsedData = { data: {} };
      }
    }

    if (parsedData && parsedData.data) {
      memoryStore = parsedData;
      global.__GLOBAL_MASTER_DB = parsedData;
    }

    return res.status(200).json(parsedData);
  } catch (err) {
    return res.status(200).json(memoryStore || { data: {} });
  }
}
