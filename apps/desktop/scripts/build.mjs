import { build as viteBuild } from 'vite';
import { bundleElectron } from './bundle-electron.mjs';

await viteBuild({ configFile: 'vite.config.ts' });
await bundleElectron();
