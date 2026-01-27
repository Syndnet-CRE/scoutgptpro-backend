# PROPERTY CARD COMPONENTS AND UI PATTERNS AUDIT
**Date:** January 26, 2026  
**Repository:** `~/scoutgpt_9461` (Frontend)  
**Purpose:** Audit existing property card components and UI patterns to inform Claude Code spec

---

## EXECUTIVE SUMMARY

The frontend has **8 property card components** with varying levels of detail and use cases. The codebase uses **framer-motion** for animations and has established patterns for loading states, progress indicators, and property display.

**Key Findings:**
- ✅ Multiple property card variants exist (chat, map, floating, detailed)
- ✅ Framer Motion installed (`^10.16.4`)
- ✅ Loading patterns use `Loader2` spinner from lucide-react
- ✅ Pipeline progress component exists (12-step visualization)
- ✅ Chat messages render markdown with property data attachments
- ⚠️ No consistent property card component (multiple implementations)
- ⚠️ Property data structure varies across components

---

## 1. PROPERTY CARD COMPONENTS

### 1.1 Component Inventory

**Found 8 Property Card Components:**

1. **`PropertyCard.jsx`** (`src/components/chat/PropertyCard.jsx`)
   - **Purpose**: Chat result property cards
   - **Size**: Compact, ~270 lines
   - **Features**: 
     - Asset class badge
     - Motivation score badge
     - Address, owner, value, acres, zoning
     - Opportunity flags (max 3)
     - Actions: "Show on Map", "View Details", "Save to CRM"
   - **Styling**: Dark theme (`bg-[#374151]`)
   - **Animation**: `transition-colors` on hover

2. **`PropertyInfoCard.jsx`** (`src/components/property/PropertyInfoCard.jsx`)
   - **Purpose**: Comprehensive property details (10 collapsible sections)
   - **Size**: Large, ~1291 lines
   - **Features**:
     - 10 collapsible sections (Property, Ownership, Valuation, Physical, etc.)
     - Save to CRM, Save to Project, Pin to Chat actions
     - File upload section
     - Copy APN functionality
     - localStorage persistence for collapse state
   - **Styling**: Dark theme with section headers
   - **Sections**: Property, Ownership, Valuation/Tax, Physical, Zoning, Land Use, Financials, Risks, Documents, Notes

3. **`FloatingPropertyCard.jsx`** (`src/components/property/FloatingPropertyCard.jsx`)
   - **Purpose**: Floating overlay on map
   - **Size**: Small, ~75 lines
   - **Features**:
     - Collapsible header
     - Wraps `PropertyInfoCard` component
     - Positioned absolutely over map
   - **Styling**: White/dark theme with shadow

4. **`MapPropertyCard.jsx`** (`src/components/property/MapPropertyCard.jsx`)
   - **Purpose**: Map popup card with Street View
   - **Size**: Medium, ~198 lines
   - **Features**:
     - Google Street View image (placeholder)
     - Property type badge
     - Zoning badge
     - Status badges (Foreclosure, Investor, Out of State)
     - Motivation score donut chart
     - Assessed value display
     - Address, owner, acres, zoning
   - **Styling**: White card with image header
   - **Note**: References Google Street View API (not configured)

5. **`MapPropertyPopup.jsx`** (`src/components/property/MapPropertyPopup.jsx`)
   - **Purpose**: Map click popup
   - **Status**: Exists but not reviewed in detail

6. **`PropertyPopupCard.jsx`** (`src/components/property/PropertyPopupCard.jsx`)
   - **Purpose**: Popup variant
   - **Status**: Exists but not reviewed in detail

7. **`PropertyDetailsModal.jsx`** (`src/components/property/PropertyDetailsModal.jsx`)
   - **Purpose**: Modal view of property details
   - **Status**: Exists but not reviewed in detail

8. **`PropertyCardsList.jsx`** (`src/components/chat/PropertyCardsList.jsx`)
   - **Purpose**: Container for multiple `PropertyCard` components
   - **Size**: Small, ~111 lines
   - **Features**:
     - Shows 5 properties initially
     - "Show more" button for remaining
     - Selection toolbar
     - Property checkboxes
   - **Styling**: Dark theme list

