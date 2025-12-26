import csv
import psycopg2
import re

conn = psycopg2.connect("postgresql://postgres:Syndnet$512@localhost:5432/scoutgpt_local")
cur = conn.cursor()

def normalize_address(addr):
    """Normalize address for matching"""
    if not addr:
        return None
    # Uppercase
    addr = addr.upper()
    # Remove punctuation except spaces
    addr = re.sub(r'[^\w\s]', '', addr)
    # Standardize common abbreviations
    addr = re.sub(r'\bSTREET\b', 'ST', addr)
    addr = re.sub(r'\bAVENUE\b', 'AVE', addr)
    addr = re.sub(r'\bDRIVE\b', 'DR', addr)
    addr = re.sub(r'\bROAD\b', 'RD', addr)
    addr = re.sub(r'\bBOULEVARD\b', 'BLVD', addr)
    addr = re.sub(r'\bLANE\b', 'LN', addr)
    addr = re.sub(r'\bCOURT\b', 'CT', addr)
    addr = re.sub(r'\bCIRCLE\b', 'CIR', addr)
    addr = re.sub(r'\bTRAIL\b', 'TRL', addr)
    addr = re.sub(r'\bPARKWAY\b', 'PKWY', addr)
    addr = re.sub(r'\bPLACE\b', 'PL', addr)
    addr = re.sub(r'\bNORTH\b', 'N', addr)
    addr = re.sub(r'\bSOUTH\b', 'S', addr)
    addr = re.sub(r'\bEAST\b', 'E', addr)
    addr = re.sub(r'\bWEST\b', 'W', addr)
    # Remove extra spaces
    addr = ' '.join(addr.split())
    return addr

print("Importing RECORDER data...")

# Column positions (0-indexed): ATTOM ID=1, APNFormatted=132, PropertyAddressFull=134, City=142, ZIP=144
with open('/Users/braydonirwin/Downloads/RECORDER_0001.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.reader(f)
    header = next(reader)
    
    # Find column indices
    attom_idx = None
    addr_idx = None
    city_idx = None
    zip_idx = None
    apn_idx = None
    
    for i, col in enumerate(header):
        col_lower = col.lower().strip('[]"')
        if 'attom id' in col_lower:
            attom_idx = i
        elif 'propertyaddressfull' in col_lower:
            addr_idx = i
        elif 'propertyaddresscity' in col_lower:
            city_idx = i
        elif 'propertyaddresszip' in col_lower and 'zip4' not in col_lower:
            zip_idx = i
        elif 'apnformatted' in col_lower:
            apn_idx = i
    
    print(f"  ATTOM ID col: {attom_idx}")
    print(f"  Address col: {addr_idx}")
    print(f"  City col: {city_idx}")
    print(f"  ZIP col: {zip_idx}")
    print(f"  APN col: {apn_idx}")
    
    if attom_idx is None or addr_idx is None:
        print("ERROR: Could not find required columns")
        exit(1)
    
    batch = []
    count = 0
    
    for row in reader:
        try:
            if len(row) <= max(attom_idx, addr_idx):
                continue
                
            attom_id = row[attom_idx].strip('"') if attom_idx < len(row) else None
            address = row[addr_idx].strip('"') if addr_idx < len(row) else None
            city = row[city_idx].strip('"') if city_idx and city_idx < len(row) else None
            zipcode = row[zip_idx].strip('"') if zip_idx and zip_idx < len(row) else None
            apn = row[apn_idx].strip('"') if apn_idx and apn_idx < len(row) else None
            
            if not attom_id or not address:
                continue
            
            # Build full address with city and zip
            full_addr = address
            if city:
                full_addr = f"{address} {city}"
            if zipcode:
                full_addr = f"{full_addr} {zipcode}"
            
            normalized = normalize_address(full_addr)
            
            batch.append((attom_id, apn, address, city, zipcode, normalized))
            count += 1
            
            if len(batch) >= 10000:
                cur.executemany("""
                    INSERT INTO staging_recorder (attom_id, apn_formatted, property_address_full, property_city, property_zip, normalized_address)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, batch)
                conn.commit()
                print(f"  Imported {count:,} RECORDER records...")
                batch = []
                
        except Exception as e:
            pass
    
    if batch:
        cur.executemany("""
            INSERT INTO staging_recorder (attom_id, apn_formatted, property_address_full, property_city, property_zip, normalized_address)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, batch)
        conn.commit()

print(f"✅ Imported {count:,} RECORDER records")
cur.close()
conn.close()
