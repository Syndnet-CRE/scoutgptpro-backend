# Travis Resolver Proof Report
**Date:** 2025-12-28T18:08:18.418Z  
**Phase:** A (READ-ONLY)  
**Purpose:** Verify feasibility of building parcel ↔ ATTOM ID resolver

---

## Executive Summary

**CONCLUSION: NO-GO**

**Reason:** Insufficient overlap (0% GEO_ID match, 0 pairs)

---

## 1. StratMap Parcels Analysis

**Source:** `/Users/braydonirwin/attom_bridge/parcel_boundaries/parcel_boundaries/stratmap24-landparcels_48453_travis_202404.dbf`

| Metric | Value |
|--------|-------|
| **Total Records** | 374,880 |
| **Distinct Prop_ID** | 372,826 |
| **Distinct GEO_ID** | 367,157 |
| **Prop_ID All Digits** | ✅ Yes |

### Prop_ID Length Distribution

```json
{
  "1": 766,
  "6": 374106,
  "7": 8
}
```

### Prop_ID Samples

- `730563`
- `227394`
- `923763`
- `343532`
- `180872`
- `193840`
- `189567`
- `106129`
- `503163`
- `884198`
- `353111`
- `161409`
- `720963`
- `968409`
- `112391`
- `919103`
- `799180`
- `319382`
- `513425`
- `363352`

### GEO_ID Length Distribution

```json
{
  "10": 368465,
  "11": 4
}
```

### GEO_ID Samples

- `0430250314`
- `0168150122`
- `0410150609`
- `0222030714`
- `0137830401`
- `0100030810`
- `0417131020`
- `0426190921`
- `0443031210`
- `0143110103`
- `0412440102`
- `0172550503`
- `0120011210`
- `0272592303`
- `0150660321`
- `0105970171`
- `0262430223`
- `0424480508`
- `0276381020`
- `0424230421`

---

## 2. ATTOM Boundary Match CSV Analysis

**Source:** `/Users/braydonirwin/Downloads/PROPERTYTOBOUNDARYMATCH_PARCEL_0003.csv`

| Metric | Value |
|--------|-------|
| **Total Rows** | 409,670 |
| **Distinct [ATTOM ID]** | 403,334 |
| **Distinct GeoID** | 409,670 |

### GeoType Distribution

```json
{
  "Parcel": 409670
}
```

### [ATTOM ID] Samples

- `2864853`
- `2864854`
- `2864855`
- `2864856`
- `2864857`
- `2864858`
- `2864859`
- `2864860`
- `2864861`
- `2864862`
- `2864864`
- `2864865`
- `2864866`
- `2864867`
- `2864868`
- `2864869`
- `2864870`
- `2864871`
- `2864872`
- `2864873`

### GeoID Samples

- `c8e252d18f378a1669232b3b4a0d35b5`
- `c1c6a54f953fd1100ea115ea9c9c6973`
- `7f945ef9df0d5c77b92c144e3dc17ef1`
- `79ecfb87dfe2b44db5a429362a80aeae`
- `29f52f6731949a57ee41f5036f04ce90`
- `b76ac66fd678a3a1efe335c4c786d0a9`
- `f42b964c7b4285c4dbab40402ab234b6`
- `5e30d26abe7589ed0b8385cd330fe586`
- `b3ea1e4bb10cd7ce5060d1899e73f8c5`
- `de14fde184fe32ead96dff73961f30fb`
- `a6f8ceafa6501017a3606f22923b30ed`
- `7f1b75f88af3f1f3d34518b428aa56a6`
- `a54e0fcd88ce41e5208b111b6d236af1`
- `7c3b647289770b7ad92ea35211e14bfa`
- `7ff5fa237a9381c943cd2bf24c99eb0d`
- `cba92df6734245270b7f4e0eec0e73a4`
- `8fdfe1802cbfd991edbccf82f0503de6`
- `91b0b4a484132a8f0aa3b73b706b6058`
- `5ca799ba57f7ef922b16c4ccbe274d79`
- `0590277bc469718b860c4d5a6d4c445f`

---

## 3. Join Feasibility (Local)

**Join Key:** StratMap `GEO_ID` = Boundary Match `GeoID`

| Metric | Value |
|--------|-------|
| **StratMap GEO_IDs** | 367,157 |
| **Boundary Match GeoIDs** | 409,670 |
| **Overlap Count** | 0 |
| **Overlap Percentage** | **0.00%** |
| **Resulting Pairs (Prop_ID → ATTOM ID)** | **0** |

### Sample Pairs



---

## 4. Neon Overlap (READ-ONLY)

| Metric | Value |
|--------|-------|
| **Total Properties** | 352,431 |
| **Distinct parcelIds** | 352,431 |
| **StratMap Prop_IDs in Neon** | 352,431 / 372,817 |
| **StratMap → Neon Match Rate** | **94.53%** |
| **Neon parcelIds in StratMap (sample)** | 50,000 / 50,000 |
| **Neon → StratMap Match Rate** | **100.00%** |

---

## 5. Conclusion

**⚠️ NO-GO (Format Mismatch)**

**Root Cause:** GEO_ID format mismatch between StratMap and ATTOM boundary match:
- StratMap `GEO_ID`: 10-digit numeric (e.g., "0105970604")
- ATTOM Boundary Match `GeoID`: 32-character hash (e.g., "c8e252d18f378a1669232b3b4a0d35b5")

**These formats are incompatible and cannot be joined directly.**

### Positive Findings

✅ **Prop_ID ↔ Neon parcelId Match:** 94.53% (352,431 / 372,817)  
✅ **Neon → StratMap Match:** 100% (in 50k sample)  
✅ **StratMap data quality:** Excellent (374,880 records, 372,826 distinct Prop_IDs)

### Recommendation

**Do NOT proceed to Phase B with current datasets** - GEO_ID formats are incompatible.

**Alternative Approaches:**
1. **Use ATTOM GeoJSON with APN:** Join `Prop_ID` (StratMap) ↔ `apn` (ATTOM GeoJSON, 6-digit values)
2. **Find ATTOM dataset with parcel numbers:** Look for ATTOM dataset that includes numeric parcel identifiers matching `Prop_ID`
3. **Manual mapping:** For high-value parcels, consider manual mapping

**Next Steps:**
- Investigate `ATTOM_Travis County.geojson` for APN ↔ Prop_ID join feasibility
- Check if other ATTOM datasets include parcel number fields
- Consider using Prop_ID directly if ATTOM data can be joined via parcel number

---

**Script:** `scripts/prove_travis_resolver.mjs`  
**Report Generated:** 2025-12-28T18:08:18.430Z
