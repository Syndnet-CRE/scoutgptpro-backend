# API Response Format Specification: `/api/ai/query`

**Endpoint:** `POST /api/ai/query`  
**File:** `src/routes/ai.js`  
**Last Audited:** 2025-01-27

---

## Overview

The `/api/ai/query` endpoint supports two main response types:
1. **Property Search** - Returns individual property records
2. **Aggregation** - Returns grouped/aggregated data (counts, sums, averages by geography or category)

---

## 1. Property Search Response

### Success Response Structure

```json
{
  "success": true,
  "type": "PROPERTY_SEARCH",
  "properties": [
    {
      "parcel_id": "string",
      "situs_address": "string",
      "owner_name_raw": "string",
      "owner_entity_type": "string | null",
      "owner_segment": "string | null",
      "acres_calc": number,
      "asset_class": "string | null",
      "market_value": number | null,
      "tax_delinquent_flag": boolean,
      "county_fips": "string | null",
      "geom": {
        "type": "Point",
        "coordinates": [lng, lat]
      }
    }
  ],
  "layers": [],
  "pois": [],
  "insights": "string | null",
  "toolCalls": [
    {
      "tool": "search_properties",
      "input": { /* tool input parameters */ }
    }
  ],
  "messages": [
    {
      "role": "assistant",
      "text": "string"
    }
  ],
  "results": [ /* same as properties */ ],
  "count": number,
  "totalCount": number,
  "overlays": [],
  "pins": [
    {
      "id": "string",
      "parcelId": "string",
      "lat": number | null,
      "lng": number | null,
      "address": "string",
      "propertyType": "string",
      "motivationScore": number
    }
  ],
  "debug": {
    "stopReason": "end_turn" | "tool_use" | "max_tokens",
    "toolCallCount": number,
    "propertyCount": number
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `true` for successful responses |
| `type` | string | Response type: `"PROPERTY_SEARCH"`, `"AGGREGATION"`, `"GIS_LAYER_TOGGLE"`, `"POI_SEARCH"`, `"PROPERTY_DETAIL"`, `"CONVERSATIONAL"` |
| `properties` | array | Array of property objects matching search criteria |
| `count` | number | Number of properties returned |
| `totalCount` | number | Same as `count` (backward compatibility) |
| `insights` | string | Natural language summary/insights from Claude |
| `toolCalls` | array | Array of tools called by Claude (for debugging) |
| `pins` | array | Map pin data (first 25 properties) |
| `debug` | object | Debug information (only in development) |

### Property Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `parcel_id` | string | 6-digit parcel identifier |
| `situs_address` | string | Property street address |
| `owner_name_raw` | string | Owner name as stored in database |
| `owner_entity_type` | string | `"person"`, `"llc"`, `"corp"`, `"trust_estate"`, `"unknown"` |
| `owner_segment` | string | `"mom_pop"`, `"small_operator"`, `"institutional"`, `"local_owner"`, `"absentee"`, `"unknown"` |
| `acres_calc` | number | Calculated acreage (float) |
| `asset_class` | string | `"residential"`, `"commercial"`, `"land"`, `"industrial"`, `"mixed"`, `"unknown"` |
| `market_value` | number | Market value in dollars (null if unavailable) |
| `tax_delinquent_flag` | boolean | `true` if property has delinquent taxes |
| `county_fips` | string | County FIPS code (e.g., `"48453"` for Travis) |
| `geom` | object | GeoJSON Point geometry with `coordinates: [lng, lat]` |

### No Results Response

When no properties match the search criteria:

```json
{
  "success": true,
  "type": "PROPERTY_SEARCH",
  "properties": [],
  "count": 0,
  "message": "No properties found matching your criteria. Try broadening your search (filters applied: acreage, property type).",
  "intent": { /* search parameters used */ },
  "debug": {
    "filtersApplied": ["acreage", "property type"]
  }
}
```

---

## 2. Aggregation Response

### ✅ Aggregation IS Supported

The endpoint **fully supports** aggregation queries with GROUP BY operations.

### Success Response Structure

```json
{
  "type": "AGGREGATION",
  "data": [
    {
      "mail_zip": "78701",
      "metric_0": 42
    },
    {
      "mail_zip": "78702",
      "metric_0": 38
    }
  ],
  "count": number,
  "groupBy": ["mail_zip"],
  "metrics": [
    {
      "type": "count",
      "alias": "metric_0"
    }
  ],
  "insights": ["Showing 1276 groups"],
  "toolCalls": [
    {
      "tool": "search_properties",
      "input": {
        "aggregation": {
          "group_by": ["mail_zip"],
          "metrics": [{ "type": "count" }]
        }
      }
    }
  ]
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"AGGREGATION"` |
| `data` | array | Array of grouped results. Each object contains: group-by columns + metric columns |
| `count` | number | Number of groups returned |
| `groupBy` | array | Columns used for grouping (e.g., `["mail_zip"]`) |
| `metrics` | array | Metrics calculated (e.g., `[{ "type": "count" }]`) |
| `insights` | array | Array of insight strings |

### Aggregation Data Structure

The `data` array contains objects with:
- **Group-by columns** as keys (e.g., `mail_zip`, `asset_class`)
- **Metric columns** as keys (e.g., `metric_0`, `metric_1`, or custom aliases)

**Example: Count by ZIP code**
```json
{
  "data": [
    { "mail_zip": "78701", "metric_0": 42 },
    { "mail_zip": "78702", "metric_0": 38 }
  ],
  "groupBy": ["mail_zip"],
  "metrics": [{ "type": "count" }]
}
```

**Example: Average value by asset class**
```json
{
  "data": [
    { "asset_class": "commercial", "avg_value": 1250000.50 },
    { "asset_class": "residential", "avg_value": 450000.25 }
  ],
  "groupBy": ["asset_class"],
  "metrics": [
    {
      "type": "avg",
      "field": "market_value",
      "alias": "avg_value"
    }
  ]
}
```

### Supported Group-By Columns

| Column | Description | Example Values |
|--------|-------------|----------------|
| `mail_zip` | ✅ **ZIP code** (5-digit) | `"78701"`, `"78702"` |
| `asset_class` | Property type | `"residential"`, `"commercial"`, `"land"` |
| `owner_entity_type` | Owner entity type | `"person"`, `"llc"`, `"corp"` |
| `owner_segment` | Owner segment | `"mom_pop"`, `"small_operator"`, `"institutional"` |
| `tax_delinquent_flag` | Tax status | `true`, `false` |
| `homestead_exemption_flag` | Homestead exemption | `true`, `false` |

### Supported Metrics

| Metric Type | Description | Required Field? | Example |
|-------------|-------------|-----------------|---------|
| `count` | Count of records | No | `{ "type": "count" }` |
| `sum` | Sum of numeric field | Yes | `{ "type": "sum", "field": "market_value" }` |
| `avg` | Average of numeric field | Yes | `{ "type": "avg", "field": "market_value" }` |
| `min` | Minimum value | Yes | `{ "type": "min", "field": "market_value" }` |
| `max` | Maximum value | Yes | `{ "type": "max", "field": "market_value" }` |

### Supported Metric Fields

| Field | Description | Type |
|-------|-------------|------|
| `market_value` | Market value in dollars | number |
| `acres_calc` | Calculated acreage | number |
| `building_sqft` | Building square footage | number |
| `land_value` | Land value in dollars | number |

### Aggregation Query Examples

**Query:** "How many properties by ZIP code?"
```json
{
  "aggregation": {
    "group_by": ["mail_zip"],
    "metrics": [{ "type": "count" }]
  }
}
```

**Response:**
```json
{
  "type": "AGGREGATION",
  "data": [
    { "mail_zip": "78701", "metric_0": 42 },
    { "mail_zip": "78702", "metric_0": 38 }
  ],
  "count": 1276,
  "groupBy": ["mail_zip"],
  "metrics": [{ "type": "count" }]
}
```

**Query:** "Average commercial property value by ZIP code"
```json
{
  "filters": {
    "asset_class": "commercial"
  },
  "aggregation": {
    "group_by": ["mail_zip"],
    "metrics": [
      {
        "type": "avg",
        "field": "market_value",
        "alias": "avg_value"
      }
    ]
  }
}
```

**Response:**
```json
{
  "type": "AGGREGATION",
  "data": [
    { "mail_zip": "78701", "avg_value": 1250000.50 },
    { "mail_zip": "78702", "avg_value": 980000.25 }
  ],
  "count": 150,
  "groupBy": ["mail_zip"],
  "metrics": [
    {
      "type": "avg",
      "field": "market_value",
      "alias": "avg_value"
    }
  ]
}
```

---

## 3. Error Response

### Structure

```json
{
  "success": false,
  "error": "Error message string",
  "message": "Detailed error message (optional)"
}
```

### Common Error Scenarios

| Status | Error | Cause |
|--------|-------|-------|
| 400 | `"Invalid request: ..."` | Request validation failed |
| 500 | `"AI query failed"` | Server error during processing |
| 500 | `"Failed to fetch ZIP boundaries"` | Database query error |

---

## 4. Implementation Details

### Aggregation Query Flow

1. **Tool Input Detection** (line 271)
   ```javascript
   if (input.aggregation && (input.aggregation.group_by?.length > 0 || input.aggregation.metrics?.length > 0))
   ```

2. **Query Building** (line 275)
   - Calls `buildAggregationQuery(intent)` (line 957)
   - Generates SQL with `GROUP BY` clause
   - Applies filters from `intent.filters`

3. **Response Construction** (line 279-285)
   ```javascript
   return {
     type: 'AGGREGATION',
     data: result.rows,
     count: result.rowCount,
     groupBy: queryResult.groupBy,
     metrics: queryResult.metrics
   };
   ```

4. **Final Response** (line 1623-1636)
   - Wraps aggregation result in standardized format
   - Adds `insights` and `toolCalls` for debugging

### SQL Generation

The `buildAggregationQuery` function (line 957) generates SQL like:

```sql
SELECT 
  mail_zip,
  COUNT(*) as metric_0
FROM parcel_features_travis
WHERE county_fips = '48453'
GROUP BY mail_zip
ORDER BY metric_0 DESC
LIMIT 100
```

### Filters Applied to Aggregations

All standard filters apply to aggregation queries:
- Geographic: `county_fips`, `bbox`
- Property: `acres_min`, `acres_max`, `asset_class`
- Owner: `owner_entity_type`, `owner_segment`
- Financial: `market_value_min`, `market_value_max`
- Status: `tax_delinquent`

---

## 5. Frontend Integration Guide

### Detecting Aggregation Responses

```javascript
if (response.type === 'AGGREGATION') {
  // Handle aggregation data
  const zipCounts = response.data.map(row => ({
    zip: row.mail_zip,
    count: row.metric_0
  }));
}
```

### Mapping to Choropleth

For ZIP code choropleth visualizations:

```javascript
// 1. Fetch ZIP boundaries
const boundaries = await fetch('/api/boundaries/zip').then(r => r.json());

// 2. Fetch aggregation data
const aggregation = await fetch('/api/ai/query', {
  method: 'POST',
  body: JSON.stringify({
    query: "How many properties by ZIP code?",
    mode: "scout"
  })
}).then(r => r.json());

// 3. Join boundaries with aggregation data
const choroplethData = boundaries.data.features.map(feature => {
  const zip = feature.properties.zip;
  const aggRow = aggregation.data.find(d => d.mail_zip === zip);
  return {
    ...feature,
    properties: {
      ...feature.properties,
      count: aggRow?.metric_0 || 0
    }
  };
});
```

---

## 6. Summary

### ✅ Aggregation Support: **FULLY SUPPORTED**

- **Group-by columns:** `mail_zip`, `asset_class`, `owner_entity_type`, `owner_segment`, `tax_delinquent_flag`, `homestead_exemption_flag`
- **Metrics:** `count`, `sum`, `avg`, `min`, `max`
- **Metric fields:** `market_value`, `acres_calc`, `building_sqft`, `land_value`
- **Filters:** All standard filters apply to aggregations
- **Response format:** Standardized with `type: "AGGREGATION"`, `data`, `groupBy`, `metrics`

### Key Findings

1. ✅ **ZIP code aggregation is supported** via `group_by: ["mail_zip"]`
2. ✅ **Response structure is well-defined** and consistent
3. ✅ **Filters work with aggregations** (e.g., "commercial properties by ZIP")
4. ✅ **Multiple metrics supported** (e.g., count + average value)
5. ✅ **Custom aliases supported** for metric columns

### No Changes Needed

The current implementation fully supports geographic aggregations (ZIP codes, asset classes, etc.) for choropleth visualizations. The frontend can:

1. Request aggregation queries via natural language
2. Receive structured aggregation data
3. Map aggregation data to ZIP boundaries for choropleth rendering

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-27
