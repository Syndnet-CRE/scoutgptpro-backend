#!/usr/bin/env python3
"""
ATTOM P0 ETL: Import TAX_ASSESSOR, PARCELS, PREFORECLOSURE
from Snowflake data share to Neon PostgreSQL.

Usage:
    python scripts/etl/attom_p0_import.py --table assessor
    python scripts/etl/attom_p0_import.py --table parcels
    python scripts/etl/attom_p0_import.py --table preforeclosure
    python scripts/etl/attom_p0_import.py --table all
    python scripts/etl/attom_p0_import.py --table all --dry-run
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime

import psycopg2
import psycopg2.extras
import snowflake.connector
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'), override=True)
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

BATCH_SIZE = 5000
TRAVIS_FIPS = '48453'
TRAVIS_FIPS_STATE = '48'
TRAVIS_FIPS_COUNTY = '453'


# ================================================================
# SNOWFLAKE QUERIES
# ================================================================

ASSESSOR_QUERY = f"""
SELECT
    ATTOMID,
    SITUSSTATECOUNTYFIPS,
    PARCELNUMBERRAW,
    PARCELNUMBERFORMATTED,
    PROPERTYADDRESSFULL,
    PROPERTYADDRESSHOUSENUMBER,
    PROPERTYADDRESSSTREETDIRECTION,
    PROPERTYADDRESSSTREETNAME,
    PROPERTYADDRESSSTREETSUFFIX,
    PROPERTYADDRESSUNITVALUE,
    PROPERTYADDRESSCITY,
    PROPERTYADDRESSSTATE,
    PROPERTYADDRESSZIP,
    LATITUDE,
    LONGITUDE,
    PARTYOWNER1NAMEFULL,
    PARTYOWNER2NAMEFULL,
    OWNERTYPEDESCRIPTION1,
    COMPANYFLAG,
    STATUSOWNEROCCUPIEDFLAG,
    PROPERTYUSEGROUP,
    PROPERTYUSESTANDARDIZED,
    ZONEDCODELOCAL,
    YEARBUILT,
    AREABUILDING,
    AREALOTSF,
    AREALOTACRES,
    STORIESCOUNT,
    BEDROOMSCOUNT,
    BATHCOUNT,
    UNITSCOUNT,
    ROOMSCOUNT,
    PARKINGSPACECOUNT,
    POOL,
    TAXASSESSEDVALUETOTAL,
    TAXMARKETVALUETOTAL,
    TAXMARKETVALUELAND,
    TAXMARKETVALUEIMPROVEMENTS,
    TAXBILLEDAMOUNT,
    TAXDELINQUENTYEAR,
    TAXYEARASSESSED,
    TAXEXEMPTIONHOMEOWNERFLAG,
    DEEDLASTSALEDATE,
    DEEDLASTSALEPRICE,
    ASSESSORPRIORSALEDATE,
    ASSESSORPRIORSALEAMOUNT
FROM ATTOM_SYNDNET_SHARE.DELIVERY.TAX_ASSESSOR
WHERE SITUSSTATECOUNTYFIPS = '{TRAVIS_FIPS}'
"""

PARCELS_QUERY = f"""
SELECT
    ID,
    APN,
    APN2,
    FIPSSTATE,
    FIPSCOUNTY,
    ADDRLINE1,
    CITY,
    STATE,
    ZIP5,
    LATITUDE,
    LONGITUDE,
    GEOMETRY
FROM ATTOM_SYNDNET_SHARE.DELIVERY.PARCELS
WHERE FIPSSTATE = '{TRAVIS_FIPS_STATE}' AND FIPSCOUNTY = '{TRAVIS_FIPS_COUNTY}'
"""

PREFORECLOSURE_QUERY = f"""
SELECT
    TRANSACTIONID,
    ATTOMID,
    SITUSSTATECOUNTYFIPS,
    PROPERTYADDRESSFULL,
    PROPERTYADDRESSCITY,
    PROPERTYADDRESSZIP,
    RECORDTYPE,
    FORECLOSUREINSTRUMENTNUMBER,
    FORECLOSURERECORDINGDATE,
    DEFAULTAMOUNT,
    JUDGMENTAMOUNT,
    JUDGMENTDATE,
    AUCTIONDATE,
    RECORDEDAUCTIONOPENINGBID,
    ORIGINALLOANAMOUNT,
    ORIGINALLOANINTERESTRATE,
    LOANMATURITYDATE,
    LOANBALANCE,
    LENDERNAMEFULLSTANDARDIZED,
    BORROWERNAMEOWNER,
    TRUSTEENAME
