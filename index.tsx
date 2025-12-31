
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { UIProvider } from './contexts/UIContext';
import { ResearchProvider } from './contexts/ResearchContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { DatabaseProvider } from './database/DatabaseContext';

// Note: Styles are now loaded via Tailwind CDN in index.html

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <DatabaseProvider>
        <UIProvider>
          <ResearchProvider>
            <LibraryProvider>
              <App />
            </LibraryProvider>
          </ResearchProvider>
        </UIProvider>
      </DatabaseProvider>
    </AuthProvider>
  </React.StrictMode>
);
