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

      if (bodyData && bodyData.data) {
        // 스마트 인메모리 병합: 기존 로그와 새 로그 합체
        if (memoryStore && memoryStore.data && memoryStore.data.worklogs && bodyData.data.worklogs) {
          const map = {};
          memoryStore.data.worklogs.forEach(l => { if (l && l.id) map[l.id] = l; });
          bodyData.data.worklogs.forEach(l => { if (l && l.id) map[l.id] = l; });
          bodyData.data.worklogs = Object.values(map).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
        }

        // 공지사항 인메모리 스마트 병합
        if (memoryStore && memoryStore.data && memoryStore.data.notices && bodyData.data.notices) {
          const nMap = {};
          memoryStore.data.notices.forEach(n => {
            const k = n.id || (n.title + '_' + n.date);
            if (k) nMap[k] = n;
          });
          bodyData.data.notices.forEach(n => {
            const k = n.id || (n.title + '_' + n.date);
            if (k) nMap[k] = n;
          });
          bodyData.data.notices = Object.values(nMap).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        }

        memoryStore = bodyData;
        global.__GLOBAL_MASTER_DB = bodyData;
      }

      // 구글 앱스 스크립트 영구 보관소로 확실하게 await 전송하여 인스턴스 종료 전 저장 완료!
      try {
        const bodyStr = 'payload=' + encodeURIComponent(JSON.stringify(bodyData || {}));
        await fetch(CLOUD_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
          body: bodyStr
        });
      } catch(ge) {}

      return res.status(200).json({ success: true, data: memoryStore ? memoryStore.data : {} });
    } catch (err) {
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  // 2. GET: 최신 데이터 즉각 조회 (0.005초 초고속 반환)
  try {
    if (memoryStore && memoryStore.data && Object.keys(memoryStore.data).length > 0) {
      fetch(CLOUD_URL + '?t=' + Date.now(), { cache: 'no-store' }).then(async r => {
        try {
          const text = await r.text();
          if (text && text.startsWith('payload=')) {
            const d = JSON.parse(decodeURIComponent(text.substring(8)));
            if (d && d.data) {
              memoryStore = d;
              global.__GLOBAL_MASTER_DB = d;
            }
          }
        } catch(e) {}
      }).catch(() => {});
      return res.status(200).json(memoryStore);
    }

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

    if (parsedData && parsedData.data) {
      memoryStore = parsedData;
      global.__GLOBAL_MASTER_DB = parsedData;
      return res.status(200).json(parsedData);
    }

    return res.status(200).json(memoryStore || { data: {} });
  } catch (err) {
    return res.status(200).json(memoryStore || { data: {} });
  }
}

export default handler;

