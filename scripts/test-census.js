#!/usr/bin/env node
// Test script for Census API integration

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDemographicsForLocation } from '../src/services/census/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
dotenv.config({ path: join(__dirname, '..', '.env') });

async function test() {
  console.log('Testing Census API with Austin, TX coordinates...');
  console.log('Location: 30.2672, -97.7431 (Downtown Austin)');
  console.log('');
  
  try {
    const result = await getDemographicsForLocation(30.2672, -97.7431);
    console.log('✅ SUCCESS: Census API integration working');
    console.log('');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

test().catch(console.error);
