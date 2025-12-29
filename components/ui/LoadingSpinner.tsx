
import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4">
      <div className="w-12 h-12 border-4 border-scholar-200 dark:border-scholar-900 border-t-scholar-600 dark:border-t-scholar-500 rounded-full animate-spin"></div>
      <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse text-sm">Searching the web with Gemini...</p>
    </div>
  );
};
