# Database Cleanup Report — Neon 512MB Limit Resolution

**Date:** December 24, 2024  
**Database:** Neon PostgreSQL (neondb)  
**Current Size:** 494 MB / 512 MB (96.5% capacity)  
**Status:** ⚠️ **AT LIMIT** — Migration blocked

---

## 📊 CURRENT DATABASE SIZE BREAKDOWN

### Total Database Size
- **Total:** 494 MB
- **Available:** ~18 MB remaining
- **Status:** ⚠️ Critical — Migration cannot proceed

### Table Size Breakdown

| Rank | Table | Total Size | Table Size | Indexes | % of Total |
|------|-------|------------|------------|---------|------------|
| 1 | **properties** | **477 MB** | 307 MB | 170 MB | **96.51%** |
| 2 | spatial_ref_sys | 7.1 MB | 6.9 MB | 208 KB | 1.41% |
| 3 | map_server_registry | 800 KB | 336 KB | 424 KB | 0.16% |
| 4 | layer_sets | 248 KB | 48 KB | 80 KB | 0.05% |
| 5 | polygon_searches | 112 KB | 8 KB | 64 KB | 0.02% |
| 6-17 | Other tables | ~200 KB | ~0 KB | ~200 KB | <0.1% |

**Key Finding:** The `properties` table consumes **96.51%** of the database (477 MB out of 494 MB).

---

## 📋 PROPERTIES TABLE ANALYSIS

### Row Count
- **Total Properties:** 372,825 rows

### Distribution by State

| State | Count | % of Total | Notes |
|-------|-------|------------|-------|
| **TX** | 348,702 | 93.5% | ✅ Primary focus |
| **CA** | 7,948 | 2.1% | ⚠️ Can be removed |
| **NULL** | 5,513 | 1.5% | ⚠️ Incomplete data |
| **FL** | 1,118 | 0.3% | ⚠️ Can be removed |
| **NY** | 868 | 0.2% | ⚠️ Can be removed |
| **Other (AZ, CO, IL, WA, MN, etc.)** | 8,676 | 2.3% | ⚠️ Can be removed |

**Total Non-TX Properties:** ~24,123 (6.5%)

### Distribution by City (Top 20)

| City | Count | % of Total |
|------|-------|------------|
| **AUSTIN** | 232,925 | 62.5% |
| PFLUGERVILLE | 29,569 | 7.9% |
| MANOR | 12,124 | 3.3% |
| LEANDER | 7,487 | 2.0% |
| LAGO VISTA | 6,978 | 1.9% |
| NULL | 5,747 | 1.5% |
| LAKEWAY | 5,470 | 1.5% |
| CEDAR PARK | 4,773 | 1.3% |
| ROUND ROCK | 4,424 | 1.2% |
| SPICEWOOD | 4,356 | 1.2% |
| DEL VALLE | 4,221 | 1.1% |
| **HOUSTON** | 4,119 | 1.1% |
| **DALLAS** | 1,571 | 0.4% |
| **SAN ANTONIO** | 1,185 | 0.3% |
| Other cities | 50,101 | 13.4% |

**Key Finding:** Austin-area properties dominate (232K+), but Houston, Dallas, and San Antonio are also present.

### NULL Value Statistics
- **NULL city:** 5,747 (1.5%)
- **NULL state:** 5,513 (1.5%)
- **NULL latitude:** 0 ✅
- **NULL longitude:** 0 ✅
- **NULL propertyType:** 0 ✅

---

## 🎯 CLEANUP RECOMMENDATIONS

### Option A: Remove Non-Texas Properties ⭐ **RECOMMENDED**

**Action:** Delete all properties where `state != 'TX'` or `state IS NULL`

**Impact:**
- **Rows to delete:** ~24,123 properties (6.5%)
- **Estimated space savings:** ~31 MB (477 MB × 6.5%)
- **New database size:** ~463 MB
- **Available space:** ~49 MB ✅

**Risk Level:** 🟢 **LOW**
- Non-TX properties are not core to the business
- Only 6.5% of data
- TX properties (348K) remain intact

**SQL Command:**
```sql
-- Preview what would be deleted
SELECT state, COUNT(*) 
FROM properties 
WHERE state != 'TX' OR state IS NULL
GROUP BY state;

-- Execute deletion (AFTER APPROVAL)
DELETE FROM properties 
WHERE state != 'TX' OR state IS NULL;
```

**Estimated Result:** Database size drops to ~463 MB, freeing ~49 MB for migration.

---

### Option B: Remove NULL/Incomplete Records

**Action:** Delete properties with NULL city or state

**Impact:**
- **Rows to delete:** ~5,513 properties (1.5%)
- **Estimated space savings:** ~7 MB
- **New database size:** ~487 MB
- **Available space:** ~25 MB ⚠️ (Still tight)

**Risk Level:** 🟡 **MEDIUM**
- Incomplete data may be useful for matching
- Small space savings
- May not be enough for migration

**SQL Command:**
```sql
DELETE FROM properties 
WHERE (city IS NULL AND "siteCity" IS NULL) 
   OR (state IS NULL AND "siteState" IS NULL);
```

