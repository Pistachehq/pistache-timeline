import { BrowserWindow, dialog, type WebPreferences } from 'electron';
import path from 'node:path';
import { APP_NAME, type DesktopDocumentState } from '@timeline/shared';
import { registerIpcHandlers, unregisterIpcHandlers } from '../ipc/register';
import { applySessionSecurity, contentSecurityPolicy } from './security';

const isMac = process.platform === 'darwin';

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.cjs');
}

function rendererIndexPath(): string {
  return path.join(__dirname, '../../dist/index.html');
}

const webPreferences: WebPreferences = {
  preload: preloadPath(),
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  navigateOnDragDrop: false,
  spellcheck: false,
};

export function createMainWindow(devServerUrl: string | undefined): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#121214',
    autoHideMenuBar: true,
    title: APP_NAME,
    webPreferences,
  });

  const csp = contentSecurityPolicy(devServerUrl);
  applySessionSecurity(window.webContents.session, csp);

  let dirty = false;
  registerIpcHandlers(window, (state: DesktopDocumentState) => {
    dirty = state.dirty;
    window.setTitle(state.title);
    window.setDocumentEdited(state.dirty);
  });

  window.on('close', (event) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      buttons: ['Cancel', 'Discard'],
      defaultId: 0,
      cancelId: 0,
      title: 'Unsaved changes',
      message: 'Discard unsaved changes?',
      detail: 'The current project has unsaved changes that will be lost.',
    });
    if (choice === 0) event.preventDefault();
  });

  window.on('closed', () => {
    unregisterIpcHandlers();
  });

  window.once('ready-to-show', () => window.show());

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(rendererIndexPath());
  }

  return window;
}

export { isMac };
