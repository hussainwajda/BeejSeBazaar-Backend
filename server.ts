import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
import mongoose from 'mongoose';
import AadhaarUser  from './models';
import authRoutes from './routes';
// Using require to avoid type dependency issues for multer in some environments
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

config();

const app = express();

const PORT = parseInt(process.env.PORT || '5000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4000';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const AZURE_TRANSLATOR_ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;
const AZURE_TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION;


app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ message: 'Good!' });
});

// Authentication routes
app.use('/api/auth', authRoutes);

const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI as string, {
});

const db = mongoose.connection;
// async function insertData() {
//   try {
//     await AadhaarUser.insertMany([
//       { aadhaar: "735269466602", phone: "+918085745154" },
//       { aadhaar: "675269466602", phone: "+918349383576" },
//     ]);
//     console.log("Data inserted successfully!");
//   } catch (err) {
//     console.error("Error inserting data:", err);
//   } finally {
//     mongoose.connection.close();
//   }
// }

// insertData();

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

app.post('/api/aadhaar', async (req, res) => {
  const { aadhaar, phone, fullname } = req.body;
  const aadhaarUser = new AadhaarUser({ aadhaar, phone, fullname });
  await aadhaarUser.save();
  res.json(aadhaarUser);
});

// Debug: list routes
app.get('/api/routes', (_req, res) => {
  const routes: any[] = [];
  // @ts-ignore
  app._router.stack.forEach((m: any) => {
    if (m.route && m.route.path) {
      const methods = Object.keys(m.route.methods).join(',').toUpperCase();
      routes.push({ path: m.route.path, methods });
    }
  });
  res.json({ routes });
});

app.get('/api/weather', async (req, res) => {
  try {
    console.log("weather api getting fetched")
    const lat = req.query.lat as string | undefined;
    const lon = req.query.lon as string | undefined;

    if (!WEATHER_API_KEY) {
      return res.status(500).json({ error: 'Weather API key is not configured' });
    }

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;

    // Using global fetch (Node 18+)
    const response = await fetch(url);
    if (!response.ok) {
      let errorText = 'Unknown error';
      try { errorText = await response.text(); } catch {}
      return res.status(response.status).json({ error: `Failed to fetch weather data: ${errorText}` });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// ---------------- Soil Analysis (Mock) ----------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type SoilParams = {
  ph?: number;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  organicMatter?: number;
  moisture?: number;
  temperature?: number;
  salinity?: number;
};

function computeMockSoilAnalysis(params: SoilParams) {
  const safe = (v: unknown, fallback = 0) => (typeof v === 'number' && !Number.isNaN(v) ? v : fallback);
  const ph = safe(params.ph, 6.5);
  const n = safe(params.nitrogen, 30);
  const p = safe(params.phosphorus, 45);
  const k = safe(params.potassium, 200);
  const om = safe(params.organicMatter, 3.5);
  const moisture = safe(params.moisture, 30);
  const temperature = safe(params.temperature, 22);
  const salinity = safe(params.salinity, 0.8);

  // Simple scoring against typical ranges
  const scorePart = (value: number, min: number, max: number) => {
    if (value >= min && value <= max) return 100;
    const dist = value < min ? min - value : value - max;
    const span = (max - min) || 1;
    const penalty = Math.min(100, (dist / span) * 120);
    return Math.max(0, 100 - penalty);
  };

  const parts = [
    scorePart(ph, 6.0, 7.5),
    scorePart(n, 20, 50),
    scorePart(p, 30, 100),
    scorePart(k, 150, 300),
    scorePart(om, 3, 6),
    scorePart(moisture, 25, 35),
    scorePart(temperature, 16, 24),
    scorePart(salinity, 0, 2),
  ];
  const overallScore = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  const status = overallScore >= 85 ? 'excellent' : overallScore >= 70 ? 'good' : overallScore >= 50 ? 'moderate' : 'poor';

  const recommendations: string[] = [];
  if (ph < 6.0) recommendations.push('Apply agricultural lime to raise pH to 6.0 - 7.0');
  if (ph > 7.5) recommendations.push('Incorporate elemental sulfur or organic matter to lower pH');
  if (n < 25) recommendations.push('Add nitrogen fertilizer (e.g., urea) at recommended dose');
  if (p < 30) recommendations.push('Apply phosphorus (DAP/SSP) to improve root development');
  if (k < 150) recommendations.push('Add potassium (MOP) to enhance stress tolerance');
  if (om < 3) recommendations.push('Incorporate 2-3 tons/acre of compost or FYM');
  if (moisture < 25) recommendations.push('Schedule irrigation to maintain 25% - 35% moisture');
  if (moisture > 35) recommendations.push('Improve drainage to avoid waterlogging');
  if (salinity > 2) recommendations.push('Leach salts with good quality water; consider gypsum if sodic');

  return {
    overallScore,
    status,
    recommendations,
    parameters: { ph, nitrogen: n, phosphorus: p, potassium: k, organicMatter: om, moisture, temperature, salinity },
  };
}

// Manual JSON input analysis
app.post('/api/soil/analyze', (req, res) => {
  try {
    const body = req.body || {};
    const params: SoilParams = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? parseFloat(v as any) : (v as any)])
    ) as SoilParams;
    const result = computeMockSoilAnalysis(params);
    res.json({ source: 'manual', ...result });
  } catch (err: any) {
    res.status(400).json({ error: 'Invalid input', details: err?.message });
  }
});

