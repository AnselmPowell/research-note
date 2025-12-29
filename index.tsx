
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UIProvider } from './contexts/UIContext';
import { ResearchProvider } from './contexts/ResearchContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { DatabaseProvider } from './database/DatabaseContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <DatabaseProvider>
      <UIProvider>
        <ResearchProvider>
          <LibraryProvider>
            <App />
          </LibraryProvider>
        </ResearchProvider>
      </UIProvider>
    </DatabaseProvider>
  </React.StrictMode>
);
