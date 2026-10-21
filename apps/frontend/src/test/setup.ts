import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

/**
 * Setup global des tests frontend (P7b).
 * - jest-dom : matchers DOM (toBeInTheDocument, toBeDisabled…)
 * - matchMedia stubé (jsdom ne l'implémente pas)
 * - ResizeObserver stubé (utilisé par certains composants)
 */

// jsdom n'implémente pas matchMedia
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as any).ResizeObserver = ResizeObserverStub
}

// ScrollIntoView absent de jsdom
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}
