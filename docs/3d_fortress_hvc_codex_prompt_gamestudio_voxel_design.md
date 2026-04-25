# Codex Prompt: 3D Fortress-Style Turn-Based Artillery Prototype

## Project Goal

Build a playable browser prototype of a **3D turn-based artillery tank game** inspired by the classic Korean Fortress-style gameplay.

This is a **1v1 game**, but it is **NOT multiplayer yet**.

The first prototype should be:

> Human Player vs Computer AI

The player and the computer take turns moving, aiming, setting shot power, and firing projectiles affected by gravity and wind.

This is **not a real-time shooter**.  
This is a **turn-based 3D artillery battle game**.

---

## Tech Stack

Use:

- Vite
- React
- TypeScript
- Three.js
- React Three Fiber
- @react-three/drei
- @react-three/rapier only if useful

Keep the project simple, clean, and easy to iterate.

Prioritize a playable prototype over perfect architecture.

---

## Core Gameplay Loop

Implement a local **Human vs Computer** prototype.

### Turn Flow

1. Human player turn starts.
2. Player can move their tank left/right within a limited movement allowance.
3. Player can adjust cannon angle.
4. Player can adjust shot power.
5. UI shows current wind direction and wind strength.
6. Show only a short initial trajectory preview from the cannon.
7. Player fires.
8. Projectile flies using gravity and wind.
9. Projectile collides with ground or enemy tank.
10. Explosion happens.
11. Damage is applied if the enemy is near the impact point.
12. Turn switches to the computer.
13. Computer chooses movement, angle, and power.
14. Computer fires.
15. Turn switches back to the player.
16. Repeat until either tank reaches 0 HP.

---

## Important Design Direction

The gameplay should feel like classic Fortress:

- Turn-based
- Angle-based shooting
- Shot power control
- Wind affecting projectile
- Limited tank movement per turn
- Skill comes from estimating angle, power, distance, and wind

Do **not** show the full predicted trajectory.

The player should only see a short curved guide near the cannon showing the initial firing direction.

---

## Human Player Controls

Use keyboard controls:

- `A` / `D`: Move tank left/right
- `W` / `S`: Adjust cannon angle
- `Q` / `E`: Adjust shot power
- `Space`: Fire

Also create visible UI controls if easy:

- Angle display
- Power display
- Fire button
- Movement remaining display

The game should be playable with keyboard alone.

---

## Computer AI Requirements

Create a simple computer opponent.

The AI does not need to be perfect.

### AI Turn Flow

When it is the computer's turn:

1. Wait briefly before acting.
2. Optionally move a small random distance left or right.
3. Choose an angle and power based on the player's position.
4. Add some randomness so the AI can miss.
5. Fire automatically.
6. End turn after projectile impact.

### AI Difficulty

For the first prototype, use a simple AI:

- Estimate distance to player.
- Pick a reasonable angle, such as 35 to 65 degrees.
- Calculate approximate power based on distance.
- Adjust slightly for wind.
- Add random error to angle and power.

The AI should be able to hit the player sometimes, but not always.

Example AI logic:

```ts
const distance = Math.abs(playerTank.x - aiTank.x);
const baseAngle = 45;
const basePower = distance * 0.8;

const angleError = randomBetween(-8, 8);
const powerError = randomBetween(-10, 10);

const finalAngle = baseAngle + angleError;
const finalPower = basePower + powerError;
```

This does not need to be mathematically perfect.  
The goal is to make the first prototype feel playable.

---

## Tank Movement

Each tank should have limited movement per turn.

Example:

- Each turn gives 5 movement points.
- Moving left/right consumes movement points.
- Once a tank fires, movement is no longer allowed for that turn.

The computer should also follow this movement limit.

---

## Aiming System

Each tank has:

- Cannon angle
- Shot power
- Facing direction

The human player can adjust angle and power manually.

The computer sets angle and power automatically.

Suggested ranges:

```ts
angle: 0 to 90 degrees
power: 10 to 100
```

For readability, display the cannon angle visually by rotating the cannon barrel.

---

## Wind System

