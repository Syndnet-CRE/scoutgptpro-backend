import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  const dbUrl = process.env.DATABASE_URL || '';
  console.log('DATABASE_URL:', dbUrl.substring(0, 80) + '...');
  console.log('Connection type:', dbUrl.includes('pooler') ? 'POOLER' : 'DIRECT');
  console.log('SSL mode:', dbUrl.includes('sslmode') ? dbUrl.match(/sslmode=([^&]*)/)?.[1] : 'not specified');
  console.log('Attempting connection...');
  
  try {
    // Test basic connection
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('SUCCESS: Connection established');
    console.log('Result:', result);
    
    // Test a simple query
    const count = await prisma.user.count();
    console.log('User count:', count);
  } catch (error) {
    console.error('FAILED:', error.message);
    console.error('Error code:', error.code);
    console.error('Error name:', error.name);
    if (error.meta) {
      console.error('Error meta:', error.meta);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
