// Lazily loads Leaflet (CSS + JS) from a CDN, exactly once per page, and
// resolves with the global `L`. Multiple maps on the same page share one load.
const LEAFLET_VERSION = '1.9.4';
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

declare global {
  interface Window {
    L?: any;
    __leafletPromise?: Promise<any>;
  }
}

export function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.L) return Promise.resolve(window.L);
  if (window.__leafletPromise) return window.__leafletPromise;

  window.__leafletPromise = new Promise((resolve, reject) => {
    // Stylesheet (idempotent)
    if (!document.querySelector(`link[data-leaflet]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      link.setAttribute('data-leaflet', '');
      document.head.appendChild(link);
    }

    // Script
    const existing = document.querySelector(`script[data-leaflet]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
      if (window.L) resolve(window.L);
      return;
    }
    const script = document.createElement('script');
    script.src = JS_URL;
    script.async = true;
    script.setAttribute('data-leaflet', '');
    script.addEventListener('load', () => resolve(window.L));
    script.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
    document.head.appendChild(script);
  });

  return window.__leafletPromise;
}
