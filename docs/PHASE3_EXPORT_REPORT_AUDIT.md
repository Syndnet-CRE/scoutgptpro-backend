# Phase 3 Export & Report Infrastructure Audit

**Date:** 2025-01-27  
**Repositories Audited:**
- Backend: `/Users/braydonirwin/scoutgptpro-backend`
- Frontend: `/Users/braydonirwin/scoutgpt_9461`

---

## Executive Summary

**Current State:** Minimal export/report infrastructure exists. No CSV/Excel/PDF export endpoints for property data. Frontend has no export UI components. Property selection is single-select only.

**Recommendation:** Build new export/report infrastructure from scratch for Phase 3.

---

## 1. Backend Audit Results

### 1.1 Existing Export Endpoints

**Found:** Document download endpoints only (not property data export)

| Endpoint | Method | Purpose | File |
|----------|--------|---------|------|
| `/api/documents/:id/download` | GET | Download uploaded document files (PDF, DOC, XLS, etc.) | `src/routes/documents.js:141` |
| `/api/deal-rooms/:id/documents/:docId/download` | POST | Log and download deal room documents | `src/routes/dealRoomDocuments.js:170` |

**Not Found:**
- ❌ No CSV export endpoints for property data
- ❌ No Excel export endpoints
- ❌ No PDF report generation endpoints
- ❌ No bulk property export endpoints

### 1.2 Report Generation

**Found:** None

- ❌ No report generation logic
- ❌ No report templates
- ❌ No comparison report functionality
- ✅ SQL generation exists (`sqlcoder.js`) but not for reports

### 1.3 Installed Export Libraries

**Backend (`package.json`):**

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| `csv-parse` | ^6.1.0 | CSV parsing (import) | ✅ Installed |
| `papaparse` | ^5.4.1 | CSV parsing (import) | ✅ Installed |
| `csv-parser` | ^3.2.0 | CSV parsing (dev) | ✅ Installed |

**Missing:**
- ❌ No CSV generation library (e.g., `csv-writer`, `fast-csv`)
- ❌ No Excel generation library (e.g., `exceljs`, `xlsx`)
- ❌ No PDF generation library (e.g., `pdfkit`, `puppeteer`, `jspdf`)
- ❌ No report templating library (e.g., `handlebars`, `ejs`)

### 1.4 Current API Routes Summary

**Total Routes Found:** 92 route handlers across 24 route files

**Key Routes:**
- `/api/ai/query` - Property search (returns JSON)
- `/api/properties/*` - Property CRUD operations
- `/api/parcels/*` - Parcel data endpoints
- `/api/boundaries/zip` - ZIP boundary GeoJSON
- `/api/discover/query` - Discovery engine queries

**No export-specific routes found.**

---

## 2. Frontend Audit Results

### 2.1 Existing Export UI Components

**Found:** None

- ❌ No export buttons or components
- ❌ No download UI
- ❌ No "Export to CSV" functionality
- ❌ No "Generate Report" buttons
- ❌ No file download handlers

### 2.2 Report/Comparison UI

**Found:** None

- ❌ No report pages
- ❌ No comparison views
- ❌ No report templates
- ✅ `AggregationResults.jsx` exists but only displays data (no export)

### 2.3 Installed Export Libraries

**Frontend (`package.json`):**

| Package | Version | Purpose | Status |
|---------|---------|---------|--------|
| `papaparse` | ^5.5.3 | CSV parsing (import) | ✅ Installed |

**Missing:**
- ❌ No CSV generation library (e.g., `papaparse` can generate but not used)
- ❌ No Excel generation library (e.g., `xlsx`, `exceljs`)
- ❌ No PDF generation library (e.g., `jspdf`, `react-pdf`)
- ❌ No file download library (e.g., `file-saver`)

### 2.4 Property Selection State

**Current Implementation:** Single-select only

**Location:** `src/hooks/useSelectedEntity.js`

