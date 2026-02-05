/**
 * Simplified Environment Configuration (Client-Side Only)
 * Server-side API keys are now handled by the backend
 */

interface AppConfig {
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

function getEnvVar(key: string, fallback: string = ''): string {
  // Only window.ENV (runtime-injected VITE_* variables)
  if (typeof window !== 'undefined' && (window as any).ENV?.[key]) {
    return (window as any).ENV[key];
  }
  return fallback;
}

export function getConfig(): AppConfig {
  const nodeEnv = getEnvVar('NODE_ENV', 'production');

  return {
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
  };
}

export const config = getConfig();
export const { nodeEnv, isDevelopment, isProduction } = config;
