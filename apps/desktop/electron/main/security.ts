import { app, type Session } from 'electron';
import { MEDIA_PROTOCOL } from '@timeline/shared';

const SPEECH_MODEL_HOSTS = 'https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co https://cdn.jsdelivr.net';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${MEDIA_PROTOCOL}:`,
  `media-src 'self' blob: ${MEDIA_PROTOCOL}:`,
  `connect-src 'self' blob: ${MEDIA_PROTOCOL}: ${SPEECH_MODEL_HOSTS}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
].join('; ');

function developmentCsp(devServerUrl: string): string {
  const host = new URL(devServerUrl).origin;
  const ws = host.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline' ${host} https://cdn.jsdelivr.net`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${MEDIA_PROTOCOL}: ${host}`,
    `media-src 'self' blob: ${MEDIA_PROTOCOL}: ${host}`,
    `connect-src 'self' blob: ${MEDIA_PROTOCOL}: ${host} ${ws} ${SPEECH_MODEL_HOSTS}`,
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function contentSecurityPolicy(devServerUrl: string | undefined): string {
  return devServerUrl ? developmentCsp(devServerUrl) : PRODUCTION_CSP;
}

export function applySessionSecurity(electronSession: Session, csp: string): void {
  electronSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  electronSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  electronSession.setPermissionCheckHandler(() => false);
}

/** Denies unexpected windows, navigations and webview attachment for every WebContents. */
export function applyApplicationSecurity(devServerUrl: string | undefined): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      const current = contents.getURL();
      const allowed = url === current || (devServerUrl !== undefined && url.startsWith(devServerUrl));
      if (!allowed) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });
}
