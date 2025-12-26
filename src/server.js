import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mapserverRoutes from './routes/mapservers.js';
import parcelRoutes from './routes/parcels.js';
import aiRoutes from './routes/ai.js';
import queryRoutes from './routes/query.js';
import polygonSearchRoutes from './routes/polygonSearches.js';
import geocodeRoutes from './routes/geocode.js';
import gisRoutes from './routes/gis.js';
import propertiesRoutes from './routes/properties.js';
import listingsRoutes from './routes/listings.js';
import dealsRoutes from './routes/deals.js';
import buyBoxesRoutes from './routes/buyboxes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - CORS Configuration
// In development, allow all origins for easier local testing
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const corsOptions = isDevelopment 
  ? {
      origin: true, // Allow all origins in development
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      optionsSuccessStatus: 200
    }
  : {
      origin: process.env.CORS_ORIGINS 
        ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
        : [
            'http://localhost:4028',
            'http://localhost:5173',
            'http://localhost:3000',
            'https://scoutcrm.netlify.app',
            process.env.FRONTEND_URL
          ].filter(Boolean),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    };

app.use(cors(corsOptions));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/mapservers', mapserverRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/parcels', parcelRoutes);
app.use('/api/query', queryRoutes);
app.use('/api', polygonSearchRoutes);
app.use('/api', geocodeRoutes);
app.use('/api/gis', gisRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/buy-boxes', buyBoxesRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ScoutGPT Backend running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗺️  MapServer API ready`);
});
