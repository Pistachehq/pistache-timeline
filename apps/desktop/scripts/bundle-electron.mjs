import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const shared = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  external: ['electron'],
};

export const mainOptions = {
  ...shared,
  entryPoints: ['electron/main/index.ts'],
  outfile: 'dist-electron/main/index.cjs',
};

export const preloadOptions = {
  ...shared,
  entryPoints: ['electron/preload/index.ts'],
  outfile: 'dist-electron/preload/index.cjs',
};

export async function bundleElectron() {
  await Promise.all([build(mainOptions), build(preloadOptions)]);
}
