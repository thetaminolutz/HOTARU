/** URL parameters for testing and screenshots: ?seed=&t=&shot=&ui=&debug=&quality=&freeze= */
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export const params = {
  seed: q.has('seed') ? Number(q.get('seed')) >>> 0 : undefined,
  hour: q.has('t') ? Number(q.get('t')) : undefined,
  shot: q.get('shot') ?? undefined,
  /** 'gallery' opens the UI gallery; '0' hides UI. */
  ui: q.get('ui') ?? undefined,
  debug: q.get('debug') === '1',
  quality: (q.get('quality') ?? undefined) as 'low' | 'medium' | 'high' | undefined,
  /** Freeze time & animation at a fixed elapsed value (for deterministic screenshots). */
  freeze: q.has('freeze') ? Number(q.get('freeze')) : undefined,
  /** Skip title screen and go straight into the scene. */
  play: q.get('play') === '1',
  nosw: q.get('nosw') === '1',
  /** Debug camera relative to the dock shore point: cam=x,y,z&look=x,y,z */
  cam: q.get('cam')?.split(',').map(Number),
  look: q.get('look')?.split(',').map(Number),
  /** Disable render passes: off=reflections,bloom,quantize,... */
  off: (q.get('off') ?? '').split(',').filter(Boolean),
  fov: q.has('fov') ? Number(q.get('fov')) : undefined,
};
