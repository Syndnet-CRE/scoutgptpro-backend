#!/usr/bin/env python3
"""
MapServer Catalog Builder
Fetches metadata from ArcGIS REST endpoints and scores for parcel enrichment value.
Run: python3 scripts/mapservers/build_catalog.py data/mapservers/mapserver_links.csv
"""

import csv
import json
import os
import hashlib
import time
import urllib.request
import urllib.error
from datetime import datetime
from urllib.parse import urlparse

CACHE_DIR = 'data/mapservers/cache'
TIMEOUT = 15
RATE_LIMIT = 0.5
MAX_RETRIES = 1

ENRICHMENT_KEYWORDS = {
    'owner': ['owner', 'ownername', 'taxpayer', 'mail', 'mailing', 'grantor', 'grantee'],
    'situs': ['situs', 'address', 'street', 'city', 'zip', 'site_addr', 'prop_addr', 'location'],
    'parcel_id': ['parcel', 'parcelid', 'account', 'geo_id', 'pin', 'apn', 'prop_id', 'tcad'],
    'legal': ['legal', 'subdivision', 'lot', 'block', 'abstract', 'plat', 'survey'],
    'land_use': ['landuse', 'zoning', 'sqft', 'acres', 'yearbuilt', 'improvement', 'land_use'],
    'sales': ['sale', 'deed', 'instrument', 'salesprice', 'sold', 'transfer', 'consideration'],
    'permits': ['permit', 'code', 'violation', 'inspection', 'building'],
    'utilities': ['sewer', 'water', 'electric', 'gas', 'wastewater', 'utility'],
    'boundaries': ['parcel', 'cadastre', 'lots', 'boundary', 'property'],
    'flood': ['fema', 'flood', 'wetland', 'slope', 'hazard', 'floodplain', 'critical']
}

os.makedirs(CACHE_DIR, exist_ok=True)

def get_cache_path(url):
    url_hash = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f'{url_hash}.json')

