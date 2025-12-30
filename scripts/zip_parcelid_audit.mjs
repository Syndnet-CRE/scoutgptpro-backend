/**
 * Zip ParcelID Forensic Audit Script
 * 
 * Read-only analysis of zip file contents to identify parcel identifier fields
 * that can map to Neon properties.parcelId (6-digit numeric string).
 * 
 * NO DATABASE WRITES. NO FILE MODIFICATIONS. READ-ONLY ONLY.
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { execSync } from 'child_process';

const ZIP_EXTRACT_DIR = '/tmp/zip_audit';
const RESULTS = {
  files: [],
  candidateFields: [],
  testedFields: [],
  conclusion: null
};

// Known parcelId format: 6-digit numeric string (100008-976502)
const PARCELID_PATTERN = /^\d{6}$/;
const PARCELID_MIN = 100008;
const PARCELID_MAX = 976502;

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

// Analyze a CSV file
async function analyzeCSV(filePath, fileName) {
  console.log(`\n📄 Analyzing CSV: ${fileName}`);
  
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let header = null;
  let headerIndices = {};
  const fieldStats = {};
  const samples = {};
  const maxRows = 100;

  for await (const line of rl) {
    lineNumber++;
    
    if (lineNumber === 1) {
      header = parseCSVLine(line);
      header.forEach((col, idx) => {
        const cleanCol = col.trim().replace(/^["\[]|["\]]$/g, '');
        headerIndices[cleanCol] = idx;
        headerIndices[col.trim()] = idx;
        
        // Initialize stats for each field
        fieldStats[cleanCol] = {
          name: cleanCol,
          lengths: new Set(),
          numericCount: 0,
          nonNumericCount: 0,
          samples: [],
          min: null,
          max: null
        };
      });
      console.log(`   Columns: ${header.length}`);
      continue;
    }
    
    if (lineNumber > maxRows + 1) break; // Stop after 100 rows
    
    const values = parseCSVLine(line);
    if (values.length < header.length) continue;
    
    // Analyze each field
    for (const [fieldName, idx] of Object.entries(headerIndices)) {
      if (idx >= values.length) continue;
      
      const value = values[idx]?.trim().replace(/^["]|["]$/g, '');
      if (!value) continue;
      
      const stats = fieldStats[fieldName];
      if (!stats) continue;
      
      // Track length
      stats.lengths.add(value.length);
      
      // Check if numeric
      const isNumeric = /^\d+$/.test(value);
      if (isNumeric) {
        stats.numericCount++;
        const num = parseInt(value, 10);
        if (stats.min === null || num < stats.min) stats.min = num;
        if (stats.max === null || num > stats.max) stats.max = num;
      } else {
        stats.nonNumericCount++;
      }
      
      // Collect samples (first 10)
      if (stats.samples.length < 10) {
        stats.samples.push(value);
      }
    }
  }
  
  // Convert Sets to Arrays for JSON
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
  console.log(`\n📄 Analyzing GeoJSON: ${fileName}`);
  
  const content = await import('fs').then(fs => fs.promises.readFile(filePath, 'utf8'));
  const data = JSON.parse(content);
  
  const features = data.features || [];
  const maxFeatures = Math.min(features.length, 100);
  const fieldStats = {};
  
  // Initialize stats from first feature
  if (features.length > 0 && features[0].properties) {
    for (const [key, value] of Object.entries(features[0].properties)) {
      fieldStats[key] = {
        name: key,
        lengths: new Set(),
        numericCount: 0,
        nonNumericCount: 0,
        samples: [],
        min: null,
        max: null
      };
    }
  }
  
  // Analyze features
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
      
      if (stats.samples.length < 10) {
        stats.samples.push(strValue);
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
  
  console.log(`   Features analyzed: ${maxFeatures} / ${features.length}`);
  console.log(`   Fields: ${Object.keys(processedStats).length}`);
  
  return {
    type: 'geojson',
    totalFeatures: features.length,
    featuresAnalyzed: maxFeatures,
    fieldStats: processedStats
  };
}

// Analyze a DBF file
async function analyzeDBF(filePath, fileName) {
  console.log(`\n📄 Analyzing DBF: ${fileName}`);
  
  // Use Python to read DBF (more reliable than manual parsing)
  try {
    const { writeFileSync, unlinkSync } = await import('fs');
    const { tmpdir } = await import('os');
    const tempScript = join(tmpdir(), `dbf_audit_${Date.now()}.py`);
    
    const pythonScript = `import json
import sys
from dbfread import DBF
table = DBF('${filePath}')
fields = [{'name': f.name, 'type': f.type, 'length': f.length, 'decimal': f.decimal} for f in table.fields]
records = []
for i, record in enumerate(table):
    if i >= 100:
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
    
    if (data.error) {
      console.log(`   ⚠️  Cannot analyze DBF (dbfread not available)`);
      return { type: 'dbf', error: data.error };
    }
    
    // Analyze fields
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
        max: null
      };
    }
    
    // Analyze records
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
        
        if (stats.samples.length < 10) {
          stats.samples.push(strValue);
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
    
    console.log(`   Records analyzed: ${data.records.length} / ${data.total}`);
    console.log(`   Fields: ${Object.keys(processedStats).length}`);
    
    return {
      type: 'dbf',
      totalRecords: data.total,
      recordsAnalyzed: data.records.length,
      fieldStats: processedStats
    };
    
  } catch (error) {
    console.log(`   ⚠️  Error analyzing DBF: ${error.message}`);
    return { type: 'dbf', error: error.message };
  }
}

// Test if field values match parcelId format
function testParcelIdMatch(fieldStats, fieldName) {
  const stats = fieldStats[fieldName];
  if (!stats) return null;
  
  const results = {
    fieldName,
    has6DigitValues: false,
    exactMatches: 0,
    overlapCount: 0,
    inRange: 0,
    samples: []
  };
  
  // Check if any values are exactly 6 digits
  if (stats.lengths.includes(6)) {
    results.has6DigitValues = true;
    
    // Test samples
    for (const sample of stats.samples) {
      if (PARCELID_PATTERN.test(sample)) {
        const num = parseInt(sample, 10);
        if (num >= PARCELID_MIN && num <= PARCELID_MAX) {
          results.exactMatches++;
          results.inRange++;
          if (results.samples.length < 5) {
            results.samples.push(sample);
          }
        } else if (PARCELID_PATTERN.test(sample)) {
          results.overlapCount++;
        }
      }
    }
  }
  
  return results;
}

// Identify candidate fields
function identifyCandidates(fieldStats) {
  const candidates = [];
  
  for (const [fieldName, stats] of Object.entries(fieldStats)) {
    // Candidate criteria:
    // - Contains 6-digit values
    // - Mostly numeric
    // - Length between 6-14 characters
    
    const has6Digit = stats.lengths.includes(6);
    const hasReasonableLength = stats.lengths.some(len => len >= 6 && len <= 14);
    const mostlyNumeric = stats.totalSamples > 0 && 
      (stats.numericCount / stats.totalSamples) > 0.8;
    
    if (has6Digit && hasReasonableLength && mostlyNumeric) {
      candidates.push({
        fieldName,
        ...stats,
        candidateReason: 'Has 6-digit numeric values'
      });
    }
  }
  
  return candidates;
}

async function main() {
  try {
    console.log('🔍 Starting Zip ParcelID Forensic Audit\n');
    console.log('='.repeat(60));
    
    // 1. List all files
    console.log('\n📁 Step 1: Listing all files in zip...\n');
    const files = await getAllFiles(ZIP_EXTRACT_DIR);
    
    for (const file of files) {
      const stats = await stat(file.fullPath);
      RESULTS.files.push({
        path: file.relativePath,
        name: file.name,
        type: file.type,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size)
      });
      
      console.log(`  ${file.relativePath} (${file.type}, ${formatBytes(stats.size)})`);
    }
    
    // 2. Analyze data files
    console.log('\n📊 Step 2: Analyzing data files...\n');
    
    for (const file of files) {
      if (file.type === 'csv') {
        const analysis = await analyzeCSV(file.fullPath, file.name);
        RESULTS.files.find(f => f.path === file.relativePath).analysis = analysis;
        
        // Identify candidates
        const candidates = identifyCandidates(analysis.fieldStats);
        if (candidates.length > 0) {
          console.log(`   ✅ Found ${candidates.length} candidate field(s)`);
          for (const cand of candidates) {
            console.log(`      - ${cand.fieldName} (lengths: ${cand.lengths.join(', ')})`);
          }
        }
        
        // Test candidates
        for (const cand of candidates) {
          const testResult = testParcelIdMatch(analysis.fieldStats, cand.fieldName);
          if (testResult && testResult.has6DigitValues) {
            RESULTS.testedFields.push({
              file: file.relativePath,
              ...testResult
            });
          }
        }
      } else if (file.type === 'geojson') {
        const analysis = await analyzeGeoJSON(file.fullPath, file.name);
        RESULTS.files.find(f => f.path === file.relativePath).analysis = analysis;
        
        if (analysis && analysis.fieldStats) {
          // Identify candidates
          const candidates = identifyCandidates(analysis.fieldStats);
          if (candidates.length > 0) {
            console.log(`   ✅ Found ${candidates.length} candidate field(s)`);
            for (const cand of candidates) {
              console.log(`      - ${cand.fieldName} (lengths: ${cand.lengths.join(', ')})`);
            }
          }
          
          // Test candidates
          for (const cand of candidates) {
            const testResult = testParcelIdMatch(analysis.fieldStats, cand.fieldName);
            if (testResult && testResult.has6DigitValues) {
              RESULTS.testedFields.push({
                file: file.relativePath,
                ...testResult
              });
            }
          }
        }
      } else if (file.type === 'dbf') {
        const analysis = await analyzeDBF(file.fullPath, file.name);
        RESULTS.files.find(f => f.path === file.relativePath).analysis = analysis;
        
        if (analysis && analysis.fieldStats && !analysis.error) {
          // Identify candidates
          const candidates = identifyCandidates(analysis.fieldStats);
          if (candidates.length > 0) {
            console.log(`   ✅ Found ${candidates.length} candidate field(s)`);
            for (const cand of candidates) {
              console.log(`      - ${cand.fieldName} (lengths: ${cand.lengths.join(', ')})`);
            }
          }
          
          // Test candidates
          for (const cand of candidates) {
            const testResult = testParcelIdMatch(analysis.fieldStats, cand.fieldName);
            if (testResult && testResult.has6DigitValues) {
              RESULTS.testedFields.push({
                file: file.relativePath,
                ...testResult
              });
            }
          }
        }
      }
    }
    
    // 3. Generate conclusion
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 Step 3: Generating conclusion...\n');
    
    if (RESULTS.testedFields.length > 0) {
      const bestMatch = RESULTS.testedFields
        .sort((a, b) => b.exactMatches - a.exactMatches)[0];
      
      if (bestMatch.exactMatches > 0) {
        RESULTS.conclusion = 'ParcelId bridge exists';
        console.log(`✅ CONCLUSION: ParcelId bridge EXISTS`);
        console.log(`   Best match: ${bestMatch.fieldName} in ${bestMatch.file}`);
        console.log(`   Exact matches found: ${bestMatch.exactMatches}`);
        console.log(`   Sample values: ${bestMatch.samples.join(', ')}`);
      } else {
        RESULTS.conclusion = 'ParcelId bridge missing';
        console.log(`❌ CONCLUSION: ParcelId bridge MISSING`);
        console.log(`   No exact matches found in tested fields`);
      }
    } else {
      RESULTS.conclusion = 'ParcelId bridge missing';
      console.log(`❌ CONCLUSION: ParcelId bridge MISSING`);
      console.log(`   No candidate fields found`);
    }
    
    // Output JSON
    console.log('\n📄 Results JSON:');
    console.log(JSON.stringify(RESULTS, null, 2));
    
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Helper functions
async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.replace(baseDir + '/', '');
    
    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      const ext = extname(entry.name).toLowerCase();
      let type = 'unknown';
      
      if (ext === '.csv') type = 'csv';
      else if (ext === '.geojson' || ext === '.json') type = 'geojson';
      else if (ext === '.shp') type = 'shapefile';
      else if (ext === '.dbf') type = 'dbf';
      else if (ext === '.xlsx' || ext === '.xls') type = 'excel';
      else if (ext === '.txt') type = 'text';
      else if (ext === '.zip') type = 'zip';
      
      files.push({
        name: entry.name,
        fullPath,
        relativePath,
        type
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

main();

