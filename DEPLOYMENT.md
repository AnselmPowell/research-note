# Railway Deployment Guide for Research Note

This guide walks you through deploying Research Note to Railway using Docker.

## 🚀 Quick Deploy to Railway

### Prerequisites
- Railway account ([sign up here](https://railway.app))
- Railway CLI installed (optional but recommended)
- API keys ready (especially GEMINI_API_KEY)

### One-Click Deploy

1. **Fork/Clone this repository**
2. **Connect to Railway:**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your `research-note` repository

3. **Configure Environment Variables:**
   Railway will auto-detect the Dockerfile and build configuration. Add these environment variables in Railway dashboard:

   **Required:**
   ```
   GEMINI_API_KEY=your_actual_gemini_api_key
   ```

   **Optional (for full functionality):**
   ```
   GOOGLE_SEARCH_KEY=your_google_search_api_key
   GOOGLE_SEARCH_CX=your_custom_search_engine_id
   OPENAI_API_KEY=your_openai_api_key
   DATABASE_URL=your_neon_database_url
   NODE_ENV=production
   PORT=8080
   ```

4. **Deploy:**
   - Railway will automatically build and deploy your application
   - You'll get a public URL like: `https://your-app.up.railway.app`

---

## 🛠 Manual Deployment Steps

### Step 1: Install Railway CLI (Optional)
```bash
npm install -g @railway/cli
railway login
```

### Step 2: Initialize Railway Project
```bash
# In your project directory
railway init
railway link [your-project-id]
```

### Step 3: Set Environment Variables
```bash
# Required
railway variables set GEMINI_API_KEY=your_actual_gemini_api_key

# Optional
railway variables set GOOGLE_SEARCH_KEY=your_google_search_api_key
railway variables set GOOGLE_SEARCH_CX=your_custom_search_engine_id
railway variables set OPENAI_API_KEY=your_openai_api_key
railway variables set DATABASE_URL=your_neon_database_url
railway variables set NODE_ENV=production
```

### Step 4: Deploy
```bash
railway up
```

---

## 📁 Deployment Files Created

This deployment includes:

- **`Dockerfile`** - Multi-stage Docker build with Nginx
- **`nginx.conf`** - Production Nginx configuration
- **`docker-entrypoint.sh`** - Runtime environment variable injection
- **`railway.json`** - Railway-specific configuration
- **`.dockerignore`** - Optimizes Docker build size

---

## 🔧 Configuration Details

### Build Process
1. **Build Stage**: Uses Node.js 20 Alpine to build the Vite application
2. **Production Stage**: Uses Nginx Alpine to serve the static files
3. **Environment Injection**: Runtime injection of environment variables

### Port Configuration
- **Development**: Port 3000
- **Production**: Port 8080 (Railway auto-maps to public domain)

### Health Checks
- Health endpoint available at `/health`
- Docker health check every 30 seconds

---

## 🚦 Environment Variables Guide

### Required
- `GEMINI_API_KEY` - Your Google Gemini AI API key

### Optional
- `GOOGLE_SEARCH_KEY` - For web PDF search functionality
- `GOOGLE_SEARCH_CX` - Custom search engine ID
- `OPENAI_API_KEY` - Fallback when Gemini is unavailable
- `DATABASE_URL` - Neon database connection string
- `NODE_ENV` - Set to 'production' for production builds
- `PORT` - Port for the application (Railway sets this automatically)

---

## 🐛 Troubleshooting

### Build Issues
- Check Railway build logs for specific errors
- Ensure all environment variables are properly set
- Verify your API keys are valid

### Runtime Issues
- Check the application logs in Railway dashboard
- Test the `/health` endpoint to ensure the app is running
- Verify environment variables are not empty

### Common Fixes
```bash
# Check deployment status
railway status

# View logs
railway logs

# Redeploy
railway up --detach
```

---

## 🔄 Updates and Redeployment

Railway automatically redeploys when you push to your connected Git branch:

```bash
git add .
git commit -m "Update application"
git push origin main
```

Or manually trigger a deployment:
```bash
railway up
```

---

## 💡 Performance Optimizations

The deployment includes:
- Gzip compression for faster loading
- Asset caching with long expiry times
- Multi-stage Docker build for smaller images
- Health checks for automatic recovery
- Proper CORS headers for API calls

---

**🎉 Your Research Note application will be live at your Railway-provided URL!**