### 1.2 Property Card Structure Analysis

**Common Fields Displayed:**

```javascript
{
  // Identifiers
  id, parcelId, propertyId, apn
  
  // Location
  address, city, state, zip, situsAddress
  
  // Ownership
  owner, ownerName, ownerType, ownerMailingAddress
  
  // Physical
  acres, lotSizeAcres, buildingAreaSqft, yearBuilt
  
  // Valuation
  marketValue, assessedValue, landValue, improvementValue
  
  // Classification
  assetClass, assetType, propertyType, zoning
  
  // Flags
  isTaxDelinquent, isForeclosure, isAbsentee, isInvestorOwned, isVacantLand
  
  // Scores
  motivationScore, saleLikelihoodScore
  
  // Metadata
  opportunityFlags, signals
}
```

**Property Data Structure Variations:**

- **Chat Results**: `property.parcel_id`, `property.address`, `property.marketValue`
- **Property Bundle**: `selectedBundle.core`, `selectedBundle.enrichment`
- **Raw Data**: `property.raw.parcelId`, `property.raw.latitude`
- **Active Property**: `activeProperty.core`, `activeProperty.physical`

**Formatting Utilities:**
- `formatCurrency()` - Currency formatting
- `formatAcres()` / `formatAcresShort()` - Acreage formatting
- `getCanonicalAcres()` - Extract acres from various sources

---

## 2. LOADING AND ANIMATION PATTERNS

### 2.1 Loading Components

**Loading Indicators Found:**

1. **`Loader2` from lucide-react**
   - **Usage**: Primary loading spinner
   - **Pattern**: `<Loader2 className="animate-spin" size={20} />`
   - **Locations**:
     - `ScoutTab.jsx` - Chat loading state
     - `PropertyCard.jsx` - Save to CRM button
     - `PipelineProgress.jsx` - Step processing indicator
     - `ChatPanel.jsx` - Message loading

2. **Loading States:**
   ```jsx
   // Pattern 1: Inline loading
   {isLoading && (
     <div className="scout-message-loading">
       <Loader2 className="animate-spin" size={20} />
       <span>Thinking...</span>
     </div>
   )}
   
   // Pattern 2: Button loading
   {savingId === propertyId ? (
     <>
       <Icon name="Loader2" size={12} className="animate-spin" />
       <span>Saving...</span>
     </>
   ) : (
     <span>Save to CRM</span>
   )}
   ```

3. **Skeleton Loading:**
   - Not found in codebase
   - Could be added for property card placeholders

### 2.2 Animation Libraries

**Framer Motion:**
- ✅ **Installed**: `framer-motion@^10.16.4`
- ⚠️ **Usage**: Limited - found in some components but not extensively used
- **Found In**:
  - `PropertyCard.jsx` - Referenced but not actively used
  - `PropertyInfoCard.jsx` - Referenced but not actively used
  - Various UI components

**CSS Transitions:**
- ✅ **Extensively Used**: `transition-colors`, `transition-all`
- **Pattern**: `className="hover:bg-blue-600 transition-colors"`
- **Duration**: Typically `0.15s` or `duration-200` (200ms)

**Animation Classes:**
- `animate-spin` - For loading spinners
- `transition-transform` - For chevron rotations
- `transition-all duration-200` - For general animations

### 2.3 Pipeline Progress Component

**`PipelineProgress.jsx`** (`src/components/chat/PipelineProgress.jsx`)

**Purpose**: Visual 12-step AI processing pipeline

**Features:**
- 12 steps with names and descriptions
- Step states: Complete (green), Current (yellow), Pending (gray)
- Timing simulation with random variation
- Icons: `CheckCircle` (complete), `Loader2` (current), `Circle` (pending)
- Displays step timing in milliseconds

**Steps:**
1. Context Injection
2. Query Interpretation
3. Intent Validation
4. Clarification Check
5. Geography Resolution
6. Spatial Resolution
7. Attribute Mapping
8. SQL Generation
9. Query Execution
10. Result Formatting
11. Session Update
12. Response Building

**Usage:**
```jsx
<PipelineProgress isActive={isProcessing} />
```

**Styling:**
- Dark gradient background (`from-gray-900 to-gray-800`)
- Grid layout (2 columns)
- Monospace font
- Border and shadow

