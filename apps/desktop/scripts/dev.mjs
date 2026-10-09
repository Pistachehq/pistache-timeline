import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';
import { mainOptions, preloadOptions } from './bundle-electron.mjs';

const renderer = await createServer({ configFile: 'vite.config.ts' });
await renderer.listen();
const devServerUrl = renderer.resolvedUrls?.local[0];
if (!devServerUrl) throw new Error('Vite did not start a local server.');

const [main, preload] = await Promise.all([context(mainOptions), context(preloadOptions)]);
await Promise.all([main.rebuild(), preload.rebuild()]);
await Promise.all([main.watch(), preload.watch()]);

const electron = spawn(String(electronPath), ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
});

const shutdown = async () => {
  await Promise.all([main.dispose(), preload.dispose(), renderer.close()]);
  if (!electron.killed) electron.kill();
};

electron.on('exit', () => {
  void shutdown().finally(() => process.exit());
});
process.on('SIGINT', () => {
  electron.kill();
});