Wind should affect projectile movement.

Wind has:

```ts
type Wind = {
  direction: "left" | "right";
  strength: number;
};
```

Requirements:

- Wind changes every turn.
- Wind direction can be left or right.
- Wind strength should be visible in the UI.
- Wind should apply horizontal acceleration to the projectile.
- Stronger wind should noticeably affect the projectile arc.

Example:

```ts
const windForce = wind.direction === "right"
  ? wind.strength
  : -wind.strength;

velocity.x += windForce * deltaTime;
```

---

## Projectile Behavior

The projectile should:

- Spawn from the cannon tip.
- Move in an arc.
- Be affected by gravity.
- Be affected by wind.
- Explode on collision with ground or tank.
- Damage the enemy based on distance from explosion.
- End the current turn after the explosion resolves.

Basic projectile math is acceptable.

Example:

```ts
vx = Math.cos(angleRadians) * power * facingDirection;
vy = Math.sin(angleRadians) * power;
```

The game can mostly happen along the X/Y plane, while still being rendered in 3D.

Use Z mostly for visual depth.

---

## Damage System

Use simple explosion radius damage.

Example:

```ts
const distance = getDistance(explosionPosition, enemyTankPosition);

if (distance < explosionRadius) {
  const damage = Math.max(0, maxDamage * (1 - distance / explosionRadius));
  enemy.hp -= damage;
}
```

Suggested values:

- Tank HP: 100
- Explosion radius: 4
- Max damage: 35

Show HP clearly in the UI.

---

## Trajectory Preview

Show only the first short section of the projectile path.

Requirements:

- Preview should start from the cannon tip.
- Preview should curve slightly based on current angle and power.
- Preview should not show the entire path to the target.
- Preview should help the player understand the initial firing direction, not solve the shot.

This is important for preserving the Fortress-style gameplay.

---

## Camera

Use a 3D scene, but keep the gameplay readable.

Recommended camera:

- Side-view or slightly angled isometric side-view.
- Both tanks should be visible.
- During projectile flight, optionally follow the projectile.
- After explosion, return to the default view.

Do not make this a free-camera game.

The camera should support the turn-based artillery gameplay, not distract from it.

---

## World / Battlefield

Create a simple 3D battlefield.

Minimum requirements:

- Ground platform or simple voxel-like terrain.
- Human tank on the left.
- Computer tank on the right.
- Clear sky/background.
- Basic lighting.
- Tanks should sit on the ground.

For the first prototype, terrain destruction is optional.

### Terrain Destruction Options

Option A, preferred for first prototype:

- No terrain destruction yet.
- Show explosion visual only.
- Apply damage normally.

Option B, if easy:

- Use simple voxel blocks.
- Remove blocks within explosion radius.

Do not spend too much time on terrain destruction in the first prototype.

---

## Visual Style / Art Direction

The prototype should be playable first, but it should also look like a small polished game prototype instead of a plain physics demo.

Use a **high-resolution voxel / blocky toy diorama style**.

Think:

- Cute 3D voxel tanks
- Chunky readable shapes
- Bright stylized battlefield
- Toy-like proportions
- Clean low-poly/voxel geometry
- Soft shadows
- Clear silhouettes
- Simple but charming game feel

The game should feel like:

> Classic Fortress gameplay reimagined as a cute voxel 3D browser game.

Do not use realistic military visuals.  
Avoid gritty war style.  
Make it feel playful, readable, and arcade-like.

---

## Voxel Asset Requirements

Create the first version of all game objects directly with Three.js/R3F primitives.

No external asset downloads are required.

Use grouped boxes, cylinders, and simple meshes to create voxel-like objects.

### Human Tank

The player tank should be more detailed than a single cube.

Build it from multiple simple parts:

- Main body made from box geometry
- Slightly smaller upper turret
- Rotating cannon barrel
- Left/right tread blocks or wheel blocks
- Small accent blocks
- Team color accent
- Clear facing direction

Suggested look:

- Compact chunky tank
- Slightly oversized cannon
- Cute proportions
- Readable from side/isometric view

### Computer Tank

