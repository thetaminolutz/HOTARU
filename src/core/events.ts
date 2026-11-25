/** Small typed event bus. */
export type Events = {
  'app:pause': { reason: string };
  'app:resume': void;
  'app:update-ready': void;
  'settings:changed': { key: string };
  'clock:period': { period: string };
  'ui:screen': { screen: string };
  'game:start': { mode: 'continue' | 'new' };
};

type Handler<T> = (payload: T) => void;

export class EventBus<E extends Record<string, unknown>> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();
  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }
  emit<K extends keyof E>(type: K, ...payload: E[K] extends void ? [] : [E[K]]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K]>)(payload[0] as E[K]);
  }
}

export const bus = new EventBus<Events>();
