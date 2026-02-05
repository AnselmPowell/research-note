# Local Development Setup

## Quick Start

### 1. Environment Variables Setup

Copy the example files and fill in your actual values:

```bash
# Frontend environment variables
cp .env.example .env

# Backend environment variables  
cp backend/.env backend/.env
```

**Required Frontend Variables (`.env`):**
- `VITE_NEON_AUTH_URL` - Your Neon Auth URL (CRITICAL - app won't work without this)
- `VITE_NEON_PROJECT_ID` - Your Neon project ID
- `VITE_MS_CLIENT_ID` - Microsoft OAuth client ID
- `VITE_MS_TENANT_ID` - Microsoft tenant ID

**Required Backend Variables (`backend/.env`):**
- `GEMINI_API_KEY` - Google Gemini API key
- `DATABASE_URL` - Neon database connection string
- `GOOGLE_SEARCH_KEY` - Google Custom Search API key
- `GOOGLE_SEARCH_CX` - Google Custom Search engine ID
- `OPENAI_API_KEY` - OpenAI API key (fallback)

### 2. Install Dependencies

```bash
# Frontend dependencies
npm install

# Backend dependencies
cd backend
npm install
cd ..
```

### 3. Run Development Servers

**Option A: Both services (recommended)**

Terminal 1 - Backend:
```bash
cd backend
node server.js
```

Terminal 2 - Frontend:
```bash
npm run dev
```

Access at: http://localhost:3002

**Option B: Frontend only (backend must be deployed)**
```bash
npm run dev
```

### 4. Verify Setup

**Backend Health Check:**
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-05T...",
  "services": {
    "gemini": true,
    "database": true,
    "openai": true
  }
}
```

**Frontend Console:**
- No "VITE_NEON_AUTH_URL is not set" errors
- No "env-config.js 404" errors
- Authentication should work

## Common Issues

### "VITE_NEON_AUTH_URL is not set"
- **Cause:** Missing `.env` file or empty VITE_NEON_AUTH_URL
- **Fix:** Copy `.env.example` to `.env` and fill in actual values

### "env-config.js 404"
- **Cause:** This file is only generated in production by `inject-env.sh`
- **Fix:** Use `.env` file for local development (Vite automatically loads VITE_* variables)

### Backend API calls fail
- **Cause:** Backend not running on port 3001
- **Fix:** Start backend with `cd backend && node server.js`

### CORS errors
- **Cause:** Frontend and backend on different ports
- **Fix:** Backend already has CORS enabled for localhost:3002

## Architecture

### Local Development:
```
Frontend (Vite)          Backend (Express)
localhost:3002    --->   localhost:3001
   ↓                        ↓
Uses .env              Uses backend/.env
(VITE_* only)          (API keys)
```

### Production (Railway):
```
Nginx (port 3000)
   ↓
   ├─> Static files (/usr/share/nginx/html)
   └─> Backend API  (localhost:3001)
```

## Files Overview

- **`.env`** - Frontend variables (VITE_* only, safe to expose)
- **`backend/.env`** - Backend variables (API keys, NEVER commit)
- **`.env.example`** - Template with placeholder values
- **`inject-env.sh`** - Production runtime variable injection (Docker only)
- **`docker-entrypoint.sh`** - Production orchestration (Docker only)

## Security Notes

- ✅ `.env` files are in `.gitignore` - never commit them
- ✅ Frontend only accesses VITE_* variables (client-safe)
- ✅ Backend keeps all API keys server-side
- ✅ Database operations are user-scoped with userId parameter
- ✅ All sensitive operations proxied through backend

## Testing Checklist

- [ ] Frontend loads at http://localhost:3002
- [ ] No console errors about missing environment variables
- [ ] Authentication works (Neon Auth)
- [ ] Can search arXiv papers
- [ ] Can upload PDFs
- [ ] Can generate research notes
- [ ] Backend health check returns all services true
- [ ] Database operations work (save/load papers and notes)
