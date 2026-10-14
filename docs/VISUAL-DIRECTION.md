# JEV City — Visual Direction Brief

**Creative north star:** **“The little city with big decisions.”** An inviting illustrated isometric miniature that becomes cinematic when events occur, without looking like a generic AI dashboard or a grim disaster game.

## 1. Art style and composition

- **2.5D isometric illustrated diorama** constructed from PixiJS tile layers and sprites. Clean beveled forms, hand-crafted silhouettes, readable rooftops, tiny expressive characters, soft contact shadows. Avoid photorealism, dense pixel noise and resource-heavy realtime 3D.
- Shape language: gently rounded corners, crisp walls, clear foreground/background layers, purposeful geometry. Props distinguish market (striped awning), clinic (cross icon), shelter (shield/roof), power substation (bolt) and houses (distinct roof colors).
- Readable at a 1280x800 browser window with map occupying ~68% width and inspector ~32%; no text embedded in the world smaller than reliably readable screen text.
- Camera: static 30–35°-style isometric projection, subtle zoom + pan, generous framing and no camera shake except a brief optional impact nudge. Keep citizen selection visible throughout motion.

## 2. Palette (design tokens; tune for contrast)

| Usage | Day | Night |
|---|---|---|
| Sky / atmospheric background | `#DDECF3` | `#14263E` |
| Ground / sidewalks | `#E5E8DC` | `#25384A` |
| Road | `#647484` | `#34455D` |
| Buildings / roofs | `#DDAE86` | `#6A7794` |
| Teal accents / UI | `#2D8F91` | `#55B9B4` |
| Windows / practical light | `#FFE1A3` | `#FFC86E` |
| Warm incident / meteor | `#F17961` | `#EF7F62` |
| Emergency responders | `#D84D56` | `#F36A72` |
| Panel background | `#F8FAF7` | `#172436` |
| Main UI text | `#1B303D` | `#F1F5F7` |

Aim for visually pleasing **warm-coral vs calm-teal** rather than default cyberpunk neon. Do not use color alone to encode meaning: outline shapes, icons, texture and labels identify hazards and roles.

## 3. Lighting and day/night

- **Day:** high-key diffuse midday sunlight; broad soft shadows, bright roofs and clean citizen silhouettes. Gentle ambient occlusion under buildings and people, not expensive realtime lights.
- **Night:** deep navy ambient overlay, selective warm window emissives, warm streetlight pools, visible clinic/shelter lights, readable citizens with subtle rim light. Avoid burying sidewalks under black overlays.
- **Blackout:** normal day/night lighting shifts to localized darkness **without making controls or paths unreadable**; clinic emergency generator becomes a distinct warm beacon. Buildings affected by outage lose window glow. Subtle traffic signal dim/off states.
- **Meteor:** a short coral/amber flash, radiating dust ring, a marked hazard zone and a handful of ember particles. Keep dust opacity low enough to follow characters; no gore, smoke-filled unplayable screen, or complicated destruction shaders.
- User-visible Day/Night control and a simulated-time readout. Lighting can be set directly for demonstration; time simulation controls are not required to simulate a full 24-hour cycle.

## 4. Character language and motion

- 25 tiny, visually different citizen sprites with distinguishable clothing shapes and role accessories (healthcare satchel, responder stripe, retail apron, commuter bag). Four simple directional poses or 8-direction animation as a stretch; prioritize smooth navigation interpolation.
- Decision changes should be apparent: walking toward shelter, congregating, going home, tending to someone, turning away from blocked road.
- Selecting a citizen adds a high-contrast outline + unobtrusive tether/halo, with persistent label while inspector is open. Overcrowded scenes require hit-area padding and cycling through overlapping citizens.
- Motion: relaxed 1–2 sec walking cycles, slight idle bounce, particles used sparingly. Honor reduced-motion OS settings with disabled shake and simplified effects.

## 5. UI framing

Top bar: `JEV CITY` identity, **mode badge** (`RECORDED REPLAY`, `LIVE JEV`, `RULES`, `FALLBACK`), scenario selector, day/night, pause/reset, speed.

Main 2-column layout:
- **City canvas:** large, cinematic, interactions and scenario overlays.
- **Citizen inspector:** identity/role, compact state context, ranked Choice probability bars, top choice, enacted action, risk and duty-pressure Score distributions, Noul readout, origin/mode, event time.

Bottom: collapsible event timeline and compact stats strip. Provenance labels remain visible in screenshots and demo recordings, not only behind a tooltip. Use restrained animations for bars, not distracting dashboard motion.

## 6. Accessibility, art pipeline, and quality bar

- All actionable controls keyboard-focusable, WCAG AA text contrast where applicable, labeled controls and alternatives to visual-only status. Canvas state and citizen details represented in accessible DOM inspector/list.
- Desktop-first; tablet preserves full inspector via panel/drawer. Small mobile can offer a clear spectator layout, but no broken/clipped main controls.
- Prefer consistent, author-owned SVG/PNG sprite atlases and lightweight generated assets with predictable licensing. Atlas at appropriate display scale / @2x for retina; avoid transferring hundreds of unique large textures.
- Art production order: block-out greyscale district → core palette → 25 characters and 5 venues → day/night passes → scenario FX → polish. Measure performance after each stage; target 30+ FPS under the PRD conditions.

## 7. Visual acceptance review

- A screenshot communicates **miniature city + active citizens + selectable decision insight** in under five seconds.
- Day, night, blackout, meteor are distinguishable even at thumbnail size.
- The viewer can tell **which action was the model's top choice versus which was enacted** without reading documentation.
- An incident remains legible when the inspector is open; the inspector never obscures the entire canvas on desktop.
- No fabricated live indicators, timings or provider activity used as motion graphics.
