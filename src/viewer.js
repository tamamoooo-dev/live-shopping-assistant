// viewer.js — the Brochure Viewer's public entry point. The implementation
// lives in src/viewer/ (canvas, gestures, hotspots, nav, sheet, state); this
// shim keeps the import path every page already uses:
//
//   import { openBrochureViewer, brochureDateLabel } from './viewer.js';

export { openBrochureViewer, brochureDateLabel } from './viewer/index.js';
