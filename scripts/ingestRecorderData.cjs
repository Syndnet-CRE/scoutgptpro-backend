const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const csv = require('csv-parser');

const prisma = new PrismaClient();

const CSV_PATH = '/Users/braydonirwin/Downloads/RECORDER_0001.csv';
const BATCH_SIZE = 500;
const MAX_PENDING_BATCHES = 5; // Limit pending batches to prevent memory buildup

async function ingestRecorderData() {
  console.log('Starting RECORDER data ingestion...');
  console.log('File:', CSV_PATH);
  
  let processed = 0;
  let matched = 0;
  let updated = 0;
  let errors = 0;
  
  // Get all existing properties with attomId or parcelId for matching
  console.log('Loading existing property IDs for matching...');
  const existingProperties = await prisma.property.findMany({
    select: { id: true, attomId: true, parcelId: true }
  });
  
  // Create lookup maps
  const attomIdMap = new Map();
  const parcelIdMap = new Map();
  
  existingProperties.forEach(p => {
    if (p.attomId) attomIdMap.set(String(p.attomId).trim(), p.id);
    if (p.parcelId) parcelIdMap.set(String(p.parcelId).trim(), p.id);
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
        ownershipYears = Math.round(ownershipYears * 10) / 10;
      }
      
      // Build update data
      const updateData = {
        lastSaleDate,
        lastSaleAmount: record['TransferAmount'] ? parseFloat(record['TransferAmount']) : null,
        lastSaleDocType: record['DocumentTypeCode']?.trim() || null,
        grantorName: record['Grantor1NameFull']?.trim() || null,
        granteeName: record['Grantee1NameFull']?.trim() || null,
        granteeMailAddress: record['GranteeMailAddressFull']?.trim() || null,
        granteeMailCity: record['GranteeMailAddressCity']?.trim() || null,
        granteeMailState: record['GranteeMailAddressState']?.trim() || null,
        granteeMailZip: record['GranteeMailAddressZIP']?.trim() || null,
        isInvestorOwned: record['GranteeInvestorFlag'] === 'Y' || record['GranteeInvestorFlag'] === '1',
        isForeclosure: record['ForeclosureAuctionSale'] === 'Y' || record['ForeclosureAuctionSale'] === '1',
        mortgageAmount: record['Mortgage1Amount'] ? parseFloat(record['Mortgage1Amount']) : null,
        mortgageLender: record['Mortgage1LenderNameFullStandardized']?.trim() || null,
        mortgageRate: record['Mortgage1InterestRate'] ? parseFloat(record['Mortgage1InterestRate']) : null,
        mortgageTerm: record['Mortgage1Term'] ? parseInt(record['Mortgage1Term']) : null,
        ownershipYears
      };
      
      // Remove null values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === null || updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      if (updateData.granteeMailAddress) {
        updateData.ownerAddress = updateData.granteeMailAddress;
      }
      
      if (Object.keys(updateData).length > 0) {
        updates.push(
          prisma.property.update({
            where: { id: propertyId },
            data: updateData
          })
        );
      }
    }
    
    if (updates.length > 0) {
      try {
        await prisma.$transaction(updates, { timeout: 30000 });
        updated += updates.length;
      } catch (e) {
        console.error('Batch error:', e.message);
        errors += updates.length;
      }
    }
  };
  
  // Process CSV with proper backpressure
  return new Promise((resolve, reject) => {
    let batch = [];
    let pendingBatches = [];
    let isProcessing = false;
    let csvStream = null;
    let isPaused = false;
    
    const processPendingBatches = async () => {
      if (isProcessing || pendingBatches.length === 0) return;
      
      isProcessing = true;
      
      while (pendingBatches.length > 0) {
        const currentBatch = pendingBatches.shift();
        await processBatch(currentBatch);
        
        // Resume CSV stream if it was paused
        if (isPaused && pendingBatches.length < MAX_PENDING_BATCHES) {
          csvStream.resume();
          isPaused = false;
        }
      }
      
      isProcessing = false;
    };
    
    csvStream = fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => {
        batch.push(row);
        processed++;
        
        if (batch.length >= BATCH_SIZE) {
          const currentBatch = [...batch];
          batch = [];
          pendingBatches.push(currentBatch);
          
          // Pause CSV stream if too many batches pending
          if (pendingBatches.length >= MAX_PENDING_BATCHES && !isPaused) {
            csvStream.pause();
            isPaused = true;
          }
          
          // Process batches
          if (!isProcessing) {
            setImmediate(processPendingBatches);
          }
        }
        
        if (processed % 50000 === 0) {
          console.log(`Processed: ${processed.toLocaleString()} | Matched: ${matched.toLocaleString()} | Updated: ${updated.toLocaleString()} | Pending: ${pendingBatches.length}`);
        }
      })
      .on('end', async () => {
        // Add final batch
        if (batch.length > 0) {
          pendingBatches.push(batch);
        }
        
        // Process all remaining batches
        while (pendingBatches.length > 0 || isProcessing) {
          await processPendingBatches();
          if (pendingBatches.length > 0 || isProcessing) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
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
