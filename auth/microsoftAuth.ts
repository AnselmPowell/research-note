// auth/microsoftAuth.ts - Popup-based Microsoft OAuth for frontend-only auth
import { authClient } from './neonAuth';
import { dataMigrationService } from '../utils/dataMigrationService';

// Runtime environment variable access function (same as neonAuth.ts)
function getEnvVar(key: string): string {
  if (typeof window !== 'undefined' && (window as any).ENV) {
    // Runtime environment (Railway production)
    return (window as any).ENV[key] || '';
  } else {
    // Build-time environment (local development)  
    return (import.meta.env as any)[key] || '';
  }
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
  console.log('[MicrosoftAuth] Creating/signing in Neon user...');

  try {
    // Check if there's localStorage data to migrate
    const hasDataToMigrate = dataMigrationService.hasLocalDataToMigrate();
    
    // Check if this Microsoft user exists in our local storage
    const storageKey = `microsoft_user_${btoa(microsoftUser.email)}`;
    const existingPassword = localStorage.getItem(storageKey);
    
    if (existingPassword) {
      // User has signed in with Microsoft before, use stored password
      console.log('[MicrosoftAuth] Existing Microsoft user, signing in...');
      
      try {
        const signInResult = await authClient.signIn.email({
          email: microsoftUser.email,
          password: existingPassword
        });

        if (signInResult.error) {
          console.error('[MicrosoftAuth] Sign in failed with stored password:', signInResult.error);
          // Password might be invalid, try creating new user
          throw new Error('Stored password invalid');
        }

        // Get the session after successful sign in
        const sessionResult = await authClient.getSession();
        if (!sessionResult.data?.user) {
          throw new Error('Failed to get user session after Microsoft sign in');
        }

        const user = {
          id: sessionResult.data.user.id,
          email: sessionResult.data.user.email,
          name: sessionResult.data.user.name,
          emailVerified: sessionResult.data.user.emailVerified || true,
          image: null,
          createdAt: sessionResult.data.user.createdAt || new Date().toISOString(),
          updatedAt: sessionResult.data.user.updatedAt || new Date().toISOString()
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

        console.log('[MicrosoftAuth] Existing Microsoft user successfully signed in');
        return { user, success: true };

      } catch (signInError) {
        console.log('[MicrosoftAuth] Sign in with stored password failed, clearing stored password');
        localStorage.removeItem(storageKey);
        // Continue to create new user below
      }
    }
    
    // New Microsoft user or stored password failed - create new account
    console.log('[MicrosoftAuth] Creating new Microsoft user...');
    
    // Generate a deterministic password that can be recovered later
    // This solves the "cache cleared" problem
    const password = generateDeterministicPassword(microsoftUser.email, microsoftUser.id);
    
    try {
      const signUpResult = await authClient.signUp.email({
        email: microsoftUser.email,
        password: password,
        name: microsoftUser.name
      });

      if (signUpResult.error) {
        console.log('[MicrosoftAuth] User exists but password unknown (cache cleared?), attempting recovery...');
        
        // User exists but we don't have password - this happens when:
        // 1. User cleared browser cache/localStorage
        // 2. User is on a different device  
        // 3. User previously signed up with email/password
        
        return await handlePasswordRecoveryFlow(microsoftUser, password, hasDataToMigrate);
      }

      // Store the password for future Microsoft sign-ins
      localStorage.setItem(storageKey, password);
      console.log('[MicrosoftAuth] Password stored for future Microsoft sign-ins');

      // Get the session after successful sign up
      const sessionResult = await authClient.getSession();
      if (!sessionResult.data?.user) {
        throw new Error('Failed to get user session after Microsoft sign up');
      }

      const user = {
        id: sessionResult.data.user.id,
        email: sessionResult.data.user.email,
        name: sessionResult.data.user.name,
        emailVerified: sessionResult.data.user.emailVerified || true,
        image: null,
        createdAt: sessionResult.data.user.createdAt || new Date().toISOString(),
        updatedAt: sessionResult.data.user.updatedAt || new Date().toISOString()
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

      console.log('[MicrosoftAuth] New Microsoft user successfully created and signed in');
      return { user, success: true };

    } catch (signUpError) {
      console.error('[MicrosoftAuth] Error in sign up process:', signUpError);
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
        error: signUpError instanceof Error ? signUpError.message : 'Microsoft user creation failed'
      };
    }

  } catch (error) {
    console.error('[MicrosoftAuth] Error creating/signing in Neon user:', error);
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
      error: error instanceof Error ? error.message : 'Microsoft authentication failed'
    };
  }
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

/**
 * Handle password recovery flow for existing Microsoft users
 * This handles cases where localStorage was cleared or user is on new device
 */
async function handlePasswordRecoveryFlow(microsoftUser: MicrosoftUser, newPassword: string, hasDataToMigrate: boolean): Promise<MicrosoftAuthResult> {
  console.log('[MicrosoftAuth] Starting password recovery flow...');
  
  try {
    // Strategy 1: Try to identify if this is a Microsoft user vs email/password user
    // We'll store a marker in the user's name or use a specific pattern
    
    console.log('[MicrosoftAuth] Attempting to determine user type...');
    
    // Strategy A: Try signing in with a deterministic password based on Microsoft ID
    // This creates a "recoverable" password that we can regenerate
    const deterministicPassword = generateDeterministicPassword(microsoftUser.email, microsoftUser.id);
    
    try {
      console.log('[MicrosoftAuth] Attempting sign-in with deterministic password...');
      const signInResult = await authClient.signIn.email({
        email: microsoftUser.email,
        password: deterministicPassword
      });

      if (!signInResult.error) {
        console.log('[MicrosoftAuth] Successfully signed in with deterministic password!');
        
        // Store the password for future use
        const storageKey = `microsoft_user_${btoa(microsoftUser.email)}`;
        localStorage.setItem(storageKey, deterministicPassword);
        
        // Get the session after successful sign in
        const sessionResult = await authClient.getSession();
        if (!sessionResult.data?.user) {
          throw new Error('Failed to get user session after recovery sign in');
        }

        const user = {
          id: sessionResult.data.user.id,
          email: sessionResult.data.user.email,
          name: sessionResult.data.user.name,
          emailVerified: sessionResult.data.user.emailVerified || true,
          image: null,
          createdAt: sessionResult.data.user.createdAt || new Date().toISOString(),
          updatedAt: sessionResult.data.user.updatedAt || new Date().toISOString()
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

        console.log('[MicrosoftAuth] Microsoft user successfully recovered and signed in');
        return { user, success: true };
      }
    } catch (signInError) {
      console.log('[MicrosoftAuth] Deterministic password sign-in failed');
    }
    
    // Strategy B: If deterministic password failed, this might be an email/password user
    // Try password reset to differentiate
    
    try {
      const resetResult = await authClient.resetPassword({ email: microsoftUser.email });
      
      if (!resetResult.error) {
        // Password reset email sent successfully - this is an email/password user
        console.log('[MicrosoftAuth] User is email/password user, sending reset email');
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
          error: 'This email was registered with a password. A password reset email has been sent to your email address. Please check your email and reset your password.'
        };
      }
    } catch (resetError) {
      console.log('[MicrosoftAuth] Password reset not available');
    }
    
    // Strategy C: Last resort - user is Microsoft user but we can't recover
    console.log('[MicrosoftAuth] Cannot recover Microsoft user automatically');
    
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
      error: 'Microsoft account recovery failed. This can happen when browser data is cleared. Please try signing in with email/password or contact support for assistance.'
    };
    
  } catch (error) {
    console.error('[MicrosoftAuth] Error in password recovery flow:', error);
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
      error: 'Account recovery failed. Please contact support.'
    };
  }
}

/**
 * Generate a deterministic password that can be recreated from Microsoft user data
 * This allows password recovery even if localStorage is cleared
 */
function generateDeterministicPassword(email: string, microsoftId: string): string {
  // Create a deterministic password based on Microsoft user data
  // This will always generate the same password for the same Microsoft user
  const baseString = `microsoft_auth_${email}_${microsoftId}_researchnotes_2024`;
  const hash = btoa(baseString).substring(0, 28);
  return `${hash}!Aa1`;
}

// Export the main function
export { signInWithMicrosoftPopup as signInWithMicrosoft };
