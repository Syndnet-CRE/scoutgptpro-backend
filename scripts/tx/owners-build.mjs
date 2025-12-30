/**
 * Owners Build Script
 * Extracts unique owners from properties table and normalizes them
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Normalize owner name
 */
function normalizeOwnerName(name) {
  if (!name) return null;
  
  let normalized = name.toUpperCase().trim();
  
  // Remove common punctuation
  normalized = normalized.replace(/[.,;:]/g, '');
  
  // Normalize entity types
  normalized = normalized.replace(/\bLLC\b/g, 'LLC');
  normalized = normalized.replace(/\bL\.L\.C\.\b/g, 'LLC');
  normalized = normalized.replace(/\bINC\b/g, 'INC');
  normalized = normalized.replace(/\bINCORPORATED\b/g, 'INC');
  normalized = normalized.replace(/\bL\.P\.\b/g, 'LP');
  normalized = normalized.replace(/\bLIMITED PARTNERSHIP\b/g, 'LP');
  normalized = normalized.replace(/\bTRUST\b/g, 'TRUST');
  
  return normalized;
}

/**
 * Normalize address
 */
function normalizeAddress(address) {
  if (!address) return null;
  
  let normalized = address.toUpperCase().trim();
  
  // Normalize common abbreviations
  normalized = normalized.replace(/\bSTREET\b/g, 'ST');
  normalized = normalized.replace(/\bAVENUE\b/g, 'AVE');
  normalized = normalized.replace(/\bROAD\b/g, 'RD');
  normalized = normalized.replace(/\bBOULEVARD\b/g, 'BLVD');
  normalized = normalized.replace(/\bDRIVE\b/g, 'DR');
  normalized = normalized.replace(/\bLANE\b/g, 'LN');
  
  return normalized;
}

/**
 * Detect entity type
 */
function detectEntityType(name) {
  if (!name) return 'UNKNOWN';
  
  const upper = name.toUpperCase();
  
  if (upper.includes('LLC') || upper.includes('L.L.C.')) return 'LLC';
  if (upper.includes('INC') || upper.includes('INCORPORATED')) return 'INC';
  if (upper.includes('LP') || upper.includes('LIMITED PARTNERSHIP')) return 'LP';
  if (upper.includes('TRUST')) return 'TRUST';
  
  // Check if corporate-like (has multiple words, no personal indicators)
  const words = upper.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 3 && !upper.includes('&') && !upper.match(/\b(JR|SR|III|IV)\b/)) {
    return 'UNKNOWN'; // Could be corporate, but not definitive
  }
  
  return 'PERSON';
}

/**
 * Check if corporate
 */
function isCorporate(entityType, name) {
  if (['LLC', 'INC', 'LP'].includes(entityType)) return true;
  
  if (!name) return false;
  const upper = name.toUpperCase();
  
  // Corporate indicators
  const corporateKeywords = ['CORP', 'CORPORATION', 'COMPANY', 'CO', 'ENTERPRISES', 'HOLDINGS', 'GROUP', 'PARTNERS'];
  return corporateKeywords.some(keyword => upper.includes(keyword));
}

/**
 * Generate owner ID hash
 */
function generateOwnerId(normalizedName, normalizedAddress) {
  const combined = `${normalizedName || ''}|${normalizedAddress || ''}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 25);
}

/**
 * Extract state from address
 */
function extractState(address) {
  if (!address) return null;
  
  const stateMatch = address.match(/\b([A-Z]{2})\s+\d{5}(-\d{4})?\b/);
  if (stateMatch) {
    return stateMatch[1];
  }
  
  // Try to find state abbreviation elsewhere
  const states = ['TX', 'CA', 'NY', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];
  const upper = address.toUpperCase();
  for (const state of states) {
    if (upper.includes(` ${state} `) || upper.endsWith(` ${state}`)) {
      return state;
    }
  }
  
  return null;
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting owners build...');
  
  try {
    // Get all unique owner combinations
    const properties = await prisma.$queryRaw`
      SELECT DISTINCT 
        owner,
        "ownerName",
        "ownerAddress",
        "parcelId"
      FROM properties
      WHERE owner IS NOT NULL 
        AND owner != ''
        AND state = 'TX'
      LIMIT 100000
    `;
    
    console.log(`Found ${properties.length} properties with owners`);
    
    const ownerMap = new Map();
    const ownerPropertyLinks = [];
    
    // Process each property
    for (const prop of properties) {
      const ownerNameRaw = prop.owner || prop.ownerName || null;
      const ownerAddressRaw = prop.ownerAddress || null;
      
      if (!ownerNameRaw) continue;
      
      const ownerNameNorm = normalizeOwnerName(ownerNameRaw);
      const ownerAddressNorm = normalizeAddress(ownerAddressRaw);
      const entityType = detectEntityType(ownerNameRaw);
      const isCorp = isCorporate(entityType, ownerNameRaw);
      const mailingState = extractState(ownerAddressRaw) || 'TX';
      
      const ownerId = generateOwnerId(ownerNameNorm, ownerAddressNorm);
      
      // Store owner if not seen before
      if (!ownerMap.has(ownerId)) {
        ownerMap.set(ownerId, {
          id: ownerId,
          ownerNameRaw,
          ownerNameNorm,
          mailingAddressRaw: ownerAddressRaw,
          mailingAddressNorm: ownerAddressNorm,
          mailingState,
          entityType,
          isCorporate: isCorp
        });
      }
      
      // Store property link
      ownerPropertyLinks.push({
        ownerId,
        parcelId: prop.parcelId
      });
    }
    
    console.log(`Created ${ownerMap.size} unique owners`);
    console.log(`Created ${ownerPropertyLinks.length} owner-property links`);
    
    // Batch insert owners using Prisma createMany
    const ownersArray = Array.from(ownerMap.values());
    const batchSize = 1000;
    
    for (let i = 0; i < ownersArray.length; i += batchSize) {
      const batch = ownersArray.slice(i, i + batchSize);
      
      // Use createMany with skipDuplicates
      await prisma.owner.createMany({
        data: batch.map(o => ({
          id: o.id,
          ownerNameRaw: o.ownerNameRaw,
          ownerNameNorm: o.ownerNameNorm,
          mailingAddressRaw: o.mailingAddressRaw,
          mailingAddressNorm: o.mailingAddressNorm,
          mailingState: o.mailingState,
          entityType: o.entityType,
          isCorporate: o.isCorporate
        })),
        skipDuplicates: true
      });
      
      console.log(`Inserted owners batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(ownersArray.length / batchSize)}`);
    }
    
    // Batch insert owner-property links
    const linkBatchSize = 5000;
    for (let i = 0; i < ownerPropertyLinks.length; i += linkBatchSize) {
      const batch = ownerPropertyLinks.slice(i, i + linkBatchSize);
      
      await prisma.ownerProperty.createMany({
        data: batch.map(l => ({
          ownerId: l.ownerId,
          parcelId: l.parcelId
        })),
        skipDuplicates: true
      });
      
      console.log(`Inserted links batch ${Math.floor(i / linkBatchSize) + 1}/${Math.ceil(ownerPropertyLinks.length / linkBatchSize)}`);
    }
    
    console.log('Owners build complete!');
    
  } catch (error) {
    console.error('Error building owners:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();

