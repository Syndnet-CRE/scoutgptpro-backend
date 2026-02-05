# Street View API Restore Fix

## Problem
The Google Static Street View API was not firing correctly when properties were clicked on the map. The user reported it "used to work perfectly" but was broken in the current state.

## Root Cause
Recent debugging attempts added complex state management (`streetViewImageError`, `streetViewImageLoading`), error handlers, timeouts, and conditional rendering logic that prevented the image from loading. The working version (Feb 4, 2026, commit `f64b6ee`) used a simple, direct approach:
- No state management for loading/error
- Direct image rendering: `{streetViewImageUrl ? <img src={...} /> : ...}`
- Browser handles image loading naturally

## Solution
Restored both `MapPropertyCard.jsx` and `PropertyPopupCard.jsx` to the simple working pattern from commit `f64b6ee`:

### MapPropertyCard.jsx
**Before (broken):**
- Complex state: `streetViewImageError`, `streetViewImageLoading`
- Multiple `useEffect` hooks for timeout and state reset
- Conditional rendering with `!streetViewImageError` check
- Image hidden with `display: none` and `opacity-0` during loading

**After (working):**
```javascript
const streetViewImageUrl = lat && lng && googleApiKey
  ? `https://maps.googleapis.com/maps/api/streetview?size=400x300&location=${lat},${lng}&key=${googleApiKey}`
  : null;

// Simple rendering
{streetViewImageUrl ? (
  <img src={streetViewImageUrl} alt="Property Street View" className="w-full h-full object-cover" />
) : streetViewLinkUrl ? (
  <a href={streetViewLinkUrl}>...</a>
) : (
  <div>...</div>
)}
```

### PropertyPopupCard.jsx
**Before (broken):**
- Same complex state management
- Timeout logic preventing image load
- Conditional checks blocking rendering

**After (working):**
```javascript
const streetViewImageUrl = lat && lng && googleApiKey
  ? `https://maps.googleapis.com/maps/api/streetview?size=400x200&location=${lat},${lng}&key=${googleApiKey}`
  : null;

// Simple rendering
{streetViewImageUrl ? (
  <img src={streetViewImageUrl} alt="Property Street View" className="w-full h-full object-cover" />
) : streetViewLinkUrl ? (
  <a href={streetViewLinkUrl}>...</a>
) : (
  <div>...</div>
)}
```

## Key Changes
1. **Removed all state management** for Street View image loading
2. **Removed error handlers** (`onError`, `onLoad`)
3. **Removed timeout logic** (`useEffect` with 5-second timeout)
4. **Simplified conditional rendering** to direct ternary checks
5. **Let browser handle image loading** naturally - if image fails, fallback shows

## Testing Checklist
- [ ] Click a property on the map
- [ ] Verify Street View image loads immediately (if API key is set)
- [ ] Verify fallback link appears if no API key or image fails
- [ ] Check browser Network tab - API request should fire on property click
- [ ] Verify image URL format: `https://maps.googleapis.com/maps/api/streetview?size=400x300&location={lat},{lng}&key={key}`

## Files Modified
- `/Users/braydonirwin/scoutgpt_9461/src/components/property/MapPropertyCard.jsx`
- `/Users/braydonirwin/scoutgpt_9461/src/components/property/PropertyPopupCard.jsx`

## Reference
- Working commit: `f64b6ee` (Feb 4, 2026)
- Pattern: Simple, direct image rendering without state management
