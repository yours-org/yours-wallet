/* global chrome */
import { installCwiContentBridge } from './cwi-content';

console.log('🌱 Yours Wallet Loaded');

// inject.js runs as a MAIN-world content script (see manifest.json), so
// window.CWI is bound before any page script executes.
installCwiContentBridge(self, () => window.location.host, chrome.runtime);
