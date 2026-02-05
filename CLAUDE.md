# CLAUDE.md — Syndnet Corp / ScoutGPT

> **PURPOSE:** This file gives Claude (or any AI coding assistant) full context about this project.
> Paste this at the start of every Claude.ai chat session, or place it in your repo root for Claude Code to read automatically.
>
> **LAST UPDATED:** [UPDATE THIS DATE EVERY TIME YOU EDIT]
> **CURRENT PHASE:** [UPDATE THIS EVERY SESSION — e.g., "Phase 5B - Universal Parcel Clicking"]

---

## What This Project Is

ScoutGPT is an AI-powered commercial real estate intelligence platform built by Syndnet Corp. Users type natural language queries ("show me 2-4 acre parcels in Travis County") and the platform returns property data, renders map pins, and generates analysis — all through a chat interface with an integrated Mapbox map.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React (JavaScript, no TypeScript) | 18.2 |
| Build Tool | Vite | 5.0 |
| Styling | Tailwind CSS | 3.4 |
| Animation | Framer Motion | 10.16 |
| Routing | React Router DOM | 6.0 |
| State Management | React Context API + localStorage | — |
| HTTP Client | Axios | 1.8 |
| Maps | Mapbox GL JS + Mapbox GL Draw | 3.13 |
| Charts | Recharts + D3 | 2.15 / 7.9 |
| Forms | React Hook Form | 7.55 |
| Icons | Lucide React | — |
| Backend Framework | FastAPI (Python 3.11+) + Uvicorn | 0.104 |
| ORM | SQLAlchemy 2.0 (async) + GeoAlchemy2 | — |
| Database | PostgreSQL 15 + PostGIS 3.3 (Neon) | — |
| Schema Management | Prisma (100+ models, ~1689 lines) | — |
| AI | Claude API (Anthropic) | — |
| MCP Servers | FastMCP (Python) | — |
| Frontend Hosting | Netlify (auto-deploy from main) | — |
| Backend Hosting | Render | — |
| MCP Hosting | Render | — |

---

## Repository Locations (Local Mac)

```
~/scoutgpt_9461/              ← Frontend (React/Vite)
~/scoutgptpro-backend/        ← Backend (FastAPI/Express hybrid)
~/scoutgpt-mcps/              ← MCP servers
  ├── property-mcp-python/    ← Property data MCP (deployed)
  └── gis-mcp-python/         ← GIS data MCP (not started)
```

---

## Deployment URLs

| Service | URL | Platform |
|---------|-----|----------|
| Frontend | https://scoutcrm.netlify.app | Netlify |
| Backend | https://scoutgpt-backend.onrender.com | Render |
| Property MCP | https://scoutgpt-property-mcp.onrender.com/mcp/ | Render |

---

## Frontend Structure (`~/scoutgpt_9461`)

```
src/
├── pages/
│   └── scout-ai-chat/
│       ├── index.jsx                    # Main chat page (entry point)
│       └── components/
│           └── MapWorkspace.jsx         # Mapbox map container
├── components/
│   ├── chat/
│   │   ├── ChatPanel.jsx               # Main chat interface
│   │   ├── PropertyCard.jsx            # Individual property card
│   │   └── PropertyCardsList.jsx       # List of property results
│   ├── layout/
│   │   ├── tabs/
│   │   │   └── ScoutTab.jsx            # Chat tab component
│   │   └── ConsolidatedPanel.jsx       # Left panel container
│   ├── property/
│   │   └── PropertyInfoCard.jsx        # Detailed property info
│   └── artifacts/
│       └── ...                         # Artifact renderers
├── hooks/
│   ├── useChatApi.js                   # Chat API integration
│   ├── useChatHistory.js               # Chat session management
│   └── useMapLayerRenderer.js          # GIS layer rendering
├── utils/
│   └── queryClassifier.js              # Intent classification (GIS vs property)
├── services/
│   └── ...                             # API service layer
└── styles/
    └── popup.css                       # Map popup styles
```

---

## Backend Structure (`~/scoutgptpro-backend`)

```
src/
├── routes/
│   ├── chat.js              # Main Claude chat endpoint
│   ├── ai.js                # AI query pipeline (Claude + MCP)
│   ├── parcels.js           # Parcel CRUD operations
│   ├── gis.js               # GIS layer queries
│   ├── boundaries.js        # ZIP boundary choropleth data
│   ├── artifacts.js         # Artifact generation
│   └── ... (30 route files total)
├── tools/
│   ├── index.js             # Claude tool definitions (7 tools)
│   └── handlers.js          # Tool execution handlers
├── services/
│   ├── mcp/
│   │   ├── server-manager.js    # MCP connection manager
│   │   └── tool-router.js       # Routes tools to correct MCP server
│   ├── claude-writeback/        # Session/message persistence
│   ├── artifacts/               # PDF/CSV/XLSX generators
│   ├── enrichment/              # Property analysis orchestrator
│   └── webSearch/               # Brave API integration
├── db/                      # Database pool config
└── server.js                # Express app entry point

prisma/
├── schema.prisma            # 100+ models, ~1689 lines
└── migrations/              # SQL migration files
```

---

## MCP Server (`~/scoutgpt-mcps/property-mcp-python`)

