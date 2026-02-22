# Project Brief

## Identity

**Name:** Research Note
**Mission:** Automate academic research discovery and extraction
**Status:** Production (v2.0)
**Deployment:** Railway (Frontend + Backend)
**Database:** Neon PostgreSQL
**Target Users:** PhD students, academic researchers, systematic reviewers

## Technical Stack

### Frontend
- **Framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS + Scholar design system
- **State:** Context API (5 domains)
- **PDF:** pdf.js
- **Build:** Vite

### Backend
- **Runtime:** Node.js
- **Framework:** Express
- **Port:** 3001
- **Routes:** `/api/arxiv-proxy`, `/api/gemini`, `/api/database`, `/api/agent`

### AI Services
- **Primary:** Google Gemini (gemini-2.5-flash, gemini-3-flash)
- **Fallback:** OpenAI (gpt-4o-mini)
- **Embeddings:** gemini-embedding-001 ⚠️ (migrated from text-embedding-004)

### Database
- **Provider:** Neon PostgreSQL
- **Tables:** papers, notes, folders, note_assignments
- **Auth:** Neon Auth + OAuth (Google, Microsoft)

## Core Requirements

### 1. Discovery
- Multi-modal search (Web, ArXiv, Upload)
- AI intent modeling for academic queries
- Backend proxy for CORS (ArXiv, external APIs)

### 2. Extraction
- Geometric PDF analysis (2-column layouts)
- Semantic filtering (relevance threshold: 0.48)
- RAG-based extraction with justifications
- Batch processing (8 pages/batch, 3 concurrent)

### 3. Management
- 3-column responsive workspace
- Hierarchical folder organization
- Bidirectional note-to-source linking
- localStorage auto-save + PostgreSQL persistence

### 4. Intelligence
- Context-aware AI assistant
- Tool calling for note access
- Citation generation
- Conversation history

## Architecture Overview

### Data Flow
```
User Query
  ↓
AI Intent Modeling (Gemini Flash)
  ↓
ArXiv API (via backend proxy)
  ↓
Semantic Filtering (vector similarity, threshold: 0.48)
  ↓
PDF Download (asyncPool: 3 concurrent)
  ↓
Text Extraction (geometric sorting)
  ↓
RAG Extraction (batch: 8 pages, concurrency: 3)
  ↓
Streaming Updates (UI real-time)
  ↓
User Saves → Neon PostgreSQL
```

### Context Architecture
```
UIContext           → Layout, theme, modals
ResearchContext     → Pipeline, results, search state
LibraryContext      → PDF loading, download tracking
DatabaseContext     → Persistence, CRUD operations
AuthContext         → Multi-tier auth, data migration
```

## Success Metrics

### Efficiency
- **Target:** 80% reduction in literature review time
- **Baseline:** Manual review of 20 papers = ~4 hours
- **Current:** Research Note pipeline = ~30 minutes

### Accuracy
- **PDF Processing:** >95% success rate
- **Relevance Filtering:** >80% user-reported satisfaction
- **Note Extraction:** >85% relevant to user questions

### Trust
- **Source Attribution:** 100% of notes link to exact PDF page
- **Transparency:** AI provides justification for every extraction
- **Verification:** One-click navigation to original source

## Current Status (v2.0)

### Completed Features
- ✅ Multi-modal search interface
- ✅ 5-stage deep research pipeline
- ✅ Advanced PDF processing
- ✅ Smart 3-column layout
- ✅ Hierarchical organization
- ✅ Authentication + data migration
- ✅ AI assistant with tool calling
- ✅ Backend Express proxy (port 3001)

### Recent Critical Updates
- ⚠️ **Embedding model migration:** text-embedding-004 → gemini-embedding-001 (Feb 6 shutdown)
- ⚠️ **Zero results fix:** Cache clearing + retry logic (commit a90481f)
- ⚠️ **ArXiv CORS:** Backend proxy for API access
- ⚠️ **Structured logging:** Emojis + formatted boxes for debugging

### Known Issues
- 🚨 **Security:** Hardcoded database credentials in `database/db.ts` (needs rotation)
- Minor: Column resize lag on slow devices
- Minor: Large PDF scrolling performance

