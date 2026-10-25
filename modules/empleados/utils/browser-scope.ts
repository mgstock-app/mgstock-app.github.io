/** Owns DOM listeners, requests and timers for one React mount. */
export function createBrowserScope(root: HTMLElement) {
  const controller = new AbortController();
  const cleanups = new Set<() => void>();
  let active = true;
  const scopedDocument = new Proxy(document, {
    get(target, key) {
      if (key === "body") return root;
      if (key === "getElementById")
        return (id: string) => root.querySelector(`[id="${id}"]`);
      if (key === "querySelector") return root.querySelector.bind(root);
      if (key === "querySelectorAll") return root.querySelectorAll.bind(root);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  function listen(
    target: EventTarget,
    event: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(event, callback, {
      ...(typeof options === "boolean" ? { capture: options } : options),
      signal: controller.signal,
    });
  }
  function timeout(callback: TimerHandler, delay?: number, ...args: unknown[]) {
    const id = window.setTimeout(() => {
      if (active && typeof callback === "function") callback(...args);
    }, delay);
    cleanups.add(() => window.clearTimeout(id));
    return id;
  }
  function interval(
    callback: TimerHandler,
    delay?: number,
    ...args: unknown[]
  ) {
    const id = window.setInterval(() => {
      if (active && typeof callback === "function") callback(...args);
    }, delay);
    cleanups.add(() => window.clearInterval(id));
    return id;
  }
  class ScopedObserver extends MutationObserver {
    constructor(callback: MutationCallback) {
      super(callback);
      cleanups.add(() => this.disconnect());
    }
  }
  return {
    get active() {
      return active;
    },
    document: scopedDocument,
    window,
    listen,
    setTimeout: timeout,
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: interval,
    clearInterval: window.clearInterval.bind(window),
    MutationObserver: ScopedObserver,
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, signal: controller.signal }),
    onDispose: (cleanup: () => void) => cleanups.add(cleanup),
    dispose() {
      active = false;
      controller.abort();
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
  };
}
export type BrowserScope = ReturnType<typeof createBrowserScope>;
