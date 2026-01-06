// auth/neonAuth.ts - Neon Auth integration
import { createAuthClient } from '@neondatabase/neon-js/auth';

// Get environment variable with proper Railway runtime support
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
  return '';
}

const neonAuthUrl = getEnvVar('VITE_NEON_AUTH_URL');

// Enhanced debugging
console.log('[NeonAuth] Initializing auth client...');
console.log('[NeonAuth] Environment check:', {
  VITE_NEON_AUTH_URL: neonAuthUrl ? `SET (${neonAuthUrl.substring(0, 40)}...)` : 'NOT SET',
  NODE_ENV: getEnvVar('NODE_ENV'),
  VITE_MICROSOFT_CLIENT_ID: getEnvVar('VITE_MICROSOFT_CLIENT_ID') ? 'SET' : 'NOT SET',
  accessMode: typeof process !== 'undefined' && process.env && process.env.VITE_NEON_AUTH_URL ? 'RAILWAY_PROCESS_ENV' : 
              typeof window !== 'undefined' && (window as any).ENV ? 'WINDOW_ENV' : 'BUILD_TIME'
});

if (!neonAuthUrl) {
  console.error('[NeonAuth] CRITICAL: VITE_NEON_AUTH_URL is not set!');
  console.error('[NeonAuth] This will cause auth to fail in production');
  throw new Error('VITE_NEON_AUTH_URL environment variable is required');
}

// Create auth client with the Neon Auth URL
const authClient = createAuthClient(neonAuthUrl);

console.log('[NeonAuth] Auth client created successfully');

export { authClient };

// Helper functions for common auth operations
export async function getCurrentUser() {
  try {
    const result = await authClient.getSession();
    return result.data ? result.data.user : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export async function signInWithEmail(email: string, password: string) {
  try {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result;
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  try {
    const result = await authClient.signUp.email({ email, password, name });
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result;
  } catch (error) {
    console.error('Sign up error:', error);
    throw error;
  }
}

export async function signOutUser() {
  try {
    await authClient.signOut();
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

export async function getSession() {
  try {
    const result = await authClient.getSession();
    return result.data || null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

// Social Authentication Functions
export async function signInWithGoogle() {
  try {
    const result = await authClient.signIn.social({ 
      provider: 'google',
      redirectTo: window.location.origin 
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result;
  } catch (error) {
    console.error('Google sign in error:', error);
    throw error;
  }
}

export async function signInWithMicrosoft() {
  try {
    const result = await authClient.signIn.social({ 
      provider: 'microsoft',
      redirectTo: window.location.origin 
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result;
  } catch (error) {
    console.error('Microsoft sign in error:', error);
    throw error;
  }
}
