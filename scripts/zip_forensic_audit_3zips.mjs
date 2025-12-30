/**
 * Zip Forensic Audit Script (3 Zips)
 * 
 * Read-only analysis of three zip files to identify parcel identifier fields
 * that can bridge to Neon properties.parcelId (6-digit numeric string).
 * 
 * NO DATABASE WRITES. NO FILE MODIFICATIONS. READ-ONLY ONLY.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { createReadStream, readdir, stat } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { execSync } from 'child_process';
import { promisify } from 'util';
import { readdir as readdirAsync, stat as statAsync } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');
dotenv.config({ path: envPath });

const prisma = new PrismaClient();

const ZIP_PATHS = [
  { name: 'zip1', path: '/Users/braydonirwin/Downloads/drive-download-20251228T175519Z-3-001.zip', extractDir: '/tmp/zip_audit_3zips/zip1' },
  { name: 'zip2', path: '/Users/braydonirwin/Downloads/drive-download-20251228T175545Z-3-001.zip', extractDir: '/tmp/zip_audit_3zips/zip2' },
  { name: 'zip3', path: '/Users/braydonirwin/Downloads/drive-download-20251228T175555Z-3-001.zip', extractDir: '/tmp/zip_audit_3zips/zip3' }
];

const RESULTS = {
  zips: [],
  neonParcelIdSet: null,
  candidateFields: [],
  testedFields: [],
  conclusion: null
};

// Known parcelId format: 6-digit numeric string (100008-976502)
const PARCELID_PATTERN = /^\d{6}$/;
const PARCELID_MIN = 100008;
const PARCELID_MAX = 976502;

// Candidate field name patterns
const CANDIDATE_PATTERNS = [
  /parcel/i,
  /apn/i,
  /account/i,
  /geo/i,
  /prop.*id/i,
  /fips/i,
  /parcel.*number/i,
  /parcel.*id/i
];

// Helper to convert BigInt to Number
function convertBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(convertBigInt);
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigInt(value);
    }
    return converted;
  }
  return obj;
}

// Simple CSV line parser (handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

// Get file type from extension
function getFileType(fileName) {
  const ext = extname(fileName).toLowerCase();
  const typeMap = {
    '.csv': 'csv',
    '.tsv': 'tsv',
    '.dbf': 'dbf',
    '.shp': 'shapefile',
    '.shx': 'shapefile_index',
    '.prj': 'projection',
    '.gpkg': 'gpkg',
    '.geojson': 'geojson',
    '.json': 'json',
    '.parquet': 'parquet',
    '.xlsx': 'excel',
    '.xls': 'excel'
  };
  return typeMap[ext] || 'unknown';
}

// Check if field name suggests parcel ID
function isCandidateFieldName(fieldName) {
  return CANDIDATE_PATTERNS.some(pattern => pattern.test(fieldName));
}

// Analyze a CSV/TSV file
async function analyzeCSV(filePath, fileName, delimiter = ',') {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header = null;
  let headerIndices = {};
  const fieldStats = {};
  const maxRows = 200;

  for await (const line of rl) {
    lineNumber++;
    
    if (lineNumber === 1) {
      header = delimiter === ',' ? parseCSVLine(line) : line.split('\t');
      header.forEach((col, idx) => {
        const cleanCol = col.trim().replace(/^["\[]|["\]]$/g, '');
        headerIndices[cleanCol] = idx;
        headerIndices[col.trim()] = idx;
        
        fieldStats[cleanCol] = {
          name: cleanCol,
          lengths: new Set(),
          numericCount: 0,
          nonNumericCount: 0,
          samples: [],
          min: null,
          max: null,
          isCandidateName: isCandidateFieldName(cleanCol)
        };
      });
      continue;
    }
    
    if (lineNumber > maxRows + 1) break;
    
    const values = delimiter === ',' ? parseCSVLine(line) : line.split('\t');
    if (values.length < header.length) continue;
    
    for (const [fieldName, idx] of Object.entries(headerIndices)) {
      if (idx >= values.length) continue;
      
      const value = values[idx]?.trim().replace(/^["]|["]$/g, '');
      if (!value) continue;
      
      const stats = fieldStats[fieldName];
      if (!stats) continue;
      
      stats.lengths.add(value.length);
      
      const isNumeric = /^\d+$/.test(value);
      if (isNumeric) {
        stats.numericCount++;
        const num = parseInt(value, 10);
        if (stats.min === null || num < stats.min) stats.min = num;
        if (stats.max === null || num > stats.max) stats.max = num;
      } else {
        stats.nonNumericCount++;
      }
      
      if (stats.samples.length < 5) {
        stats.samples.push(value);
      }
    }
  }
  
  // Convert Sets to Arrays
  const processedStats = {};
  for (const [fieldName, stats] of Object.entries(fieldStats)) {
    processedStats[fieldName] = {
      ...stats,
      lengths: Array.from(stats.lengths).sort((a, b) => a - b),
      totalSamples: stats.numericCount + stats.nonNumericCount
    };
  }
  
  return {
    header,
    fieldStats: processedStats,
    rowsAnalyzed: Math.min(lineNumber - 1, maxRows)
  };
}

// Analyze a GeoJSON file
async function analyzeGeoJSON(filePath, fileName) {
  const content = await import('fs').then(fs => fs.promises.readFile(filePath, 'utf8'));
  const data = JSON.parse(content);
  
  const features = data.features || [];
  const maxFeatures = Math.min(features.length, 200);
  const fieldStats = {};
  
  if (features.length > 0 && features[0].properties) {
    for (const [key, value] of Object.entries(features[0].properties)) {
      fieldStats[key] = {
        name: key,
        lengths: new Set(),
        numericCount: 0,
        nonNumericCount: 0,
        samples: [],
        min: null,
        max: null,
        isCandidateName: isCandidateFieldName(key)
      };
    }
  }
  
  for (let i = 0; i < maxFeatures; i++) {
    const props = features[i]?.properties || {};
    for (const [fieldName, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      
      const stats = fieldStats[fieldName];
      if (!stats) continue;
      
      const strValue = String(value).trim();
      if (!strValue) continue;
      
      stats.lengths.add(strValue.length);
      
      const isNumeric = /^\d+$/.test(strValue);
      if (isNumeric) {
        stats.numericCount++;
        const num = parseInt(strValue, 10);
        if (stats.min === null || num < stats.min) stats.min = num;
        if (stats.max === null || num > stats.max) stats.max = num;
      } else {
        stats.nonNumericCount++;
      }
      
      if (stats.samples.length < 5) {
        stats.samples.push(strValue);
      }
    }
  }
  
  const processedStats = {};
  for (const [fieldName, stats] of Object.entries(fieldStats)) {
    processedStats[fieldName] = {
      ...stats,
      lengths: Array.from(stats.lengths).sort((a, b) => a - b),
      totalSamples: stats.numericCount + stats.nonNumericCount
    };
  }
  
  return {
    type: 'geojson',
    totalFeatures: features.length,
    featuresAnalyzed: maxFeatures,
    fieldStats: processedStats
  };
}

// Analyze a DBF file
async function analyzeDBF(filePath, fileName) {
  try {
    const { writeFileSync, unlinkSync } = await import('fs');
    const { tmpdir } = await import('os');
    const tempScript = join(tmpdir(), `dbf_audit_${Date.now()}.py`);
    
    const pythonScript = `import json
from dbfread import DBF
try:
    table = DBF('${filePath}', encoding='latin1')
except:
    table = DBF('${filePath}')
fields = [{'name': f.name, 'type': f.type, 'length': f.length, 'decimal': f.decimal} for f in table.fields]
records = []
for i, record in enumerate(table):
    if i >= 200:
        break
    records.append({k: str(v).strip() if v is not None else '' for k, v in record.items()})
print(json.dumps({'fields': fields, 'records': records, 'total': len(list(table))}))`;
    
    writeFileSync(tempScript, pythonScript);
    const result = execSync(`python3 "${tempScript}"`, { 
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    unlinkSync(tempScript);
    
    const data = JSON.parse(result);
    
    const fieldStats = {};
    for (const field of data.fields) {
      fieldStats[field.name] = {
        name: field.name,
        type: field.type,
        length: field.length,
        lengths: new Set(),
        numericCount: 0,
        nonNumericCount: 0,
        samples: [],
        min: null,
        max: null,
        isCandidateName: isCandidateFieldName(field.name)
      };
    }
    
    for (const record of data.records) {
      for (const [fieldName, value] of Object.entries(record)) {
        const stats = fieldStats[fieldName];
        if (!stats || !value) continue;
        
        const strValue = String(value).trim();
        if (!strValue) continue;
        
        stats.lengths.add(strValue.length);
        
        const isNumeric = /^\d+$/.test(strValue);
        if (isNumeric) {
          stats.numericCount++;
          const num = parseInt(strValue, 10);
          if (stats.min === null || num < stats.min) stats.min = num;
          if (stats.max === null || num > stats.max) stats.max = num;
        } else {
          stats.nonNumericCount++;
        }
        
        if (stats.samples.length < 5) {
          stats.samples.push(strValue);
        }
      }
    }
    
    const processedStats = {};
    for (const [fieldName, stats] of Object.entries(fieldStats)) {
      processedStats[fieldName] = {
        ...stats,
        lengths: Array.from(stats.lengths).sort((a, b) => a - b),
        totalSamples: stats.numericCount + stats.nonNumericCount
      };
    }
    
    return {
      type: 'dbf',
      totalRecords: data.total,
      recordsAnalyzed: data.records.length,
      fieldStats: processedStats
    };
    
  } catch (error) {
    return { type: 'dbf', error: error.message };
  }
}

// Identify candidate fields
function identifyCandidates(fieldStats) {
  const candidates = [];
  
  for (const [fieldName, stats] of Object.entries(fieldStats)) {
    const hasReasonableLength = stats.lengths.some(len => len >= 5 && len <= 16);
    const mostlyNumeric = stats.totalSamples > 0 && 
      (stats.numericCount / stats.totalSamples) > 0.7;
    const hasCandidateName = stats.isCandidateName;
    
    if ((hasReasonableLength && mostlyNumeric) || hasCandidateName) {
      candidates.push({
        fieldName,
        ...stats,
        candidateReason: hasCandidateName ? 'Name pattern match' : 'Length + numeric pattern'
      });
    }
  }
  
  return candidates;
}

// Test overlap with Neon parcelIds
function testOverlap(fieldStats, fieldName, parcelIdSet, filePath) {
  const stats = fieldStats[fieldName];
  if (!stats) return null;
  
  const results = {
    file: filePath,
    fieldName,
    exactMatches: 0,
    normalizedMatches: {},
    uniqueValues: new Set(),
    overlapRate: 0
  };
  
  // Test exact matches
  for (const sample of stats.samples) {
    if (PARCELID_PATTERN.test(sample)) {
      const num = parseInt(sample, 10);
      if (num >= PARCELID_MIN && num <= PARCELID_MAX) {
        if (parcelIdSet.has(sample)) {
          results.exactMatches++;
        }
      }
      results.uniqueValues.add(sample);
    }
  }
  
  // Test normalized variants if evidence supports
  const lengths = stats.lengths;
  const has14Digit = lengths.includes(14);
  const hasLeadingZeros = stats.samples.some(s => /^0+/.test(s));
  
  if (has14Digit) {
    // Test rightmost 6 digits (heuristic, not acceptable)
    const rightmost6Matches = 0;
    for (const sample of stats.samples) {
      if (sample.length >= 6 && /^\d+$/.test(sample)) {
        const normalized = sample.slice(-6);
        if (parcelIdSet.has(normalized)) {
          rightmost6Matches++;
        }
      }
    }
    results.normalizedMatches.rightmost_6 = {
      matches: rightmost6Matches,
      note: 'heuristic, not acceptable for ingestion'
    };
  }
  
  if (hasLeadingZeros) {
    // Test trim leading zeros
    const trimZerosMatches = 0;
    for (const sample of stats.samples) {
      if (/^\d+$/.test(sample)) {
        const normalized = sample.replace(/^0+/, '') || '0';
        if (normalized.length === 6 && parcelIdSet.has(normalized)) {
          trimZerosMatches++;
        }
      }
    }
    results.normalizedMatches.trim_leading_zeros = {
      matches: trimZerosMatches
    };
  }
  
  results.overlapRate = results.uniqueValues.size > 0 
    ? (results.exactMatches / results.uniqueValues.size * 100).toFixed(2)
    : '0.00';
  
  return {
    ...results,
    uniqueValues: Array.from(results.uniqueValues)
  };
}

// Load Neon parcelIds
async function loadNeonParcelIds() {
  console.log('\n🔍 Loading Neon parcelIds for overlap testing...');
  const parcelIdSet = new Set();
  const chunkSize = 10000;
  let offset = 0;
  let totalLoaded = 0;
  
  while (parcelIdSet.size < 50000) {
    const chunk = await prisma.$queryRawUnsafe(`
      SELECT "parcelId"
      FROM properties
      WHERE "parcelId" IS NOT NULL
      ORDER BY "parcelId"
      LIMIT ${chunkSize} OFFSET ${offset};
    `);
    
    if (chunk.length === 0) break;
    
    chunk.forEach(row => parcelIdSet.add(String(row.parcelId)));
    totalLoaded += chunk.length;
    offset += chunkSize;
    
    if (parcelIdSet.size % 10000 === 0) {
      console.log(`  Loaded ${parcelIdSet.size} unique parcelIds...`);
    }
  }
  
  console.log(`✅ Loaded ${parcelIdSet.size} unique parcelIds`);
  return parcelIdSet;
}

// Get all files recursively
async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = await readdirAsync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.replace(baseDir + '/', '');
    
    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      files.push({
        name: entry.name,
        fullPath,
        relativePath,
        type: getFileType(entry.name)
      });
    }
  }
  
  return files;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function main() {
  try {
    console.log('🚀 Starting Zip Forensic Audit (3 Zips)\n');
    console.log('='.repeat(60));
    
    // Load Neon parcelIds
    const parcelIdSet = await loadNeonParcelIds();
    RESULTS.neonParcelIdSetSize = parcelIdSet.size;
    
    // Process each zip
    for (const zipInfo of ZIP_PATHS) {
      console.log(`\n📦 Processing ${zipInfo.name}...`);
      console.log('='.repeat(60));
      
      const zipResult = {
        name: zipInfo.name,
        path: zipInfo.path,
        files: [],
        candidateFields: [],
        testedFields: []
      };
      
      // List all files
      const files = await getAllFiles(zipInfo.extractDir);
      
      for (const file of files) {
        const stats = await statAsync(file.fullPath);
        const fileInfo = {
          path: file.relativePath,
          name: file.name,
          type: file.type,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size)
        };
        
        zipResult.files.push(fileInfo);
        
        // Analyze data files
        if (file.type === 'csv' || file.type === 'tsv') {
          console.log(`\n📄 Analyzing ${file.type.toUpperCase()}: ${file.name}`);
          const delimiter = file.type === 'tsv' ? '\t' : ',';
          const analysis = await analyzeCSV(file.fullPath, file.name, delimiter);
          fileInfo.analysis = analysis;
          
          if (analysis.fieldStats) {
            const candidates = identifyCandidates(analysis.fieldStats);
            if (candidates.length > 0) {
              console.log(`   ✅ Found ${candidates.length} candidate field(s)`);
              zipResult.candidateFields.push(...candidates.map(c => ({
                file: file.relativePath,
                ...c
              })));
              
              // Test overlap
              for (const cand of candidates) {
                const testResult = testOverlap(analysis.fieldStats, cand.fieldName, parcelIdSet, file.relativePath);
                if (testResult) {
                  zipResult.testedFields.push(testResult);
                  RESULTS.testedFields.push({
                    zip: zipInfo.name,
                    ...testResult
                  });
                }
              }
            }
          }
        } else if (file.type === 'geojson' || file.type === 'json') {
          console.log(`\n📄 Analyzing GeoJSON: ${file.name}`);
          const analysis = await analyzeGeoJSON(file.fullPath, file.name);
          fileInfo.analysis = analysis;
          
          if (analysis.fieldStats) {
            const candidates = identifyCandidates(analysis.fieldStats);
            if (candidates.length > 0) {
              console.log(`   ✅ Found ${candidates.length} candidate field(s)`);
              zipResult.candidateFields.push(...candidates.map(c => ({
                file: file.relativePath,
                ...c
              })));
              
              for (const cand of candidates) {
                const testResult = testOverlap(analysis.fieldStats, cand.fieldName, parcelIdSet, file.relativePath);
                if (testResult) {
                  zipResult.testedFields.push(testResult);
                  RESULTS.testedFields.push({
                    zip: zipInfo.name,
                    ...testResult
                  });
                }
              }
            }
          }
        } else if (file.type === 'dbf') {
          console.log(`\n📄 Analyzing DBF: ${file.name}`);
          const analysis = await analyzeDBF(file.fullPath, file.name);
          fileInfo.analysis = analysis;
          
          if (analysis.fieldStats && !analysis.error) {
            const candidates = identifyCandidates(analysis.fieldStats);
            if (candidates.length > 0) {
              console.log(`   ✅ Found ${candidates.length} candidate field(s)`);
              zipResult.candidateFields.push(...candidates.map(c => ({
                file: file.relativePath,
                ...c
              })));
              
              for (const cand of candidates) {
                const testResult = testOverlap(analysis.fieldStats, cand.fieldName, parcelIdSet, file.relativePath);
                if (testResult) {
                  zipResult.testedFields.push(testResult);
                  RESULTS.testedFields.push({
                    zip: zipInfo.name,
                    ...testResult
                  });
                }
              }
            }
          }
        }
      }
      
      RESULTS.zips.push(zipResult);
    }
    
    // Generate conclusion
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 Generating conclusion...\n');
    
    const bestMatch = RESULTS.testedFields
      .filter(f => f.exactMatches > 0)
      .sort((a, b) => parseFloat(b.overlapRate) - parseFloat(a.overlapRate))[0];
    
    if (bestMatch && bestMatch.exactMatches > 0) {
      RESULTS.conclusion = 'Bridge exists';
      console.log(`✅ CONCLUSION: Bridge EXISTS`);
      console.log(`   Best match: ${bestMatch.fieldName} in ${bestMatch.file} (${bestMatch.zip})`);
      console.log(`   Exact matches: ${bestMatch.exactMatches}`);
      console.log(`   Overlap rate: ${bestMatch.overlapRate}%`);
    } else {
      RESULTS.conclusion = 'Bridge missing';
      console.log(`❌ CONCLUSION: Bridge MISSING`);
      console.log(`   No exact matches found in any tested fields`);
    }
    
    // Output JSON
    console.log('\n📄 Results JSON:');
    console.log(JSON.stringify(RESULTS, null, 2));
    
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

