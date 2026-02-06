# ScoutGPT Backend - Hide Layer Quick Fix

**Date:** February 5, 2026  
**Implementation:** Claude Assistant  
**Task:** Enable "hide layer" functionality via get_gis_layers tool

---

## Summary

Successfully implemented hide layer functionality by adding an `action` parameter to the `get_gis_layers` tool. Users can now both show and hide GIS layers through natural language commands like "hide zoning districts" or "remove flood layer".

---

## Changes Made

### ✅ Fix 1: Updated Tool Definition
**File:** `src/tools/index.js`

Added `action` parameter to `get_gis_layers` tool input schema:

```javascript
action: {
  type: 'string',
  enum: ['show', 'hide'],
  description: 'Whether to show or hide the layer. Default: show',
  default: 'show'
}
```

**Impact:** Claude can now receive hide/show instructions from user requests

### ✅ Fix 2: Updated Tool Handler
**File:** `src/tools/handlers.js`

**Function Signature Update:**
```javascript
// Before
async function getGisLayers({ layer_id, bbox, parcel_id }) {

// After  
async function getGisLayers({ layer_id, bbox, parcel_id, action }) {
```

**Logic Enhancement:**
```javascript
const requestedAction = action || 'show';

return {
  action: requestedAction === 'hide' ? 'hide_layer' : 'show_layer',
  layerId: layer.id,
  displayName: layer.displayName,
  hasData: true,
  style: layer.style,
  message: requestedAction === 'hide' 
    ? `Hiding ${layer.displayName} from the map.`
    : `Showing ${layer.displayName} on the map.`
};
```

**Impact:** Tool handler now returns appropriate action and message based on user intent

### ✅ Fix 3: Updated System Prompt
**File:** `src/routes/chat.js`

Added hide layer instructions to Claude's system prompt:

```
When a user asks to HIDE or REMOVE a layer:
1. Call get_gis_layers with the layer_id AND action: "hide"
2. The frontend will remove the layer from the map
```

**Impact:** Claude now understands hide/remove requests and knows to use action parameter

### ✅ Fix 4: Enhanced Layer Toggle Capture
**File:** `src/routes/chat.js`

**Before:** Generic action mapping
```javascript
const toggle = {
  layerId: result.layerId,
  action: result.action === 'show_layer' ? 'show' : 'hide',
  ...(result.style && { style: result.style })
};
```

**After:** Explicit action handling
```javascript
if (result.action === 'show_layer') {
  layerToggles.push({ 
    layerId: result.layerId, 
    action: 'show', 
    style: result.style 
  });
} else if (result.action === 'hide_layer') {
  layerToggles.push({ 
    layerId: result.layerId, 
    action: 'hide' 
  });
}
```

**Impact:** Cleaner layer toggle capture with explicit show/hide handling

---

## API Response Examples

### Show Layer Request
**User Input:** `"Show me zoning districts"`

**Tool Call:**
```json
{
  "name": "get_gis_layers",
  "input": {
    "layer_id": "zoning_districts",
    "action": "show"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "The zoning districts are now displayed on the map!",
  "layerToggles": [
    {
      "layerId": "zoning_districts",
      "action": "show",
      "style": {
        "fillColor": "#3b82f6",
        "fillOpacity": 0.3,
        "strokeColor": "#1e40af",
        "strokeWidth": 1.5
      }
    }
  ]
}
```

### Hide Layer Request
**User Input:** `"Hide the zoning districts layer"`

**Tool Call:**
```json
{
  "name": "get_gis_layers", 
  "input": {
    "layer_id": "zoning_districts",
    "action": "hide"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "I've hidden the zoning districts layer from the map.",
  "layerToggles": [
    {
      "layerId": "zoning_districts", 
      "action": "hide"
    }
  ]
}
```

---

## Natural Language Commands Supported

### Show Commands
- "Show me zoning districts"
- "Display flood zones" 
- "Turn on opportunity zones"
- "I want to see ZIP boundaries"
- "Add water districts to the map"

### Hide Commands  
- "Hide the zoning districts layer"
- "Remove flood zones from the map"
- "Turn off opportunity zones"
- "Hide ZIP boundaries"
- "Remove the water districts layer"

---

## Technical Implementation Details

### Parameter Flow
1. **User Request** → Claude interprets intent
2. **Claude** → Calls `get_gis_layers` with `action` parameter
3. **Tool Handler** → Returns `show_layer` or `hide_layer` action
4. **Chat Route** → Captures toggle and adds to `layerToggles` array
5. **Frontend** → Receives `layerToggles` and shows/hides layers accordingly

### Error Handling
- **Unknown layer:** Returns available layer list
- **Unavailable layer:** Notifies user of pending import status  
- **Invalid action:** Defaults to "show" if action parameter is missing

### Backward Compatibility
- Existing show layer functionality unchanged
- Default action is "show" when parameter omitted
- All existing API clients continue to work

---

## Testing Commands

### Test Show Layer
```bash
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Show me zoning districts"}]}' \
  | python3 -m json.tool | grep -A5 "layerToggles"
```

**Expected Output:**
```json
"layerToggles": [
  {
    "layerId": "zoning_districts",
    "action": "show", 
    "style": {...}
  }
]
```

### Test Hide Layer
```bash
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hide the zoning districts layer"}]}' \
  | python3 -m json.tool | grep -A5 "layerToggles"
```

**Expected Output:**
```json
"layerToggles": [
  {
    "layerId": "zoning_districts", 
    "action": "hide"
  }
]
```

---

## Files Modified

| File | Purpose | Changes |
|------|---------|---------|
| `src/tools/index.js` | Tool Definition | Added `action` parameter to input schema |
| `src/tools/handlers.js` | Tool Logic | Enhanced handler to process action parameter |
| `src/routes/chat.js` | System Prompt & Toggle Capture | Added hide instructions + enhanced toggle logic |

---

## Benefits

1. **Enhanced UX:** Users can now hide layers they don't need
2. **Natural Language:** Supports intuitive hide/remove commands  
3. **Clean Implementation:** Minimal code changes with maximum impact
4. **Consistent API:** Same tool for both show and hide operations
5. **Frontend Ready:** `layerToggles` provides clear show/hide instructions

---

## Future Enhancements

1. **Toggle Command:** Support "toggle zoning districts" to show/hide automatically
2. **Multi-layer Operations:** "Hide all environmental layers" 
3. **Layer Groups:** "Show all utility layers"
4. **Persistence:** Remember layer visibility across sessions

---

**Implementation Status:** ✅ **COMPLETE**  
**Ready for Testing:** ✅ **Requires server restart**  
**Frontend Integration:** ⏳ **Needs layerToggles handling**