// contexts/AuthContext.tsx - Authentication context with Neon integration and data migration
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient } from '../auth/neonAuth';
import { dataMigrationService } from '../utils/dataMigrationService';
import { signInWithMicrosoft as customMicrosoftSignIn } from '../auth/microsoftAuth';

interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: (resetCallbacks?: (() => void)[]) => Promise<void>;
  clearError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log('[Auth] Initializing authentication...');
        const result = await authClient.getSession();
        
        if (result.data?.session && result.data?.user) {
          console.log('[Auth] User session found:', result.data.user.email);
          setUser(result.data.user);
        } else {
          console.log('[Auth] No active session found');
        }
      } catch (error) {
        console.error('[Auth] Session initialization error:', error);
        setError('Failed to initialize authentication');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[Auth] Signing in user:', email);
      
      // Check if there's localStorage data to migrate
      const hasDataToMigrate = dataMigrationService.hasLocalDataToMigrate();
      
      const result = await authClient.signIn.email({ email, password });
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Get updated session after successful sign in
      const sessionResult = await authClient.getSession();
      if (sessionResult.data?.user) {
        console.log('[Auth] Sign in successful');
        setUser(sessionResult.data.user);
        
        // Offer to migrate localStorage data if exists
        if (hasDataToMigrate) {
          console.log('[Auth] Found local data, migrating to account...');
          const migrationResult = await dataMigrationService.migrateAnonymousDataToUser(sessionResult.data.user.id);
          
          if (migrationResult.success) {
            console.log('[Auth] Data migration successful');
          } else {
            console.warn('[Auth] Data migration failed:', migrationResult.error);
            // Don't fail the signin, just warn
          }
        }
      } else {
        throw new Error('Failed to get user session after sign in');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign in failed';
      console.error('[Auth] Sign in error:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[Auth] Signing up user:', email);
      
      // Check if there's localStorage data to migrate
      const hasDataToMigrate = dataMigrationService.hasLocalDataToMigrate();
      
      const result = await authClient.signUp.email({ email, password, name });
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Get session after successful sign up
      const sessionResult = await authClient.getSession();
      if (sessionResult.data?.user) {
        console.log('[Auth] Sign up successful');
        setUser(sessionResult.data.user);
        
        // Migrate localStorage data to user account if exists
        if (hasDataToMigrate) {
          console.log('[Auth] Migrating anonymous data to new account...');
          const migrationResult = await dataMigrationService.migrateAnonymousDataToUser(sessionResult.data.user.id);
          
          if (migrationResult.success) {
            console.log('[Auth] Data migration successful');
          } else {
            console.warn('[Auth] Data migration failed:', migrationResult.error);
            // Don't fail the signup, just warn
          }
        }
      } else {
        throw new Error('Failed to get user session after sign up');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign up failed';
      console.error('[Auth] Sign up error:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async (resetCallbacks?: (() => void)[]) => {
    setIsLoading(true);
    
    try {
      console.log('[Auth] Signing out user');
      await authClient.signOut();
      setUser(null);
      setError(null);
      
      // Call reset functions to clear all app state
      if (resetCallbacks) {
        console.log('[Auth] Clearing app state...');
        resetCallbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('[Auth] Error during state reset:', error);
          }
        });
      }
      
      console.log('[Auth] Sign out successful');
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
      // Even if sign out fails, clear local state and app state
      setUser(null);
      setError(null);
      
      if (resetCallbacks) {
        resetCallbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('[Auth] Error during emergency state reset:', error);
          }
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[Auth] Signing in with Google...');
      
      // Check if there's localStorage data to migrate
      const hasDataToMigrate = dataMigrationService.hasLocalDataToMigrate();
      
      const result = await authClient.signIn.social({ 
        provider: 'google',
        redirectTo: window.location.origin 
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Get session after successful sign in
      const sessionResult = await authClient.getSession();
      if (sessionResult.data?.user) {
        console.log('[Auth] Google sign in successful');
        setUser(sessionResult.data.user);
        
        // Migrate localStorage data if exists
        if (hasDataToMigrate) {
          console.log('[Auth] Migrating anonymous data...');
          const migrationResult = await dataMigrationService.migrateAnonymousDataToUser(sessionResult.data.user.id);
          
          if (migrationResult.success) {
            console.log('[Auth] Data migration successful');
          } else {
            console.warn('[Auth] Data migration failed:', migrationResult.error);
          }
        }
      } else {
        throw new Error('Failed to get user session after Google sign in');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Google sign in failed';
      console.error('[Auth] Google sign in error:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[Auth] Signing in with Microsoft (Custom OAuth)...');
      
      // Use custom Microsoft authentication
      const result = await customMicrosoftSignIn();
      
      if (!result.success) {
        throw new Error(result.error || 'Microsoft authentication failed');
      }

      console.log('[Auth] Microsoft sign in successful');
      setUser(result.user);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Microsoft sign in failed';
      console.error('[Auth] Microsoft sign in error:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    signIn,
    signUp,
    signOut,
    clearError,
    signInWithGoogle,
    signInWithMicrosoft
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
