# Active Context - Research Note

## Current Work Focus (February 6, 2026)

### Primary Active Focus: Production Stability & Backend Migration

**Recent Major Accomplishments:**
1. ✅ **Backend API Proxy Architecture** - Migrated all AI/DB operations to Node.js/Express backend (port 3001)
2. ✅ **Embedding Model Migration** - Updated from `text-embedding-004` to `gemini-embedding-001` (Google shutdown on Jan 14)
3. ✅ **Zero Results Bug Fix** - Fixed cache clearing and retry logic when filtering returns 0 papers
4. ✅ **Comprehensive Logging** - Added structured logging for PDF URI tracking and paper filtering

### Latest Session Fixes (Feb 6, 2026)

**Bug: Search Blocked After Zero Results**
- **Issue**: When embedding model failed, search found 122 papers but filtered to 0. User couldn't retry search.
- **Root Cause 1**: `App.tsx` checked `arxivCandidates.length > 0` instead of `filteredCandidates.length`
- **Root Cause 2**: `ResearchContext` saved broken state to localStorage (papers with 0 visible results)
- **Fix**: Check `filteredCandidates.length` for visible results, auto-clear cache when all counts = 0
- **Commit**: `a90481f`

**Bug: Embedding API 404 Errors**
- **Issue**: All paper filtering failed silently with `text-embedding-004` returning 404
- **Root Cause**: Google shut down embedding model on January 14, 2026
- **Fix**: Updated to `gemini-embedding-001` (768-dim → 768-dim, same API)
- **Commit**: `0066128`

## Current Technical State

### Backend Architecture (Node.js + Express)
```javascript
// server.js - Port 3001
app.use('/api/v1/gemini', geminiRoutes);    // AI operations
app.use('/api/v1/database', databaseRoutes); // CRUD operations
app.use('/api/v1/agent', agentRoutes);       // Research assistant
app.use('/api/v1/arxiv', arxivRoutes);       // ArXiv proxy (CORS fix)
```

### Production Deployment (Railway + Docker + Nginx)
- **Multi-stage Docker**: Frontend build → Backend build → Nginx runtime
- **Nginx Proxy**: Port 3000 → Frontend (static) + `/api/*` → Backend (3001)
- **Environment Injection**: Runtime env vars via `inject-env.sh`

### Critical Services Status
- ✅ **Gemini AI**: `gemini-2.0-flash-exp` for generation, `gemini-embedding-001` for embeddings
- ✅ **Database**: Neon Serverless Postgres with user-scoped queries
- ✅ **ArXiv**: Backend proxy eliminates CORS issues
- ⚠️ **OpenAI**: Fallback only (not primary)

## Recent Code Patterns

### Error Recovery Pattern
```typescript
// ResearchContext.tsx - Auto-clear cache on zero results
useEffect(() => {
  if (filteredCandidates.length > 0 || deepResearchResults.length > 0) {
    localStorageService.saveDeepResearchResults({...});
  } else if (arxivCandidates.length === 0 && filteredCandidates.length === 0) {
    console.log('[ResearchContext] Clearing cache - no visible results');
    localStorageService.clearDeepResearchResults();
  }
}, [filteredCandidates, deepResearchResults, arxivCandidates]);
```

### Structured Logging Pattern
```javascript
// backend/routes/gemini.js
console.log('╔════════════════════════════════════════╗');
console.log('║ [ROUTE] /extract-notes - REQUEST START║');
console.log('╚════════════════════════════════════════╝');
console.log('📄 Paper:', paperTitle);
console.log('🔍 First page pdfUri:', relevantPages[0]?.pdfUri);
```

### Batch Processing Pattern
```javascript
// geminiService.js - Extract notes with concurrency control
const BATCH_SIZE = 8;        // Pages per batch
const CONCURRENCY = 3;       // Parallel batches
const results = await asyncPool(CONCURRENCY, batches, processBatch);
```

## Active Challenges

### Performance
- **Large Result Sets**: 100+ papers can slow UI rendering
- **Solution In Progress**: Virtual scrolling for note lists

### User Experience
- **PDF Search Highlighting**: Canvas rendering errors on rapid page navigation
- **Status**: Known issue, non-blocking, deferred to future sprint

## Next Priorities
1. Remove excessive debug logging from production
2. Implement rate limiting on backend API
3. Add Redis cache for embeddings (replace in-memory cache)
4. Monitor Gemini API quota usage

## Key Files Recently Modified
- `App.tsx` - Search retry logic (line 186)
- `contexts/ResearchContext.tsx` - Cache management (line 224)
- `backend/services/geminiService.js` - Embedding model update (line 176, 242)
- `backend/routes/gemini.js` - Structured logging (line 64)