**State Structure:**
```javascript
{
  selectedEntity: null | PropertyObject,
  selectedIds: { propertyId: null, parcelId: null },
  loading: boolean,
  error: null | string
}
```

**Key Findings:**
- ✅ Single property selection works (`useSelectedEntity`)
- ✅ Property bundle caching exists (`usePropertyBundle`)
- ❌ **No multi-select state**
- ❌ **No bulk selection tracking**
- ❌ **No selected properties array/list**

**Other Selection State:**
- `PropertyContext` has `pinnedPropertyIds` array (for pinning, not selection)
- `MapWorkspace` has `savedProperties` array (for saved properties, not selection)
- `queryResultParcelIds` Set exists (for query results, not user selection)

### 2.5 AIChatPanel Export Capabilities

**Checked:** `src/components/layout/AIChatPanel.jsx`

**Found:**
- ❌ No export buttons
- ❌ No download actions
- ❌ No CSV/PDF generation calls
- ✅ Displays property results via `PropertyCardsList`
- ✅ Shows aggregation results via `AggregationResults`

### 2.6 MapWorkspace Selection Capabilities

**Checked:** `src/pages/scout-ai-chat/components/MapWorkspace.jsx`

**Found:**
- ✅ Single property selection (`selectedProperty` state)
- ✅ Parcel selection via map clicks
- ❌ **No multi-select checkboxes**
- ❌ **No bulk selection UI**
- ❌ **No "Select All" functionality**

---

## 3. Detailed Findings

### 3.1 CSV Export Infrastructure

**Backend:**
- ✅ Has CSV parsing libraries (`csv-parse`, `papaparse`)
- ❌ No CSV generation libraries
- ❌ No CSV export endpoints

**Frontend:**
- ✅ Has `papaparse` (can generate CSV)
- ❌ Not used for export
- ❌ No file download mechanism

**Recommendation:**
- **Backend:** Install `csv-writer` or use `papaparse` for CSV generation
- **Frontend:** Install `file-saver` for client-side downloads, or use backend endpoint

### 3.2 Excel Export Infrastructure

**Backend:**
- ❌ No Excel libraries installed
- ❌ No Excel export endpoints

**Frontend:**
- ❌ No Excel libraries installed
- ❌ No Excel export functionality

**Recommendation:**
- Install `exceljs` (backend) or `xlsx` (frontend) for Excel generation

### 3.3 PDF Report Infrastructure

**Backend:**
- ❌ No PDF libraries installed
- ❌ No PDF generation endpoints
- ❌ No report templates

**Frontend:**
- ❌ No PDF libraries installed
- ❌ No PDF generation

**Recommendation:**
- Install `pdfkit` (backend) or `jspdf` (frontend) for PDF generation
- Consider `puppeteer` for HTML-to-PDF conversion (better formatting)

### 3.4 Property Selection for Export

**Current State:**
- Single-select only via `useSelectedEntity`
- No multi-select state management
- No bulk selection UI

**Required for Phase 3:**
- Multi-select checkbox UI in property lists
- Bulk selection state management
- "Select All" / "Clear Selection" actions
- Selected properties array/Set for export

**Recommendation:**
- Create `useMultiSelect` hook for bulk selection
- Add checkboxes to `PropertyCardsList` component
- Store selected property IDs in context or state

---

## 4. Recommended Approach

### 4.1 CSV Export

**Option A: Backend Endpoint (Recommended)**
- ✅ Better for large datasets
- ✅ Consistent formatting
- ✅ Can include all property fields

**Implementation:**
1. Install `csv-writer` or use `papaparse` in backend
2. Create `/api/properties/export/csv` endpoint
3. Accept array of property IDs or query filters
4. Generate CSV and return as download
5. Frontend calls endpoint and triggers download

**Option B: Frontend Generation**
- ✅ No backend changes needed
- ❌ Limited to data already loaded
- ❌ May be slow for large datasets

**Implementation:**
1. Install `file-saver` in frontend
2. Use `papaparse` to generate CSV from property array
3. Trigger download via `file-saver`

