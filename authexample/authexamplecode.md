## Social Auth

// auth/social/googleAuth.js
import config from '../../config'

export function getGoogleAuthUrl() {
  console.log("\n=== [getGoogleAuthUrl] START ===");
  console.log(`[getGoogleAuthUrl] Client ID: ${config.googleClientId ? 'EXISTS' : 'MISSING'}`);
  console.log(`[getGoogleAuthUrl] Redirect URI: ${config.googleRedirectUri}`);
  
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log(`[getGoogleAuthUrl] Generated URL length: ${authUrl.length}`);
  console.log("=== [getGoogleAuthUrl] END ===\n");
  
  return authUrl;
}

export async function getGoogleUser(code) {
  console.log("\n" + "="*60);
  console.log("=== [getGoogleUser] START ===");
  console.log("="*60);
  console.log(`[getGoogleUser] Code received: ${code ? code.substring(0, 15) + '...' : 'NONE'}`);
  console.log('[getGoogleUser] Config check:', {
    clientIdLength: config.googleClientId?.length || 0,
    clientSecretLength: config.googleSecretId?.length || 0,
    redirectUri: config.googleRedirectUri
  });

  try {
    // Exchange code for tokens
    console.log("\n[getGoogleUser] Step 1: Exchanging code for Google tokens...");
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleSecretId,
        redirect_uri: config.googleRedirectUri,
        grant_type: 'authorization_code',
      }),
    });

    console.log(`[getGoogleUser] Token response status: ${tokenResponse.status}`);

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[getGoogleUser] Token exchange FAILED:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorBody
      });
      console.error("="*60 + "\n");
      throw new Error(`Failed to exchange code for tokens: ${tokenResponse.status}`);
    }

    const tokens = await tokenResponse.json();
    console.log("[getGoogleUser] Token exchange SUCCESS");
    console.log(`[getGoogleUser] Access token length: ${tokens.access_token?.length || 0}`);

    // Get user info using access token
    console.log("\n[getGoogleUser] Step 2: Fetching user info from Google...");
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    console.log(`[getGoogleUser] User info response status: ${userResponse.status}`);

    if (!userResponse.ok) {
      console.error(`[getGoogleUser] Failed to get user info: ${userResponse.status}`);
      console.error("="*60 + "\n");
      throw new Error('Failed to get user info');
    }

    const userData = await userResponse.json();
    console.log("[getGoogleUser] User info retrieved SUCCESS");
    console.log(`[getGoogleUser] User email: ${userData.email}`);
    console.log(`[getGoogleUser] User name: ${userData.name}`);

    const result = {
      email: userData.email,
      name: userData.name,
      given_name: userData.given_name,
      family_name: userData.family_name,
      picture: userData.picture
    };
    
    console.log("\n" + "="*60);
    console.log("=== [getGoogleUser] END - SUCCESS ===");
    console.log("="*60 + "\n");
    
    return result;

  } catch (error) {
    console.error("\n" + "="*60);
    console.error("=== [getGoogleUser] ERROR ===");
    console.error('[getGoogleUser] Error:', {
      name: error.name,
      message: error.message
    });
    console.error("="*60 + "\n");
    throw error;
  }
}

// pages/api/auth/google/url.js
import { getGoogleAuthUrl } from '../../../../auth/social/googleAuth';

