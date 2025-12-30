# TAXASSESSOR Join Proof Report
**Date:** 2025-12-28T18:15:53.507Z  
**Phase:** READ-ONLY Proof  
**Purpose:** Test feasibility of joining Neon parcelId to ATTOM ID via TAXASSESSOR CSV parcel number fields

---

## Executive Summary

**Source:** `/Users/braydonirwin/Downloads/TAXASSESSOR_0001.csv`

| Field | 6-Digit Count | Overlap | Overlap Rate | Collisions | Collision Rate |
|-------|---------------|---------|--------------|------------|----------------|
| `ParcelAccountNumber` | 438,130 | 351008 | **80.12%** | 44 | **0.01%** |
| `ParcelNumberAlternate` | 0 | 0 | **0.00%** | 0 | **0.00%** |
| `ParcelNumberPrevious` | 1,735 | 0 | **0.00%** | 0 | **0.00%** |
| `ParcelNumberRaw` | 4 | 2 | **50.00%** | 0 | **0.00%** |

---

## 1. Overall Statistics

| Metric | Value |
|--------|-------|
| **Total Rows** | 439,769 |

---

## 2. Field Analysis

### 2.1 ParcelAccountNumber

#### Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Values** | 438,130 | 100% |
| **Digits-Only** | 438,130 | 100.00% |
| **Exactly 6 Digits** | 438,130 | 100.00% |

#### Length Distribution

```json
{
  "6": 438130
}
```

#### Neon Overlap

| Metric | Value |
|--------|-------|
| **6-Digit Values** | 438,130 |
| **Overlap Count** | 351008 |
| **Overlap Rate** | **80.12%** |
| **Collision Count** | 44 |
| **Collision Rate** | **0.01%** |

#### Example Mappings

| parcelId | ATTOM ID | Collision? | ATTOM ID Count |
|----------|----------|------------|----------------|
| `545063` | `2864334` | ✅ No | 1 |
| `545085` | `2864335` | ✅ No | 1 |
| `544711` | `2864336` | ✅ No | 1 |
| `545066` | `2864337` | ✅ No | 1 |
| `545133` | `2864339` | ✅ No | 1 |
| `545137` | `2864340` | ✅ No | 1 |
| `545135` | `2864341` | ✅ No | 1 |
| `545136` | `2864342` | ✅ No | 1 |
| `545053` | `2864343` | ✅ No | 1 |
| `545072` | `3340087` | ✅ No | 1 |
| `545074` | `3340088` | ✅ No | 1 |
| `545117` | `3340090` | ✅ No | 1 |
| `545075` | `3340091` | ✅ No | 1 |
| `545071` | `3340092` | ✅ No | 1 |
| `545076` | `3340093` | ✅ No | 1 |
| `545077` | `3340094` | ✅ No | 1 |
| `545078` | `3340095` | ✅ No | 1 |
| `545079` | `3340096` | ✅ No | 1 |
| `545027` | `4517297` | ✅ No | 1 |
| `545039` | `7332482` | ✅ No | 1 |

#### Conclusion

**❌ NOT FEASIBLE**

❌ **DO NOT USE** - Insufficient overlap.


---

### 2.2 ParcelNumberAlternate

#### Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Values** | 2 | 100% |
| **Digits-Only** | 2 | 100.00% |
| **Exactly 6 Digits** | 0 | 0.00% |

#### Length Distribution

```json
{
  "10": 2
}
```

#### Neon Overlap

| Metric | Value |
|--------|-------|
| **6-Digit Values** | 0 |
| **Overlap Count** | 0 |
| **Overlap Rate** | **0.00%** |
| **Collision Count** | 0 |
| **Collision Rate** | **0.00%** |

#### Example Mappings

No mappings found.

#### Conclusion

**❌ NOT FEASIBLE**

❌ **DO NOT USE** - Insufficient overlap.


---

### 2.3 ParcelNumberPrevious

#### Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Values** | 431,375 | 100% |
| **Digits-Only** | 431,375 | 100.00% |
| **Exactly 6 Digits** | 1,735 | 0.40% |

#### Length Distribution

```json
{
  "6": 1735,
  "10": 418980,
  "14": 10660
}
```

#### Neon Overlap

| Metric | Value |
|--------|-------|
| **6-Digit Values** | 1,735 |
| **Overlap Count** | 0 |
| **Overlap Rate** | **0.00%** |
| **Collision Count** | 0 |
| **Collision Rate** | **0.00%** |

#### Example Mappings

No mappings found.

#### Conclusion

**❌ NOT FEASIBLE**

❌ **DO NOT USE** - Insufficient overlap.


---

### 2.4 ParcelNumberRaw

#### Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total Values** | 439,769 | 100% |
| **Digits-Only** | 439,765 | 100.00% |
| **Exactly 6 Digits** | 4 | 0.00% |

#### Length Distribution

```json
{
  "6": 4,
  "10": 5,
  "14": 439753,
  "15": 3
}
```

#### Neon Overlap

| Metric | Value |
|--------|-------|
| **6-Digit Values** | 4 |
| **Overlap Count** | 2 |
| **Overlap Rate** | **50.00%** |
| **Collision Count** | 0 |
| **Collision Rate** | **0.00%** |

#### Example Mappings

| parcelId | ATTOM ID | Collision? | ATTOM ID Count |
|----------|----------|------------|----------------|
| `967779` | `336179642` | ✅ No | 1 |
| `966186` | `336692578` | ✅ No | 1 |

#### Conclusion

**❌ NOT FEASIBLE**

❌ **DO NOT USE** - Insufficient overlap.



---

## 3. Recommendation

**Best Field:** ParcelAccountNumber

---

**Script:** `scripts/prove_taxassessor_join.mjs`  
**Report Generated:** 2025-12-28T18:15:53.511Z
