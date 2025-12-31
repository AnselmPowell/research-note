# Microsoft Authentication Setup Guide

## Overview

This guide walks you through setting up Microsoft OAuth authentication for ResearchNotes. The implementation uses a popup-based OAuth flow that works entirely in the frontend.

## Prerequisites

- Azure AD account (free with Microsoft account)
- Admin access to your Railway deployment
- Basic understanding of OAuth flow

## Step 1: Create Azure AD App Registration

1. **Go to Azure Portal**:
   - Visit https://portal.azure.com
   - Sign in with your Microsoft account

2. **Navigate to App Registrations**:
   - Search for "App registrations" in the search bar
   - Click on "App registrations"

3. **Create New Registration**:
   - Click "New registration"
   - Fill in the details:
     - **Name**: ResearchNotes OAuth
     - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
     - **Redirect URI**: Web → `https://your-app.railway.app/auth/microsoft/callback.html`

4. **Configure Application**:
   - After creation, note down the **Application (client) ID**
   - Go to "Authentication" section
   - Add additional redirect URIs:
     - `http://localhost:3000/auth/microsoft/callback.html` (for development)
   - Under "Implicit grant and hybrid flows", check:
     - ✅ ID tokens

5. **API Permissions**:
   - Go to "API permissions"
   - Ensure these permissions are granted:
     - Microsoft Graph → User.Read (should be there by default)
     - OpenId permissions → openid, profile, email

## Step 2: Configure Environment Variables

### For Local Development

Add these to your `.env.local` file:

```bash
# Microsoft OAuth Configuration
VITE_MICROSOFT_CLIENT_ID=your_azure_app_client_id_here
VITE_MICROSOFT_TENANT_ID=common
```

### For Railway Production

Add these environment variables in your Railway project dashboard:

1. Go to your Railway project
2. Click on "Variables"
3. Add:
   - `VITE_MICROSOFT_CLIENT_ID`: Your Azure app client ID
   - `VITE_MICROSOFT_TENANT_ID`: Set to `common`

## Step 3: Update Redirect URIs

Make sure your Azure app registration includes these redirect URIs:

**Development:**
- `http://localhost:3000/auth/microsoft/callback.html`

**Production:**
- `https://your-actual-railway-url.railway.app/auth/microsoft/callback.html`

## Step 4: Test the Integration

1. **Start your development server**:
   ```bash
   npm run dev
   ```

2. **Test Microsoft auth**:
   - Open the app
   - Click "Continue with Microsoft"
   - A popup should open with Microsoft login
   - Complete authentication in popup
   - You should be signed into the app

## How It Works

### Technical Flow

1. **User clicks "Continue with Microsoft"**
2. **Popup opens** with Microsoft OAuth URL
3. **User authenticates** with Microsoft in popup
4. **Popup receives callback** with authorization code
5. **Frontend exchanges code** for Microsoft user info
6. **Neon user created** with Microsoft email/name + generated password
7. **User signed into** Neon Auth system with data migration

### Security Features

- ✅ **CSRF Protection**: State parameter prevents cross-site request forgery
- ✅ **Secure Token Exchange**: Uses Microsoft's official OAuth endpoints
- ✅ **Popup Isolation**: OAuth flow happens in isolated popup window
- ✅ **No Client Secrets**: Frontend-only flow with public client ID
- ✅ **HTTPS Required**: Production requires HTTPS (Railway provides this)

## Troubleshooting

### Common Issues

**1. Popup Blocked**
- **Issue**: Browser blocks the OAuth popup
- **Solution**: Allow popups for your domain in browser settings

**2. Redirect URI Mismatch**
- **Issue**: OAuth error about redirect URI
- **Solution**: Ensure exact match between Azure config and your app URL

**3. Client ID Not Set**
- **Issue**: "VITE_MICROSOFT_CLIENT_ID environment variable is required"
- **Solution**: Add the environment variable and restart the app

**4. User Already Exists**
- **Issue**: "This email is already registered"
- **Solution**: User should sign in with password or reset password first

**5. CORS Errors**
- **Issue**: Cross-origin errors in popup
- **Solution**: These are normal for OAuth flows, the auth should still work

### Debug Steps

1. **Check Environment Variables**:
   ```bash
   # Should not be empty
   echo $VITE_MICROSOFT_CLIENT_ID
   ```

2. **Check Browser Console**:
   - Look for Microsoft auth flow logs
   - Check for JavaScript errors

3. **Check Azure AD Logs**:
   - Go to Azure Portal → Azure Active Directory → Sign-in logs
   - Look for your application's authentication attempts

4. **Test Popup Manually**:
   - Try opening the OAuth URL directly
   - Should redirect to Microsoft login

## Support

If you encounter issues:

1. **Check the browser console** for error messages
2. **Verify Azure AD configuration** matches the guide
3. **Test with different browsers** to rule out browser-specific issues
4. **Check Railway logs** for any server-side issues

## Security Notes

- **Client ID is public**: It's safe to include in frontend code
- **No client secret needed**: Frontend-only OAuth flow
- **Users get Neon accounts**: Microsoft auth creates real Neon Auth users
- **Data migration works**: Anonymous data transfers to Microsoft accounts
- **Sign out clears data**: Full reset on sign out

The implementation creates a seamless experience where Microsoft authentication feels identical to the existing Google authentication, with full support for data migration and anonymous user conversion.
