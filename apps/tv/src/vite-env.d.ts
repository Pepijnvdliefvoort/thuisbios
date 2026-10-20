/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_JELLYFIN_URL?: string;
  readonly VITE_REMOTE_URL?: string;
}
