import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html must contain <div id="root">');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
