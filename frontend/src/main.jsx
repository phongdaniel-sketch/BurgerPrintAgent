import React from 'react';
import ReactDOM from 'react-dom/client';
import { LanguageProvider } from './i18n';
import App from './App.jsx';
import './styles.css';
import './chat-markdown.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