The computer tank should share the same structure but use different accent colors.

It should be visually clear which tank belongs to the player and which belongs to the computer.

Example:

- Player tank: blue/green accent
- Computer tank: red/orange accent

Do not rely only on UI labels.  
The tanks should be distinguishable in the scene.

### Cannon

The cannon must visually rotate with the current aim angle.

Requirements:

- Barrel should be mounted on the turret.
- Barrel should point in the actual firing direction.
- Cannon tip should match the projectile spawn position.
- Angle changes should be immediately visible.

### Projectile

The projectile can be simple but should have game feel.

Use:

- Small glowing sphere or voxel shell
- Tiny trail during flight if easy
- Optional small smoke puffs

### Explosion

Explosion should be simple but satisfying.

Use one or more of:

- Expanding transparent sphere
- Voxel debris particles
- Flash circle
- Small smoke puff
- Screen/camera shake if easy

Explosion must clearly show where the projectile hit.

### Battlefield

The battlefield should look like a small floating voxel island or toy terrain.

Minimum visual requirements:

- Main ground platform with thickness
- Layered blocky terrain edges
- Some decorative voxel rocks
- A few small grass blocks or shrubs
- Simple background sky
- Directional light and ambient light
- Soft shadows if possible

Recommended style:

- Floating rectangular island
- Grass top layer
- Dirt/stone side layers
- Slightly uneven terrain surface if easy

Do not make terrain so visually busy that it becomes hard to aim.

### Background

Create a simple polished background:

- Sky gradient or solid pleasant sky color
- Optional distant blocky clouds
- Optional subtle sun/moon sphere
- No distracting background animation needed

### UI Style

The UI should match the game style.

Use a clean arcade HUD:

- Rounded panels
- Clear labels
- Large readable numbers
- Player HP and Computer HP
- Turn indicator
- Wind display with arrow
- Angle and power display
- Movement points display

The UI should feel like a game interface, not a default debug panel.

Use simple CSS, but make it presentable.

---

## Visual Quality Bar

The first prototype should meet this visual quality bar:

- A screenshot should immediately communicate that this is a cute 3D voxel artillery game.
- Tanks should look like tanks, not random boxes.
- The cannon angle should be obvious.
- The battlefield should feel like a game arena.
- The HUD should be readable and styled.
- Projectile and explosion should provide satisfying feedback.
- The game should still run smoothly in the browser.

Do not spend so much time on visuals that the core gameplay is unfinished.

Gameplay completion is still the top priority, but avoid bare placeholder visuals if possible.

---

## UI Requirements

Create a clear game HUD.

Show:

- Current turn: Player or Computer
- Player HP
- Computer HP
- Current angle
- Current power
- Current wind direction
- Current wind strength
- Remaining movement points
- Controls reminder
- Fire button or Space key instruction
- Winner message when game ends

During the computer turn, show something like:

> Computer is aiming...

---

## Game State Requirements

Use clear game states.

Suggested states:

```ts
type TurnOwner = "player" | "computer";

type GamePhase =
  | "aiming"
  | "projectileFlying"
  | "exploding"
  | "turnTransition"
  | "gameOver";
```

The game should prevent input during:

- Computer turn
- Projectile flight
- Explosion
- Game over

---

## Suggested File Structure

Organize the project clearly.

Suggested structure:

```txt
src/
  App.tsx
  main.tsx

  game/
    GameScene.tsx
    Tank.tsx
    Projectile.tsx
    Terrain.tsx
    TrajectoryPreview.tsx
    Explosion.tsx
    gameTypes.ts
    gameMath.ts
    aiLogic.ts

  ui/
    GameHUD.tsx
```

Do not put everything into one giant file unless absolutely necessary.

---

## Code Quality Requirements

- Use TypeScript types.
- Keep game state understandable.
- Keep gameplay constants easy to tweak.
- Use clear function and variable names.
- Avoid unnecessary complexity.
- Add comments only where helpful.
- Make the code easy to expand later into multiplayer.

---

## Physics / Math Guidance

If using a physics engine becomes complex, use simple custom projectile math instead.

