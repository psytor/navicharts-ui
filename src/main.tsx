import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from 'astrogators-shared-ui';
import App from './App';
import './index.css';

// Get API base URL for astrogators-table (authentication)
// Defaults to nginx proxy path for development
const apiBaseURL = import.meta.env.VITE_ASTROGATORS_TABLE_URL || 'http://localhost/astrogators-table';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider apiBaseUrl={apiBaseURL}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
