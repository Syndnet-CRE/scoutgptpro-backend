# Parcel Click Fix - Fill Layer Not Clickable

## Problem
Users could only click on parcel boundaries (outline), not anywhere inside the parcel fill area. This prevented the property card from popping up when clicking inside parcels.

## Root Cause
The parcel fill layer (`parcels`) was being added BEFORE the outline layer (`mts-parcels-outline`). In Mapbox GL JS:
- Layers render bottom-to-top (last layer added = topmost visually)
- Click events go to the topmost layer that has a feature at that point
- Since the outline layer was added after the fill layer, it rendered on top and captured all clicks, blocking clicks to the fill layer

## Solution
1. **Swapped layer creation order** in `MapWorkspace.jsx`:
   - Now adds outline layer FIRST (so it's below)
   - Then adds fill layer SECOND (so it's on top and clickable)

2. **Updated layer ordering function** in `enforceLayerOrder.js`:
   - Ensures fill layer (`parcels`) is always positioned AFTER outline layer (`mts-parcels-outline`)
   - This maintains the correct order: outline (bottom) → fill (top, clickable) → centroids

## Changes Made

### `/Users/braydonirwin/scoutgpt_9461/src/pages/scout-ai-chat/components/MapWorkspace.jsx`
- Lines 1084-1161: Swapped order of layer creation
  - Outline layer now created first
  - Fill layer created second (renders on top)

### `/Users/braydonirwin/scoutgpt_9461/src/utils/enforceLayerOrder.js`
- Lines 141-157: Updated MTS parcels layer ordering logic
  - Explicitly maintains order: outline → fill → centroids
  - Ensures fill layer is always above outline for clickability

## Testing
- [ ] Click anywhere inside a parcel (not just on boundary)
- [ ] Verify property card pops up
- [ ] Verify outline still renders correctly
- [ ] Verify fill layer opacity/colors still work
- [ ] Test at different zoom levels

## Technical Notes
- Mapbox layers render bottom-to-top: last layer in array = topmost visually
- For click events to work on fill areas, the fill layer must be above the outline layer
- Layer order is enforced both during creation and via `enforceLayerOrder()` function
