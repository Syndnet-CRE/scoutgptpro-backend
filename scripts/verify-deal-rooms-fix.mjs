#!/usr/bin/env node
/**
 * Verify deal_rooms migration fix
 */

import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;
const prisma = new PrismaClient();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function verify() {
  try {
    console.log('Verifying deal_rooms migration fix...\n');
    
    // 1. Check database columns
    console.log('1. Checking database columns...');
    const dbResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'deal_rooms'
        AND column_name IN ('ownerId', 'title', 'propertyIds', 'primaryPropertyId')
      ORDER BY column_name;
    `);
    
    console.log('   Database columns:');
    dbResult.rows.forEach(row => {
      console.log(`     ✓ ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    });
    
    if (dbResult.rows.length < 4) {
      console.log('   ❌ Missing columns!');
      return;
    }
    
    // 2. Test Prisma query
    console.log('\n2. Testing Prisma query...');
    try {
      const dealRooms = await prisma.dealRoom.findMany({
        take: 3,
        select: {
          id: true,
          ownerId: true,
          title: true,
          propertyIds: true,
          primaryPropertyId: true,
          status: true
        }
      });
      
      console.log(`   ✓ Prisma query successful! Found ${dealRooms.length} deal rooms`);
      console.log('\n   Sample data:');
      dealRooms.forEach((room, i) => {
        console.log(`     Room ${i + 1}:`);
        console.log(`       id: ${room.id}`);
        console.log(`       ownerId: ${room.ownerId}`);
        console.log(`       title: ${room.title}`);
        console.log(`       propertyIds: [${room.propertyIds.join(', ')}]`);
        console.log(`       primaryPropertyId: ${room.primaryPropertyId || 'null'}`);
      });
      
    } catch (error) {
      console.log(`   ❌ Prisma query failed: ${error.message}`);
      throw error;
    }
    
    // 3. Test creating a new deal room
    console.log('\n3. Testing create operation...');
    try {
      const testRoom = await prisma.dealRoom.create({
        data: {
          ownerId: 'test_user_123',
          title: 'Test Deal Room',
          status: 'inbound'
        }
      });
      
      console.log(`   ✓ Create successful! ID: ${testRoom.id}`);
      
      // Clean up test room
      await prisma.dealRoom.delete({
        where: { id: testRoom.id }
      });
      console.log('   ✓ Test room cleaned up');
      
    } catch (error) {
      console.log(`   ❌ Create failed: ${error.message}`);
      throw error;
    }
    
    console.log('\n✅ All verification tests passed!');
    console.log('\nThe deal_rooms table is now compatible with Prisma schema.');
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

verify().catch(console.error);
