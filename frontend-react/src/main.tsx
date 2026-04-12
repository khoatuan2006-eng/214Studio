// Native Error Catcher (Bypasses React entirely)
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, lineNo, columnNo, error) {
    const errorMsg = `CRASH: ${msg}\nURL: ${url}\nLine: ${lineNo}:${columnNo}\nStack: ${error?.stack}`;
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#440000;color:white;z-index:999999;padding:2rem;font-family:monospace;white-space:pre-wrap;overflow:auto;';
    div.innerText = '🔴 TRÌNH DUYỆT BÁO LỖI (NATIVE CRASH):\n\n' + errorMsg;
    if (document.body) document.body.appendChild(div);
  };
  window.onunhandledrejection = function(event) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#440000;color:white;z-index:999999;padding:2rem;font-family:monospace;white-space:pre-wrap;overflow:auto;';
    div.innerText = '🔴 LỖI PROMISE ẨN (UNHANDLED REJECTION):\n\n' + (event.reason?.stack || event.reason);
    if (document.body) document.body.appendChild(div);
  };

  (window as any).global = window;
  (window as any).process = { env: { NODE_ENV: 'development' } };
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Toaster } from './components/ui/sonner.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
)
