const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const prisma = new PrismaClient();

const CSV_PATH = '/Users/braydonirwin/Downloads/RECORDER_0001.csv';
const BATCH_SIZE = 1000;

async function ingestRecorderData() {
  console.log('Starting RECORDER data ingestion...');
  console.log('File:', CSV_PATH);
  
  let processed = 0;
  let matched = 0;
  let updated = 0;
  let errors = 0;
  let batch = [];
  
  // Get all existing properties with attomId or parcelId for matching
  console.log('Loading existing property IDs for matching...');
  const existingProperties = await prisma.property.findMany({
    select: { id: true, attomId: true, parcelId: true }
  });
  
  // Create lookup maps
  const attomIdMap = new Map();
  const parcelIdMap = new Map();
  
  existingProperties.forEach(p => {
    if (p.attomId) attomIdMap.set(p.attomId, p.id);
    if (p.parcelId) parcelIdMap.set(p.parcelId, p.id);
  });
  
  console.log(`Loaded ${attomIdMap.size} attomIds and ${parcelIdMap.size} parcelIds`);
  
  const processBatch = async (records) => {
    const updates = [];
    
    for (const record of records) {
      // Try to match by ATTOM ID first, then by APN
      const attomId = record['[ATTOM ID]']?.trim();
      const apn = record['APNFormatted']?.trim();
      
      let propertyId = null;
      if (attomId && attomIdMap.has(attomId)) {
        propertyId = attomIdMap.get(attomId);
      } else if (apn && parcelIdMap.has(apn)) {
        propertyId = parcelIdMap.get(apn);
      }
      
      if (!propertyId) continue;
      matched++;
      
      // Parse dates
      let lastSaleDate = null;
      if (record['RecordingDate']) {
        try {
          lastSaleDate = new Date(record['RecordingDate']);
          if (isNaN(lastSaleDate.getTime())) lastSaleDate = null;
        } catch (e) {}
      }
      
      // Calculate ownership years
      let ownershipYears = null;
      if (lastSaleDate) {
        const now = new Date();
        ownershipYears = (now - lastSaleDate) / (1000 * 60 * 60 * 24 * 365.25);
        ownershipYears = Math.round(ownershipYears * 10) / 10; // 1 decimal
      }
      
      // Build update data
      const updateData = {
        lastSaleDate,
        lastSaleAmount: parseFloat(record['TransferAmount']) || null,
        lastSaleDocType: record['DocumentTypeCode']?.trim() || null,
        grantorName: record['Grantor1NameFull']?.trim() || null,
        granteeName: record['Grantee1NameFull']?.trim() || null,
        granteeMailAddress: record['GranteeMailAddressFull']?.trim() || null,
        granteeMailCity: record['GranteeMailAddressCity']?.trim() || null,
        granteeMailState: record['GranteeMailAddressState']?.trim() || null,
        granteeMailZip: record['GranteeMailAddressZIP']?.trim() || null,
        isInvestorOwned: record['GranteeInvestorFlag'] === 'Y',
        isForeclosure: record['ForeclosureAuctionSale'] === 'Y',
        mortgageAmount: parseFloat(record['Mortgage1Amount']) || null,
        mortgageLender: record['Mortgage1LenderNameFullStandardized']?.trim() || null,
        mortgageRate: parseFloat(record['Mortgage1InterestRate']) || null,
        mortgageTerm: parseInt(record['Mortgage1Term']) || null,
        ownershipYears
      };
      
      // Also update ownerAddress if granteeMailAddress exists and ownerAddress is empty
      if (updateData.granteeMailAddress) {
        updateData.ownerAddress = updateData.granteeMailAddress;
      }
      
      updates.push(
        prisma.property.update({
          where: { id: propertyId },
          data: updateData
        })
      );
    }
    
    if (updates.length > 0) {
      try {
        await prisma.$transaction(updates);
        updated += updates.length;
      } catch (e) {
        console.error('Batch error:', e.message);
        errors += updates.length;
      }
    }
  };
  
  // Process CSV in streaming fashion
  let processing = false;
  const pendingBatches = [];
  
  const processPendingBatches = async () => {
    if (processing || pendingBatches.length === 0) return;
    processing = true;
    
    while (pendingBatches.length > 0) {
      const currentBatch = pendingBatches.shift();
      await processBatch(currentBatch);
    }
    
    processing = false;
  };
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', async (row) => {
        batch.push(row);
        processed++;
        
        if (batch.length >= BATCH_SIZE) {
          const currentBatch = [...batch];
          batch = [];
          pendingBatches.push(currentBatch);
          processPendingBatches();
        }
        
        if (processed % 100000 === 0) {
          console.log(`Processed: ${processed.toLocaleString()} | Matched: ${matched.toLocaleString()} | Updated: ${updated.toLocaleString()}`);
        }
      })
      .on('end', async () => {
        // Process remaining batch
        if (batch.length > 0) {
          pendingBatches.push(batch);
        }
        
        // Wait for all pending batches to complete
        while (pendingBatches.length > 0 || processing) {
          await processPendingBatches();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('\n=== INGESTION COMPLETE ===');
        console.log(`Total Processed: ${processed.toLocaleString()}`);
        console.log(`Matched to Properties: ${matched.toLocaleString()}`);
        console.log(`Updated: ${updated.toLocaleString()}`);
        console.log(`Errors: ${errors.toLocaleString()}`);
        console.log(`Match Rate: ${((matched / processed) * 100).toFixed(2)}%`);
        
        await prisma.$disconnect();
        resolve({ processed, matched, updated, errors });
      })
      .on('error', (err) => {
        console.error('CSV Error:', err);
        reject(err);
      });
  });
}

ingestRecorderData()
  .then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

