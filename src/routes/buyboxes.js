import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/buy-boxes - List user buy boxes
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const buyBoxes = await prisma.buyBox.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, buyBoxes });
  } catch (error) {
    console.error('Error fetching buy boxes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/buy-boxes - Create buy box
router.post('/', async (req, res) => {
  try {
    const {
      userId,
      name,
      markets = [],
      counties = [],
      propertyTypes = [],
      priceMin,
      priceMax,
      acresMin,
      acresMax,
      zoningCodes = [],
      mustBeAbsentee = false,
      mustBeTaxDelinquent = false,
      isActive = true
    } = req.body;

    if (!userId || !name) {
      return res.status(400).json({
        success: false,
        error: 'userId and name are required'
      });
    }

    const buyBox = await prisma.buyBox.create({
      data: {
        userId,
        name,
        markets: markets,
        counties: counties,
        propertyTypes: propertyTypes,
        minPrice: priceMin ? parseFloat(priceMin) : null,
        maxPrice: priceMax ? parseFloat(priceMax) : null,
        minSize: acresMin ? parseFloat(acresMin) : null,
        maxSize: acresMax ? parseFloat(acresMax) : null,
        sizeUnit: 'acres',
        zoning: zoningCodes,
        filters: {
          mustBeAbsentee,
          mustBeTaxDelinquent
        },
        isActive
      }
    });

    res.status(201).json({ success: true, buyBox });
  } catch (error) {
    console.error('Error creating buy box:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/buy-boxes/:id - Update buy box
router.patch('/:id', async (req, res) => {
  try {
    const updateData = {};
    const {
      name,
      markets,
      counties,
      propertyTypes,
      priceMin,
      priceMax,
      acresMin,
      acresMax,
      zoningCodes,
      mustBeAbsentee,
      mustBeTaxDelinquent,
      isActive
    } = req.body;

    if (name) updateData.name = name;
    if (markets) updateData.markets = markets;
    if (counties) updateData.counties = counties;
    if (propertyTypes) updateData.propertyTypes = propertyTypes;
    if (priceMin !== undefined) updateData.minPrice = parseFloat(priceMin);
    if (priceMax !== undefined) updateData.maxPrice = parseFloat(priceMax);
    if (acresMin !== undefined) updateData.minSize = parseFloat(acresMin);
    if (acresMax !== undefined) updateData.maxSize = parseFloat(acresMax);
    if (zoningCodes) updateData.zoning = zoningCodes;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Update filters
    if (mustBeAbsentee !== undefined || mustBeTaxDelinquent !== undefined) {
      const existing = await prisma.buyBox.findUnique({
        where: { id: req.params.id }
      });
      updateData.filters = {
        ...(existing?.filters || {}),
        ...(mustBeAbsentee !== undefined && { mustBeAbsentee }),
        ...(mustBeTaxDelinquent !== undefined && { mustBeTaxDelinquent })
      };
    }

    const buyBox = await prisma.buyBox.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, buyBox });
  } catch (error) {
    console.error('Error updating buy box:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/buy-boxes/:id - Delete buy box
router.delete('/:id', async (req, res) => {
  try {
    await prisma.buyBox.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'Buy box deleted' });
  } catch (error) {
    console.error('Error deleting buy box:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/buy-boxes/:id/matches - Get properties matching buy box
router.get('/:id/matches', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const buyBox = await prisma.buyBox.findUnique({
      where: { id: req.params.id }
    });

    if (!buyBox) {
      return res.status(404).json({ success: false, error: 'Buy box not found' });
    }

    const where = {};

    // Markets/Counties (from siteCity or county)
    if (buyBox.counties && Array.isArray(buyBox.counties) && buyBox.counties.length > 0) {
      where.OR = [
        { siteCity: { in: buyBox.counties } },
        { county: { in: buyBox.counties } }
      ];
    }

    // Property types
    if (buyBox.propertyTypes && Array.isArray(buyBox.propertyTypes) && buyBox.propertyTypes.length > 0) {
      where.propertyType = { in: buyBox.propertyTypes };
    }

    // Price range
    if (buyBox.minPrice || buyBox.maxPrice) {
      where.OR = [
        ...(where.OR || []),
        { avmValue: { gte: buyBox.minPrice || 0, lte: buyBox.maxPrice || Infinity } },
        { mktValue: { gte: buyBox.minPrice || 0, lte: buyBox.maxPrice || Infinity } }
      ];
    }

    // Size range (acres)
    if (buyBox.minSize || buyBox.maxSize) {
      where.acres = {
        gte: buyBox.minSize || 0,
        lte: buyBox.maxSize || Infinity
      };
    }

    // Filters
    if (buyBox.filters) {
      if (buyBox.filters.mustBeAbsentee) where.isAbsentee = true;
      if (buyBox.filters.mustBeTaxDelinquent) where.isTaxDelinquent = true;
    }

    const properties = await prisma.property.findMany({
      where,
      take: Math.min(parseInt(limit), 500),
      skip: parseInt(offset),
      orderBy: [
        { motivationScore: 'desc' },
        { avmValue: 'desc' }
      ]
    });

    const total = await prisma.property.count({ where });

    res.json({
      success: true,
      properties,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching buy box matches:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