// ---------------- Pest & Disease (Mock) ----------------
type PestTreatment = {
  type: 'immediate' | 'preventive' | 'organic';
  title: string;
  description: string;
  steps?: string[];
  products?: { name: string; price: string; description: string }[];
  safety?: string;
};

type PestResult = {
  name: string;
  confidence: number;
  severity: 'Low' | 'Medium' | 'High';
  type: 'Pest' | 'Disease' | 'Deficiency';
  description: string;
  symptoms: string[];
  treatments: PestTreatment[];
};

const COMMON_PESTS: PestResult[] = [
  {
    name: 'Aphid Infestation',
    confidence: 92,
    severity: 'Medium',
    type: 'Pest',
    description: 'Aphids are small, soft-bodied insects that feed on plant sap causing leaf curling and reduced vigor. They excrete honeydew that can lead to sooty mold.',
    symptoms: ['Curling or yellowing leaves', 'Sticky honeydew on leaves', 'Clusters of small green/black insects', 'Ants farming aphids'],
    treatments: [
      {
        type: 'organic',
        title: 'Neem Oil Spray',
        description: 'Neem oil disrupts aphid growth and feeding.',
        steps: ['Mix neem oil per label', 'Spray undersides of leaves', 'Repeat every 5–7 days for 3 cycles'],
        safety: 'Avoid spraying during peak sunlight; wear gloves and eye protection.'
      },
      {
        type: 'preventive',
        title: 'Biological Control',
        description: 'Encourage natural predators like lady beetles and lacewings.',
      }
    ]
  },
  {
    name: 'Leaf Miner Damage',
    confidence: 76,
    severity: 'Low',
    type: 'Pest',
    description: 'Leaf miner larvae tunnel between leaf surfaces, leaving serpentine trails that reduce photosynthesis.',
    symptoms: ['White serpentine trails', 'Blotches between leaf layers', 'Tiny punctures from adult flies'],
    treatments: [
      { type: 'preventive', title: 'Cultural Control', description: 'Remove and destroy affected leaves; maintain hygiene.' },
      { type: 'organic', title: 'Spinosad Spray', description: 'Apply spinosad on young larvae per label directions.' }
    ]
  },
  {
    name: 'Powdery Mildew',
    confidence: 81,
    severity: 'Medium',
    type: 'Disease',
    description: 'Fungal disease characterized by white powdery growth on leaves and stems, thriving in humid conditions.',
    symptoms: ['White powdery patches', 'Distorted or stunted growth', 'Yellowing leaves'],
    treatments: [
      { type: 'organic', title: 'Bicarbonate Spray', description: 'Potassium bicarbonate can suppress mildew development.' },
      { type: 'preventive', title: 'Airflow Management', description: 'Prune for airflow; avoid overhead irrigation.' }
    ]
  },
  {
    name: 'Early Blight (Tomato/Potato)',
    confidence: 74,
    severity: 'High',
    type: 'Disease',
    description: 'Fungal disease causing concentric ring lesions on lower leaves progressing upward, leading to defoliation.',
    symptoms: ['Brown concentric ring spots', 'Yellow halos around lesions', 'Lower leaves affected first'],
    treatments: [
      { type: 'immediate', title: 'Fungicidal Spray', description: 'Use labeled fungicides (e.g., chlorothalonil, copper) rotating modes of action.' },
      { type: 'preventive', title: 'Crop Rotation', description: 'Rotate Solanaceae crops and remove infected debris.' }
    ]
  }
];

