/** Boot: renderer, loading screen, world build, title screen, game loop. */
import { Game } from './app/game';
import { params } from './core/params';
import { DEFAULT_SEED } from './config';
import { clock } from './core/clock';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const seed = params.seed ?? DEFAULT_SEED;
const game = new Game(canvas, seed, params.quality ?? 'medium');

async function boot(): Promise<void> {
  for (let i = 0; i < game.world.stepCount; i++) {
    game.world.runStep(i);
    await new Promise((r) => setTimeout(r, 0));
  }
  game.finishInit(params.hour ?? 21.5);
  if (params.shot) game.applyShot(params.shot);
  if (params.hour !== undefined) clock.setHour(params.hour);
  if (params.freeze !== undefined) game.frozenElapsed = params.freeze;
  for (const k of params.off) if (k in game.pipeline.toggles) (game.pipeline.toggles as Record<string, boolean>)[k] = false;
  if (params.cam && params.look) {
    const S = game.world.dock.anchors.shore!;
    game.controller.mode = 'fixed';
    game.controller.position.set(S.x + params.cam[0]!, S.y + params.cam[1]!, S.z + params.cam[2]!);
    game.controller.lookAt(S.clone().set(S.x + params.look[0]!, S.y + params.look[1]!, S.z + params.look[2]!));
    if (params.fov) { game.camera.fov = params.fov; game.camera.updateProjectionMatrix(); }
    if (game.frozenElapsed === null) game.frozenElapsed = 4200;
  }
  addEventListener('resize', () => game.resize());
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    game.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __hotaru: unknown }).__hotaru = { game, ready: true };
}

boot();
