/** iOS needs a user gesture before audio can play: create/resume the AudioContext on first touch. */
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null { return ctx; }

export function installAudioUnlock(): void {
  const unlock = () => {
    try {
      ctx ??= new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state !== 'running') void ctx.resume();
    } catch { /* no audio available */ }
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { passive: true });
}

export function suspendAudio(): void { void ctx?.suspend(); }
