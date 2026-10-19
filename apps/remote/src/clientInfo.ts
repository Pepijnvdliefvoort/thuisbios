import { CLIENT_NAME } from './jellyfin/auth';
import type { ClientInfo } from './jellyfin/types';
import { getDeviceId } from './storage';

export const clientInfo = (): ClientInfo => ({
  client: CLIENT_NAME,
  device: 'Phone',
  deviceId: getDeviceId(),
  version: __APP_VERSION__,
});