**Estimated Result:** Database size drops to ~487 MB, freeing ~7 MB (may not be enough).

---

### Option C: Vacuum and Reclaim Space

**Action:** Run `VACUUM FULL` to reclaim space from deleted rows

**Impact:**
- **Space savings:** Unknown (depends on fragmentation)
- **Risk:** May lock tables during operation

**Risk Level:** 🟡 **MEDIUM**
- May not free enough space
- Can cause temporary downtime

**SQL Command:**
```sql
VACUUM FULL ANALYZE properties;
```

---

### Option D: Archive Old/Unused Data

**Action:** Check for duplicate or stale records

**Impact:**
- **Space savings:** Unknown (needs investigation)
- **Requires:** Analysis of data freshness

**Risk Level:** 🟡 **MEDIUM**
- Requires careful analysis
- May not free significant space

---

## 🎯 RECOMMENDED CLEANUP PLAN

### Phase 1: Remove Non-Texas Properties ⭐ **PRIMARY ACTION**

**Why:**
1. **Largest impact:** Frees ~31 MB (6.5% of database)
2. **Low risk:** Non-TX data is not core business
3. **Immediate:** Can be executed quickly
4. **Sufficient:** Provides enough space for migration (~49 MB free)

**Steps:**
1. ✅ **Backup** (if possible) — Neon may have automatic backups
2. ✅ **Preview** deletion with SELECT query
3. ✅ **Execute** DELETE command
4. ✅ **Verify** database size reduction
5. ✅ **Run** `VACUUM ANALYZE` to reclaim space
6. ✅ **Retry** migration: `npx prisma db push`

**Expected Outcome:**
- Database size: ~463 MB
- Free space: ~49 MB
- Migration: ✅ Can proceed

---

### Phase 2: Remove NULL Records (If Needed)

**If Phase 1 doesn't free enough space:**

**Action:** Delete properties with NULL city AND NULL state

**Impact:**
- Additional ~7 MB freed
- Total free space: ~56 MB

---

## ⚠️ RISK ASSESSMENT

### Option A: Remove Non-TX Properties
- **Data Loss:** ~24K properties (6.5%)
- **Business Impact:** 🟢 **LOW** — Non-TX properties not core business
- **Recovery:** Can re-import if needed
- **Recommendation:** ✅ **APPROVE**

### Option B: Remove NULL Records
- **Data Loss:** ~5.5K properties (1.5%)
- **Business Impact:** 🟡 **MEDIUM** — May lose matchable records
- **Recovery:** Difficult (data incomplete)
- **Recommendation:** ⚠️ **USE ONLY IF NEEDED**

### Option C: Vacuum
- **Data Loss:** None
- **Business Impact:** 🟢 **LOW** — No data loss
- **Downtime:** Temporary table locks
- **Recommendation:** ✅ **RUN AFTER DELETION**

---

## 📝 EXECUTION CHECKLIST

### Before Deletion:
- [ ] Review this report
- [ ] Confirm business approval for removing non-TX properties
- [ ] Check Neon backup availability
- [ ] Run preview query to verify counts

### Execution:
- [ ] Run preview query: `SELECT state, COUNT(*) FROM properties WHERE state != 'TX' OR state IS NULL GROUP BY state;`
- [ ] Execute deletion: `DELETE FROM properties WHERE state != 'TX' OR state IS NULL;`
- [ ] Verify deletion: `SELECT COUNT(*) FROM properties;` (should be ~348,702)
- [ ] Run vacuum: `VACUUM ANALYZE properties;`
- [ ] Check database size: `SELECT pg_size_pretty(pg_database_size(current_database()));`

### After Deletion:
- [ ] Verify database size is ~463 MB
- [ ] Retry migration: `npx prisma db push`
- [ ] Verify listings table migration succeeded
- [ ] Test listings endpoints

---

## 📊 ESTIMATED RESULTS

### After Option A (Remove Non-TX Properties):

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Database Size** | 494 MB | ~463 MB | -31 MB ✅ |
| **Free Space** | 18 MB | ~49 MB | +31 MB ✅ |
| **Properties Count** | 372,825 | ~348,702 | -24,123 |
| **TX Properties** | 348,702 | 348,702 | 0 (preserved) |
| **Migration Status** | ❌ Blocked | ✅ Can proceed | — |

---

## 🚀 NEXT STEPS

1. **Review and Approve** cleanup plan
2. **Execute** Option A (remove non-TX properties)
3. **Verify** database size reduction
4. **Run** migration: `npx prisma db push`
5. **Test** listings endpoints

---

## 📞 QUESTIONS TO CONSIDER

1. **Are non-Texas properties needed?**
   - If yes, consider upgrading Neon plan instead
   - If no, proceed with Option A

2. **Is 49 MB enough for migration?**
   - Migration adds ~20-30 fields to listings table
   - Estimated migration size: ~5-10 MB
   - **Answer:** ✅ Yes, 49 MB should be sufficient

3. **Should we archive instead of delete?**
   - Can export non-TX properties to CSV/JSON
   - Store in S3 or local backup
   - **Recommendation:** Export before deletion if needed

---

**Report Generated:** December 24, 2024  
**Status:** ⏳ **AWAITING APPROVAL**