FROM ATTOM_SYNDNET_SHARE.DELIVERY.PREFORECLOSURE
WHERE SITUSSTATECOUNTYFIPS = '{TRAVIS_FIPS}'
"""


# ================================================================
# CONNECTION HELPERS
# ================================================================

def get_snowflake_conn():
    """Connect to Snowflake data share."""
    return snowflake.connector.connect(
        account=os.environ['SNOWFLAKE_ACCOUNT'],
        user=os.environ['SNOWFLAKE_USER'],
        password=os.environ['SNOWFLAKE_PASSWORD'],
        warehouse=os.environ.get('SNOWFLAKE_WAREHOUSE', 'COMPUTE_WH'),
        database='ATTOM_SYNDNET_SHARE',
        schema='DELIVERY'
    )


def get_pg_conn():
    """Connect to Neon PostgreSQL."""
    return psycopg2.connect(os.environ['DATABASE_URL'])


# ================================================================
# TRANSFORM HELPERS
# ================================================================

def safe_bool(val):
    """Convert Snowflake boolean/string to Python bool."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.upper() in ('Y', 'YES', 'TRUE', '1')
    return bool(val)


def safe_numeric(val):
    """Safely convert to numeric, returning None for invalid."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def compute_derived(row_dict):
    """Compute derived fields: value_per_sqft, value_per_acre, improvement_ratio."""
    mv = safe_numeric(row_dict.get('market_value_total'))
    bsf = safe_numeric(row_dict.get('building_sqft'))
    acres = safe_numeric(row_dict.get('lot_acres'))
    mvi = safe_numeric(row_dict.get('market_value_improve'))

    row_dict['value_per_sqft'] = round(mv / bsf, 2) if mv and bsf and bsf > 0 else None
    row_dict['value_per_acre'] = round(mv / acres, 2) if mv and acres and acres > 0 else None
    row_dict['improvement_ratio'] = round(mvi / mv, 4) if mv and mvi and mv > 0 else None
    return row_dict


# ================================================================
# TABLE-SPECIFIC IMPORTERS
# ================================================================

def import_assessor(sf_conn, pg_conn, dry_run=False):
    """Import TAX_ASSESSOR → attom_assessor."""
    logger.info("Starting TAX_ASSESSOR import...")

    sf_cur = sf_conn.cursor()
    sf_cur.execute(ASSESSOR_QUERY)

    columns = [desc[0] for desc in sf_cur.description]
    logger.info(f"Snowflake returned columns: {len(columns)}")

    # Column mapping: SNOWFLAKE_NAME → postgres_name
    col_map = {
        'ATTOMID': 'attom_id',
        'SITUSSTATECOUNTYFIPS': 'fips',
        'PARCELNUMBERRAW': 'apn_raw',
        'PARCELNUMBERFORMATTED': 'apn_formatted',
        'PROPERTYADDRESSFULL': 'address_full',
        'PROPERTYADDRESSHOUSENUMBER': 'address_house_number',
        'PROPERTYADDRESSSTREETDIRECTION': 'address_street_dir',
        'PROPERTYADDRESSSTREETNAME': 'address_street_name',
        'PROPERTYADDRESSSTREETSUFFIX': 'address_street_suffix',
        'PROPERTYADDRESSUNITVALUE': 'address_unit',
        'PROPERTYADDRESSCITY': 'address_city',
        'PROPERTYADDRESSSTATE': 'address_state',
        'PROPERTYADDRESSZIP': 'address_zip',
        'LATITUDE': 'latitude',
        'LONGITUDE': 'longitude',
        'PARTYOWNER1NAMEFULL': 'owner1_name',
        'PARTYOWNER2NAMEFULL': 'owner2_name',
        'OWNERTYPEDESCRIPTION1': 'owner_type_desc',
        'COMPANYFLAG': 'company_flag',
        'STATUSOWNEROCCUPIEDFLAG': 'owner_occupied',
        'PROPERTYUSEGROUP': 'property_use_group',
        'PROPERTYUSESTANDARDIZED': 'property_use_standard',
        'ZONEDCODELOCAL': 'zoned_code_local',
        'YEARBUILT': 'year_built',
        'AREABUILDING': 'building_sqft',
        'AREALOTSF': 'lot_sqft',
        'AREALOTACRES': 'lot_acres',
        'STORIESCOUNT': 'stories_count',
        'BEDROOMSCOUNT': 'bedrooms_count',
        'BATHCOUNT': 'bath_count',
        'UNITSCOUNT': 'units_count',
        'ROOMSCOUNT': 'rooms_count',
        'PARKINGSPACECOUNT': 'parking_spaces',
        'POOL': 'pool_flag',
        'TAXASSESSEDVALUETOTAL': 'assessed_total',
        'TAXMARKETVALUETOTAL': 'market_value_total',
        'TAXMARKETVALUELAND': 'market_value_land',
        'TAXMARKETVALUEIMPROVEMENTS': 'market_value_improve',
        'TAXBILLEDAMOUNT': 'tax_billed_amount',
        'TAXDELINQUENTYEAR': 'tax_delinquent_year',
        'TAXYEARASSESSED': 'tax_year',
        'TAXEXEMPTIONHOMEOWNERFLAG': 'homestead_exempt',
        'DEEDLASTSALEDATE': 'last_sale_date',
        'DEEDLASTSALEPRICE': 'last_sale_price',
        'ASSESSORPRIORSALEDATE': 'prior_sale_date',
        'ASSESSORPRIORSALEAMOUNT': 'prior_sale_price',
    }

    bool_fields = {'company_flag', 'owner_occupied', 'pool_flag', 'homestead_exempt'}

    pg_columns = list(col_map.values()) + ['value_per_sqft', 'value_per_acre', 'improvement_ratio']
    insert_sql = f"""
        INSERT INTO attom_assessor ({', '.join(pg_columns)})
        VALUES ({', '.join(['%s'] * len(pg_columns))})
        ON CONFLICT (attom_id) DO NOTHING
    """

    pg_cur = pg_conn.cursor()
    total_inserted = 0
    total_skipped = 0
    batch = []

    for sf_row in tqdm(sf_cur, desc="TAX_ASSESSOR", unit="rows"):
        row_dict = dict(zip(columns, sf_row))

        # Map and transform
        pg_row = {}
        for sf_col, pg_col in col_map.items():
            val = row_dict.get(sf_col)
            if pg_col in bool_fields:
                val = safe_bool(val)
            pg_row[pg_col] = val

        # Compute derived fields
        pg_row = compute_derived(pg_row)

        # Build tuple in column order
        row_tuple = tuple(pg_row.get(c) for c in pg_columns)
        batch.append(row_tuple)

        if len(batch) >= BATCH_SIZE:
            if not dry_run:
                psycopg2.extras.execute_batch(pg_cur, insert_sql, batch)
                pg_conn.commit()
            total_inserted += len(batch)
            batch = []

    # Flush remaining
    if batch:
        if not dry_run:
            psycopg2.extras.execute_batch(pg_cur, insert_sql, batch)
            pg_conn.commit()
        total_inserted += len(batch)

    sf_cur.close()
    pg_cur.close()
    logger.info(f"TAX_ASSESSOR complete: {total_inserted} rows {'(dry run)' if dry_run else 'inserted'}")
    return total_inserted


def import_parcels(sf_conn, pg_conn, dry_run=False):
    """Import PARCELS → attom_parcels with geometry conversion."""
    logger.info("Starting PARCELS import...")

    sf_cur = sf_conn.cursor()
    sf_cur.execute(PARCELS_QUERY)

    columns = [desc[0] for desc in sf_cur.description]
    logger.info(f"Snowflake returned columns: {len(columns)}")

    # Geometry insert uses ST_GeomFromGeoJSON + ST_Multi to ensure MultiPolygon
    insert_sql = """
        INSERT INTO attom_parcels (id, apn, apn2, fips_state, fips_county,
            address, city, state, zip5, latitude, longitude, geom)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))
        ON CONFLICT (id) DO NOTHING
    """

    # Fallback for NULL/invalid geometry
    insert_sql_no_geom = """
        INSERT INTO attom_parcels (id, apn, apn2, fips_state, fips_county,
            address, city, state, zip5, latitude, longitude)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """

    pg_cur = pg_conn.cursor()
    total_inserted = 0
    total_geom_errors = 0

    for sf_row in tqdm(sf_cur, desc="PARCELS", unit="rows"):
        row_dict = dict(zip(columns, sf_row))

        geom_raw = row_dict.get('GEOMETRY')

        base_values = (
            str(row_dict['ID']) if row_dict['ID'] is not None else None,
            row_dict.get('APN'),
            row_dict.get('APN2'),
            row_dict.get('FIPSSTATE'),
            row_dict.get('FIPSCOUNTY'),
            row_dict.get('ADDRLINE1'),
            row_dict.get('CITY'),
            row_dict.get('STATE'),
            row_dict.get('ZIP5'),
            row_dict.get('LATITUDE'),
            row_dict.get('LONGITUDE'),
        )

        if not dry_run:
            try:
                if geom_raw and geom_raw.strip():
                    # Ensure it's valid JSON
                    geom_json = geom_raw if isinstance(geom_raw, str) else json.dumps(geom_raw)
                    pg_cur.execute(insert_sql, base_values + (geom_json,))
                else:
                    pg_cur.execute(insert_sql_no_geom, base_values)
                total_inserted += 1
            except Exception as e:
                pg_conn.rollback()
                total_geom_errors += 1
                if total_geom_errors <= 5:
                    logger.warning(f"Geometry error for ID={row_dict['ID']}: {e}")
                # Insert without geometry as fallback
                try:
                    pg_cur.execute(insert_sql_no_geom, base_values)
                    pg_conn.commit()
                    total_inserted += 1
                except Exception:
                    pg_conn.rollback()
        else:
            total_inserted += 1

        # Commit every BATCH_SIZE rows
        if total_inserted % BATCH_SIZE == 0 and not dry_run:
            pg_conn.commit()

    if not dry_run:
        pg_conn.commit()

    sf_cur.close()
    pg_cur.close()
    logger.info(f"PARCELS complete: {total_inserted} rows, {total_geom_errors} geometry errors {'(dry run)' if dry_run else ''}")
    return total_inserted


def import_preforeclosure(sf_conn, pg_conn, dry_run=False):
    """Import PREFORECLOSURE → attom_preforeclosure."""
    logger.info("Starting PREFORECLOSURE import...")

    sf_cur = sf_conn.cursor()
    sf_cur.execute(PREFORECLOSURE_QUERY)

    columns = [desc[0] for desc in sf_cur.description]

    col_map = {
        'TRANSACTIONID': 'transaction_id',
        'ATTOMID': 'attom_id',
        'SITUSSTATECOUNTYFIPS': 'fips',
        'PROPERTYADDRESSFULL': 'address_full',
        'PROPERTYADDRESSCITY': 'address_city',
        'PROPERTYADDRESSZIP': 'address_zip',
        'RECORDTYPE': 'record_type',
        'FORECLOSUREINSTRUMENTNUMBER': 'document_number',
        'FORECLOSURERECORDINGDATE': 'foreclosure_recording_date',
        'DEFAULTAMOUNT': 'default_amount',
        'JUDGMENTAMOUNT': 'judgment_amount',
        'JUDGMENTDATE': 'judgment_date',
        'AUCTIONDATE': 'auction_date',
        'RECORDEDAUCTIONOPENINGBID': 'auction_min_bid',
        'ORIGINALLOANAMOUNT': 'original_loan_amount',
        'ORIGINALLOANINTERESTRATE': 'original_loan_rate',
        'LOANMATURITYDATE': 'loan_maturity_date',
        'LOANBALANCE': 'loan_balance',
        'LENDERNAMEFULLSTANDARDIZED': 'lender_name',
        'BORROWERNAMEOWNER': 'borrower_name',
        'TRUSTEENAME': 'trustee_name',
    }

    pg_columns = list(col_map.values())
    insert_sql = f"""
        INSERT INTO attom_preforeclosure ({', '.join(pg_columns)})
        VALUES ({', '.join(['%s'] * len(pg_columns))})
        ON CONFLICT (transaction_id) DO NOTHING
    """

    pg_cur = pg_conn.cursor()
    total_inserted = 0
    batch = []

    for sf_row in tqdm(sf_cur, desc="PREFORECLOSURE", unit="rows"):
        row_dict = dict(zip(columns, sf_row))
        row_tuple = tuple(row_dict.get(sf_col) for sf_col in col_map.keys())
        batch.append(row_tuple)

        if len(batch) >= BATCH_SIZE:
            if not dry_run:
                psycopg2.extras.execute_batch(pg_cur, insert_sql, batch)
                pg_conn.commit()
            total_inserted += len(batch)
            batch = []

    if batch:
        if not dry_run:
            psycopg2.extras.execute_batch(pg_cur, insert_sql, batch)
            pg_conn.commit()
        total_inserted += len(batch)

    sf_cur.close()
    pg_cur.close()
    logger.info(f"PREFORECLOSURE complete: {total_inserted} rows {'(dry run)' if dry_run else ''}")
    return total_inserted


# ================================================================
# MAIN
# ================================================================

def main():
    parser = argparse.ArgumentParser(description='ATTOM P0 ETL Import')
    parser.add_argument('--table', required=True,
                        choices=['assessor', 'parcels', 'preforeclosure', 'all'],
                        help='Which table to import')
    parser.add_argument('--dry-run', action='store_true',
                        help='Read from Snowflake but do not write to PostgreSQL')
    args = parser.parse_args()

    logger.info(f"ATTOM P0 ETL starting — table={args.table}, dry_run={args.dry_run}")
    start = time.time()

    sf_conn = get_snowflake_conn()
    pg_conn = get_pg_conn()

    try:
        results = {}

        if args.table in ('assessor', 'all'):
            results['assessor'] = import_assessor(sf_conn, pg_conn, args.dry_run)

        if args.table in ('parcels', 'all'):
            results['parcels'] = import_parcels(sf_conn, pg_conn, args.dry_run)

        if args.table in ('preforeclosure', 'all'):
            results['preforeclosure'] = import_preforeclosure(sf_conn, pg_conn, args.dry_run)

        elapsed = time.time() - start
        logger.info(f"ETL complete in {elapsed:.1f}s — Results: {results}")

    finally:
        sf_conn.close()
        pg_conn.close()


if __name__ == '__main__':
    main()