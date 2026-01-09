import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runAudit() {
  const client = await pool.connect();
  
  try {
    console.log('\n=== 1. parcel_features_travis structure ===\n');
    const cols1 = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'parcel_features_travis'
      ORDER BY ordinal_position;
    `);
    console.table(cols1.rows);

    console.log('\n=== 2. properties table structure ===\n');
    const cols2 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'properties'
      ORDER BY ordinal_position;
    `);
    console.table(cols2.rows);

    console.log('\n=== 3. All tables with parcel/signal/opportunity in name ===\n');
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%parcel%' OR table_name LIKE '%signal%' OR table_name LIKE '%opportunity%')
      ORDER BY table_name;
    `);
    console.table(tables.rows);

    console.log('\n=== 4. Indexes on parcel_features_travis ===\n');
    const indexes = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'parcel_features_travis';
    `);
    console.table(indexes.rows);

    console.log('\n=== 5. Sample row from parcel_features_travis ===\n');
    const sample = await client.query(`
      SELECT * FROM parcel_features_travis LIMIT 1;
    `);
    console.log(JSON.stringify(sample.rows[0], null, 2));

    console.log('\n=== 6. Row counts ===\n');
    const counts = await client.query(`
      SELECT 'parcel_features_travis' as tbl, COUNT(*)::int as count FROM parcel_features_travis
      UNION ALL
      SELECT 'properties', COUNT(*)::int FROM properties;
    `);
    console.table(counts.rows);

    console.log('\n=== 7. All parcel enrichment tables ===\n');
    const enrichment = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%enrichment%'
      ORDER BY table_name;
    `);
    console.table(enrichment.rows);

    console.log('\n=== 8. Sample from parcels_travis_enrichment (if exists) ===\n');
    try {
      const enrichSample = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns 
        WHERE table_name = 'parcels_travis_enrichment'
        ORDER BY ordinal_position;
      `);
      console.table(enrichSample.rows);
    } catch (e) {
      console.log('Table does not exist or error:', e.message);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

runAudit().catch(console.error);
