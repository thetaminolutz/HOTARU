# HOTARU

A quiet, fully 3D, first-person Japanese-inspired exploration game rendered as a
living pixel-art painting. Runs offline on iPad as a PWA.

- Design & tech spec: [`SPEC.md`](SPEC.md)
- Plan, tech choices & risks: [`PLAN.md`](PLAN.md)
- Decision log: [`DECISIONS.md`](DECISIONS.md)
- Reference look: [`reference/`](reference/)

## Status

| # | Milestone | Status | Screenshots | iPad benchmark (Medium) |
|---|---|---|---|---|
| M1 | Foundations & THE LOOK prototype | ✅ Done | [M1](docs/screenshots/M1/) | pending (run on iPad) |
| M2 | Terrain & world streaming | ✅ Done | [M2](docs/screenshots/M2/) | pending (run on iPad) |
| M3 | Player controller & controls | ✅ Done | [M3](docs/screenshots/M3/) | pending (run on iPad) |
| M4 | Water | ✅ Done | [M4](docs/screenshots/M4/) | pending (run on iPad) |
| M5 | Vegetation, wind & particles | ✅ Done | [M5](docs/screenshots/M5/) | pending (run on iPad) |
| M6 | Regions, weather & seasons | ✅ Done | [M6](docs/screenshots/M6/) | pending (run on iPad) |
| M7 | Buildings, villages & interiors | ✅ Done | [M7](docs/screenshots/M7/) | pending (run on iPad) |
| M8 | Fauna | ✅ Done | [M8](docs/screenshots/M8/) | pending (run on iPad) |
| M9 | Villagers & wanderers | ✅ Done | [M9](docs/screenshots/M9/) | pending (run on iPad) |
| M10 | Castle, shrines, caves & secrets | 🔨 In progress | — | — |
| M11 | Items, journal, map, photo, boats, fishing | ⬜ Not started | — | — |
| M12 | Lore, spirits & festivals | ⬜ Not started | — | — |
| M13 | Audio | ✅ Done | [M13](docs/screenshots/M13/) · [listen](docs/audio/) | pending (run on iPad) |
| M14 | Polish, performance & release | ⬜ Not started | — | — |

