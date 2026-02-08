import csv
import io
import psycopg2

CSV_PATH = "scripts/etl/recorder_travis.csv"
NEON_DSN = "postgresql://neondb_owner:npg_xJzuLT8FirI9@ep-rapid-wind-a4k9miff-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
TABLE = "attom_recorder"
BATCH_SIZE = 5000

csv.field_size_limit(10 * 1024 * 1024)

def get_columns():
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return [k.lower().strip() for k in reader.fieldnames]

COLUMNS = get_columns()

def clean_value(val):
    if val is None or val.strip() == "":
        return None
    return val.strip()

def _copy_batch(cur, batch, columns):
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in batch:
        writer.writerow(["" if v is None else v for v in row])
    buf.seek(0)
    cols = ", ".join(columns)
    cur.copy_expert(f"COPY {TABLE} ({cols}) FROM STDIN WITH (FORMAT csv, NULL '')", buf)

def main():
    conn = psycopg2.connect(NEON_DSN,
        keepalives=1, keepalives_idle=30,
        keepalives_interval=10, keepalives_count=5)
    conn.autocommit = False
    cur = conn.cursor()

    total = 0
    batch = []

    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_lower = {k.lower().strip(): v for k, v in row.items()}
            cleaned = [clean_value(row_lower.get(col)) for col in COLUMNS]
            batch.append(cleaned)

            if len(batch) >= BATCH_SIZE:
                _copy_batch(cur, batch, COLUMNS)
                conn.commit()
                total += len(batch)
                print(f"  Loaded {total} rows...")
                batch = []

        if batch:
            _copy_batch(cur, batch, COLUMNS)
            conn.commit()
            total += len(batch)

    print(f"\nDone. Total rows loaded: {total}")
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()