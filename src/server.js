import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mapserverRoutes from './routes/mapservers.js';
import parcelRoutes from './routes/parcels.js';
import aiRoutes from './routes/ai.js';
import queryRoutes from './routes/query.js';
import polygonSearchRoutes from './routes/polygonSearches.js';
import geocodeRoutes from './routes/geocode.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

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
