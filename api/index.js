// Vercel Serverless Function handler for /api/* routes
const ZENEX_API_KEY = process.env.ZENEX_API_KEY || 'ZNX_PJVG9XBZ6NBSLIAIK884NZ4I';

function getZenexHeaders(isJson = false) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'mapikey': ZENEX_API_KEY,
    'apikey': ZENEX_API_KEY,
    'api-key': ZENEX_API_KEY,
    'x-api-key': ZENEX_API_KEY,
  };
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse path
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // 1. Health check
  if (pathname === '/api/health') {
    return res.status(200).json({
      status: 'ok',
      service: 'NXV SMS Panel Backend (Vercel Serverless)',
      timestamp: new Date().toISOString(),
      keyMasked: ZENEX_API_KEY ? `${ZENEX_API_KEY.slice(0, 7)}...${ZENEX_API_KEY.slice(-4)}` : 'None',
    });
  }

  // 2. Active Ranges
  if (pathname === '/api/zenex/active-ranges') {
    try {
      const response = await fetch('https://api.zenexnetwork.com/v1/active-ranges', {
        method: 'GET',
        headers: getZenexHeaders(false),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Error fetching active ranges',
      });
    }
  }

  // 3. Get Number (POST or GET)
  if (pathname === '/api/zenex/getnum') {
    try {
      let targetRange = '';
      let targetService = 'general';

      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        targetRange = body.range || '';
        targetService = body.service || 'general';
      } else {
        targetRange = url.searchParams.get('range') || '';
        targetService = url.searchParams.get('service') || 'general';
      }

      const response = await fetch('https://api.zenexnetwork.com/v1/getnum', {
        method: 'POST',
        headers: getZenexHeaders(true),
        body: JSON.stringify({
          range: targetRange,
          service: targetService,
          is_national: false,
          remove_plus: false,
        }),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Error provisioning number from carrier gateway',
      });
    }
  }

  // 4. Fetch OTPs / Success info
  if (pathname === '/api/zenex/numsuccess/info') {
    try {
      const response = await fetch('https://api.zenexnetwork.com/v1/numsuccess/info', {
        method: 'GET',
        headers: getZenexHeaders(false),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Error fetching OTP info',
      });
    }
  }

  // 5. Global Broadcast
  if (pathname === '/api/zenex/global-broadcast') {
    try {
      const response = await fetch('https://www.zenexnetwork.com/api/v1/global-broadcast', {
        method: 'GET',
        headers: getZenexHeaders(false),
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message || 'Error fetching global broadcast',
      });
    }
  }

  return res.status(404).json({
    error: 'API route not found',
    pathname: pathname,
  });
}
