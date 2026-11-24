# Decisions

Non-obvious decisions and why. Newest at the bottom.

## Start (planning)

- **Hosting: GitHub Pages from a public repo** (owner's choice). Deploy workflow in M1.
- **Git flow: branch + PR per milestone** (owner's choice); Pages deploys from `main`.
- **iPad performance is measured by an in-game benchmark the owner runs on the iPad**,
  because this container renders with software GL and can't measure real fps.
- **Look beats size:** if 60 fps on Medium isn't reachable, shrink the world or merge
  minor regions before lowering rendering quality (owner's choice). World size is a
  single config constant.
- **No mid-M1 look checkpoint;** one stop at the end of M1 (owner's choice).
- **Default "New Journey" uses one fixed curated seed;** custom seeds are optional
  (owner's choice). Tuning and verification of landmarks and secrets target that seed.
- **Custom `ShaderMaterial`s instead of Three's PBR materials:** banded diffuse, tinted
  shadows, rim and fake subsurface need full control over the lighting model.
- **Palette quantization through a 3D LUT built in a worker:** an OKLab nearest-colour
  search per pixel over 96 colours is too expensive on the iPad GPU; a LUT is one fetch.
- **Point lights via a CPU-built screen-tile light grid:** the internal resolution is
  tiny (~640×360), so tiling on the CPU is cheap and needs no compute shaders.
- **`vite-plugin-pwa` (Workbox `generateSW`) for the service worker:** reliable precache
  manifest of hashed assets; the runtime is bundled, so no network at runtime.
