# 🚀 Local Development Environment Setup

## Current Status
✅ Backend server running on port 3001 (but without API keys)
✅ Frontend dev server running on port 3002
❌ Environment variables not configured (using placeholders)

## 🔧 Fix the Errors - Step by Step

### Step 1: Get Your Environment Variables from Railway

1. Open Railway Dashboard: https://railway.app/dashboard
2. Select your **research-note** project
3. Click on the **Variables** tab
4. You'll see all your environment variables listed

### Step 2: Update Frontend Environment (`.env`)

Open `.env` in the root directory and replace these values:

```env
# From Railway Variables tab, copy these EXACTLY:
VITE_NEON_AUTH_URL=<copy from Railway>
VITE_NEON_PROJECT_ID=<copy from Railway>
VITE_MS_CLIENT_ID=<copy from Railway>
VITE_MS_TENANT_ID=<copy from Railway>
```

**Critical:** The `VITE_NEON_AUTH_URL` must be a real URL like `https://xxx.neon.tech`
- NOT "REPLACE_WITH_YOUR_*"
- NOT "your-neon-auth-url.neon.tech"

### Step 3: Update Backend Environment (`backend/.env`)

Open `backend/.env` and replace these values:

```env
# From Railway Variables tab, copy these EXACTLY:
GEMINI_API_KEY=<copy from Railway>
DATABASE_URL=<copy from Railway>
GOOGLE_SEARCH_KEY=<copy from Railway>
GOOGLE_SEARCH_CX=<copy from Railway>
OPENAI_API_KEY=<copy from Railway>
```

### Step 4: Restart Both Servers

After updating the `.env` files:

**Terminal 1 - Stop and restart backend:**
```bash
# Stop the current backend (Ctrl+C or kill the process)
cd backend
node server.js
```

**Terminal 2 - Restart frontend:**
```bash
# Stop the current dev server (Ctrl+C)
npm run dev
```

### Step 5: Verify Everything Works

1. **Backend Health Check:**
   ```bash
   curl http://localhost:3001/api/health
   ```
   Should show:
   ```json
   {
     "status": "healthy",
     "services": {
       "gemini": true,    ← Should be true
       "database": true,  ← Should be true
       "openai": true     ← Should be true
     }
   }
   ```

2. **Frontend Console (http://localhost:3002):**
   - ✅ No "VITE_NEON_AUTH_URL is not set" errors
   - ✅ No "Failed to fetch" errors for auth
   - ✅ No 404 errors for `/api/v1/database/init-schema`
   - ✅ Authentication should work

## 🐛 Current Errors Explained

### Error 1: `VITE_NEON_AUTH_URL is not set`
**Cause:** `.env` file has placeholder value "REPLACE_WITH_YOUR_NEON_AUTH_URL"
**Fix:** Replace with actual URL from Railway (Step 2)

### Error 2: `POST http://localhost:3002/api/v1/database/init-schema 404`
**Cause:** Backend is running but APIs return 404 because database URL is not set
**Fix:** Add DATABASE_URL to `backend/.env` (Step 3) and restart backend

### Error 3: `Failed to fetch from https://your-neon-auth-url.neon.tech`
**Cause:** Trying to connect to placeholder URL that doesn't exist
**Fix:** Replace with real Neon Auth URL from Railway (Step 2)

## 📝 Quick Reference

### File Locations
- Frontend env: `.env` (root directory)
- Backend env: `backend/.env`
- Examples: `.env.example` and `backend/.env` (don't edit these)

### Port Configuration
- Frontend: http://localhost:3002
- Backend: http://localhost:3001
- Production: https://your-app.railway.app (port 3000)

### Architecture
```
┌─────────────────────────────────────────┐
│ Localhost Development                   │
├─────────────────────────────────────────┤
│                                         │
│  Frontend (Vite)      Backend (Express)│
│  localhost:3002  -->  localhost:3001   │
│       ↓                    ↓           │
│  Uses .env          Uses backend/.env  │
│  (VITE_* only)      (API keys)         │
│                                         │
└─────────────────────────────────────────┘
```

## ✅ Success Checklist

- [ ] Opened Railway dashboard and found Variables tab
- [ ] Copied all VITE_* variables to `.env`
- [ ] Copied all API keys to `backend/.env`
- [ ] Restarted backend server
- [ ] Restarted frontend dev server
- [ ] Backend health check shows all services: true
- [ ] Frontend loads without console errors
- [ ] Can authenticate with Neon Auth
- [ ] Can search and save papers

## 🆘 Still Having Issues?

If you're still seeing errors after completing all steps:

1. Double-check all values are copied EXACTLY from Railway (no spaces, no quotes)
2. Make sure backend is running on port 3001 (check with `netstat -ano | findstr :3001`)
3. Make sure frontend is running on port 3002
4. Clear browser cache and reload
5. Check backend console for startup warnings