**Recommendation:** **Option A (Backend Endpoint)**

### 4.2 PDF Reports

**Option A: Backend Generation (Recommended)**
- ✅ Better formatting control
- ✅ Can include images/maps
- ✅ Consistent styling

**Implementation:**
1. Install `pdfkit` or `puppeteer` in backend
2. Create `/api/properties/export/pdf` endpoint
3. Generate PDF with property details, maps, charts
4. Return PDF as download

**Option B: Frontend Generation**
- ✅ Faster for simple reports
- ❌ Limited formatting options
- ❌ May not include maps/images

**Implementation:**
1. Install `jspdf` or `react-pdf` in frontend
2. Generate PDF from property data
3. Trigger download

**Recommendation:** **Option A (Backend Generation)** for professional reports

### 4.3 Property Comparison

**Current State:** No comparison functionality

**Required:**
1. Multi-select UI (checkboxes in property lists)
2. Comparison view component
3. Side-by-side property display
4. Export comparison as PDF/Excel

**Implementation:**
1. Create `useMultiSelect` hook
2. Add checkboxes to `PropertyCardsList`
3. Create `PropertyComparison` component
4. Add comparison export endpoints

---

## 5. Implementation Checklist

### Phase 3.1: Multi-Select Infrastructure

- [ ] Create `useMultiSelect` hook
- [ ] Add checkboxes to `PropertyCardsList` component
- [ ] Add "Select All" / "Clear Selection" buttons
- [ ] Store selected property IDs in context/state
- [ ] Update `PropertyContext` to support multi-select

### Phase 3.2: CSV Export

- [ ] Install `csv-writer` in backend
- [ ] Create `/api/properties/export/csv` endpoint
- [ ] Accept property IDs array or query filters
- [ ] Generate CSV with all property fields
- [ ] Add "Export to CSV" button in frontend
- [ ] Test with 100+ properties

### Phase 3.3: Excel Export

- [ ] Install `exceljs` in backend
- [ ] Create `/api/properties/export/excel` endpoint
- [ ] Generate Excel with multiple sheets (properties, summary)
- [ ] Add "Export to Excel" button in frontend
- [ ] Include formatting (headers, colors, formulas)

### Phase 3.4: PDF Reports

- [ ] Install `pdfkit` or `puppeteer` in backend
- [ ] Create `/api/properties/export/pdf` endpoint
- [ ] Design report template (header, property details, maps)
- [ ] Generate PDF with property data
- [ ] Add "Generate Report" button in frontend
- [ ] Support single property and multi-property reports

### Phase 3.5: Property Comparison

- [ ] Create `PropertyComparison` component
- [ ] Add comparison view page/route
- [ ] Display properties side-by-side
- [ ] Highlight differences
- [ ] Add comparison export (PDF/Excel)

---

## 6. Summary

### Existing Export Endpoints
**None** (except document file downloads)

### Existing Export UI
**None**

### Installed Export Libraries
**Backend:** `csv-parse`, `papaparse` (parsing only)  
**Frontend:** `papaparse` (parsing only)

### Property Selection State
**Single-select only** via `useSelectedEntity`  
**No multi-select** capability

### Report Generation
**None**

### Recommended Approach

**CSV Export:**
- ✅ Use backend endpoint with `csv-writer` or `papaparse`
- ✅ Frontend calls endpoint and triggers download

**PDF Reports:**
- ✅ Use backend generation with `pdfkit` or `puppeteer`
- ✅ Professional formatting with maps/charts

**Property Comparison:**
- ✅ Build multi-select infrastructure first
- ✅ Create comparison component
- ✅ Add comparison export endpoints

**Next Steps:**
1. Build multi-select infrastructure
2. Implement CSV export endpoint
3. Implement Excel export endpoint
4. Implement PDF report generation
5. Build property comparison UI

---

**Audit Complete:** 2025-01-27  
**Next Phase:** Phase 3 Implementation