---

## 3. CHAT MESSAGE STRUCTURE

### 3.1 Message Object Structure

**From `ScoutTab.jsx`:**

```javascript
{
  id: number,              // Timestamp-based ID
  role: 'user' | 'assistant',
  content: string,         // Markdown text
  mapData?: GeoJSON,       // Optional: Property search results
  artifact?: object,       // Optional: Generated artifact
  timestamp: string        // ISO timestamp
}
```

### 3.2 Message Rendering

**User Messages:**
- Simple text display: `<span>{msg.content}</span>`
- No markdown processing

**Assistant Messages:**
- Markdown rendering via `react-markdown`
- Custom component overrides for styling
- Supports: links, lists, headings, code blocks, bold text

**Property Data Attachment:**
```jsx
{msg.mapData && msg.mapData.features?.length > 0 && (
  <div className="scout-message-properties">
    <MapPin size={16} />
    {formatPropertyCount(msg.mapData)}
  </div>
)}
```

**Artifact Attachment:**
```jsx
{msg.artifact && (
  <div className="scout-message-artifact" onClick={() => setSelectedArtifact(msg.artifact)}>
    <span className="artifact-icon">📄</span>
    <div className="artifact-info">
      <div className="artifact-title">{msg.artifact.title}</div>
      <div className="artifact-subtitle">Click to view</div>
    </div>
  </div>
)}
```

### 3.3 Map Data Dispatch

**Event System:**
```javascript
// Dispatch property results to map
window.dispatchEvent(new CustomEvent('ai-results', {
  detail: { properties: response.mapData.features }
}));

// Dispatch parcel selection
window.dispatchEvent(new CustomEvent('parcel-selected', {
  detail: {
    id: parcelId,
    property: property,
    source: 'chat-card'
  }
}));
```

---

## 4. SUBJECT OVERVIEW TAB STRUCTURE

### 4.1 Tab Organization

**From `SubjectOverviewTab.jsx`:**

**Sub-tabs:**
1. Property Info
2. Zoning
3. Land Use
4. Financials
5. Risks

**Property Info Content:**
- Uses `PropertyInfoCard` component
- Transforms `selectedBundle` into property object structure
- Handles data from multiple sources (`core`, `enrichment`, `raw`)

### 4.2 Property Data Transformation

**Data Sources:**
- `selectedBundle.core` - Core property data
- `selectedBundle.enrichment` - Enrichment data
- `activeProperty` - Active property context
- `activeParcel` - Parcel context

**Property Object Structure:**
```javascript
{
  parcelId: string,
  core: {
    id, address, city, state, zip, apn,
    assetType, assetSubtype
  },
  physical: {
    lotSizeAcres, lotSizeSqft, buildingAreaSqft,
    yearBuilt, units, stories, floodplainFlag
  },
  ownership: {
    ownerName, ownerType, ownerMailingAddress,
    ownerOccupied, ownedSince
  },
  valuationTax: {
    assessedValue, marketValueEstimateLow,
    marketValueEstimateHigh, landValue, annualTaxAmount
  },
  developmentMetrics: {
    zoningCode, maxBuildableSqft, farCurrent
  },
  signals: {
    taxDelinquent, preForeclosure, saleLikelihoodScore
  },
  raw: { /* extended raw data */ }
}
```

---

## 5. UI PATTERNS SUMMARY

### 5.1 Color Schemes

**Dark Theme (Primary):**
- Background: `bg-[#1c1c1c]`, `bg-gray-900`
- Cards: `bg-[#374151]`, `bg-gray-800`
- Borders: `border-gray-600`, `border-[#555555]`
- Text: `text-gray-100`, `text-gray-400`

**Asset Class Colors:**
- Commercial: `bg-red-900/50 text-red-300`
- Land: `bg-green-900/50 text-green-300`
- Residential: `bg-blue-900/50 text-blue-300`
- Mixed: `bg-purple-900/50 text-purple-300`
- Industrial: `bg-orange-900/50 text-orange-300`

**Status Colors:**
- Success: `bg-green-500`, `text-green-400`
- Warning: `bg-yellow-900/50`, `text-yellow-300`
- Error: `bg-red-500`
- Info: `bg-blue-500`, `text-blue-400`

