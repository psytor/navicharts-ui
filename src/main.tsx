import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from 'astrogators-shared-ui';
import App from './App';
import './index.css';

// Get API base URL for astrogators-table (authentication)
// Defaults to nginx proxy path for development
const apiBaseURL = import.meta.env.VITE_ASTROGATORS_TABLE_URL || 'http://localhost/astrogators-table';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/navicharts">
      <AuthProvider apiBaseUrl={apiBaseURL}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
