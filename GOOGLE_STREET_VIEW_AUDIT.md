# Google Static Street View API Audit
**Date:** February 5, 2026  
**Issue:** Street View images not loading in property popup cards

## Executive Summary

Google Static Street View API images are not loading when property popup cards appear. Multiple issues identified across different property card components.

---

## Components Using Street View

### 1. PropertyPopupCard.jsx ❌ **NO IMAGE LOADING**
**File:** `src/components/property/PropertyPopupCard.jsx`  
**Lines:** 39-144

**Current Implementation:**
- Only creates a **link** to Google Street View
- Does NOT attempt to load an embedded image
- No Street View image displayed in popup

**Code:**
```javascript
const streetViewUrl = lat && lng 
  ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
  : address 
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

// Only renders a link button, no image
{streetViewUrl && (
  <a href={streetViewUrl} target="_blank" rel="noopener noreferrer">
    Street View
  </a>
)}
```

**Issue:** This component doesn't use the Static Street View API at all - it's just a link.

---

### 2. MapPropertyCard.jsx ⚠️ **CONDITIONAL IMAGE LOADING**
**File:** `src/components/property/MapPropertyCard.jsx`  
**Lines:** 11-49

**Current Implementation:**
- Attempts to load Street View image IF API key exists
- Falls back to link if API key missing
- No error handling for failed image loads

**Code:**
```javascript
const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const streetViewImageUrl = lat && lng && googleApiKey
  ? `https://maps.googleapis.com/maps/api/streetview?size=400x300&location=${lat},${lng}&key=${googleApiKey}`
  : null;

{streetViewImageUrl ? (
  <img src={streetViewImageUrl} alt="Property Street View" className="w-full h-full object-cover" />
) : streetViewLinkUrl ? (
  <a href={streetViewLinkUrl}>Open Street View</a>
) : (
  <div>No image</div>
)}
```

**Issues:**
1. No error handling - if image fails to load, shows broken image icon
2. No loading state
3. No fallback if API returns error
4. CORS issues not handled

---

### 3. PropertyDetailsModal.jsx ⚠️ **CONDITIONAL IMAGE LOADING**
**File:** `src/components/property/PropertyDetailsModal.jsx`  
**Lines:** 90-181

**Current Implementation:**
- Similar to MapPropertyCard
- Requires API key check before rendering image
- No error handling

**Code:**
```javascript
const streetViewUrl = lat && lng
  ? `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`
  : null;

