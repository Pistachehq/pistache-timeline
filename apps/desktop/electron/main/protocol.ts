import { protocol } from 'electron';
import { MEDIA_PROTOCOL } from '@timeline/shared';
import { responseForMediaRequest } from '../ipc/grants';

/** Must run before `app.whenReady()`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: false,
      },
    },
  ]);
}

export function handleMediaProtocol(): void {
  protocol.handle(MEDIA_PROTOCOL, (request) => responseForMediaRequest(request));
}
