import csv
import psycopg2
from datetime import datetime

conn = psycopg2.connect("postgresql://postgres:Syndnet$512@localhost:5432/scoutgpt_local")
cur = conn.cursor()

print("Importing AVM data...")
with open('/Users/braydonirwin/Downloads/avm_0002.csv', 'r') as f:
    reader = csv.DictReader(f)
    batch = []
    count = 0
    
    for row in reader:
        try:
            # Parse date
            val_date = None
            if row.get('ValuationDate'):
                try:
                    val_date = datetime.strptime(row['ValuationDate'], '%m/%d/%y').date()
                except:
                    pass
            
            batch.append((
                row['[ATTOM ID]'],
                float(row['EstimatedValue']) if row.get('EstimatedValue') else None,
                float(row['EstimatedMinValue']) if row.get('EstimatedMinValue') else None,
                float(row['EstimatedMaxValue']) if row.get('EstimatedMaxValue') else None,
                int(row['ConfidenceScore']) if row.get('ConfidenceScore') else None,
                val_date
            ))
            count += 1
            
            if len(batch) >= 5000:
                cur.executemany("""
                    INSERT INTO staging_avm (attom_id, estimated_value, estimated_min_value, estimated_max_value, confidence_score, valuation_date)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (attom_id) DO NOTHING
                """, batch)
                conn.commit()
                print(f"  Imported {count:,} AVM records...")
                batch = []
        except Exception as e:
            pass
    
    if batch:
        cur.executemany("""
            INSERT INTO staging_avm (attom_id, estimated_value, estimated_min_value, estimated_max_value, confidence_score, valuation_date)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (attom_id) DO NOTHING
        """, batch)
        conn.commit()

print(f"✅ Imported {count:,} AVM records")
cur.close()
conn.close()
