import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/listings - Get all active listings (for marketplace)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      propertyType,
      city,
      minPrice,
      maxPrice,
      minSqft,
      maxSqft,
      sort = 'listedAt',
      order = 'desc'
    } = req.query;

    const where = {
      status: 'ACTIVE'
    };

    if (propertyType) where.propertyType = propertyType;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    
    if (minPrice || maxPrice) {
      where.askingPrice = {};
      if (minPrice) where.askingPrice.gte = parseFloat(minPrice);
      if (maxPrice) where.askingPrice.lte = parseFloat(maxPrice);
    }
    
    if (minSqft || maxSqft) {
      where.totalSqft = {};
      if (minSqft) where.totalSqft.gte = parseInt(minSqft);
      if (maxSqft) where.totalSqft.lte = parseInt(maxSqft);
    }

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = Math.min(parseInt(pageSize), 100);

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take,
        orderBy: { [sort]: order }
      }),
      prisma.listing.count({ where })
    ]);

    res.json({
      success: true,
      listings,
      pagination: {
        page: parseInt(page),
        pageSize: take,
        total,
        totalPages: Math.ceil(total / take)
      }
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch listings' });
  }
});

// GET /api/listings/:id - Get single listing
router.get('/:id', async (req, res) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id }
    });

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    // Increment view count (fire and forget)
    prisma.listing.update({
      where: { id: req.params.id },
      data: { views: { increment: 1 } }
    }).catch(console.error);

    res.json({ success: true, listing });
  } catch (error) {
    console.error('Error fetching listing:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch listing' });
  }
});

