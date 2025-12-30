const fs = require('fs');
const readline = require('readline');

const INPUT = '/Users/braydonirwin/Downloads/RECORDER_0001.csv';
const OUTPUT = '/Users/braydonirwin/Downloads/RECORDER_MINIMAL.csv';

// Column indices (0-based) from verified header
const COLUMN_INDICES = {
  transaction_id: 0,        // TransactionID
  attom_id: 1,              // [ATTOM ID]
  document_type: 6,         // DocumentTypeCode
  recording_date: 13,       // RecordingDate
  transfer_amount: 22,       // TransferAmount
  grantor_name: 27,         // Grantor1NameFull
  grantee_name: 68,         // Grantee1NameFull
  grantee_mail_address: 98,  // GranteeMailAddressFull
  grantee_mail_city: 106,   // GranteeMailAddressCity
  grantee_mail_state: 107,  // GranteeMailAddressState
  grantee_mail_zip: 108,    // GranteeMailAddressZIP
  grantee_investor_flag: 97, // GranteeInvestorFlag
  foreclosure_flag: 16,     // ForeclosureAuctionSale
  mortgage_amount: 159,     // Mortgage1Amount
  mortgage_lender: 161,      // Mortgage1LenderNameFullStandardized
  mortgage_rate: 177,       // Mortgage1InterestRate
  mortgage_term: 171,       // Mortgage1Term
  apn_formatted: 132,       // APNFormatted
  property_address: 134     // PropertyAddressFull
};

const COLUMN_ORDER = [
  'transaction_id',
  'attom_id',
  'document_type',
  'recording_date',
  'transfer_amount',
  'grantor_name',
  'grantee_name',
  'grantee_mail_address',
  'grantee_mail_city',
  'grantee_mail_state',
  'grantee_mail_zip',
  'grantee_investor_flag',
  'foreclosure_flag',
  'mortgage_amount',
  'mortgage_lender',
  'mortgage_rate',
  'mortgage_term',
  'apn_formatted',
  'property_address'
];

async function extract() {
  console.log('Extracting columns from RECORDER CSV...');
  console.log(`Input: ${INPUT}`);
  console.log(`Output: ${OUTPUT}`);
  
  const input = fs.createReadStream(INPUT);
  const output = fs.createWriteStream(OUTPUT);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  
  let lineCount = 0;
  let isHeader = true;
  
  // Write header
  output.write(COLUMN_ORDER.join(',') + '\n');
  
  for await (const line of rl) {
    lineCount++;
    
    if (isHeader) {
      isHeader = false;
      continue; // Skip header row
    }
    
    // Parse CSV line (handle quoted fields)
    const fields = parseCSVLine(line);
    
    // Extract only needed columns
    const extracted = COLUMN_ORDER.map(colName => {
      const index = COLUMN_INDICES[colName];
      const value = fields[index] || '';
      // Escape quotes and wrap in quotes
      return `"${value.replace(/"/g, '""')}"`;
    });
    
    output.write(extracted.join(',') + '\n');
    
    if (lineCount % 100000 === 0) {
      console.log(`Processed ${lineCount.toLocaleString()} rows...`);
    }
  }
  
  output.end();
  console.log(`\nDone! Total rows: ${lineCount.toLocaleString()}`);
  console.log(`Output: ${OUTPUT}`);
}

function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  
  return fields;
}

extract().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

