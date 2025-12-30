# Join Sanity Check Report

**Generated:** 2025-12-30T15:50:05.328Z

## Summary

- **Sample Size:** 100 detected_id values vs 100 parcel_id values
- **SQL Verification Matched Count:** 1

## Match Categories

| Category | Count | Description |
|----------|-------|-------------|
| **A** | 0 | Exact raw string match |
| **B** | 0 | Match after normalizeDotZero only |
| **C** | 0 | Match after stripLeadingZeros only |
| **D** | 0 | Match after full matchKey |
| **E** | 100 | No match |

## Category A: Exact Raw String Match

No matches found.

## Category B: Match After normalizeDotZero Only

No matches found.

## Category C: Match After stripLeadingZeros Only

No matches found.

## Category D: Match After Full matchKey

No matches found.

## Category E: No Match

1. detected_id: `0229111006` (no matching parcel_id found)
2. detected_id: `0410250239` (no matching parcel_id found)
3. detected_id: `0202080608` (no matching parcel_id found)
4. detected_id: `C OF A` (no matching parcel_id found)
5. detected_id: `0174300208` (no matching parcel_id found)
6. detected_id: `0105160354` (no matching parcel_id found)
7. detected_id: `HAYS CO` (no matching parcel_id found)
8. detected_id: `0426500754` (no matching parcel_id found)
9. detected_id: `0145480905` (no matching parcel_id found)
10. detected_id: `0422191601` (no matching parcel_id found)

## Top 10 Transformations: parcels_travis.parcel_id

| Original | matchKey |
|----------|----------|
| `128035` | `128035` |
| `524269` | `524269` |
| `340289` | `340289` |
| `222280` | `222280` |
| `457968` | `457968` |
| `927419` | `927419` |
| `840608` | `840608` |
| `905067` | `905067` |
| `483949` | `483949` |
| `904983` | `904983` |

## Top 10 Transformations: parcels_travis_enrichment_stage.detected_id

| Original | matchKey |
|----------|----------|
| `0229111006` | `229111006` |
| `0410250239` | `410250239` |
| `0202080608` | `202080608` |
| `C OF A` | `C OF A` |
| `0174300208` | `174300208` |
| `0105160354` | `105160354` |
| `HAYS CO` | `HAYS CO` |
| `0426500754` | `426500754` |
| `0145480905` | `145480905` |
| `0422191601` | `422191601` |

## SQL Verification Result

```sql
WITH s AS (
  SELECT CASE
    WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\.0+$', ''), '^0+', '') = '' THEN '0'
    ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(detected_id::text), E'\.0+$', ''), '^0+', '')
  END AS k
  FROM parcels_travis_enrichment_stage
  WHERE detected_id IS NOT NULL
),
p AS (
  SELECT CASE
    WHEN REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\.0+$', ''), '^0+', '') = '' THEN '0'
    ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(parcel_id::text), E'\.0+$', ''), '^0+', '')
  END AS k
  FROM parcels_travis
)
SELECT COUNT(*) AS matched_count FROM s JOIN p ON s.k = p.k;
```

**Result:** `matched_count = 1`

---

## Helper Functions Used

### normalizeDotZero(x)
- Trim string
- Remove trailing ".0+" via `/.0+$/`

### stripLeadingZeros(x)
- Remove leading zeros via `/^0+/`

### matchKey(x)
- Apply normalizeDotZero → stripLeadingZeros
- If empty, return "0"
