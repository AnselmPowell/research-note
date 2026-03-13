// contexts/AuthContext.tsx - Authentication context with Neon integration and data migration
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient } from '../auth/neonAuth';
import { dataMigrationService } from '../utils/dataMigrationService';
import { localStorageService } from '../utils/localStorageService';
import { signInWithMicrosoft as customMicrosoftSignIn } from '../auth/microsoftAuth';
import { dbService } from '../database/db';

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

          // Migrate any anonymous localStorage data — this covers the post-Google-redirect
          // case where migration could not run inside signInWithGoogle (redirect-based flow).
          const hasDataToMigrate = dataMigrationService.hasLocalDataToMigrate();
          if (hasDataToMigrate) {
            console.log('[Auth] 🔄 Migrating anonymous data after session restore...');
            try {
              const migrationResult = await dataMigrationService.migrateAnonymousDataToUser(
                result.data.user.id
              );
              if (migrationResult.success) {
                console.log('[Auth] ✅ Post-redirect migration successful:', migrationResult);
                localStorageService.clearPaperResultsAfterMigration();
              } else {
                console.warn('[Auth] ⚠️ Post-redirect migration failed:', migrationResult.error);
              }
            } catch (migrationError) {
              console.error('[Auth] ❌ Migration error on init:', migrationError);
            }
          }
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
      
      const hasDataToMigrate = dataMigrationService.hasLocalDataToMigrate();
      
      const result = await authClient.signIn.email({ email, password });
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Get updated session after successful sign in
      const sessionResult = await authClient.getSession();
      if (sessionResult.data?.user) {
        console.log('[Auth] Sign in successful');
        
        // Check if this was a password reset from Microsoft auth
        const pendingMicrosoftMapping = localStorage.getItem('pending_microsoft_mapping');
        if (pendingMicrosoftMapping) {
          try {
            const { microsoftId, email } = JSON.parse(pendingMicrosoftMapping);
            if (email === sessionResult.data.user.email) {
              await dbService.createMicrosoftMapping(microsoftId, sessionResult.data.user.id, email);
              localStorage.removeItem('pending_microsoft_mapping');
              console.log('[Auth] Microsoft mapping created successfully');
            }
          } catch (error) {
            console.error('[Auth] Failed to create Microsoft mapping:', error);
          }
        }
        
        setUser(sessionResult.data.user);
        
        // ✅ NEW: Migrate localStorage data if exists
        if (hasDataToMigrate) {
          console.log('[Auth] 🔄 Starting data migration...');
          
          try {
            const migrationResult = await dataMigrationService.migrateAnonymousDataToUser(
              sessionResult.data.user.id
            );
            
            if (migrationResult.success) {
              console.log('[Auth] ✅ Data migration successful:', migrationResult);
              // Clear "My Results" localStorage
              localStorageService.clearPaperResultsAfterMigration();
            } else {
              console.warn('[Auth] ⚠️ Data migration failed:', migrationResult.error);
            }
          } catch (migrationError) {
            console.error('[Auth] ❌ Migration error:', migrationError);
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
      const migrationPreview = dataMigrationService.getMigrationPreview();
      
      if (hasDataToMigrate) {
        console.log('[Auth] 📊 Migration preview:', migrationPreview);
      }
      
      const result = await authClient.signUp.email({ email, password, name });
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      // Get session after successful sign up
      const sessionResult = await authClient.getSession();
      if (sessionResult.data?.user) {
        console.log('[Auth] Sign up successful');
        setUser(sessionResult.data.user);
        
        // ✅ NEW: Migrate localStorage data to user account if exists
        if (hasDataToMigrate) {
          console.log('[Auth] 🔄 Starting data migration...');
          
          try {
            const migrationResult = await dataMigrationService.migrateAnonymousDataToUser(
              sessionResult.data.user.id
            );
            
            if (migrationResult.success) {
              console.log('[Auth] ✅ Data migration successful');
              console.log('[Auth] 📊 Migrated:', {
                papers: migrationResult.migratedPapers,
                notes: migrationResult.migratedNotes,
                folders: migrationResult.migratedFolders,
                accumulatedPapers: migrationResult.migratedAccumulatedPapers,
                accumulatedNotes: migrationResult.migratedAccumulatedNotes
              });
              
              // Clear the "My Results" localStorage now that data is in database
              localStorageService.clearPaperResultsAfterMigration();
              
            } else {
              console.warn('[Auth] ⚠️ Data migration failed:', migrationResult.error);
              // Continue anyway - don't fail signup if migration fails
            }
          } catch (migrationError) {
            console.error('[Auth] ❌ Migration error:', migrationError);
            // Log but don't fail signup
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

      // signIn.social triggers a full-page redirect to Google's consent screen.
      // We must NOT call getSession() here — there is no session yet at this point.
      // The session will be read by initAuth on the next page load (post-redirect).
      // Migration of anonymous data is also handled in initAuth for this reason.
      const result = await authClient.signIn.social({ 
        provider: 'google',
        redirectTo: window.location.origin 
      });

      // If an error is returned BEFORE the redirect (e.g. misconfigured provider),
      // surface it to the user and reset loading state.
      if (result.error) {
        throw new Error(result.error.message);
      }

      // If we reach here the redirect is in flight — do nothing further.
      // isLoading will reset naturally when the page reloads after OAuth.
    } catch (err) {
      // Only a true pre-redirect failure ends up here.
      const errorMessage = err instanceof Error ? err.message : 'Google sign in failed';
      console.error('[Auth] Google sign in error:', errorMessage);
      setError(errorMessage);
      setIsLoading(false); // Reset loading on real error only
      throw err;
    }
    // No finally block — we intentionally leave isLoading=true while the
    // browser is navigating to Google. Resetting it here would cause a
    // flicker/error state that the user incorrectly sees as a failure.
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
