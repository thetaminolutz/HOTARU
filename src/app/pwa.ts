/** Service worker registration with a gentle "new version" toast (never force-reload mid-game). */
import { bus } from '../core/events';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export async function registerPwa(): Promise<void> {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() { bus.emit('app:update-ready'); },
    onOfflineReady() { /* everything precached: the game now runs in airplane mode */ },
  });
}

export function restartToUpdate(): void {
  void applyUpdate?.(true);
}
