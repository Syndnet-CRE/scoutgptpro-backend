# ATTOM GeoJSON Join Proof Report
**Date:** 2025-12-28T18:15:27.972Z  
**Phase:** READ-ONLY Proof  
**Purpose:** Test feasibility of joining Neon parcelId to ATTOM ID via ATTOM GeoJSON APN field

---

## Executive Summary

**Source:** `/tmp/zip_audit_3zips/zip2/ATTOM_Travis County.geojson`

| Metric | Value |
|--------|-------|
| **Total Features** | 413,905 |
| **APN Fields (Total)** | 413,905 |
| **APN Digits-Only** | 413,905 |
| **APN Exactly 6 Digits** | 413,622 |
| **Overlap with Neon parcelId** | 352,316 / 413,622 |
| **Overlap Rate** | **85.18%** |
| **Collisions** | 3,226 |
| **Collision Rate** | **0.92%** |

---

## 1. Property Keys Identified

**Available fields in ATTOM GeoJSON:**

- `id`
- `fipsstate`
- `fipscounty`
- `county`
- `apn`
- `apn2`
- `addrline1`
- `city`
- `state`
- `zip5`
- `src_id`
- `latitude`
- `longitude`

**Key Fields:**
- **ATTOM ID:** `id`
- **APN:** `apn`

---

## 2. APN Field Analysis

### 2.1 Length Distribution

```json
{
  "1": 275,
  "6": 413622,
  "7": 8
}
```

### 2.2 Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total APN Values** | 413,905 | 100% |
| **Digits-Only** | 413,905 | 100.00% |
| **Exactly 6 Digits** | 413,622 | 99.93% |

---

## 3. Neon Overlap Analysis

**Neon parcelId Sample:** All 352,431 distinct parcelIds

### 3.1 Overlap Metrics

| Metric | Value |
|--------|-------|
| **6-Digit APN Values** | 413,622 |
| **Overlap Count** | 352,316 |
| **Overlap Rate** | **85.18%** |

### 3.2 Collision Analysis

**Collision:** Multiple ATTOM IDs mapping to the same 6-digit APN (parcelId)

| Metric | Value |
|--------|-------|
| **Collision Count** | 3,226 |
| **Collision Rate** | **0.92%** |

**Interpretation:**
- Collision rate < 0.1%: ✅ Excellent (deterministic join)
- Collision rate 0.1-1%: ⚠️ Acceptable (may need conflict resolution)
- Collision rate > 1%: ❌ Poor (not deterministic)

---

## 4. Example Mappings

**Sample parcelId → ATTOM ID mappings:**

| parcelId | ATTOM ID | Collision? | ATTOM ID Count |
|----------|----------|------------|----------------|
| `315284` | `9fed3c14dbe946953f28797b22e5ffff` | ⚠️ Yes | 2 |
| `922822` | `3a41aec91415a34c04d752d64fedaad1` | ✅ No | 1 |
| `953827` | `26dbb3508d86f502654134d25a7b59d0` | ✅ No | 1 |
| `825919` | `8e1f5b14f5f5cef48e57c1273f6498ef` | ✅ No | 1 |
| `153473` | `935cd4759bc5b2f8a028df226f4aaa34` | ✅ No | 1 |
| `739091` | `b526f6db2df066f740754f962084f845` | ✅ No | 1 |
| `143819` | `8bd6ec50d76213f243b088a2825c2396` | ✅ No | 1 |
| `954025` | `a3067a1be9700e8e61fb57ee0d9050db` | ✅ No | 1 |
| `902843` | `664123503e78c559375c9b3f14532f3d` | ✅ No | 1 |
| `965142` | `74e48eb6dd40a6b38276d9a8a9e6ccfd` | ✅ No | 1 |
| `200184` | `3697b0170534d9d8e858c6e5daa0512e` | ✅ No | 1 |
| `165482` | `69b103b8dd103c0ed2c3c659786782a0` | ✅ No | 1 |
| `299903` | `a258501671dc7977346b3784bfd9cacb` | ✅ No | 1 |
| `179965` | `0ce7c6e7a3615a91563ed15922b93018` | ✅ No | 1 |
| `911682` | `833f16812324132c169c6cdac159e4e2` | ✅ No | 1 |
| `495545` | `289af880bfd3e853d383eefca920caaa` | ✅ No | 1 |
| `961526` | `367ad494520e7d650997c973f515dc3a` | ✅ No | 1 |
| `905475` | `5ee89dc05cfb7114d032874866817ab5` | ✅ No | 1 |
| `149915` | `fc832169cbf7f5a4c3f2669fa5b67068` | ✅ No | 1 |
| `127502` | `735ca70d5103c2e79602facab91080e1` | ✅ No | 1 |

---

## 5. Conclusion

**❌ NOT FEASIBLE**

**Overlap Rate:** 85.18% ❌  
**Collision Rate:** 0.92% ❌

**Recommendation:**
❌ **DO NOT USE** - Insufficient overlap or too many collisions.

---

**Script:** `scripts/prove_attom_geojson_join.mjs`  
**Report Generated:** 2025-12-28T18:15:27.980Z