### 5.2 Typography

**Font Sizes:**
- Headers: `text-lg`, `text-xl`
- Body: `text-xs`, `text-sm`
- Small: `text-[10px]`, `text-[11px]`

**Font Weights:**
- Bold: `font-bold`
- Semibold: `font-semibold`
- Medium: `font-medium`

### 5.3 Spacing

**Padding:**
- Cards: `p-3`, `p-4`
- Sections: `px-3 py-2.5`

**Gaps:**
- Between items: `gap-2`, `gap-3`
- Flex gaps: `gap-1.5`

### 5.4 Interactive Elements

**Buttons:**
- Primary: `bg-blue-500 text-white rounded-full`
- Secondary: `bg-purple-500 text-white rounded-full`
- Success: `bg-green-500 text-white rounded-full`
- Hover: `hover:bg-blue-600 transition-colors`

**Badges:**
- Rounded: `rounded-full`
- Pills: `px-2 py-0.5`
- Small: `text-[9px]`, `text-[10px]`

---

## 6. RECOMMENDATIONS FOR CLAUDE CODE SPEC

### 6.1 Property Card Component

**Recommended Structure:**
```jsx
<PropertyCard
  property={property}
  variant="compact" | "detailed" | "map"
  showActions={true}
  onSelect={handler}
  onShowOnMap={handler}
  onViewDetails={handler}
/>
```

**Key Features to Include:**
- ✅ Asset class badge with color coding
- ✅ Motivation score display
- ✅ Address, owner, value, acres
- ✅ Opportunity flags (max 3)
- ✅ Action buttons (Show on Map, View Details, Save to CRM)
- ✅ Loading states for async actions
- ✅ Hover animations (`transition-colors`)

### 6.2 Loading States

**Recommended Patterns:**
```jsx
// Query processing
{isProcessing && (
  <PipelineProgress isActive={true} />
)}

// Property card loading
{isLoading ? (
  <PropertyCardSkeleton />
) : (
  <PropertyCard property={property} />
)}

// Button loading
<button disabled={saving}>
  {saving ? (
    <>
      <Loader2 className="animate-spin" size={12} />
      <span>Saving...</span>
    </>
  ) : (
    <span>Save</span>
  )}
</button>
```

### 6.3 Animation Recommendations

**Use Framer Motion For:**
- Property card entrance animations
- List item animations (stagger)
- Modal/drawer transitions
- Progress bar animations

**Use CSS Transitions For:**
- Hover effects (`transition-colors`)
- Button state changes
- Simple transforms (chevron rotation)

### 6.4 Message Rendering

**Recommended Structure:**
```jsx
<ChatMessage
  role="assistant"
  content={markdownContent}
  mapData={geoJSONFeatures}
  properties={propertyArray}
  artifact={artifactObject}
  isLoading={false}
/>
```

**Property Cards in Messages:**
- Render `PropertyCardsList` when `mapData.features` present
- Show count badge: "X properties found"
- Allow expansion to show all properties
- Link to map view

---

## APPENDIX: COMPONENT FILE LOCATIONS

### Property Cards:
- `src/components/chat/PropertyCard.jsx`
- `src/components/chat/PropertyCardsList.jsx`
- `src/components/property/PropertyInfoCard.jsx`
- `src/components/property/FloatingPropertyCard.jsx`
- `src/components/property/MapPropertyCard.jsx`
- `src/components/property/MapPropertyPopup.jsx`
- `src/components/property/PropertyPopupCard.jsx`
- `src/components/property/PropertyDetailsModal.jsx`

### Loading/Animation:
- `src/components/chat/PipelineProgress.jsx`
- `src/components/layout/tabs/ScoutTab.jsx` (loading states)

### Chat Components:
- `src/components/layout/tabs/ScoutTab.jsx` (main chat)
- `src/components/chat/ChatPanel.jsx`
- `src/components/chat/AIChatPanel.jsx`

### Property Display:
- `src/components/layout/tabs/SubjectOverviewTab.jsx`
- `src/components/layout/PropertyPanel.jsx`

---

**Report Generated:** January 26, 2026  
**Next Steps:** Use this audit to inform Claude Code spec for property cards and query animations