**4 working tools:**
- `get_property(parcel_id)` — Single property lookup
- `search_properties(county, filters)` — Multi-county filtered search
- `get_enrichment(parcel_id)` — Enrichment data for a parcel
- `bulk_properties(parcel_ids)` — Batch lookup (max 1000)

**Endpoint:** `https://scoutgpt-property-mcp.onrender.com/mcp/` (trailing slash required)

**Server entry:** Uses `mcp.streamable_http_app()` with Uvicorn on port 8000

---

## Database

**Host:** Neon PostgreSQL with PostGIS enabled

### Key Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `parcel_features_travis` | 372K+ | Main property features (denormalized) |
| `parcels_travis` | 372K+ | Geometry data (PostGIS) |
| `parcels_travis_enrichment` | varies | Enrichment data |
| `osm_pois_travis` | 50K+ | Pre-loaded OpenStreetMap POIs |
| `zoning_districts` | varies | Zoning boundary polygons |
| `zip_boundaries` | 1,989 | ZIP code polygons for choropleth |
| `opportunities` | varies | Deal pipeline/CRM data |

### Critical Database Rule
**All database column values are lowercase.** Claude API outputs mixed case (e.g., "Travis" vs "travis"). **Always normalize to lowercase** before querying:
```sql
-- WRONG: WHERE county = 'Travis'
-- RIGHT: WHERE LOWER(county) = LOWER('Travis')
-- OR:    WHERE county = 'travis'
```

---

## Data Flow

```
User types query in ChatPanel
       ↓
Frontend sends POST to /api/ai/query (backend)
       ↓
Backend classifies intent (GIS vs Property vs Comps vs Zoning)
       ↓
Backend calls Claude API with tool definitions
       ↓
Claude decides which tools to call
       ↓
Tool router sends to MCP server OR direct DB query
       ↓
Results return to Claude for natural language response
       ↓
Backend sends response + property data to frontend
       ↓
ChatPanel renders text + PropertyCards
MapWorkspace renders pins on Mapbox map
```

---

## Known Issues & Constraints

1. **Query performance:** ~16 seconds for complex queries (needs optimization)
2. **Case sensitivity:** Claude outputs mixed case, DB is lowercase — always normalize
3. **MCP trailing slash:** Property MCP URL must end with `/mcp/` (not `/mcp`)
4. **Render cold starts:** Free tier backend/MCP spin down after inactivity, first request takes 30-60s
5. **No authentication yet:** No user auth or session management in production
6. **GIS MCP not built:** Zoning, flood, spatial queries still handled by direct DB queries

---

## AI Modes

| Mode | Purpose | Status |
|------|---------|--------|
| Scout | General property search & analysis | ✅ Working |
| Zoning-GIS | Zoning lookups, GIS layer queries | ✅ Partial |
| Comps | Comparable sales analysis | 🔲 Planned |
| Site Analysis | Multi-factor site evaluation | 🔲 Planned |

---

## GIS Layers Available

Zoning Districts, FEMA Flood Zones, Sewer Mains, Sewer Manholes, Water Mains, Wetland Types, Building Permits, Parcel Boundaries, Fire Hydrants, Water Meters, Gas Mains

Triggered by chat queries like "show zoning", "show flood", etc. Mapped in `queryClassifier.js`.

---

## Conventions & Rules

1. **Commits:** Descriptive messages, e.g., `feat: add polygon query endpoint`, `fix: normalize county case`
2. **Frontend deploy:** Push to `main` → Netlify auto-deploys
3. **Backend deploy:** Push to `main` → Render auto-deploys
4. **MCP deploy:** Push to `main` on separate repo → Render auto-deploys
5. **Error handling:** All API responses follow `{ success: bool, data: {}, error: string }`
6. **No TypeScript:** Entire frontend is JavaScript
7. **Cursor for execution:** Claude provides prompts → Cursor executes → report back results

---

## Environment Variables

### Backend (Render)
```
DATABASE_URL=postgresql://...@neon.tech/...
ANTHROPIC_API_KEY=sk-ant-...
PROPERTY_MCP_URL=https://scoutgpt-property-mcp.onrender.com/mcp/
BRAVE_API_KEY=...
MAPBOX_TOKEN=...
```

### Frontend (Netlify)
```
VITE_API_URL=https://scoutgpt-backend.onrender.com
VITE_MAPBOX_TOKEN=...
```

### Property MCP (Render)
```
DATABASE_URL=postgresql://...@neon.tech/...
```

---

## IMPORTANT RULES FOR AI ASSISTANTS

1. **Change ONLY what is asked.** Do not refactor, rename, or reorganize anything unless explicitly requested.
2. **One file at a time.** Show complete file contents with changes clearly marked.
3. **Always normalize case** when building database queries. Never pass mixed-case values.
4. **Preserve existing error handling.** Do not remove try/catch blocks or error responses.
5. **Do not add TypeScript.** This project is JavaScript only.
6. **Do not change the styling framework.** This project uses Tailwind CSS.
7. **Test queries to suggest:** After any backend change, provide 2-3 test queries to verify.
8. **Trailing slash on MCP URL.** Always use `/mcp/` not `/mcp`.
