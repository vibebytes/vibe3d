import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { captureToken, setToken } from './lib/rpc';
import { prepareGltfLoader } from './three/gltf';
import './styles/globals.css';

captureToken();
void prepareGltfLoader();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
