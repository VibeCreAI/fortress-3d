# Fortress 3D

A browser prototype of a 3D turn-based artillery tank game inspired by classic Fortress-style gameplay.

The current prototype is a local Human vs Computer match built with Vite, React, TypeScript, Three.js, React Three Fiber, and Drei.

## Features

- 3D voxel-style battlefield with heightfield terrain
- Player tank vs computer AI tank
- Turn-based artillery loop
- 3D tank movement on ground X/Y coordinates
- Projectile arcs affected by gravity and wind
- Simple destructible terrain craters
- Omniscient tactical camera with mouse drag, pan, and wheel zoom
- Keyboard aiming, movement, power, and HUD controls

## Requirements

- Node.js 18 or newer
- npm

## Install

```bash
npm install
```

## Open The Dev Server

Start the local Vite dev server:

```bash
npm run dev
```

Vite will print a local URL, usually:

```text
http://localhost:5173/
```

If you want to bind to a specific host and port:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Then open:

```text
http://127.0.0.1:5173/
```

## Build

Create a production build:

```bash
npm run build
```

The built files are emitted to:

```text
dist/
```

## Preview Production Build

After building, preview the production output locally:

```bash
npm run preview
```

## Controls

- `W/A/S/D`: Move the player tank on the ground plane
- Arrow keys: Aim turret yaw and cannon elevation
- Left mouse drag on the battlefield: Rotate camera
- Right mouse drag on the battlefield: Pan camera
- Mouse wheel: Adjust omniscient camera distance
- `Q/E`: Decrease / increase shot power
- `Space`: Fire

## Vercel Deployment

This project can be deployed directly from GitHub through Vercel.

Recommended Vercel settings:

- Framework Preset: `Vite`
- Root Directory: repo root
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`
- Production Branch: `main`

No environment variables are required for the current prototype.

## Project Structure

```text
src/
  App.tsx
  App.css
  main.tsx
  game/
    GameScene.tsx
    Tank.tsx
    Projectile.tsx
    Terrain.tsx
    TrajectoryPreview.tsx
    Explosion.tsx
    aiLogic.ts
    constants.ts
    gameMath.ts
    gameTypes.ts
  ui/
    GameHUD.tsx
```

## Notes

This is an early prototype. It does not include multiplayer, accounts, leaderboards, sound, mobile touch controls, or advanced terrain destruction yet.
