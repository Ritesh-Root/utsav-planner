import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

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

// Tests must never reach the network; individual tests stub fetch explicitly.
vi.stubGlobal('fetch', () => Promise.reject(new Error('Network access is disabled in tests')));

afterEach(() => {
  cleanup();
  localStorage.clear();
});