export default async function handler(req, res) {
  console.log("\n" + "="*60);
  console.log("=== [Google URL Route] START ===");
  console.log("="*60);
  console.log(`[Google URL Route] Method: ${req.method}`);
  
  if (req.method !== 'GET') {
    console.log("[Google URL Route] Invalid method");
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("[Google URL Route] Generating Google auth URL...");
    const url = getGoogleAuthUrl();
    console.log(`[Google URL Route] URL generated - Length: ${url.length}`);
    console.log("[Google URL Route] Redirect URI included in URL");
    console.log("="*60 + "\n");
    return res.status(200).json({ url });
  } catch (error) {
    console.error("\n=== [Google URL Route] ERROR ===");
    console.error('[Google URL Route] Error:', error.message);
    console.error("="*60 + "\n");
    return res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}

// pages/api/auth/google/callback.js
import { getGoogleUser } from '../../../../auth/social/googleAuth';
import { googleLoginRegister } from '../../../../auth/core/backendAuthApi';
import config from '../../../../config';

export default async function handler(req, res) {
  console.log("\n" + "="*70);
  console.log("=== [Google Callback] START ===");
  console.log("="*70);
  console.log(`[Google Callback] Method: ${req.method}`);
  
  if (req.method !== 'GET') {
    console.log("[Google Callback] Invalid method");
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const code = req.query.code;
  console.log(`[Google Callback] Code received: ${code ? code.substring(0, 10) + '...' : 'NONE'}`);
  console.log(`[Google Callback] Request URL: ${req.url}`);
  console.log(`[Google Callback] Redirect URI from config: ${config.googleRedirectUri}`);
  
  if (!code) {
    console.error("[Google Callback] No authorization code provided");
    console.error("="*70 + "\n");
    return res.status(400).json({ error: 'No code provided' });
  }
  
  try {
    console.log("\n[Google Callback] Step 1: Getting Google user data...");
    const googleUser = await getGoogleUser(code);
    console.log(`[Google Callback] Google user received: ${googleUser.email}`);
    console.log(`[Google Callback] Name: ${googleUser.name}`);

    console.log("\n[Google Callback] Step 2: Registering/logging in with backend...");
    const { access_token, refresh_token, user } = await googleLoginRegister(googleUser.email, googleUser.name);
    console.log(`[Google Callback] Backend response received`);
    console.log(`[Google Callback] User logged in: ${user.email}`);
    console.log(`[Google Callback] Access token length: ${access_token?.length || 0}`);
    console.log(`[Google Callback] Refresh token length: ${refresh_token?.length || 0}`);

    // Instead of cookies, pass tokens via query params (base64 encoded for URL safety)
    console.log("\n[Google Callback] Step 3: Preparing redirect with tokens...");
    const tokenData = Buffer.from(JSON.stringify({
      access_token,
      refresh_token,
      user
    })).toString('base64');
    
    const redirectUrl = `${config.redirectUrl}?auth=${encodeURIComponent(tokenData)}`;
    console.log("[Google Callback] Token data encoded and added to redirect URL");
    
    // Redirect to main application with tokens
    console.log(`\n[Google Callback] Step 4: Redirecting to app with auth data`);
    console.log("\n" + "="*70);
    console.log("=== [Google Callback] END - SUCCESS ===");
    console.log("="*70 + "\n");
    
    res.redirect(302, redirectUrl);
    
  } catch (error) {
    console.error("\n" + "="*70);
    console.error("=== [Google Callback] ERROR ===");
    console.error('[Google Callback] Authentication error:', {
      name: error.name,
      message: error.message
    });
    console.error("="*70 + "\n");

    // Redirect to app even on error (will show login modal)
    console.log(`[Google Callback] Redirecting to app after error: ${config.redirectUrl}`);
    return res.redirect(302, config.redirectUrl);
  }
}


// auth/social/microsoftAuth.js
import config from '../../config'
import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';

const msalConfig = { 
    auth: {
        clientId: config.microsoftClientId,
        clientSecret: config.microsoftClientSecret,
        authority: 'https://login.microsoftonline.com/consumers',
    },
};

export const msalInstance = new ConfidentialClientApplication(msalConfig);

export async function getMicrosoftAuthUrl() {
  console.log("Inside Microsoft Auth URL generation");
  const cryptoProvider = new CryptoProvider();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();

  const scopes = ['user.read', 'openid', 'profile', 'email'];
  const redirectUri = config.microsoftRedirectUri;
  console.log("Microsoft redirect URI: ", redirectUri);
  
  if (!redirectUri) {
    throw new Error('Redirect URI is not set in environment variables');
  }

  try {
    const authCodeUrlParameters = {
      scopes: scopes,
      redirectUri: redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    };

    const response = await msalInstance.getAuthCodeUrl(authCodeUrlParameters);
    
    console.log("Microsoft auth URL generated successfully");
    console.log("Code verifier generated:", verifier.substring(0, 10) + "...");
    return { url: response, codeVerifier: verifier };
  } catch (error) {
    console.error("Error generating Microsoft auth URL:", error);
    throw error;
  }
}



// pages/api/auth/microsoft/url.js
import { getMicrosoftAuthUrl } from '../../../../auth/social/microsoftAuth';

export default async function handler(req, res) {
  console.log("\n" + "="*60);
  console.log("=== [Microsoft URL Route] START ===");
  console.log("="*60);
  console.log(`[Microsoft URL Route] Method: ${req.method}`);
  
  if (req.method !== 'GET') {
    console.log("[Microsoft URL Route] Invalid method");
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("[Microsoft URL Route] Generating Microsoft auth URL and PKCE code...");
    const { url, codeVerifier } = await getMicrosoftAuthUrl();
    console.log(`[Microsoft URL Route] URL generated - Length: ${url.length}`);
    console.log(`[Microsoft URL Route] Code verifier generated - Length: ${codeVerifier?.length || 0}`);

    const state = Buffer.from(JSON.stringify({ codeVerifier })).toString('base64');
    const urlWithState = `${url}&state=${state}`;
    console.log(`[Microsoft URL Route] State parameter added to URL`);

    // Set cookie for code verifier - use Lax for development compatibility
    console.log("\n[Microsoft URL Route] Setting code verifier cookie...");
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSettings = isProduction 
      ? 'HttpOnly=true; SameSite=None; Secure; Max-Age=600'
      : 'HttpOnly=true; SameSite=Lax; Max-Age=600';
    
    res.setHeader('Set-Cookie', `codeVerifier=${codeVerifier}; Path=/; ${cookieSettings}`);
    console.log(`[Microsoft URL Route] Cookie set - Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    
    console.log("\n" + "="*60);
    console.log("=== [Microsoft URL Route] END - SUCCESS ===");
    console.log("="*60 + "\n");
    return res.status(200).json({ url: urlWithState, codeVerifier });
  } catch (error) {
    console.error("\n" + "="*60);
    console.error("=== [Microsoft URL Route] ERROR ===");
    console.error("[Microsoft URL Route] Error:", error.message);
    console.error("="*60 + "\n");
    return res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}


// pages/api/auth/microsoft/callback.js
import { msalInstance } from '../../../../auth/social/microsoftAuth';
import { microsoftLoginRegister } from '../../../../auth/core/backendAuthApi';
import config from '../../../../config';

export default async function handler(req, res) {
  console.log("\n" + "="*70);
  console.log("=== [Microsoft Callback] START ===");
  console.log("="*70);
  console.log(`[Microsoft Callback] Method: ${req.method}`);
  
  if (req.method !== 'GET') {
    console.log("[Microsoft Callback] Invalid method");
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;
  console.log(`[Microsoft Callback] Code: ${code ? 'RECEIVED' : 'MISSING'}`);
  console.log(`[Microsoft Callback] State: ${state ? 'RECEIVED' : 'MISSING'}`);

  if (!code) {
    console.error("[Microsoft Callback] No authorization code provided");
    console.error("="*70 + "\n");
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    console.log("\n[Microsoft Callback] Step 1: Retrieving code verifier...");
    let codeVerifier = req.cookies.codeVerifier;
    console.log(`[Microsoft Callback] Code verifier from cookie: ${codeVerifier ? 'FOUND' : 'NOT FOUND'}`);

    // If not found, try to get from state
    if (!codeVerifier && state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        codeVerifier = stateData.codeVerifier;
        console.log(`[Microsoft Callback] Code verifier from state: ${codeVerifier ? 'FOUND' : 'NOT FOUND'}`);
      } catch (error) {
        console.error('[Microsoft Callback] Failed to parse state parameter:', error.message);
      }
    }

    if (!codeVerifier) {
      console.error("[Microsoft Callback] Code verifier not found in cookie or state");
      console.error("="*70 + "\n");
      throw new Error('Code verifier not found');
    }

    console.log("\n[Microsoft Callback] Step 2: Exchanging code for Microsoft tokens...");
    const tokenRequest = {
      code,
      scopes: ["user.read", "openid", "profile", "email"],
      redirectUri: config.microsoftRedirectUri,
      codeVerifier: codeVerifier,
    };
    console.log(`[Microsoft Callback] Redirect URI: ${config.microsoftRedirectUri}`);

    const response = await msalInstance.acquireTokenByCode(tokenRequest);
    console.log("[Microsoft Callback] Microsoft token acquired successfully");
    const { account } = response;

    const email = account.username || account.idTokenClaims.email;
    const name = account.name;
    console.log(`[Microsoft Callback] User email: ${email}`);
    console.log(`[Microsoft Callback] User name: ${name}`);

    console.log("\n[Microsoft Callback] Step 3: Registering/logging in with backend...");
    const { access_token, refresh_token, user } = await microsoftLoginRegister(email, name);
    console.log(`[Microsoft Callback] Backend response received`);
    console.log(`[Microsoft Callback] User logged in: ${user.email}`);
    console.log(`[Microsoft Callback] Access token length: ${access_token?.length || 0}`);
    console.log(`[Microsoft Callback] Refresh token length: ${refresh_token?.length || 0}`);

    // Instead of cookies, pass tokens via query params (base64 encoded for URL safety)
    console.log("\n[Microsoft Callback] Step 4: Preparing redirect with tokens...");
    const tokenData = Buffer.from(JSON.stringify({
      access_token,
      refresh_token,
      user
    })).toString('base64');
    
    const redirectUrl = `${config.redirectUrl}?auth=${encodeURIComponent(tokenData)}`;
    console.log("[Microsoft Callback] Token data encoded and added to redirect URL");

    // Redirect to main application with tokens
    console.log(`\n[Microsoft Callback] Step 5: Redirecting to app with auth data`);
    console.log("\n" + "="*70);
    console.log("=== [Microsoft Callback] END - SUCCESS ===");
    console.log("="*70 + "\n");
    
    res.redirect(302, redirectUrl);

  } catch (error) {
    console.error("\n" + "="*70);
    console.error("=== [Microsoft Callback] ERROR ===");
    console.error('[Microsoft Callback] Authentication error:', error.message);
    console.error("="*70 + "\n");
    
    // Redirect to app even on error (will show login modal)
    console.log(`[Microsoft Callback] Redirecting to app after error: ${config.redirectUrl}`);
    return res.redirect(302, config.redirectUrl);
  }
}













// lib/auth.js
// Enhanced CSRF token management with caching and proper error handling

let csrfTokenCache = null;
let tokenExpiry = 0;
let csrfTokenPromise = null;

/**
 * Get CSRF token with caching and deduplication
 * @returns {Promise<string|null>} CSRF token or null if failed
 */
export async function getCsrfToken() {
  // Check cache validity
  if (csrfTokenCache && Date.now() < tokenExpiry) {
    console.log('🔒 Using cached CSRF token');
    return csrfTokenCache;
  }
  
  // Prevent multiple simultaneous requests
  if (csrfTokenPromise) {
    console.log('🔒 Waiting for existing CSRF token request');
    return csrfTokenPromise;
  }
  
  // Create new token request
  csrfTokenPromise = fetchCsrfToken();
  
  try {
    const token = await csrfTokenPromise;
    csrfTokenCache = token;
    tokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes cache
    console.log('🔒 CSRF token refreshed and cached');
    return token;
  } catch (error) {
    csrfTokenCache = null;
    tokenExpiry = 0;
    console.error('🔒 Failed to get CSRF token:', error);
    return null;
  } finally {
    csrfTokenPromise = null;
  }
}

/**
 * Fetch CSRF token from the backend
 * @returns {Promise<string|null>} CSRF token
 */
async function fetchCsrfToken() {
  console.log('🔒 CSRF TOKEN REQUEST: Fetching new token from backend');
  
  try {
    const response = await fetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'include',  // Essential for CSRF cookies
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('🔒 CSRF TOKEN RESPONSE:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      throw new Error(`CSRF token request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.csrfToken) {
      throw new Error('No CSRF token in response');
    }
    
    console.log('🔒 CSRF token received successfully');
    return data.csrfToken;
    
  } catch (error) {
    console.error('🔒 CSRF token fetch error:', error.message);
    throw error;
  }
}

/**
 * Invalidate cached CSRF token (force refresh on next request)
 */
export function invalidateCsrfToken() {
  console.log('🔒 Invalidating cached CSRF token');
  csrfTokenCache = null;
  tokenExpiry = 0;
}