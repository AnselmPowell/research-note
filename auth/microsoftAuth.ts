// auth/microsoftAuth.ts - Popup-based Microsoft OAuth for frontend-only auth
import { authClient } from './neonAuth';
import { dataMigrationService } from '../utils/dataMigrationService';
import { dbService } from '../database/db';

// Runtime environment variable access function (consistent with neonAuth.ts)
function getEnvVar(key: string): string {
  // PRIORITY 1: Railway production - check actual process.env at runtime  
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || '';
  }
  
  // PRIORITY 2: Runtime window.ENV (for VITE_ variables)
  if (typeof window !== 'undefined' && (window as any).ENV) {
    return (window as any).ENV[key] || '';
  }
  
  // PRIORITY 3: Development build-time fallback
  return (import.meta.env as any)[key] || '';
}

interface MicrosoftUser {
  id: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
}

interface MicrosoftAuthResult {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  success: boolean;
  error?: string;
}

// Microsoft OAuth configuration with runtime support
const MICROSOFT_CLIENT_ID = getEnvVar('VITE_MICROSOFT_CLIENT_ID');
const MICROSOFT_TENANT_ID = getEnvVar('VITE_MICROSOFT_TENANT_ID') || 'common';

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate Microsoft OAuth URL for popup authentication
 */
async function generateMicrosoftAuthUrl(): Promise<{ authUrl: string; codeVerifier: string }> {
  if (!MICROSOFT_CLIENT_ID) {
    throw new Error('VITE_MICROSOFT_CLIENT_ID environment variable is required');
  }

  const redirectUri = `${window.location.origin}/auth/microsoft/callback.html`;
  const state = btoa(JSON.stringify({ 
    timestamp: Date.now(),
    origin: window.location.origin 
  }));
  
  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state: state,
    prompt: 'select_account',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  const authUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
  
  return { authUrl, codeVerifier };
}

/**
 * Exchange Microsoft authorization code for user information
 */
async function exchangeCodeForUserInfo(code: string, codeVerifier: string): Promise<MicrosoftUser> {
  console.log('[MicrosoftAuth] Exchanging code for user info...');
  
  try {
    // Exchange code for access token using PKCE
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${window.location.origin}/auth/microsoft/callback.html`,
        code_verifier: codeVerifier,
        scope: 'openid profile email User.Read'
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[MicrosoftAuth] Token exchange failed:', errorText);
      throw new Error(`Microsoft token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('[MicrosoftAuth] Token exchange successful');

    // Get user information using access token
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!userResponse.ok) {
      console.error('[MicrosoftAuth] User info fetch failed:', userResponse.status);
      throw new Error(`Failed to get Microsoft user info: ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    console.log('[MicrosoftAuth] User info retrieved:', userData.mail || userData.userPrincipalName);

    return {
      id: userData.id,
      email: userData.mail || userData.userPrincipalName,
      name: userData.displayName || `${userData.givenName || ''} ${userData.surname || ''}`.trim(),
      given_name: userData.givenName,
      family_name: userData.surname
    };

  } catch (error) {
    console.error('[MicrosoftAuth] Error in user info exchange:', error);
    throw error;
  }
}

/**
 * Create or sign in Neon Auth user from Microsoft user data
 */
async function createNeonUserFromMicrosoft(microsoftUser: MicrosoftUser): Promise<MicrosoftAuthResult> {
  console.log('[MicrosoftAuth] Microsoft OAuth successful, checking user mapping...');

  try {
    const hasDataToMigrate = dataMigrationService.hasLocalDataToMigrate();
    
    // Step 1: Check for existing mapping
    console.log('[MicrosoftAuth] Checking for existing Microsoft mapping...');
    const mapping = await dbService.getMicrosoftMapping(microsoftUser.id);
    
    if (mapping) {
      // We know this Microsoft user - use existing Neon user ID
      console.log('[MicrosoftAuth] Found existing mapping, using Neon user:', mapping.neon_user_id);
      const user = {
        id: mapping.neon_user_id,
        email: microsoftUser.email,
        name: microsoftUser.name,
        emailVerified: true,
        image: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      return await handleSuccessfulAuth(user, hasDataToMigrate);
    }
    
    // Step 2: No mapping - this is existing user case or new user
    console.log('[MicrosoftAuth] No mapping found, checking if user exists in Neon...');
    
    try {
      // Try password reset to detect existing user
      await authClient.resetPassword({ email: microsoftUser.email });
      
      // Store mapping info for after password reset
      localStorage.setItem('pending_microsoft_mapping', JSON.stringify({
        microsoftId: microsoftUser.id,
        email: microsoftUser.email
      }));
      
      console.log('[MicrosoftAuth] Existing user detected, password reset email sent');
      
      return {
        user: {
          id: '',
          email: microsoftUser.email,
          name: microsoftUser.name,
          emailVerified: true,
          image: null,
          createdAt: '',
          updatedAt: ''
        },
        success: false,
        error: `Account found! We've sent a password reset email to ${microsoftUser.email}. After you reset your password and sign in once with email/password, Microsoft auth will work seamlessly.`
      };
    } catch (resetError) {
      // User doesn't exist in Neon - create new user
      console.log('[MicrosoftAuth] User does not exist, creating new user...');
      
      const tempPassword = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const signUpResult = await authClient.signUp.email({
        email: microsoftUser.email,
        password: tempPassword,
        name: microsoftUser.name
      });
      
      if (!signUpResult.error) {
        const sessionResult = await authClient.getSession();
        if (sessionResult.data?.user) {
          // Create mapping for new user
          console.log('[MicrosoftAuth] Creating Microsoft mapping for new user...');
          await dbService.createMicrosoftMapping(microsoftUser.id, sessionResult.data.user.id, microsoftUser.email);
          return await handleSuccessfulAuth(sessionResult.data.user, hasDataToMigrate);
        }
      }
      
      throw new Error('Failed to create new user');
    }
    
  } catch (error) {
    console.error('[MicrosoftAuth] Error:', error);
    return {
      user: {
        id: '',
        email: microsoftUser.email,
        name: microsoftUser.name,
        emailVerified: false,
        image: null,
        createdAt: '',
        updatedAt: ''
      },
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed'
    };
  }
}

