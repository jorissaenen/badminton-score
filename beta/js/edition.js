// Which edition this copy of the app is. The beta lives next to production (v28, in the site
// root) on the same web address, so everything it stores gets its own name: it must never read
// over or overwrite production's scores, settings or offline cache.
export const EDITION = {
  label: 'β v29',
  storageKey: 'badminton-score-beta-v1',
  // Read once, never written: on first start the beta copies production's settings.
  productionStorageKey: 'badminton-score-v1',
  installDismissKey: 'badminton-score-beta-install-dismissed',
  cachePrefix: 'badminton-score-beta-', // keep in sync with sw.js
};