Recommended approach for MVP:

- Store projectile position and velocity.
- Update position every frame.
- Apply gravity.
- Apply wind.
- Check collision manually with ground and tanks.

Example:

```ts
velocity.y -= gravity * deltaTime;
velocity.x += windForce * deltaTime;

position.x += velocity.x * deltaTime;
position.y += velocity.y * deltaTime;
```

Ground collision can be simple:

```ts
if (projectile.position.y <= groundHeight) {
  explode();
}
```

Tank collision can be approximate using distance checks.

---

## Additional Visual Definition of Done

The visual prototype is complete when:

- Both tanks are made from multiple voxel-like parts.
- The player and computer tanks are visually different.
- The cannon visibly rotates when aiming.
- The projectile spawns from the cannon tip.
- The projectile has at least a small visual trail or glow.
- The explosion has a clear animated effect.
- The battlefield looks like a stylized voxel arena or floating island.
- The HUD is styled and readable.
- The game looks presentable enough for an early social media screenshot.

---

## Definition of Done

The prototype is complete when:

- I can run the app locally.
- I see a 3D battlefield.
- I see a human tank and a computer tank.
- The human player can move left/right with limited movement points.
- The human player can adjust cannon angle.
- The human player can adjust shot power.
- The human player can fire a projectile.
- Wind changes each turn and affects projectile movement.
- The projectile can hit the computer tank or ground.
- Explosion damage reduces HP.
- The computer takes its own turn automatically.
- The computer can move, aim, and fire.
- Turns alternate correctly.
- The game ends when either tank reaches 0 HP.
- The UI clearly shows turn, HP, wind, angle, power, and movement points.

---

## Do Not Add Yet

Do NOT add these in the first prototype:

- Online multiplayer
- Account login
- Leaderboard
- Shop
- Multiple tank classes
- Multiple weapons
- Character unlocks
- Complex destructible terrain
- Mobile touch controls
- Advanced VFX
- External paid assets or downloaded asset packs
- Sound effects
- Music
- AI difficulty menu
- Matchmaking
- Network synchronization

Focus only on making the first playable **Human vs Computer 3D artillery battle prototype**.

---

## After Implementation

After coding, explain:

1. How to run the project.
2. Which files were created.
3. What controls are available.
4. What gameplay features are working.
5. Any known limitations.
6. What should be improved next.

---



---

## IMPORTANT: Use Codex Game Studio Skill

You have access to a built-in **Game Studio** skill inside Codex.

You MUST use the Game Studio skill to:

- Scaffold the project structure
- Initialize the game loop
- Set up rendering and scene
- Manage game state where appropriate
- Accelerate development of gameplay systems

### Game Studio + Visual Design Requirement

When using Game Studio, do not accept the most basic placeholder visuals as the final result.

Use Game Studio to create the project quickly, then improve the scene with custom voxel-style R3F components for:

- Tanks
- Cannon
- Projectile
- Explosion
- Battlefield
- HUD styling

The final prototype should be both playable and visually understandable.

### Requirements

- Prefer Game Studio abstractions where they make development faster.
- Do NOT over-engineer outside of Game Studio unless necessary.
- Ensure the final result is still:
  - Editable as a normal React + Three.js project
  - Runnable locally via Vite
  - Easy to extend later

### Goal with Game Studio

Use Game Studio to speed up:

- Scene setup
- Entity management (tanks, projectiles)
- Game loop handling
- Input handling
- Turn state transitions

But still implement:

- Fortress-style aiming system
- Wind physics
- Projectile arc behavior
- Turn-based logic
- Simple AI opponent

Game Studio should be used as a **productivity accelerator**, not as a black box.

---

## Important Final Reminder

The goal is not to build the full game yet.

The goal is to create the first playable prototype where the player can immediately feel:

> “This is a 3D version of Fortress-style turn-based artillery gameplay.”

Prioritize the core fun:

- Move a little.
- Read the wind.
- Adjust angle.
- Adjust power.
- Fire.
- Watch the arc.
- Hit or miss.
- Take turns.
