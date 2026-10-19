import type { ClientInfo } from './jellyfin/types';
import { getDeviceId } from './storage';

export const clientInfo = (): ClientInfo => ({
  client: 'Thuisbios TV',
  device: 'Samsung TV',
  deviceId: getDeviceId(),
  version: __APP_VERSION__,
});
