// auth/neonAuth.ts - Neon Auth integration
import { createAuthClient } from '@neondatabase/neon-js/auth';

// Debug environment variable
const neonAuthUrl = process.env.VITE_NEON_AUTH_URL || '';
console.log('[NeonAuth] Using auth URL:', neonAuthUrl);
console.log('[NeonAuth] All environment variables:', {
  VITE_NEON_AUTH_URL: process.env.VITE_NEON_AUTH_URL,
  NODE_ENV: process.env.NODE_ENV,
  VITE_MICROSOFT_CLIENT_ID: process.env.VITE_MICROSOFT_CLIENT_ID ? 'SET' : 'NOT SET'
});

if (!neonAuthUrl) {
  console.error('[NeonAuth] VITE_NEON_AUTH_URL is not set!');
  // Don't throw error in production, let's see what's happening
  console.error('[NeonAuth] Cannot initialize auth client without URL');
}

// Create auth client - but handle case where URL might not be available
const authClient = neonAuthUrl ? createAuthClient(neonAuthUrl) : null;

if (!authClient) {
  console.error('[NeonAuth] Failed to create auth client');
}

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
