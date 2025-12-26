import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function analyzeDatabaseSize() {
  try {
    console.log('🔍 Analyzing database size...\n');

    // Get total database size
    const dbSizeResult = await prisma.$queryRaw`
      SELECT pg_size_pretty(pg_database_size(current_database())) as total_size,
             pg_database_size(current_database()) as total_size_bytes
    `;
    console.log('📊 Total Database Size:');
    const dbSize = dbSizeResult[0];
    console.log(`Total: ${dbSize.total_size}`);
    console.log(`Bytes: ${dbSize.total_size_bytes.toString()}`);
    console.log('');

    // Get table sizes
    const tableSizes = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) as table_size,
        pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) as index_size,
        pg_total_relation_size(schemaname || '.' || tablename) as total_size_bytes
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
    `;

    console.log('📋 Table Sizes (sorted by total size):');
    console.log('─'.repeat(100));
    tableSizes.forEach((table, index) => {
      const bytes = typeof table.total_size_bytes === 'bigint' 
        ? Number(table.total_size_bytes) 
        : Number(table.total_size_bytes);
      console.log(`${index + 1}. ${table.tablename}`);
      console.log(`   Total: ${table.total_size} | Table: ${table.table_size} | Indexes: ${table.index_size}`);
      console.log(`   Bytes: ${bytes}`);
      console.log('');
    });

    // Count rows in major tables
    console.log('📊 Row Counts:');
    console.log('─'.repeat(100));
    
    const tables = ['properties', 'listings', 'deals', 'users', 'comps', 'activities', 'tasks', 'documents'];
    
    for (const tableName of tables) {
      try {
        const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`${tableName}: ${count[0].count} rows`);
      } catch (err) {
        // Table might not exist, skip
        console.log(`${tableName}: (table not found)`);
      }
    }

    // Check properties distribution
    console.log('\n🏙️  Properties Distribution by City/State:');
    console.log('─'.repeat(100));
    try {
      const distribution = await prisma.$queryRaw`
        SELECT 
          COALESCE(city, "siteCity", 'NULL') as city,
          COALESCE(state, "siteState", 'NULL') as state,
          COUNT(*) as count
        FROM properties 
        GROUP BY COALESCE(city, "siteCity"), COALESCE(state, "siteState")
        ORDER BY COUNT(*) DESC 
        LIMIT 20
      `;
      distribution.forEach((row, index) => {
        console.log(`${index + 1}. ${row.city}, ${row.state}: ${row.count} properties`);
      });
    } catch (err) {
      console.log('Error querying properties distribution:', err.message);
    }

    // Calculate total size breakdown
    const totalBytes = tableSizes.reduce((sum, table) => {
      const bytes = typeof table.total_size_bytes === 'bigint' 
        ? Number(table.total_size_bytes) 
        : Number(table.total_size_bytes);
      return sum + bytes;
    }, 0);
    
    const dbTotalBytes = typeof dbSize.total_size_bytes === 'bigint'
      ? Number(dbSize.total_size_bytes)
      : Number(dbSize.total_size_bytes);
    
    console.log('\n📈 Summary:');
    console.log('─'.repeat(100));
    console.log(`Total database size: ${dbSize.total_size}`);
    console.log(`Total from tables: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Top 5 largest tables:`);
    tableSizes.slice(0, 5).forEach((table, index) => {
      const tableBytes = typeof table.total_size_bytes === 'bigint'
        ? Number(table.total_size_bytes)
        : Number(table.total_size_bytes);
      const percentage = ((tableBytes / dbTotalBytes) * 100).toFixed(2);
      console.log(`  ${index + 1}. ${table.tablename}: ${table.total_size} (${percentage}%)`);
    });

  } catch (error) {
    console.error('❌ Error analyzing database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDatabaseSize();

