import { app, BrowserWindow } from 'electron';
import { APP_NAME } from '@timeline/shared';
import { releaseAllGrants } from '../ipc/grants';
import { handleMediaProtocol, registerMediaScheme } from './protocol';
import { applyApplicationSecurity } from './security';
import { createMainWindow, isMac } from './window';

registerMediaScheme();

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

app.setName(APP_NAME);
app.setAppUserModelId('app.timeline.editor');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

applyApplicationSecurity(devServerUrl);

let mainWindow: BrowserWindow | null = null;

void app.whenReady().then(() => {
  handleMediaProtocol();
  mainWindow = createMainWindow(devServerUrl);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(devServerUrl);
    }
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('will-quit', () => {
  releaseAllGrants();
});
