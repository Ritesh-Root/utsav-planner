import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// jsdom 30 has no <dialog> behaviour, so give it the minimum the app relies on.
if (!('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}

// jsdom has no matchMedia; answer "no preference" for every query.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

// Tests must never reach the network. Re-stub before every test: files call
// vi.unstubAllGlobals(), which would otherwise restore the real fetch.
beforeEach(() => {
  vi.stubGlobal('fetch', () => Promise.reject(new Error('Network access is disabled in tests')));
});

// axe-core probes <canvas>; jsdom has none, so answer null instead of logging noise.
HTMLCanvasElement.prototype.getContext = () => null;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
