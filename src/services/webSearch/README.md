# Web Search Service

Web search service for enriching property data with external information using Brave Search API.

## Setup

1. Get a Brave Search API key from: https://brave.com/search/api/
2. Add to your `.env` file:
   ```
   BRAVE_SEARCH_API_KEY=your_key_here
   ```

## Usage

### Basic Web Search

```javascript
import { webSearch } from './services/webSearch/index.js';

const results = await webSearch('Austin commercial real estate market 2025');
console.log(results);
// {
//   results: [
//     {
//       title: "...",
//       url: "...",
//       description: "...",
//       publishedDate: "..."
//     }
//   ],
//   source: 'brave',
//   query: 'Austin commercial real estate market 2025',
//   count: 5
// }
```

### Search Market Data

```javascript
import { searchMarketData } from './services/webSearch/index.js';

const marketData = await searchMarketData('78702', 'commercial');
console.log(marketData);
// {
//   marketNews: [...],
//   developmentNews: [...],
//   zoningNews: [...],
//   searchedAt: '2026-01-23T...',
//   location: '78702',
//   propertyType: 'commercial'
// }
```

### Enrich Property with Web Data

```javascript
import { enrichPropertyWithWeb } from './services/webSearch/index.js';

const property = {
  address: '100 Main St',
  zip: '78702',
  propertyType: 'commercial'
};

const enriched = await enrichPropertyWithWeb(property);
console.log(enriched.webEnrichment);
```

### Search Property-Specific Info

```javascript
import { searchPropertyInfo } from './services/webSearch/index.js';

const info = await searchPropertyInfo('100 Main St, Austin TX', '123456');
console.log(info.propertySearches);
```

## Options

### Freshness Options
- `'pd'` - Past day
- `'pw'` - Past week (default for general searches)
- `'pm'` - Past month (default for market data)
- `'py'` - Past year (default for property info)

### Count Limits
- Maximum 20 results per query (Brave API limit)
- Default: 5 results

## Integration with Pipeline

To integrate with the 12-step pipeline, add web search enrichment in Step 10 (Formatter) or Step 12 (Response Builder):

```javascript
import { enrichPropertyWithWeb } from '../services/webSearch/index.js';

// In formatter or response builder
const enrichedProperties = await Promise.all(
  properties.map(p => enrichPropertyWithWeb(p))
);
```

## Error Handling

The service gracefully handles errors:
- Missing API key: Returns empty results with `source: 'none'`
- API errors: Returns empty results with `source: 'error'` and error message
- Invalid queries: Returns empty results with error message

## Cost

Brave Search API pricing: $0.005 per query (500 queries = $2.50)

## Alternatives

If you prefer a different search provider:

- **Google Custom Search**: $5 per 1000 queries
- **SerpAPI**: $50 per 5000 queries (wraps Google)

To switch providers, modify the `webSearch()` function in `index.js`.
