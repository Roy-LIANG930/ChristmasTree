export const TREE_HEIGHT = 16;
export const BASE_RADIUS = 6.0;

/**
 * Generates position for a single light in an organic, hand-wrapped spiral.
 * @param index Current index of the light
 * @param total Total number of lights
 * @returns {x, y, z} coordinates
 */
export const generateLightSpiral = (index: number, total: number) => {
  // Normalized progress from bottom (0) to top (1)
  const progress = index / total;
  
  // Calculate height: -8 to +8
  const y = progress * TREE_HEIGHT - (TREE_HEIGHT / 2);
  
  // RADIUS LOGIC
  // We want it to start inside the trunk (radius 0) at the very bottom
  // and quickly flare out to the surface.
  
  // Base cone radius at this height
  const coneRadius = (1 - progress) * BASE_RADIUS;
  
  // Fade in radius: 0 -> 1 over the first 5% of the string
  const startFlare = Math.min(progress * 20, 1.0); 
  
  // Final radius: Cone radius * slightly outside foliage * flare factor
  const r = coneRadius * 1.05 * startFlare;
  
  // SPIRAL LOGIC
  // Reduce loops to 6-7 for a steeper, looser wrap
  const loops = 7;
  const theta = progress * Math.PI * 2 * loops;
  
  // Base spiral position
  let x = r * Math.cos(theta);
  let z = r * Math.sin(theta);
  
  // NOISE / ORGANIC WOBBLE
  // Add randomness to simulate loose cable wrapping
  // We use the index to make it deterministic but "random" looking
  const noiseAmt = 0.3; // Amplitude of the wobble
  x += (Math.random() - 0.5) * noiseAmt;
  z += (Math.random() - 0.5) * noiseAmt;
  // Also wobble height slightly so it's not a perfect line
  const yWobble = y + (Math.random() - 0.5) * 0.4;
  
  return { x, y: yWobble, z };
};

/**
 * Generates a random position on a sphere surface/volume for chaos state
 * @param radius Maximum radius of the explosion
 */
export const generateChaosPosition = (radius: number) => {
  const u = Math.random();
  const v = Math.random();
  const phi = Math.acos(2 * v - 1);
  const theta = 2 * Math.PI * u;
  // Cubic root for uniform distribution within sphere volume
  const r = Math.cbrt(Math.random()) * radius;
  
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta),
    z: r * Math.cos(phi)
  };
};