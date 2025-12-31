import express from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { extractDiscoverIntent } from '../services/intentExtractor.js';
import { buildDiscoverQuery, scoreCandidates } from '../services/discoverEngine.js';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/discover/query
 * Natural language discovery endpoint
 */
router.post('/query', async (req, res) => {
  const { queryText, geo, limit = 100 } = req.body;
  const userId = req.user?.id || req.headers['x-user-id'] || 'anonymous';

  if (!queryText) {
    return res.status(400).json({ error: 'queryText is required' });
  }

  const runId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const startedAt = new Date();

  try {
    // Step 1: Extract intent using LLM
    const extractedIntent = await extractDiscoverIntent(queryText, anthropic);
    
    // Step 2: Build SQL query based on intent
    const { sql, params } = buildDiscoverQuery(extractedIntent, geo, limit);
    
    // Step 3: Execute query
    const candidates = await prisma.$queryRawUnsafe(sql, ...params);
    
    // Step 4: Score candidates
    const scoringModel = await prisma.scoringModel.findFirst({
      where: {
        assetClass: extractedIntent.assetTypes[0] || 'general',
        version: '1.0'
      }
    });

    const scoredCandidates = await scoreCandidates(
      candidates,
      extractedIntent,
      scoringModel?.modelJson || null,
      prisma
    );

    // Step 5: Save run and results
    const endedAt = new Date();
    const stats = {
      totalCandidates: scoredCandidates.length,
      executionTimeMs: endedAt - startedAt,
      intent: extractedIntent
    };

    await prisma.discoverRun.create({
      data: {
        id: runId,
        queryText,
        intentJson: extractedIntent,
        createdBy: userId,
        startedAt,
        endedAt,
        stats
      }
    });

    // Save top results
    const topResults = scoredCandidates.slice(0, limit);
    await prisma.discoverResult.createMany({
      data: topResults.map(c => ({
        runId,
        parcelId: c.parcelId,
        score: c.score,
        reasons: c.reasons,
        breakdown: c.breakdown
      }))
    });

    // Format map pins
    const mapPins = topResults
      .filter(c => c.longitude && c.latitude)
      .map(c => ({
        parcelId: c.parcelId,
        lon: c.longitude,
        lat: c.latitude,
        score: c.score
      }));

    res.json({
      extractedIntent,
      candidates: topResults.map(c => ({
        parcelId: c.parcelId,
        score: parseFloat(c.score),
        reasons: c.reasons,
        breakdown: c.breakdown,
        address: c.address,
        city: c.city,
        state: c.state,
        propertyType: c.propertyType,
        acres: c.acres,
        mktValue: c.mktValue
      })),
      mapPins,
      runId,
      stats
    });

  } catch (error) {
    console.error('Discover query error:', error);
    
    // Save error to run
    await prisma.discoverRun.create({
      data: {
        id: runId,
        queryText,
        intentJson: {},
        createdBy: userId,
        startedAt,
        endedAt: new Date(),
        error: error.message
      }
    });

    res.status(500).json({
      error: 'Discovery query failed',
      message: error.message,
      runId
    });
  }
});

export default router;

