# evanly.me

Evan Li's personal portfolio — a scroll‑driven, cinematic 3D ride through a neon
cyberpunk city. A Tron‑style bike carries the viewer past the About, Projects, and
Research sections and ends on a moonlit bridge. An accessible DOM layer mirrors the
content for SEO and reduced‑motion users.

## Stack

- **React 19** + **React Three Fiber** / **drei** / **postprocessing**
- **three.js**
- **GSAP ScrollTrigger** for the scroll‑scrubbed camera timeline
- **Vite** + **TypeScript**

## Getting started

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production build → dist/
npm run preview    # serve the production build
```

## Project layout

```
src/
  components/three/   R3F scene, city, bike, moon, camera director
  world/              deterministic layout + camera/route math (roads, stunts,
                      research, shibuya, finale, buildings)
  choreography/       route spline, bike path, camera rig, scroll remap
  scroll/             scroll runtime + experience shell
  content/            résumé data and generated art
  assets/             procedural bike/rider
public/               models (KitBash GLB), textures, images
tools/                offline asset pipeline (mesh → DRACO GLB, moon, props)
```

## Asset pipeline

Building/prop/moon assets are processed offline into web‑ready formats:

```bash
npm run assets:kitbash    # OBJ → per-piece DRACO GLB
npm run assets:moon       # NASA moon albedo/height → WebP
npm run assets:props      # prop meshes
npm run assets:portrait   # About portrait
```
