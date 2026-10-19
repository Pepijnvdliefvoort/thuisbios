import type { RemoteCommand } from './messages';

export type RemoteHandler = (command: RemoteCommand) => void;

let handlers: RemoteHandler[] = [];

/** Screens listen for phone commands here. Returns an unsubscribe function. */
export function subscribeRemote(handler: RemoteHandler): () => void {
  handlers = handlers.concat([handler]);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}

/** The socket publishes every parsed command here. */
export function emitRemote(command: RemoteCommand): void {
  handlers.forEach((h) => h(command));
}