// POST /api/listings - Create new listing (Submit Property)
router.post('/', async (req, res) => {
  try {
    const {
      // Required
      propertyType,
      title,
      address,
      city,
      state = 'TX',
      zipCode,
      askingPrice,
      
      // Location
      county,
      latitude,
      longitude,
      apn,
      
      // Common characteristics
      totalSqft,
      lotSizeAcres,
      lotSizeSqft,
      yearBuilt,
      zoning,
      
      // Commercial
      assetType,
      assetSubtype,
      noi,
      capRate,
      occupancy,
      tenantCount,
      buildingCount,
      floors,
      parkingSpaces,
      leaseType,
      
      // Residential
      bedrooms,
      bathrooms,
      hoaFee,
      
      // Land
      totalAcres,
      numberOfLots,
      roadFrontage,
      topography,
      utilities,
      entitlements,
      
      // Media
      images,
      documents,
      coverImage,
      
      // Description
      description,
      
      // Optional relationships
      userId,
      propertyId
    } = req.body;

    // Validation
    if (!propertyType || !title || !address || !city || !zipCode || !askingPrice) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: propertyType, title, address, city, zipCode, askingPrice'
      });
    }

    // Validate propertyType enum
    const validPropertyTypes = ['COMMERCIAL', 'RESIDENTIAL', 'LAND'];
    if (!validPropertyTypes.includes(propertyType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid propertyType. Must be one of: ${validPropertyTypes.join(', ')}`
      });
    }

    // Calculate derived fields (convert to Decimal for Prisma)
    const pricePerSqft = totalSqft ? new Prisma.Decimal(parseFloat(askingPrice) / totalSqft) : null;
    const pricePerAcre = totalAcres ? new Prisma.Decimal(parseFloat(askingPrice) / parseFloat(totalAcres)) : null;
    const calculatedCapRate = (noi && askingPrice) ? (parseFloat(noi) / parseFloat(askingPrice)) * 100 : capRate;

    // Try to find matching property by address or coordinates
    let matchedPropertyId = propertyId || null; // Use provided propertyId if given

    if (!matchedPropertyId) {
      try {
        // First try exact address match
        const addressMatch = await prisma.property.findFirst({
          where: {
            OR: [
              { siteAddress: { contains: address, mode: 'insensitive' } },
              { address: { contains: address, mode: 'insensitive' } }
            ],
            // Also match city and state if provided
            ...(city && { siteCity: { contains: city, mode: 'insensitive' } }),
            ...(state && { siteState: state })
          },
          select: { id: true, parcelId: true, siteAddress: true, address: true }
        });
        
        if (addressMatch) {
          matchedPropertyId = addressMatch.id;
          console.log(`[Listings] Matched property by address: ${matchedPropertyId} (parcelId: ${addressMatch.parcelId})`);
        } 
        // If no address match and we have coordinates, try coordinate match
        else if (latitude && longitude) {
          const coordMatch = await prisma.property.findFirst({
            where: {
              latitude: { 
                gte: parseFloat(latitude) - 0.0001, 
                lte: parseFloat(latitude) + 0.0001 
              },
              longitude: { 
                gte: parseFloat(longitude) - 0.0001, 
                lte: parseFloat(longitude) + 0.0001 
              }
            },
            select: { id: true, parcelId: true, latitude: true, longitude: true }
          });
          
          if (coordMatch) {
            matchedPropertyId = coordMatch.id;
            console.log(`[Listings] Matched property by coordinates: ${matchedPropertyId} (parcelId: ${coordMatch.parcelId})`);
          }
        }
        
        if (!matchedPropertyId) {
          console.log(`[Listings] No matching property found for: ${address}${city ? `, ${city}` : ''}`);
        }
      } catch (matchError) {
        console.error('[Listings] Error matching property:', matchError);
        // Continue without match - listing can still be created
      }
    } else {
      console.log(`[Listings] Using provided propertyId: ${matchedPropertyId}`);
    }

    const listing = await prisma.listing.create({
      data: {
        status: 'ACTIVE', // Immediately active per requirements
        propertyType,
        title,
        description,
        
        // Location
        address,
        city,
        state,
        zipCode,
        county,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        apn,
        
        // Pricing - Use Prisma.Decimal for Decimal fields
        askingPrice: new Prisma.Decimal(askingPrice),
        pricePerSqft,
        pricePerAcre,
        
        // Characteristics
        totalSqft: totalSqft ? parseInt(totalSqft) : null,
        lotSizeAcres: lotSizeAcres ? new Prisma.Decimal(lotSizeAcres) : null,
        lotSizeSqft: lotSizeSqft ? parseInt(lotSizeSqft) : null,
        yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
        zoning,
        
        // Commercial - Use Prisma.Decimal for Decimal fields
        assetType,
        assetSubtype,
        noi: noi ? new Prisma.Decimal(noi) : null,
        capRate: calculatedCapRate ? new Prisma.Decimal(calculatedCapRate) : null,
        occupancy: occupancy ? new Prisma.Decimal(occupancy) : null,
        tenantCount: tenantCount ? parseInt(tenantCount) : null,
        buildingCount: buildingCount ? parseInt(buildingCount) : null,
        floors: floors ? parseInt(floors) : null,
        parkingSpaces: parkingSpaces ? parseInt(parkingSpaces) : null,
        leaseType,
        
        // Residential - Use Prisma.Decimal for Decimal fields
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? new Prisma.Decimal(bathrooms) : null,
        hoaFee: hoaFee ? new Prisma.Decimal(hoaFee) : null,
        
        // Land - Use Prisma.Decimal for Decimal fields
        totalAcres: totalAcres ? new Prisma.Decimal(totalAcres) : null,
        numberOfLots: numberOfLots ? parseInt(numberOfLots) : null,
        roadFrontage: roadFrontage ? parseInt(roadFrontage) : null,
        topography,
        utilities: utilities || null,
        entitlements,
        
        // Media
        images: images || [],
        documents: documents || [],
        coverImage,
        
        // Optional relationships
        userId: userId || null,
        propertyId: matchedPropertyId  // Link to matched property (or null if no match)
      }
    });

    console.log(`[Listings] Created listing ${listing.id} with propertyId: ${listing.propertyId || 'null'}`);

    res.status(201).json({
      success: true,
      listing,
      message: 'Property submitted successfully'
    });
  } catch (error) {
    console.error('Error creating listing:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create listing', 
      details: error.message 
    });
  }
});

// PUT /api/listings/:id - Update listing
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.listing.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    // Prepare update data, converting types as needed
    const updateData = { ...req.body };
    
    // Convert numeric fields
    if (updateData.askingPrice !== undefined) updateData.askingPrice = parseFloat(updateData.askingPrice);
    if (updateData.totalSqft !== undefined) updateData.totalSqft = parseInt(updateData.totalSqft);
    if (updateData.lotSizeAcres !== undefined) updateData.lotSizeAcres = parseFloat(updateData.lotSizeAcres);
    if (updateData.lotSizeSqft !== undefined) updateData.lotSizeSqft = parseInt(updateData.lotSizeSqft);
    if (updateData.yearBuilt !== undefined) updateData.yearBuilt = parseInt(updateData.yearBuilt);
    if (updateData.latitude !== undefined) updateData.latitude = parseFloat(updateData.latitude);
    if (updateData.longitude !== undefined) updateData.longitude = parseFloat(updateData.longitude);

    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, listing });
  } catch (error) {
    console.error('Error updating listing:', error);
    res.status(500).json({ success: false, error: 'Failed to update listing', details: error.message });
  }
});

// DELETE /api/listings/:id - Withdraw/delete listing
router.delete('/:id', async (req, res) => {
  try {
    // Soft delete by changing status
    await prisma.listing.update({
      where: { id: req.params.id },
      data: { status: 'WITHDRAWN' }
    });

    res.json({ success: true, message: 'Listing withdrawn' });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ success: false, error: 'Failed to delete listing', details: error.message });
  }
});

// POST /api/listings/bulk - Bulk submit properties
router.post('/bulk', async (req, res) => {
  try {
    const { properties } = req.body;

    if (!Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Properties array is required'
      });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const property of properties) {
      try {
        // Validate required fields
        if (!property.propertyType || !property.title || !property.address || 
            !property.city || !property.zipCode || !property.askingPrice) {
          results.failed.push({
            property,
            error: 'Missing required fields'
          });
          continue;
        }

        // Calculate derived fields
        const pricePerSqft = property.totalSqft ? parseFloat(property.askingPrice) / property.totalSqft : null;
        const pricePerAcre = property.totalAcres ? parseFloat(property.askingPrice) / parseFloat(property.totalAcres) : null;

        const listing = await prisma.listing.create({
          data: {
            status: 'ACTIVE',
            propertyType: property.propertyType,
            title: property.title,
            description: property.description,
            address: property.address,
            city: property.city,
            state: property.state || 'TX',
            zipCode: property.zipCode,
            county: property.county,
            latitude: property.latitude ? parseFloat(property.latitude) : null,
            longitude: property.longitude ? parseFloat(property.longitude) : null,
            apn: property.apn,
            askingPrice: parseFloat(property.askingPrice),
            pricePerSqft,
            pricePerAcre,
            totalSqft: property.totalSqft ? parseInt(property.totalSqft) : null,
            lotSizeAcres: property.lotSizeAcres ? parseFloat(property.lotSizeAcres) : null,
            yearBuilt: property.yearBuilt ? parseInt(property.yearBuilt) : null,
            zoning: property.zoning,
            images: property.images || [],
            documents: property.documents || [],
            userId: property.userId || null,
            propertyId: property.propertyId || null
          }
        });
        results.success.push(listing);
      } catch (err) {
        results.failed.push({
          property,
          error: err.message
        });
      }
    }

    res.status(201).json({
      success: true,
      results,
      summary: {
        total: properties.length,
        succeeded: results.success.length,
        failed: results.failed.length
      }
    });
  } catch (error) {
    console.error('Error bulk creating listings:', error);
    res.status(500).json({ success: false, error: 'Failed to create listings', details: error.message });
  }
});

// GET /api/listings/stats/summary - Get marketplace stats
router.get('/stats/summary', async (req, res) => {
  try {
    const [total, byType, byCity] = await Promise.all([
      prisma.listing.count({ where: { status: 'ACTIVE' } }),
      prisma.listing.groupBy({
        by: ['propertyType'],
        where: { status: 'ACTIVE' },
        _count: true
      }),
      prisma.listing.groupBy({
        by: ['city'],
        where: { status: 'ACTIVE' },
        _count: true,
        orderBy: { _count: { city: 'desc' } },
        take: 10
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalActive: total,
        byType: byType.map(t => ({ type: t.propertyType, count: t._count })),
        topCities: byCity.map(c => ({ city: c.city, count: c._count }))
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats', details: error.message });
  }
});

// GET /api/listings/my - Get current user's listings
router.get('/my', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const listings = await prisma.listing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, listings });
  } catch (error) {
    console.error('Error fetching user listings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;