app.post('/api/pest/analyze-upload', upload.single('image'), (req, res) => {
  try {
    const anyReq: any = req as any;
    const uploaded = anyReq.file as { originalname?: string; mimetype?: string } | undefined;
    const crop = (req.body?.crop as string | undefined)?.toLowerCase();

    // Select top 2–3 plausible results; simple heuristic by crop if provided
    let results = COMMON_PESTS.slice(0, 3);
    if (crop && (crop.includes('tomato') || crop.includes('potato'))) {
      results = COMMON_PESTS.filter(r => r.name.toLowerCase().includes('blight')).concat(COMMON_PESTS.filter(r => !r.name.toLowerCase().includes('blight')).slice(0, 2));
    }

    // Add slight variance to confidence to feel dynamic
    const varied = results.map(r => ({
      ...r,
      confidence: Math.min(99, Math.max(60, Math.round(r.confidence + (Math.random() * 8 - 4))))
    }));

    res.json({
      source: 'upload',
      fileName: uploaded?.originalname,
      mimeType: uploaded?.mimetype,
      results: varied
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to analyze pest image', details: err?.message });
  }
});

// File upload analysis (mock: we do not parse file contents, just return computed defaults)
app.post('/api/soil/analyze-upload', upload.single('file'), (req, res) => {
  try {
    const defaults: SoilParams = {
      ph: 6.4,
      nitrogen: 32,
      phosphorus: 46,
      potassium: 210,
      organicMatter: 3.8,
      moisture: 29,
      temperature: 23,
      salinity: 0.9,
    };
    // Optional overrides via fields, e.g., when CSV extraction is done client-side
    const fields = req.body || {};
    const params: SoilParams = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? parseFloat(v as any) : (v as any)])
    ) as SoilParams;
    const anyReq: any = req as any;
    const uploaded = anyReq.file as { originalname?: string; mimetype?: string } | undefined;
    const result = computeMockSoilAnalysis({ ...defaults, ...params });
    res.json({ source: 'upload', fileName: uploaded?.originalname, mimeType: uploaded?.mimetype, ...result });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to analyze uploaded report', details: err?.message });
  }
});

// Simple in-memory cache with TTL
type CacheEntry = { value: any; expiresAt: number };
const translationCache = new Map<string, CacheEntry>();
const TRANSLATION_TTL_MS = 1000 * 60 * 60; // 1 hour

function cacheGet(key: string) {
  const entry = translationCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    translationCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: any) {
  translationCache.set(key, { value, expiresAt: Date.now() + TRANSLATION_TTL_MS });
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// Flatten nested object to path -> string map (only string leaves)
function flattenStrings(obj: any, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (isString(obj)) {
    out[prefix] = obj;
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      Object.assign(out, flattenStrings(obj[key], path));
    }
  }
  return out;
}