## Development Roadmap

### v2.1 (Q1 2026)
- [ ] Citation format templates (APA, MLA, Chicago)
- [ ] Advanced search filters (date, author, journal)
- [ ] Performance dashboard
- [ ] Database credential rotation

### v3.0 (Q2 2026)
- [ ] Literature map visualization
- [ ] Team collaboration (shared workspaces)
- [ ] Batch PDF export
- [ ] API for integrations

### v4.0 (Q3 2026)
- [ ] Mobile responsive refinements
- [ ] Browser extension
- [ ] Institutional licensing
- [ ] Advanced analytics

## API Endpoints (Backend Port 3001)

### ArXiv Proxy
```javascript
GET /api/arxiv-proxy?params=search_query=...
// Bypasses CORS for ArXiv API
```

### Gemini Proxy
```javascript
POST /api/gemini/generate
// Proxies Gemini API calls with API key injection
```

### Database
```javascript
GET /api/database/papers
POST /api/database/notes
PUT /api/database/folders/:id
DELETE /api/database/notes/:id
```

### Agent
```javascript
POST /api/agent/upload
// Handles PDF file upload for AI agent
```

## Environment Variables

```env
# Frontend
VITE_GOOGLE_API_KEY=          # Gemini API key
VITE_OPENAI_API_KEY=          # OpenAI fallback
VITE_NEON_DATABASE_URL=       # PostgreSQL connection
VITE_GOOGLE_SEARCH_API_KEY=   # Custom Search API
VITE_GOOGLE_SEARCH_CX=        # Search Engine ID

# Backend
PORT=3001
DATABASE_URL=                  # Neon PostgreSQL
GEMINI_API_KEY=               # Server-side Gemini
```

## Out of Scope

### Will Not Build
- Native mobile applications
- Document editing/writing tools
- Social networking features
- Paper recommendation engine
- Peer review workflows
- Journal submission automation

### May Consider Later
- Mobile apps (Phase 4)
- Browser extension (Phase 3)
- Public API (Phase 3)
- Institutional plans (Phase 2)

## Deployment

### Frontend
- **Platform:** Railway
- **Build:** `npm run build`
- **Start:** `npm run preview`
- **URL:** https://research-note-production.up.railway.app/

### Backend
- **Platform:** Railway
- **Start:** `node server.js`
- **Port:** 3001
- **Health Check:** `/api/health`

### Database
- **Provider:** Neon (serverless PostgreSQL)
- **Connection:** SSL required
- **Backup:** Automatic (Neon managed)

## Key Files

### Frontend
```
src/
├── contexts/ResearchContext.tsx    # Deep research pipeline
├── contexts/LibraryContext.tsx     # PDF management
├── contexts/DatabaseContext.tsx    # PostgreSQL operations
├── services/aiService.ts           # Gemini + OpenAI
├── services/arxivService.ts        # ArXiv search + filter
├── services/pdfService.ts          # PDF parsing + extraction
└── utils/asyncPool.ts              # Concurrency control
```

### Backend
```
backend/
├── server.js                       # Express app
└── routes/
    ├── arxiv.js                   # CORS proxy
    ├── gemini.js                  # AI proxy
    ├── database.js                # CRUD operations
    └── agent.js                   # File upload
```

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| PDF Download | <5s | ~2-4s |
| Note Extraction | <10s | ~8s (20 pages) |
| Embedding Generation | <2s | ~1-2s (cached) |
| Time to First Result | <15s | ~5-10s |
| Cache Hit Rate | >50% | ~60% |

## Code Patterns

### asyncPool (Concurrency Control)
```typescript
await asyncPool(3, pdfs, async (pdf) => {
  return await processPdf(pdf);
});
```

### Streaming Updates
```typescript
await extractNotes(pages, questions, (notes) => {
  setResults(prev => [...prev, ...notes]);
});
```

### Error Recovery
```typescript
if (filtered.length === 0 && papers.length > 0) {
  embeddingCache.clear();
  filtered = await filterRelevantPapers(papers, questions);
}
```

### UPSERT Pattern
```typescript
await supabase.from('papers').upsert({
  uri: url,
  is_explicitly_saved: true
}, { onConflict: 'uri' });
```
