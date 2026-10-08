import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Official Zenex API Key provided by user
let zenexApiKey = process.env.ZENEX_API_KEY || 'ZNX_PJVG9XBZ6NBSLIAIK884NZ4I';

// Common Zenex Request Headers
function getZenexHeaders(isJson = false) {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'mapikey': zenexApiKey,
    'apikey': zenexApiKey,
    'api-key': zenexApiKey,
    'x-api-key': zenexApiKey,
  };
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'NXV SMS Panel Backend Core',
    timestamp: new Date().toISOString(),
    keyMasked: zenexApiKey ? `${zenexApiKey.slice(0, 7)}...${zenexApiKey.slice(-4)}` : 'None',
  });
});

// Config API
app.get('/api/zenex/config', (_req: Request, res: Response) => {
  res.json({
    apiKey: zenexApiKey,
    apiKeyMasked: zenexApiKey ? `${zenexApiKey.slice(0, 7)}...${zenexApiKey.slice(-4)}` : '',
    hasKey: Boolean(zenexApiKey),
    endpoints: {
      getnum: 'https://api.zenexnetwork.com/v1/getnum',
      numsuccess: 'https://api.zenexnetwork.com/v1/numsuccess/info',
      activeRanges: 'https://api.zenexnetwork.com/v1/active-ranges',
      globalBroadcast: 'https://www.zenexnetwork.com/api/v1/global-broadcast',
    },
  });
});

app.post('/api/zenex/config', (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (typeof apiKey === 'string' && apiKey.trim()) {
    zenexApiKey = apiKey.trim();
  }
  res.json({
    success: true,
    message: 'API Key updated successfully',
    apiKeyMasked: zenexApiKey ? `${zenexApiKey.slice(0, 7)}...${zenexApiKey.slice(-4)}` : '',
  });
});

// 1. ACTIVE RANGES: GET https://api.zenexnetwork.com/v1/active-ranges
app.get('/api/zenex/active-ranges', async (_req: Request, res: Response) => {
  try {
    const response = await fetch('https://api.zenexnetwork.com/v1/active-ranges', {
      method: 'GET',
      headers: getZenexHeaders(false),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error connecting to active-ranges',
    });
  }
});

// 2. PROVISION VIRTUAL NUMBER: POST https://api.zenexnetwork.com/v1/getnum
app.post('/api/zenex/getnum', async (req: Request, res: Response) => {
  const { range, is_national = false, remove_plus = false } = req.body;

  try {
    let cleanRange = (range || '4473845XXX').trim();
    if (!cleanRange.includes('X') && cleanRange.length <= 7) {
      cleanRange = `${cleanRange}XXX`;
    }

    const payload = {
      range: cleanRange,
      is_national: Boolean(is_national),
      remove_plus: Boolean(remove_plus),
    };

    const response = await fetch('https://api.zenexnetwork.com/v1/getnum', {
      method: 'POST',
      headers: getZenexHeaders(true),
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error connecting to getnum',
    });
  }
});

// GET /api/zenex/getnum wrapper for query parameters
app.get('/api/zenex/getnum', async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '4473845XXX';

  try {
    let cleanRange = range.trim();
    if (!cleanRange.includes('X') && cleanRange.length <= 7) {
      cleanRange = `${cleanRange}XXX`;
    }

    const payload = {
      range: cleanRange,
      is_national: false,
      remove_plus: false,
    };

    const response = await fetch('https://api.zenexnetwork.com/v1/getnum', {
      method: 'POST',
      headers: getZenexHeaders(true),
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error connecting to getnum',
    });
  }
});

// 3. FETCH SMS/OTP PAYLOADS: GET https://api.zenexnetwork.com/v1/numsuccess/info
app.get('/api/zenex/numsuccess/info', async (_req: Request, res: Response) => {
  try {
    const response = await fetch('https://api.zenexnetwork.com/v1/numsuccess/info', {
      method: 'GET',
      headers: getZenexHeaders(false),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error connecting to numsuccess/info',
    });
  }
});

// 4. GLOBAL LIVE CONSOLE: GET https://www.zenexnetwork.com/api/v1/global-broadcast
app.get('/api/zenex/global-broadcast', async (_req: Request, res: Response) => {
  try {
    const response = await fetch('https://www.zenexnetwork.com/api/v1/global-broadcast', {
      method: 'GET',
      headers: getZenexHeaders(false),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Error connecting to global-broadcast',
    });
  }
});

// Start Server & mount Vite in dev mode
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NXV SMS Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
