import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './shell/App.tsx';
import { runDiagnostics } from './diag.ts';

if (__DIAG__) {
  void runDiagnostics(__DIAG__);
} else {
  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}
