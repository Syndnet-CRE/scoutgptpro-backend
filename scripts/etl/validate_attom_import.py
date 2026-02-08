#!/usr/bin/env python3
"""
ATTOM P0 Validation: Verify imported data from Snowflake to PostgreSQL.

Usage:
    python scripts/etl/validate_attom_import.py
"""

import os
import logging
import psycopg2
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


def get_pg_conn():
    """Connect to Neon PostgreSQL."""
    return psycopg2.connect(os.environ['DATABASE_URL'])


def run_validation():
    """Run validation queries and report results."""
    logger.info("Starting ATTOM P0 validation...")
    
    conn = get_pg_conn()
    cur = conn.cursor()
    
    try:
        # === ROW COUNTS ===
        logger.info("=== ROW COUNTS ===")
        cur.execute("""
            SELECT 'attom_assessor' AS tbl, COUNT(*) FROM attom_assessor
            UNION ALL
            SELECT 'attom_parcels', COUNT(*) FROM attom_parcels
            UNION ALL
            SELECT 'attom_preforeclosure', COUNT(*) FROM attom_preforeclosure;
        """)
        
        results = cur.fetchall()
        for table, count in results:
            logger.info(f"{table}: {count:,} rows")
        
        # === GEOMETRY HEALTH ===
        logger.info("\n=== GEOMETRY HEALTH ===")
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(geom) AS with_geom,
                COUNT(*) - COUNT(geom) AS missing_geom,
                SUM(CASE WHEN ST_IsValid(geom) THEN 1 ELSE 0 END) AS valid_geom
            FROM attom_parcels;
        """)
        
        geom_stats = cur.fetchone()
        logger.info(f"Total parcels: {geom_stats[0]:,}")
        logger.info(f"With geometry: {geom_stats[1]:,}")
        logger.info(f"Missing geometry: {geom_stats[2]:,}")
        logger.info(f"Valid geometry: {geom_stats[3]:,}")
        
        # === SPATIAL INDEX TEST ===
        logger.info("\n=== SPATIAL INDEX TEST ===")
        cur.execute("""
            EXPLAIN ANALYZE
            SELECT id, apn, address
            FROM attom_parcels
            WHERE ST_Intersects(geom, ST_MakeEnvelope(-97.80, 30.20, -97.70, 30.30, 4326))
            LIMIT 10;
        """)
        
        explain_results = cur.fetchall()
        for row in explain_results:
            if 'Index' in row[0] and 'gist' in row[0]:
                logger.info("✓ Spatial index is being used")
                break
        else:
            logger.warning("⚠ Spatial index may not be working")
        
        # === JOIN TEST (assessor ↔ parcels) ===
        logger.info("\n=== JOIN TESTS ===")
        cur.execute("""
            SELECT COUNT(*)
            FROM attom_assessor a
            JOIN attom_parcels p ON a.apn_formatted = p.apn
            WHERE a.fips = '48453';
        """)
        
        join_count = cur.fetchone()[0]
        logger.info(f"Assessor-Parcels matches: {join_count:,}")
        
        # === PREFORECLOSURE JOIN TEST ===
        cur.execute("""
            SELECT COUNT(*)
            FROM attom_preforeclosure pf
            JOIN attom_assessor a ON pf.attom_id = a.attom_id;
        """)
        
        pf_join_count = cur.fetchone()[0]
        logger.info(f"Preforeclosure-Assessor matches: {pf_join_count:,}")
        
        # === SAMPLE DATA SPOT CHECK ===
        logger.info("\n=== SAMPLE DATA ===")
        cur.execute("""
            SELECT attom_id, address_full, owner1_name, market_value_total, lot_acres, property_use_group
            FROM attom_assessor
            WHERE address_city = 'AUSTIN' AND market_value_total > 1000000
            ORDER BY market_value_total DESC
            LIMIT 5;
        """)
        
        samples = cur.fetchall()
        for sample in samples:
            logger.info(f"${sample[3]:,.0f} | {sample[4]:.2f} acres | {sample[1]}")
        
        # === NULL RATE CHECK ===
        logger.info("\n=== DATA COMPLETENESS ===")
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(address_full) AS has_address,
                COUNT(market_value_total) AS has_market_value,
                COUNT(lot_acres) AS has_acres,
                COUNT(property_use_group) AS has_use_group,
                COUNT(latitude) AS has_lat,
                COUNT(longitude) AS has_lon
            FROM attom_assessor;
        """)
        
        completeness = cur.fetchone()
        total = completeness[0]
        logger.info(f"Address completeness: {completeness[1]/total*100:.1f}%")
        logger.info(f"Market value completeness: {completeness[2]/total*100:.1f}%")
        logger.info(f"Acres completeness: {completeness[3]/total*100:.1f}%")
        logger.info(f"Use group completeness: {completeness[4]/total*100:.1f}%")
        logger.info(f"Coordinate completeness: {completeness[5]/total*100:.1f}%")
        
        # === DERIVED FIELD CHECK ===
        logger.info("\n=== DERIVED FIELDS ===")
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(value_per_sqft) AS has_value_per_sqft,
                COUNT(value_per_acre) AS has_value_per_acre,
                COUNT(improvement_ratio) AS has_improvement_ratio
            FROM attom_assessor;
        """)
        
        derived = cur.fetchone()
        logger.info(f"Value per sqft: {derived[1]:,} records")
        logger.info(f"Value per acre: {derived[2]:,} records")
        logger.info(f"Improvement ratio: {derived[3]:,} records")
        
        logger.info("\n=== VALIDATION COMPLETE ===")
        logger.info("All validation queries executed successfully!")
        
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    run_validation()