// Unflatten path -> string map back into nested object using base shape
function unflattenInto(base: any, map: Record<string, string>): any {
  const result = Array.isArray(base) ? [] as any[] : (typeof base === 'object' && base !== null ? {} as any : base);
  if (typeof base !== 'object' || base === null) {
    return base;
  }
  for (const key of Object.keys(base)) {
    const value = base[key];
    if (typeof value === 'object' && value !== null) {
      result[key] = unflattenInto(value, map);
    } else if (isString(value)) {
      const path = key;
      // We'll reconstruct by walking map keys that start with this path when nested
      // But since we call per level with base shapes, we can compute full path later in translate function
      result[key] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function assignByPath(target: any, path: string, value: string) {
  const segments = path.split('.');
  let node = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!(seg in node) || typeof node[seg] !== 'object' || node[seg] === null) {
      node[seg] = {};
    }
    node = node[seg];
  }
  node[segments[segments.length - 1]] = value;
}

async function translateStrings(texts: string[], to: string) {
  if (!AZURE_TRANSLATOR_KEY || !AZURE_TRANSLATOR_REGION) {
    throw new Error('Azure Translator not configured');
  }
  const url = `${AZURE_TRANSLATOR_ENDPOINT}/translate?api-version=3.0&from=en&to=${encodeURIComponent(to)}`;
  const body = texts.map((t) => ({ Text: t }));
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
      'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.log("Azure translate failed", response.status, response.statusText)
    const text = await response.text().catch(() => '');
    throw new Error(`Azure translate failed: ${response.status} ${text}`);
  }
  const data: any = await response.json();
  // data: [{ translations: [{ text: '...' }] }]
  return data.map((item: any) => item.translations?.[0]?.text ?? '');
}

app.post('/api/translate', async (req, res) => {
  try {
    console.log("[translate] hit", { to: req.body?.to, hasPayload: !!req.body?.payload })
    const to = (req.body?.to as string || '').trim();
    const payload = req.body?.payload;
    if (!to) return res.status(400).json({ error: 'Missing target language' });
    if (typeof payload !== 'object' || payload === null) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    if (to === 'en') {
      return res.json(payload);
    }

    const flat = flattenStrings(payload);
    const keys = Object.keys(flat);
    const cacheKey = `v1:${to}:${JSON.stringify(flat)}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      console.log('[translate] cache hit')
      return res.json(cached);
    }

    const values = keys.map((k) => flat[k]);
    const translatedValues: string[] = [];
    const BATCH_SIZE = 90; // Azure limit is 100 items
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const chunk = values.slice(i, i + BATCH_SIZE);
      const out = await translateStrings(chunk, to);
      translatedValues.push(...out);
    }

    const result: any = {};
    keys.forEach((path, idx) => {
      assignByPath(result, path, translatedValues[idx]);
    });

    cacheSet(cacheKey, result);
    console.log('[translate] success', { keys: keys.length })
    return res.json(result);
  } catch (err: any) {
    console.error('[translate] error', err)
    return res.status(500).json({ error: err?.message || 'Translation failed' });
  }
});

// Translate an array of raw strings
app.post('/api/translate-texts', async (req, res) => {
  try {
    console.log('[translate-texts] hit', { to: req.body?.to, count: Array.isArray(req.body?.texts) ? req.body.texts.length : 0 })
    const to = (req.body?.to as string || '').trim();
    const texts = req.body?.texts as unknown;
    if (!to) return res.status(400).json({ error: 'Missing target language' });
    if (!Array.isArray(texts) || texts.some(t => typeof t !== 'string')) {
      return res.status(400).json({ error: 'Invalid texts' });
    }
    if (to === 'en') {
      return res.json(texts);
    }

    const cacheKey = `v1:texts:${to}:${JSON.stringify(texts)}`;
    const cached = cacheGet(cacheKey);
    if (cached) { console.log('[translate-texts] cache hit'); return res.json(cached); }

    const results: string[] = [];
    const BATCH_SIZE = 90;
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const chunk = texts.slice(i, i + BATCH_SIZE);
      const out = await translateStrings(chunk, to);
      results.push(...out);
    }

    cacheSet(cacheKey, results);
    console.log('[translate-texts] success', { translated: results.length })
    return res.json(results);
  } catch (err: any) {
    console.error('[translate-texts] error', err)
    return res.status(500).json({ error: err?.message || 'Translation failed' });
  }
});

// Catch unmatched routes for diagnostics
app.use((req, _res, next) => {
  console.warn('[unmatched]', req.method, req.path)
  next()
});

app.listen(PORT, () => {
  console.log(`✅ Backend listening on http://localhost:${PORT}`);
});


