import { useEffect, useState } from 'preact/hooks';

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Whether the browser says it has a network; follows the online and offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
