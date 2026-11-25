/** A small pool of terrain workers with request priorities (nearest first). */
export type Job = { msg: Record<string, unknown> & { id: number }; priority: number; resolve: (data: unknown) => void };

export class WorkerPool {
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private queue: Job[] = [];
  private pending = new Map<number, Job>();
  private nextId = 1;

  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number }>) => {
        this.busy[i] = false;
        const job = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        job?.resolve(e.data);
        this.pump();
      };
      this.workers.push(w);
      this.busy.push(false);
    }
  }

  request<T>(msg: Record<string, unknown>, priority: number): Promise<T> {
    return new Promise<T>((resolve) => {
      const job: Job = { msg: { ...msg, id: this.nextId++ }, priority, resolve: resolve as (d: unknown) => void };
      this.queue.push(job);
      this.pump();
    });
  }

  /** Re-prioritise queued jobs (called when the camera moves). */
  reprioritise(fn: (msg: Record<string, unknown>) => number): void {
    for (const j of this.queue) j.priority = fn(j.msg);
  }

  /** Drop queued jobs that are no longer wanted. */
  cancel(pred: (msg: Record<string, unknown>) => boolean): void {
    this.queue = this.queue.filter((j) => !pred(j.msg));
  }

  get queued(): number { return this.queue.length + this.pending.size; }

  private pump(): void {
    for (let i = 0; i < this.workers.length; i++) {
      if (this.busy[i] || this.queue.length === 0) continue;
      let best = 0;
      for (let k = 1; k < this.queue.length; k++) if (this.queue[k]!.priority < this.queue[best]!.priority) best = k;
      const job = this.queue.splice(best, 1)[0]!;
      this.busy[i] = true;
      this.pending.set(job.msg.id, job);
      this.workers[i]!.postMessage(job.msg);
    }
  }
}
