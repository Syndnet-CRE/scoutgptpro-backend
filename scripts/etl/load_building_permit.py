#!/usr/bin/env python3
"""
ATTOM P1 ETL: Load Building Permit from CSV into Neon PostgreSQL.
Uses CSV-format COPY for reliable escaping.
Expected: 3,121,551 rows
"""

import csv
import io
import os
import sys
import time
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
CSV_PATH = "scripts/etl/building_permit_travis.csv"
TABLE = "attom_building_permit"
BATCH_SIZE = 5000  # Smaller batches for larger CSV to avoid memory spikes

def get_columns():
    """Read column names from CSV header."""
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [k.lower().strip() for k in reader.fieldnames]

def copy_batch(cur, batch, columns):
    """Bulk insert using CSV-format COPY."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in batch:
        writer.writerow(["" if v is None else v for v in row])
    buf.seek(0)
    cols = ", ".join(columns)
    cur.copy_expert(f"COPY {TABLE} ({cols}) FROM STDIN WITH (FORMAT csv, NULL '')", buf)

def main():
    columns = get_columns()
    print(f"Table: {TABLE}")
    print(f"Columns: {len(columns)}")
    print(f"CSV: {CSV_PATH}")

    conn = psycopg2.connect(DATABASE_URL)
    conn.set_session(autocommit=False)

    cur = conn.cursor()
    batch = []
    total = 0
    start = time.time()

    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)  # skip header

        for row in reader:
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                copy_batch(cur, batch, columns)
                conn.commit()
                total += len(batch)
                elapsed = time.time() - start
                rate = total / elapsed if elapsed > 0 else 0
                print(f"  {total:,} rows ({rate:.0f}/s)")
                batch = []

    if batch:
        copy_batch(cur, batch, columns)
        conn.commit()
        total += len(batch)

    elapsed = time.time() - start
    print(f"\nDone: {total:,} rows in {elapsed:.1f}s ({total/elapsed:.0f}/s)")

    # Verify
    cur.execute(f"SELECT count(*) FROM {TABLE}")
    count = cur.fetchone()[0]
    print(f"Verification: {count:,} rows in {TABLE}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()