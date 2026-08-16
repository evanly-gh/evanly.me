# evanly.me

Hey there, I'm Evan and this is the code behind my interactive cyber-city personal website. This took way too long to make... hope you enjoy it!

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
