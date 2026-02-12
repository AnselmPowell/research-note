# Technical Context - Research Note

## Technology Stack

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Custom Scholar Design System
- **PDF**: PDF.js (with geometric text sorter for 2-column layouts)
- **State**: React Context API (5-layer hierarchy)
- **Storage**: localStorage (anonymous) + Neon Postgres (authenticated)

### Backend (Added Jan 2026)
- **Runtime**: Node.js 20 + Express
- **AI Models**:
  - `gemini-2.0-flash-exp` (text generation)
  - `gemini-embedding-001` (768-dim vectors) ⚠️ **Updated Feb 6** from `text-embedding-004`
  - `gpt-4o-mini` (fallback)
- **Database**: Neon Serverless Postgres
- **Logging**: Winston

### Deployment
- **Platform**: Railway
- **Container**: Docker (multi-stage: frontend → backend → nginx:alpine)
- **Reverse Proxy**: Nginx (port 3000 → static files + `/api/*` → backend:3001)
- **CDN**: Nginx static asset caching (1 year expiry)

## Project Structure

```
research-note/
├── src/
│   ├── contexts/          # React Context providers (Auth, Research, Library, UI, Database)
│   ├── components/        # UI components (layout, pdf, research, library, search)
│   ├── services/          # API clients (apiClient.ts, geminiService.ts, pdfService.ts)
│   ├── utils/             # Utilities (localStorage, metadata cache, migration)
│   ├── database/          # Database wrapper (db.ts)
│   └── auth/              # Auth clients (neonAuth.ts, microsoftAuth.ts)
├── backend/
│   ├── server.js          # Express entry point
│   ├── routes/            # API routes (gemini.js, database.js, agent.js, arxiv.js)
│   ├── services/          # Business logic (geminiService.js, databaseService.js, agentService.js)
│   ├── middleware/        # Error handling
│   └── utils/             # Logger, async pool
├── Dockerfile             # Multi-stage build
├── nginx.conf             # Reverse proxy config
└── docker-entrypoint.sh   # Container startup orchestration
```

## Critical API Endpoints

### Gemini AI (`/api/v1/gemini/*`)
```javascript
POST /enhance-metadata      // Extract title/author from PDF first 4 pages
POST /arxiv-search-terms   // Generate structured ArXiv queries
POST /embedding            // Get single embedding (768-dim)
POST /batch-embeddings     // Batch embed up to 50 texts
POST /filter-papers        // Cosine similarity filtering (threshold: 0.48)
POST /extract-notes        // Extract quotes + justifications from pages
POST /search               // Google Custom Search API
```

### Database (`/api/v1/database/*`)
```javascript
POST /init-schema          // Initialize Postgres tables
POST /save-paper           // Upsert paper metadata
POST /save-note            // Insert note with citations
GET  /library-data         // Fetch all papers + notes for user
DELETE /paper/:uri         // Delete paper (cascades to notes)
POST /create-folder        // Create organizational folder
```

### Agent (`/api/v1/agent/*`)
```javascript
POST /upload-file          // Upload PDF to Gemini File API
POST /send-message         // Chat with research assistant (has access to PDFs + notes)
```

## Environment Variables

### Client-Safe (Injected at Runtime)
```bash
VITE_NEON_AUTH_URL=https://auth.neon.tech
VITE_NEON_PROJECT_ID=<project-id>
VITE_MS_CLIENT_ID=<microsoft-oauth-client-id>
VITE_MS_TENANT_ID=common
```

### Server-Side Only (Never Exposed to Browser)
```bash
GEMINI_API_KEY=<your-gemini-key>
DATABASE_URL=postgresql://<neon-connection-string>
GOOGLE_SEARCH_KEY=<optional>
OPENAI_API_KEY=<optional-fallback>
```

## Technical Constraints

### Performance Limits
- **Gemini Embeddings**: 1,000 requests/minute (cached to reduce usage)
- **Gemini Generation**: 15 requests/minute per model
- **ArXiv API**: 3 queries/second (enforced via concurrency control)
- **PDF Size**: 50MB max upload

### Quotas & Rate Limits
- **Gemini Free Tier**: 1,500 requests/day
- **Neon Postgres**: 10GB storage, unlimited queries
- **localStorage**: 10MB limit (auto-migrates to DB on sign-in)

## Security Model

### API Key Protection
```typescript
// Vite config - Development only
define: {
  ...(mode === 'development' ? {
    'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
  } : {})  // ← Production NEVER includes server keys
}
```

### SQL Injection Prevention
```javascript
// All queries use parameterized templates
await sql`SELECT * FROM papers WHERE uri = ${uri}`;  // ✅ Safe
// await sql`SELECT * FROM papers WHERE uri = '${uri}'`; // ❌ Never used
```

### CORS Strategy
- **Development**: Frontend calls backend via `http://localhost:3001`
- **Production**: Nginx proxies `/api/*` → same-origin, no CORS needed

## Development Workflow

### Local Setup
```bash
# Terminal 1: Backend
cd backend && npm install && node server.js

# Terminal 2: Frontend
npm install && npm run dev

# Access: http://localhost:5173
```

### Production Build
```bash
docker build -t research-note .
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=$GEMINI_API_KEY \
  -e DATABASE_URL=$DATABASE_URL \
  research-note
```

## Type Safety

### Global Types (types.ts)
```typescript
interface DeepResearchNote {
  quote: string;
  justification: string;
  relatedQuestion: string;
  pageNumber: number;
  pdfUri: string;              // ⚠️ Critical for linking to PDF
  relevanceScore: number;      // 0.0-1.0 cosine similarity
  citations: string[];
}

type ResearchPhase =
  | 'idle'
  | 'searching'                // Querying ArXiv
  | 'filtering'                // Relevance scoring
  | 'extracting'               // Extracting notes
  | 'completed'
  | 'failed';
```

## Recent Technical Changes (Feb 2026)

### Embedding Model Migration
- **Before**: `text-embedding-004` (Google shut down Jan 14)
- **After**: `gemini-embedding-001` (768-dim, same API)
- **Impact**: All paper filtering working again

### Backend API Proxy
- **Before**: Frontend called Gemini directly (API keys exposed)
- **After**: Backend proxies all AI calls, frontend uses `apiClient.ts`
- **Security**: Zero API keys in browser bundle

### Cache Management
- **Before**: Broken state saved to localStorage (papers with 0 results)
- **After**: Auto-clear cache when `filteredCandidates.length === 0`
- **UX**: Users can retry searches immediately

## Known Issues
1. **Canvas Rendering**: PDF viewer throws errors on rapid page changes (non-blocking)
2. **Large Result Sets**: 100+ papers can cause UI lag (virtual scrolling planned)
3. **No Rate Limiting**: Backend vulnerable to abuse (Redis + rate-limit-express planned)
