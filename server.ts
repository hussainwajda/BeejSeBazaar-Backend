import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';

config();

const app = express();

const PORT = parseInt(process.env.PORT || '4000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ message: 'Good!' });
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

app.listen(PORT, () => {
  console.log(`✅ Backend listening on http://localhost:${PORT}`);
});


