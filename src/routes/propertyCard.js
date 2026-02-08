// src/routes/propertyCard.js
// Property card REST endpoints
// Created: Feb 8, 2026

import express from 'express';
import { getPropertyCard, getPropertyCardsBatch } from '../services/propertyCard.js';

const router = express.Router();

// GET /api/properties/:attomId/card
router.get('/:attomId/card', async (req, res) => {
  try {
    const { attomId } = req.params;
    const parsed = parseInt(attomId);
    
    if (!attomId || isNaN(parsed)) {
      return res.status(400).json({ error: 'Invalid attomId — must be a numeric ATTOM ID' });
    }

    const card = await getPropertyCard(parsed);
    
    if (!card) {
      return res.status(404).json({ error: 'Property not found', attomId });
    }

    res.json(card);
  } catch (err) {
    console.error('[PropertyCard] Single card error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// POST /api/properties/batch/cards
router.post('/batch/cards', async (req, res) => {
  try {
    const { attomIds } = req.body;
    
    if (!Array.isArray(attomIds) || attomIds.length === 0) {
      return res.status(400).json({ error: 'attomIds array required' });
    }
    if (attomIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 properties per batch request' });
    }

    const cards = await getPropertyCardsBatch(attomIds);
    res.json({ properties: cards, count: cards.length });
  } catch (err) {
    console.error('[PropertyCard] Batch error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

export default router;