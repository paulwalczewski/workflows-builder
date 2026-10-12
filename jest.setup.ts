import "@testing-library/jest-dom";

// jsdom lacks these browser APIs, which HeroUI (React Aria) uses for layout.
if (typeof window !== "undefined") {
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.getAnimations ??= () => [];
}
