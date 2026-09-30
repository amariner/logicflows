// Las pruebas se ejecutan en jsdom, que no implementa window.matchMedia. Los
// componentes de Ionic como ion-menu e ion-split-pane lo consultan.
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
