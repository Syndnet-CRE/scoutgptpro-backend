#!/usr/bin/env python3
"""
Bulk load ATTOM parcels from CSV into PostgreSQL.
Phase 1: COPY flat data + raw GeoJSON as text
Phase 2: Convert geometry in-database via ST_GeomFromGeoJSON
"""

import csv
csv.field_size_limit(10 * 1024 * 1024)
import io
import logging
import os
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.getenv('DATABASE_URL')
CSV_PATH = os.path.join(os.path.dirname(__file__), 'parcels_travis.csv')
BATCH_SIZE = 10000


def clean_db_url(url):
    """Remove sslmode and other params that conflict with psycopg2."""
    if '?' in url:
        url = url.split('?')[0]
    return url


def main():
    start = time.time()
    conn = psycopg2.connect(
        clean_db_url(DB_URL),
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5
    )
    conn.autocommit = False
    cur = conn.cursor()

    # Add temp column for raw GeoJSON text
    logger.info("Adding geom_raw column...")
    cur.execute("ALTER TABLE attom_parcels ADD COLUMN IF NOT EXISTS geom_raw TEXT;")
    conn.commit()

    # Phase 1: Bulk insert flat data
    logger.info("Phase 1: Reading CSV and bulk inserting...")
    row_count = 0
    error_count = 0
    batch = []

    with open(CSV_PATH, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                batch.append((
                    row['ID'],
                    row.get('APN', ''),
                    row.get('APN2', ''),
                    row.get('FIPSSTATE', ''),
                    row.get('FIPSCOUNTY', ''),
                    row.get('ADDRLINE1', ''),
                    row.get('CITY', ''),
                    row.get('STATE', ''),
                    row.get('ZIP5', ''),
                    float(row['LATITUDE']) if row.get('LATITUDE') else None,
                    float(row['LONGITUDE']) if row.get('LONGITUDE') else None,
                    row.get('GEOM_RAW', ''),
                ))
                row_count += 1

                if len(batch) >= BATCH_SIZE:
                    _insert_batch(cur, batch)
                    conn.commit()
                    logger.info(f"  Inserted {row_count} rows...")
                    batch = []

            except Exception as e:
                error_count += 1
                if error_count <= 5:
                    logger.warning(f"Row error: {e}")
                continue

    # Final batch
    if batch:
        _insert_batch(cur, batch)
        conn.commit()

    phase1_time = time.time() - start
    logger.info(f"Phase 1 complete: {row_count} rows inserted, {error_count} errors in {phase1_time:.1f}s")

    # Phase 2: Convert geometry in-database
    logger.info("Phase 2: Converting geometry via ST_GeomFromGeoJSON...")
    phase2_start = time.time()
    cur.execute("""
        UPDATE attom_parcels 
        SET geom = ST_GeomFromGeoJSON(geom_raw)
        WHERE geom_raw IS NOT NULL 
          AND geom_raw != ''
          AND geom IS NULL;
    """)
    conn.commit()
    phase2_time = time.time() - phase2_start
    logger.info(f"Phase 2 complete: geometry converted in {phase2_time:.1f}s")

    # Cleanup
    logger.info("Dropping geom_raw column...")
    cur.execute("ALTER TABLE attom_parcels DROP COLUMN IF EXISTS geom_raw;")
    conn.commit()

    total_time = time.time() - start
    logger.info(f"Done! {row_count} rows total in {total_time:.1f}s")

    cur.close()
    conn.close()


def _insert_batch(cur, batch):
    """Insert a batch using execute_values for speed."""
    from psycopg2.extras import execute_values
    execute_values(
        cur,
        """INSERT INTO attom_parcels 
           (id, apn, apn2, fips_state, fips_county, address, city, state, zip5, latitude, longitude, geom_raw)
           VALUES %s
           ON CONFLICT (id) DO NOTHING""",
        batch,
        page_size=BATCH_SIZE
    )


if __name__ == '__main__':
    main()