def fetch_json(url, use_cache=True):
    cache_path = get_cache_path(url)
    if use_cache and os.path.exists(cache_path):
        try:
            with open(cache_path, 'r') as f:
                return json.load(f), 'cached'
        except:
            pass
    time.sleep(RATE_LIMIT)
    for attempt in range(MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ScoutGPT/1.0'})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                data = json.loads(response.read().decode('utf-8'))
                with open(cache_path, 'w') as f:
                    json.dump(data, f)
                return data, response.status
        except urllib.error.HTTPError as e:
            return None, e.code
        except urllib.error.URLError as e:
            if attempt < MAX_RETRIES:
                time.sleep(2)
                continue
            return None, f'URLError: {str(e.reason)[:50]}'
        except json.JSONDecodeError:
            return None, 'InvalidJSON'
        except Exception as e:
            return None, f'Error: {str(e)[:50]}'
    return None, 'MaxRetries'

def normalize_url(url):
    if not url:
        return None
    url = url.strip()
    if 'rest/services' not in url.lower() and 'mapserver' not in url.lower() and 'featureserver' not in url.lower():
        return None
    parsed = urlparse(url)
    base_url = f'{parsed.scheme}://{parsed.netloc}{parsed.path}'
    return base_url.rstrip('/')

def score_layer(layer_name, fields):
    score = 0
    tags = []
    text_to_match = layer_name.lower()
    if fields:
        text_to_match += ' ' + ' '.join(f.get('name', '').lower() for f in fields)
    for tag, keywords in ENRICHMENT_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text_to_match:
                if tag not in tags:
                    tags.append(tag)
                    score += 10
                break
    return min(score, 100), tags

def process_service(url):
    result = {
        'serviceUrl': url, 'status': 'error', 'httpStatus': None,
        'serviceType': 'unknown', 'name': None, 'spatialRef': None,
        'maxRecordCount': None, 'supportsPagination': None,
        'capabilities': None, 'layers': [], 'errors': []
    }
    metadata_url = f'{url}?f=pjson'
    data, status = fetch_json(metadata_url)
    result['httpStatus'] = status
    if not data:
        result['errors'].append(f'Failed to fetch: {status}')
        return result
    if 'error' in data:
        result['errors'].append(data['error'].get('message', 'Unknown error'))
        return result
    result['status'] = 'ok'
    result['name'] = data.get('serviceDescription') or data.get('documentInfo', {}).get('Title') or data.get('name')
    result['serviceType'] = data.get('type', 'MapServer' if 'MapServer' in url else 'FeatureServer')
    result['maxRecordCount'] = data.get('maxRecordCount')
    result['supportsPagination'] = data.get('advancedQueryCapabilities', {}).get('supportsPagination')
    result['capabilities'] = data.get('capabilities')
    if data.get('spatialReference'):
        result['spatialRef'] = {'wkid': data['spatialReference'].get('wkid') or data['spatialReference'].get('latestWkid')}
    for layer in data.get('layers', []):
        layer_id = layer.get('id')
        layer_name = layer.get('name', '')
        layer_info = {'id': layer_id, 'name': layer_name, 'geometryType': layer.get('geometryType', 'unknown'), 'fields': [], 'score': 0, 'tags': []}
        if layer_id is not None:
            layer_url = f'{url}/{layer_id}?f=pjson'
            layer_data, _ = fetch_json(layer_url)
            if layer_data and 'error' not in layer_data:
                layer_info['geometryType'] = layer_data.get('geometryType', layer_info['geometryType'])
                fields = layer_data.get('fields', [])
                if fields and isinstance(fields, list):
                    layer_info['fields'] = [{'name': f.get('name'), 'type': f.get('type')} for f in fields[:50]]
        layer_info['score'], layer_info['tags'] = score_layer(layer_name, layer_info['fields'])
        result['layers'].append(layer_info)
    return result

def main(csv_path):
    print(f'=== MapServer Catalog Builder ===')
    print(f'Input: {csv_path}')
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    print(f'Total rows: {len(rows)}')
    url_column = None
    for col in fieldnames:
        if any(x in col.lower() for x in ['url', 'link', 'endpoint', 'service', 'mapserver', 'rest']):
            url_column = col
            break
    if not url_column:
        url_column = fieldnames[0]
    print(f'URL column: {url_column}')
    urls = set()
    for row in rows:
        url = normalize_url(row.get(url_column, ''))
        if url:
            urls.add(url)
    print(f'Unique URLs: {len(urls)}')
    services = []
    for i, url in enumerate(sorted(urls)):
        print(f'[{i+1}/{len(urls)}] {url[:70]}...')
        result = process_service(url)
        services.append(result)
    registry = {'generatedAt': datetime.now().isoformat(), 'sourceCsv': csv_path, 'totalInputRows': len(rows), 'uniqueServices': len(urls), 'services': services}
    with open('data/mapservers/registry.json', 'w') as f:
        json.dump(registry, f, indent=2)
    ok_services = [s for s in services if s['status'] == 'ok']
    all_layers = []
    for s in ok_services:
        for layer in s['layers']:
            all_layers.append({'serviceUrl': s['serviceUrl'], 'layerId': layer['id'], 'layerName': layer['name'], 'geometryType': layer['geometryType'], 'score': layer['score'], 'tags': layer['tags'], 'status': s['status'], 'httpStatus': s['httpStatus']})
    with open('data/mapservers/registry_flat.csv', 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['serviceUrl', 'layerId', 'layerName', 'geometryType', 'score', 'tags', 'status', 'httpStatus'])
        writer.writeheader()
        for layer in all_layers:
            row = layer.copy()
            row['tags'] = ','.join(row['tags'])
            writer.writerow(row)
    print(f'OK: {len(ok_services)}, Failed: {len(services) - len(ok_services)}, Layers: {len(all_layers)}')

if __name__ == '__main__':
    import sys
    csv_file = sys.argv[1] if len(sys.argv) > 1 else 'data/mapservers/mapserver_links.csv'
    main(csv_file)