/**
 * Handle successful authentication and data migration
 */
async function handleSuccessfulAuth(neonUser: any, hasDataToMigrate: boolean): Promise<MicrosoftAuthResult> {
  const user = {
    id: neonUser.id,
    email: neonUser.email,
    name: neonUser.name,
    emailVerified: neonUser.emailVerified || true,
    image: null,
    createdAt: neonUser.createdAt || new Date().toISOString(),
    updatedAt: neonUser.updatedAt || new Date().toISOString()
  };

  // Migrate data if available
  if (hasDataToMigrate) {
    console.log('[MicrosoftAuth] Migrating anonymous data...');
    const migrationResult = await dataMigrationService.migrateAnonymousDataToUser(user.id);
    if (migrationResult.success) {
      console.log('[MicrosoftAuth] Data migration successful');
    } else {
      console.warn('[MicrosoftAuth] Data migration failed:', migrationResult.error);
    }
  }

  console.log('[MicrosoftAuth] Microsoft user successfully authenticated');
  return { user, success: true };
}

/**
 * Handle Microsoft OAuth popup flow
 */
export async function signInWithMicrosoftPopup(): Promise<MicrosoftAuthResult> {
  return new Promise(async (resolve, reject) => {
    console.log('[MicrosoftAuth] Starting Microsoft OAuth popup flow...');

    try {
      const { authUrl, codeVerifier } = await generateMicrosoftAuthUrl();
      console.log('[MicrosoftAuth] Opening popup window...');
      
      // Open popup window
      const popup = window.open(
        authUrl,
        'microsoft-auth',
        'width=600,height=700,scrollbars=yes,resizable=yes,status=yes'
      );

      if (!popup) {
        reject(new Error('Failed to open Microsoft OAuth popup. Please allow popups for this site.'));
        return;
      }

      // Listen for postMessage from popup (backup method)
      const messageListener = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'MICROSOFT_AUTH_SUCCESS' && event.data.code) {
          window.removeEventListener('message', messageListener);
          clearInterval(checkPopup);
          popup.close();
          
          console.log('[MicrosoftAuth] Authorization code received via postMessage');
          exchangeCodeForUserInfo(event.data.code, codeVerifier)
            .then(createNeonUserFromMicrosoft)
            .then(resolve)
            .catch(reject);
        }
      };
      
      window.addEventListener('message', messageListener);

      // Listen for popup completion
      const checkPopup = setInterval(() => {
        try {
          // Check if popup was closed by user
          if (popup.closed) {
            clearInterval(checkPopup);
            reject(new Error('Microsoft authentication was cancelled'));
            return;
          }

          // Check if popup has navigated to our callback URL
          try {
            const popupUrl = popup.location.href;
            if (popupUrl.includes('/auth/microsoft/callback.html')) {
              const url = new URL(popupUrl);
              const code = url.searchParams.get('code');
              const error = url.searchParams.get('error');

              clearInterval(checkPopup);
              popup.close();

              if (error) {
                reject(new Error(`Microsoft OAuth error: ${error}`));
                return;
              }

              if (code) {
                console.log('[MicrosoftAuth] Authorization code received');
                // Process the authorization code
                exchangeCodeForUserInfo(code, codeVerifier)
                  .then(createNeonUserFromMicrosoft)
                  .then(resolve)
                  .catch(reject);
              } else {
                reject(new Error('No authorization code received from Microsoft'));
              }
            }
          } catch (e) {
            // Expected: Cross-origin error when popup is still on Microsoft's domain
            // This is normal and we continue checking
          }
        } catch (error) {
          // Ignore cross-origin policy errors, they're expected
          console.log('[MicrosoftAuth] Cross-origin check (this is normal):', error.message);
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkPopup);
        window.removeEventListener('message', messageListener);
        if (!popup.closed) {
          popup.close();
        }
        reject(new Error('Microsoft authentication timeout'));
      }, 5 * 60 * 1000);

    } catch (error) {
      console.error('[MicrosoftAuth] Error in popup flow:', error);
      reject(error);
    }
  });
}

// Export the main function
export { signInWithMicrosoftPopup as signInWithMicrosoft };