{streetViewUrl && import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? (
  <img src={streetViewUrl} alt="Property" className="w-full h-full object-cover" />
) : (
  <div>No image placeholder</div>
)}
```

**Issues:**
1. Double API key check (redundant)
2. No error handling
3. No loading state

---

## Root Causes

### Issue #1: Missing API Key
**Severity:** HIGH

**Problem:**
- `VITE_GOOGLE_MAPS_API_KEY` may not be set in environment variables
- Components check for key but don't show helpful error messages
- No validation or warning when key is missing

**Evidence:**
- `.env.example` shows key is optional
- Components silently fall back to links
- No console warnings

**Fix Needed:**
- Add API key validation
- Show helpful error messages
- Add environment variable check utility

---

### Issue #2: No Error Handling
**Severity:** HIGH

**Problem:**
- Images fail silently if API returns error
- No `onerror` handlers on `<img>` tags
- No fallback UI when image fails to load

**Common Failure Scenarios:**
1. Invalid API key → 403 Forbidden
2. API quota exceeded → 429 Too Many Requests
3. No Street View available → 200 OK but no image data
4. CORS issues → Blocked by browser
5. Network errors → Timeout or connection failure

**Fix Needed:**
- Add `onerror` handlers to all `<img>` tags
- Implement fallback UI (placeholder + link)
- Add error logging for debugging

---

### Issue #3: No Loading State
**Severity:** MEDIUM

**Problem:**
- Images load asynchronously but no loading indicator
- Users see blank space while image loads
- No feedback if image is taking long to load

**Fix Needed:**
- Add loading spinner/placeholder
- Show loading state while image loads
- Timeout after reasonable delay (5-10 seconds)

---

### Issue #4: PropertyPopupCard Doesn't Load Images
**Severity:** HIGH

**Problem:**
- `PropertyPopupCard.jsx` only creates links, never loads images
- This is the main popup card component
- Users expect to see Street View image in popup

**Fix Needed:**
- Add Street View image loading to PropertyPopupCard
- Match implementation from MapPropertyCard
- Add error handling and fallback

---

### Issue #5: API Key Not Available at Runtime
**Severity:** MEDIUM

**Problem:**
- Vite environment variables must be prefixed with `VITE_`
- Key must be set at build time (for production)
- Development vs production environment differences

**Fix Needed:**
- Verify API key is accessible at runtime
- Add runtime API key validation
- Document environment variable setup

---

## Google Street View Static API Requirements

### API Endpoint
```
https://maps.googleapis.com/maps/api/streetview?size=WIDTHxHEIGHT&location=LAT,LNG&key=API_KEY
```

### Required Parameters
- `size`: Image dimensions (e.g., `400x300`, `600x400`)
- `location`: Latitude,longitude (e.g., `30.2672,-97.7431`)
- `key`: Google Maps API key

### Optional Parameters
- `heading`: Camera heading (0-360)
- `pitch`: Camera pitch (-90 to 90)
- `fov`: Field of view (10-120)

### API Response
- **Success:** Returns image (JPEG/PNG)
- **Error:** Returns JSON error object:
  ```json
  {
    "error_message": "The provided API key is invalid.",
    "status": "REQUEST_DENIED"
  }
  ```

### Common Error Statuses
- `REQUEST_DENIED` - Invalid API key or API not enabled
- `ZERO_RESULTS` - No Street View available at location
- `OVER_QUERY_LIMIT` - Quota exceeded
- `INVALID_REQUEST` - Missing required parameters

---

## Testing Checklist

### Step 1: Verify API Key
- [ ] Check `.env` file has `VITE_GOOGLE_MAPS_API_KEY` set
- [ ] Verify key is valid in Google Cloud Console
- [ ] Confirm "Street View Static API" is enabled
- [ ] Check API key restrictions (HTTP referrers, IPs)

### Step 2: Test Image Loading
- [ ] Open property popup card
- [ ] Check Network tab for Street View API request
- [ ] Verify request URL includes API key
- [ ] Check response status code
- [ ] Verify image loads successfully

### Step 3: Test Error Handling
- [ ] Test with invalid API key → Should show fallback
- [ ] Test with no API key → Should show link
- [ ] Test with location that has no Street View → Should handle gracefully
- [ ] Test network failure → Should show error state

### Step 4: Test All Components
- [ ] PropertyPopupCard - Should load image
- [ ] MapPropertyCard - Should load image
- [ ] PropertyDetailsModal - Should load image

---

## Fixes Applied

### Fix #1: Add Error Handling to MapPropertyCard
**File:** `src/components/property/MapPropertyCard.jsx`

**Changes:**
- Add `onerror` handler to `<img>` tag
- Add loading state
- Add error state with fallback link
- Add console logging for debugging

### Fix #2: Add Street View Image to PropertyPopupCard
**File:** `src/components/property/PropertyPopupCard.jsx`

**Changes:**
- Add Street View image loading (like MapPropertyCard)
- Add error handling
- Add fallback to link if image fails
- Add loading placeholder

### Fix #3: Improve PropertyDetailsModal
**File:** `src/components/property/PropertyDetailsModal.jsx`

**Changes:**
- Remove redundant API key check
- Add error handling
- Add loading state
- Improve fallback UI

---

## Debugging Steps

### 1. Check API Key
```bash
# Check if API key is set
echo $VITE_GOOGLE_MAPS_API_KEY

# Or check in browser console
console.log(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
```

### 2. Test API Directly
```bash
# Replace YOUR_API_KEY and coordinates
curl "https://maps.googleapis.com/maps/api/streetview?size=400x300&location=30.2672,-97.7431&key=YOUR_API_KEY" -o test.jpg

# Check if file was created (success) or JSON error (failure)
cat test.jpg | head -20
```

### 3. Check Browser Console
- Open DevTools → Network tab
- Filter by "streetview"
- Click on property popup
- Check request URL, status, response

### 4. Check for CORS Issues
- Look for CORS errors in console
- Google Static API should not have CORS issues
- If CORS errors, check API key restrictions

---

## Expected Behavior After Fix

1. **PropertyPopupCard:**
   - Shows Street View image when API key available
   - Shows loading placeholder while image loads
   - Falls back to link if image fails
   - Shows helpful error message if API key missing

2. **MapPropertyCard:**
   - Shows Street View image with error handling
   - Falls back gracefully on errors
   - Shows loading state

3. **PropertyDetailsModal:**
   - Shows Street View image with error handling
   - Improved fallback UI
   - Better error messages

---

## Files Modified

1. ✅ `src/components/property/PropertyPopupCard.jsx` - Add image loading
2. ✅ `src/components/property/MapPropertyCard.jsx` - Add error handling
3. ✅ `src/components/property/PropertyDetailsModal.jsx` - Improve error handling

---

## Next Steps

1. **Test the fixes** - Verify images load in all components
2. **Set API key** - Ensure `VITE_GOOGLE_MAPS_API_KEY` is set
3. **Enable API** - Enable Street View Static API in Google Cloud Console
4. **Check quotas** - Verify API quota is not exceeded
5. **Monitor errors** - Check console for any remaining issues