Build order (owner's revision): M2 → M3 → M5 → M13 → M7 → M8 → M4 → M6 → M9 → M10 → M11 → M12 → M14.

Legend: ⬜ not started · 🔨 in progress · 👀 waiting for review · ✅ done

### M9 at a glance (villagers)

The villages are inhabited: **117 villagers** and **16 wanderers**. Among the wanderers are a travelling poet, a pilgrim with a bell, a peddler, a painter, Akari the lantern maker, a masked stranger at dusk, a star watcher and the postman.

**Daily routines by trade:**
- Farmers work the terraces.
- Fishers go out before dawn.
- Potters, weavers and carpenters work in their workshops.
- Shopkeepers and tea masters sweep their step and then open.
- Monks pray at dawn and dusk.
- Children play by the well and the river.
- Elders sit on the plaza.
- In the evening everyone gathers to chat.

**At dusk the lantern maker walks the village and lights every lantern, one by one,** and puts them out again at dawn.

**How they react:**
- Umbrellas come out in the rain, and everyone goes home in a storm.
- They turn to you: a bow the first time, a wave later, and eventually a nickname.

**Talking:** 518 different gentle lines depend on who they are, how well they know you, the time, the weather, the season and the village, plus gossip about the neighbours. Each speaker has a pixel portrait and soft voice babble.

| Evening on the plaza | Umbrellas in the rain |
|---|---|
| ![](docs/screenshots/M9/plaza-evening.png) | ![](docs/screenshots/M9/rain-umbrellas.png) |
| **Children at the well** | **Talking to Akari** |
| ![](docs/screenshots/M9/children-play.png) | ![](docs/screenshots/M9/talk.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 61 passed (518 distinct lines, schedules, first meeting vs. nickname, weather-aware talk) |
| People e2e (`npm run e2e:people`) | ✅ 133 people; they move through the day, the lantern maker lights lanterns, umbrellas in rain, talking works and is remembered |
| All e2e | ✅ offline, stability, controls, audio, houses, fauna, water, people |
| Draw calls · triangles (Medium) | 334 · 1.65 M (everyone is one draw) |

### M6 at a glance (weather & seasons)

**Four seasons.** A new journey starts in autumn. Each season lasts 3, 7 or 14 days, or you can lock one (*eternal autumn*) in **Settings → World**.
- **Spring:** cherries and plums blossom, the grass is fresh green, and the rice terraces are flooded.
- **Summer:** deep green, green rice, and the most fireflies.
- **Autumn:** red maples and golden rice.
- **Winter:** bare trees, red camellias, and snow on ground, roofs and treetops.

**Changing weather:** clear, cloudy, overcast, drizzle, rain, heavy rain, thunderstorms, fog, sunshowers and snow.
- Weather changes slowly, and each season and region has its own climate.
- In rain everything darkens and puddles mirror the sky. Rain rings spread on the lake.
- Lightning comes first and the thunder follows by distance.
- A rainbow appears after rain.

| Cherry hills in spring | Inaho under snow |
|---|---|
| ![](docs/screenshots/M6/spring-cherry.png) | ![](docs/screenshots/M6/winter-village.png) |
| **Storm over the lake** | **Sunshower with a rainbow** |
| ![](docs/screenshots/M6/storm-lake.png) | ![](docs/screenshots/M6/sunshower.png) |
| **Rice valley in summer** | **Fog in the cedar forest** |
| ![](docs/screenshots/M6/summer-rice.png) | ![](docs/screenshots/M6/fog-cedar.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 57 passed (season blending, tree looks, weather cycling, rain → snow in winter, thunder after lightning) |
| All e2e | ✅ offline, stability, controls, audio, houses, fauna, water |
| Draw calls · triangles (Medium) | 331 · 1.65 M |

### M4 at a glance (water)

**Rivers:**
- A main river runs from the snowy pass, over the **Great Waterfall**, into Lantern Lake, and out through the marsh to the sea.
- Tributaries flow down from mountain springs, and some end in quiet ponds.
- Riverbeds are carved into the land, and water always flows downhill.
- You can wade and swim in rivers and ponds, and roads cross them on plank bridges.

**The waterfall:** a falling sheet of water with mist at its foot, and a rainbow when the sun is behind you.

**Lake and sea:**
- Ripples spread when you wade or swim, when ducks paddle, and when fish jump (with a splash, more often at dusk).
- Sunlight makes a moving net of caustics over sunny shallows.
- The open sea has swells, and surf breaks white on the coast.

| The Great Waterfall | River at dusk |
|---|---|
| ![](docs/screenshots/M4/great-waterfall.png) | ![](docs/screenshots/M4/river-dusk.png) |
| **Mountain river** | **Surf on the eastern coast** |
| ![](docs/screenshots/M4/mountain-river.png) | ![](docs/screenshots/M4/coast-surf.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 51 passed (hydrology deterministic, water only flows downhill, beds carved under the surface) |
| Water e2e (`npm run e2e:water`) | ✅ swim in the upper river at its own level (21.6 m), ripples in the lake |
| All e2e | ✅ offline, stability, controls, audio, houses, fauna, water |
| Draw calls · triangles (Medium) | 331 · 1.65 M (rivers, ponds and falls are one draw) |

### M8 at a glance (animals)

**41 species**, all peaceful, all animated in code:

- **Wild animals:** sika deer, tanuki, foxes (and a rare white fox at night), macaques, serow, hares, boar with striped piglets, squirrels, tortoises, tree frogs
- **Village and farm animals:** cats (tabby, calico, black), shiba and akita dogs, horses, cows, chickens, a temple goat
- **Birds:** cranes, herons, egrets, ducks, mandarin ducks, gulls, kites, crows, sparrows, swallows, pigeons, pheasants, ptarmigans, owls
- **Water life and insects:** koi, crabs, red dragonflies, swallowtails, small whites, bees

How they behave:
- They live where they should, and at their own hours. Deer lie down in the grass at night, and tanuki come out at dusk.
- Jogging scares them and birds take off. Stand still and the curious ones come over.
- You can pet cats, dogs and horses, which slowly builds their trust.
- Bow to the temple deer and they bow back.

| Deer at the temple | Cats and sparrows in Ichiba |
|---|---|
| ![](docs/screenshots/M8/temple-deer.png) | ![](docs/screenshots/M8/village-cats.png) |
| **Macaques at Yukemuri** | **Tanuki at night** |
| ![](docs/screenshots/M8/onsen-macaques.png) | ![](docs/screenshots/M8/forest-night.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 47 passed (41 species, every body builds with animatable parts) |
| Fauna e2e (`npm run e2e:fauna`) | ✅ animals in 100 % of 10 places × day/night, flee from a jogger, petting builds trust, deer bow back |
| Other e2e | ✅ offline, stability, controls, audio, houses |
| Draw calls · triangles (headless benchmark, all passes) | Low 281 · 1.29 M — Medium 329 · 1.65 M — High 374 · 1.95 M |

Medium is now slightly over the 1.5 M triangle budget (forests + animals); M14 trims LODs
against the real iPad benchmark.

### M7 at a glance (villages & houses)

**Seven villages**, joined by winding dirt roads:

- **Ichiba:** a market town with tiled machiya, shops and workshops
- **Inaho:** thatched farmhouses among the rice terraces
- **Chabatake:** a tea hamlet
- **Shiomachi:** a fishing harbour
- **Sakuraoka:** on the cherry hills
- **Yukemuri:** a hot-spring village with an onsen
- **Kumoji:** a shrine settlement

**Every house can be entered.** Walk up the stone steps and the shōji door slides open, with no loading screen. Inside are:

- tatami, an irori hearth with a kettle, and cushions you can sit on
- a tokonoma alcove with a scroll and flowers, and andon lamps
- tools for the owner's trade: a potter's wheel, a lantern maker's lanterns, a loom, nets
- futons laid out at night

Interiors are lamp-lit and darker than outside. Windows glow at night, so villages shine from the hills.

| Inside a farmhouse | Farmhouse at night |
|---|---|
| ![](docs/screenshots/M7/interior-day.png) | ![](docs/screenshots/M7/interior-night.png) |
| **Ichiba at dusk** | **A village at night from the hills** |
| ![](docs/screenshots/M7/market-dusk.png) | ![](docs/screenshots/M7/villages-night.png) |
| **Inaho, thatched farmhouses** | **Shiomachi harbour** |
| ![](docs/screenshots/M7/thatch-village.png) | ![](docs/screenshots/M7/harbour.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 45 passed (layout determinism, no overlaps, every house has a door gap, floor and walkable steps, roads connect) |
| Houses e2e (`npm run e2e:houses`) | ✅ walk up, door opens, step inside (indoors, room reverb, tatami steps), walls hold |
| Offline · stability · controls · audio e2e | ✅ |
| Draw calls · triangles (Medium) | benchmark path 311 · 1.57 M; market street at dusk 360 · 1.33 M; inside a house 244 · 0.64 M |

### M13 at a glance (audio)

Everything you hear is synthesised in the browser: no sound files.

- **Music** comes now and then, like in Minecraft: a generated piece of 2–4 minutes, then long
  stretches of just the world. Koto, shakuhachi, shamisen, soft piano, music box, pads and bells
  on Japanese scales. Each region has its own motif, and the Lantern Lake theme comes back in
  variations.
- **Ambience** follows the place, the hour and the wind:
  - dawn chorus in the woods (bush warbler, tits, doves, woodpeckers)
  - creaking cedars, dripping leaves and bamboo knocks in the deep forests
  - crickets, bell crickets, frogs and owls at night
  - gulls and surf at the coast
  - a wind chime at the dock, the temple bell at 6 and 18 h
- **Sound is placed in 3D** around your head, with reverb that changes between forest, valley
  and open land.
- **Footsteps** change with the ground: grass, dry leaves, wood boards, gravel, sand, snow and
  shallow water.
- **Settings → Sound** has volume sliders and how often music plays (often / occasional /
  rare / off).

Listen (rendered offline from the game's own synths):
[main theme](docs/audio/main-theme-title.wav) ·
[cedar forest](docs/audio/cedar-forest-day.wav) ·
[rice valley](docs/audio/rice-valley-day.wav) ·
[lake at night](docs/audio/lake-night.wav)

| Check | Result |
|---|---|
| Unit tests | ✅ 41 passed (composer: determinism, 2–4 min arcs, notes in scale, main theme, sparse nights) |
| Audio e2e (`npm run e2e:audio`) | ✅ unlock on first tap, real output level, music plays, and each of 6 places gets its own mix (forest reverb, surf at the coast, dawn chorus, night insects/frogs, bamboo) |

![](docs/screenshots/M13/settings-sound.png)

### M5 at a glance

Grass everywhere: 16 kinds of ground plants (tufts, tall grass, reeds, cattails, ferns, moss,
sasa, pampas, rice, clover, cosmos, spider lilies, bellflowers, dandelions, daisies, horsetail)
stream around you in one draw call, bend in the wind and part as you walk through. Nine new
trees and bushes (willow, persimmon, camphor, hinoki, plum, zelkova, azalea, hydrangea,
camellia), twice-as-dense cedar and bamboo woods, ground mist, and ambient particles —
fireflies, falling leaves, petals, pollen, sun motes, sea spray, moths, steam (rain and snow
are ready for the weather in M6).

| Misty cedar forest | Fireflies at the dock |
|---|---|
| ![](docs/screenshots/M5/cedar-forest.png) | ![](docs/screenshots/M5/dock-night.png) |
| **The pampas moor** | **Bamboo grove** |
| ![](docs/screenshots/M5/pampas-moor.png) | ![](docs/screenshots/M5/bamboo-grove.png) |
| **Meadow by the dock** | **Cosmos fields** |
| ![](docs/screenshots/M5/dock-day.png) | ![](docs/screenshots/M5/meadow-flowers.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 36 passed (incl. ground-plant determinism and tile bounds) |
| Offline · pixel stability · controls e2e | ✅ · ✅ (one-pixel turn match 0.979) · ✅ |
| Draw calls · triangles (headless, all passes) | Low 251 · 1.23 M — Medium 303 · 1.59 M — High 360 · 1.93 M |

Medium is slightly over the 1.5 M triangle budget because of the denser forests; the iPad
benchmark decides whether the far-tree LOD needs trimming.

### M3 at a glance

Walk, jog, slow walk, jump, step up onto ledges, wade, swim (calm, no drowning), slide on snow,
sit and lie down anywhere, time-lapse while sitting, soft landings. Desktop, touch, gamepad and
**Apple Pencil** (tap = look there & interact, drag = precise look, pixel brush cursor);
every key rebindable; FOV, sensitivity, invert Y, head bob, tap-to-jog.

| On the pier (interact prompt) | Sitting at dusk |
|---|---|
| ![](docs/screenshots/M3/pier-prompt.png) | ![](docs/screenshots/M3/sitting-dusk.png) |
| **Swimming** | **Touch controls** |
| ![](docs/screenshots/M3/swimming.png) | ![](docs/screenshots/M3/touch-hud.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 33 passed |
| Controls e2e (`npm run e2e:controls`) | ✅ walk, jump & land, swim, sit, time-lapse, stand up, colliders, Apple Pencil tap |
| Offline / pixel stability | ✅ / ✅ (one-pixel turn match 0.98 after the water-mesh fix) |
| Draw calls · triangles (Medium, all passes) | 278 · 1.54 M |

### M2 at a glance

A 10 km world (16 km with the border ranges) streamed around the player: 20 regions from
the spec, a quadtree terrain built in Web Workers, forests streamed in tiles, and only what
is visible gets drawn.

| Lantern Lake from the castle mountain | Mirror lake at dusk |
|---|---|
| ![](docs/screenshots/M2/castle-view.png) | ![](docs/screenshots/M2/lake-dusk.png) |
| **Maple mountains, golden hour** | **High over the world** |
| ![](docs/screenshots/M2/maple-golden.png) | ![](docs/screenshots/M2/flyover.png) |

| Check | Result |
|---|---|
| Unit tests | ✅ 33 passed (incl. chunk-hash determinism, tree placement) |
| Offline boot + save load | ✅ |
| Pixel stability | ✅ |
| Draw calls (headless benchmark path, all passes) | Low 232 · Medium 278 · High 352 (budget < 400) |
| Triangles (all passes: shadow + reflection + main) | Low 1.22 M · Medium 1.54 M · High 1.91 M |
| Download size | 853 KB |
| iPad benchmark | ⏳ needs a run on the iPad |

### M1 at a glance

| Night dock (reference 1) | Mirror lake at dusk (reference 2) |
|---|---|
| ![](docs/screenshots/M1/dock-night.png) | ![](docs/screenshots/M1/lake-dusk.png) |
| **Title screen** | **On the pier (touch HUD)** |
| ![](docs/screenshots/M1/title.png) | ![](docs/screenshots/M1/play-touch-hud.png) |

M1 checks:

| Check | Result |
|---|---|
| Type-check + build | ✅ |
| Unit tests (`npm test`) | ✅ 29 passed |
| Offline boot + save load (`npm run e2e:offline`) | ✅ |
| Pixel stability (`npm run e2e:stability`) | ✅ sub-pixel turn: 0 changed pixels |
| Console errors in screenshot runs | ✅ none |
| Download size (precache) | 813 KB |
| Headless perf (software GL, regression only) | see below |
| iPad Air benchmark | ⏳ needs a run on the iPad |

Headless software-rendered numbers (SwiftShader, 2360×1640, *not* representative of a GPU):

| Preset | Internal res (1180×820 viewport) | Avg frame | 1 % low | Draw calls | Triangles (all passes) |
|---|---|---|---|---|---|
| Low | 394×274 ×3 | 789 ms | 883 ms | 101 | 855 k |
| Medium | 590×410 ×2 | 926 ms | 1017 ms | 101 | 855 k |
| High | 590×410 ×2 | 1086 ms | 1300 ms | 101 | 855 k |

Triangles and draw calls are the meaningful numbers here (budget: < 400 draws, < 1.5 M
triangles); frame times need the iPad run.

## Install on iPad (works offline)

1. One-time setup (repo owner): make the repository public, then
   *Settings → Pages → Source: GitHub Actions*. Every push to `main` deploys.
2. On the iPad, open **https://thetaminolutz.github.io/hotaru/** in Safari once.
3. Tap **Share → Add to Home Screen**.
4. Start Hotaru from the home screen. Everything is cached; airplane mode works.
   When a new version has been downloaded, a small paper toast offers a restart.

## Controls

| | Desktop | iPad |
|---|---|---|
| | Desktop | iPad (touch) | Apple Pencil | Gamepad |
|---|---|---|---|---|
| Look | click, then mouse | drag on the right side | drag (fine) | right stick |
| Walk / jog / slow | WASD · Shift · Ctrl/C | koi stick (rim = jog, gentle = slow) | — | left stick · L3/RT · LB/LT |
| Jump | Space | jump token | — | A |
| Interact · sit · lie · stand | E | interact token | tap the thing (also turns your view) | X / B |
| Time-lapse (while sitting) | hold T | hold the hourglass token | — | hold Y |
| Menu | Esc | lacquer token, top right | — | Start |
| Debug panel | `` ` `` | three-finger tap | — | — |

All keys can be rebound in Settings → Keys. Rowing arrives with boats in M11.

## Benchmark on the iPad

Open the debug panel (three-finger tap) → **Benchmark (current preset)** (60 s) or
**All presets** (3 min). Copy the result line and paste it back; it goes into the table above.

## Development

```sh
npm ci
npm run dev            # http://localhost:5173  (?debug=1 opens the debug panel)
npm test               # unit tests (Vitest)
npm run build          # production build + service worker in dist/
npm run shots -- M5    # milestone screenshots → docs/screenshots/M5/
npm run e2e:offline    # offline boot test (builds must exist)
npm run e2e:stability  # pixel stability test
npm run e2e:controls   # walking, swimming, sitting, Pencil tap
npm run e2e:audio      # audio unlock, output and per-place mix
npm run e2e:houses     # walk into a house
npm run e2e:fauna      # animals: presence, fleeing, petting, bowing
npm run e2e:water      # swim in a river, ripples
npm run e2e:people     # villagers through a day, lantern round, talking
npm run audio:samples  # render music samples → docs/audio/
npm run icons          # regenerate app icons & launch images
```

Useful URL parameters: `?shot=dock-night|lake-dusk|dock-golden|dock-day|lake-night|pier-end`,
`?t=17.5` (hour), `?ui=gallery` (every UI element), `?quality=low|medium|high`,
`?off=bloom,quantize,outlines,reflections,shadows,grade,vignette`, `?seed=123`, `?play=1`.
