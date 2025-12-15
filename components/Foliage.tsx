import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame, extend } from '@react-three/fiber';
import { useAppStore } from '../store';
import { TreeState } from '../types';
import { shaderMaterial } from '@react-three/drei';

const COUNT = 80000;
const TREE_HEIGHT = 16;
const BASE_RADIUS = 6.0;
const CHAOS_RADIUS = 60; 

// --- FOLIAGE SHADER ---
// Enables bottom-up reveal logic to match LightString
const FoliageMaterial = shaderMaterial(
  {
    uTime: 0,
    uHeight: -20.0, // Start invisible
    uMap: null,
    uOpacity: 1.0,
  },
  // Vertex
  `
    attribute vec3 color;
    varying vec3 vColor;
    varying float vY;
    varying vec2 vUv;
    
    void main() {
      vColor = color;
      vY = position.y;
      vUv = uv;
      
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 6.0 * (60.0 / -mvPosition.z); // Size attenuation
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  // Fragment
  `
    uniform float uTime;
    uniform float uHeight;
    uniform sampler2D uMap;
    uniform float uOpacity;
    
    varying vec3 vColor;
    varying float vY;
    varying vec2 vUv;
    
    void main() {
      // Sample soft circle texture
      vec4 texColor = texture2D(uMap, gl_PointCoord);
      
      // Visibility Logic: Black until uHeight passes vY
      // Use smoothstep for soft reveal edge
      float visible = 1.0 - smoothstep(uHeight, uHeight + 2.0, vY);
      
      // If invisible, we can either discard OR just be black.
      // To satisfy "Dead Black", we should probably just make it black if it's below threshold?
      // Wait, uHeight increases from -12 to +12.
      // visible = 1.0 when y < uHeight.
      // So items BELOW the line are visible.
      
      if (visible < 0.01) discard;

      // Final Color
      gl_FragColor = vec4(vColor * texColor.rgb, texColor.a * uOpacity * visible);
    }
  `
);
extend({ FoliageMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    foliageMaterial: any;
  }
}

export const Foliage: React.FC<{ heightRef?: React.MutableRefObject<number> }> = ({ heightRef }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<any>(null);
  const treeState = useAppStore((state) => state.treeState);

  // 1. TEXTURE
  const softTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); 
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)'); 
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); 
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // 2. DATA GENERATION
  const { positions, targetPositions, chaosPositions, colors } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const tar = new Float32Array(COUNT * 3);
    const chs = new Float32Array(COUNT * 3);
    const cols = new Float32Array(COUNT * 3);

    const green = new THREE.Color('#006622'); 
    const brightGreen = new THREE.Color('#008833'); 

    for (let i = 0; i < COUNT; i++) {
      // Target
      const yNorm = Math.pow(Math.random(), 0.7); 
      const y = yNorm * TREE_HEIGHT - (TREE_HEIGHT / 2);
      const rMax = (1 - yNorm) * BASE_RADIUS;
      const r = Math.sqrt(Math.random()) * rMax; 
      const theta = Math.random() * Math.PI * 2;

      tar[i * 3] = r * Math.cos(theta);
      tar[i * 3 + 1] = y;
      tar[i * 3 + 2] = r * Math.sin(theta);

      // Chaos
      const u = Math.random();
      const v = Math.random();
      const phi = Math.acos(2 * v - 1);
      const azimuth = 2 * Math.PI * u;
      const radius = Math.cbrt(Math.random()) * CHAOS_RADIUS;

      chs[i * 3] = radius * Math.sin(phi) * Math.cos(azimuth);
      chs[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(azimuth);
      chs[i * 3 + 2] = radius * Math.cos(phi);

      // Init
      pos[i * 3] = chs[i * 3];
      pos[i * 3 + 1] = chs[i * 3 + 1];
      pos[i * 3 + 2] = chs[i * 3 + 2];

      // Colors
      const c = Math.random() > 0.7 ? brightGreen.clone() : green.clone();
      c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1); 

      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    return { positions: pos, targetPositions: tar, chaosPositions: chs, colors: cols };
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current || !materialRef.current) return;
    
    // UPDATE UNIFORMS
    materialRef.current.uTime = state.clock.elapsedTime;
    
    // Check heightRef. If undefined (edit mode), force show all (999). 
    materialRef.current.uHeight = heightRef ? heightRef.current : 999.0;

    const isOrdered = treeState === TreeState.ORDER;
    const targetOpacity = isOrdered ? 1.0 : 0.0;
    
    // Smooth opacity transition for chaos/order modes
    materialRef.current.uOpacity = THREE.MathUtils.lerp(materialRef.current.uOpacity, targetOpacity, delta * 3.0);
    
    // OPTIMIZATION: Skip position update if fully hidden
    if (materialRef.current.uOpacity < 0.01) return;

    const geom = pointsRef.current.geometry;
    const currPositions = geom.attributes.position.array as Float32Array;
    const lerpFactor = Math.min(delta * 2.5, 0.1); 

    for (let i = 0; i < COUNT; i++) {
        const idx = i * 3;
        const cx = currPositions[idx];
        const cy = currPositions[idx + 1];
        const cz = currPositions[idx + 2];

        const tx = isOrdered ? targetPositions[idx] : chaosPositions[idx];
        const ty = isOrdered ? targetPositions[idx + 1] : chaosPositions[idx + 1];
        const tz = isOrdered ? targetPositions[idx + 2] : chaosPositions[idx + 2];

        if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 || Math.abs(tz - cz) > 0.001) {
             currPositions[idx] += (tx - cx) * lerpFactor;
             currPositions[idx + 1] += (ty - cy) * lerpFactor;
             currPositions[idx + 2] += (tz - cz) * lerpFactor;
        }
    }
    
    geom.attributes.position.needsUpdate = true;
    
    if (isOrdered) {
        pointsRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.05;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute 
            attach="attributes-position" 
            count={COUNT} 
            array={positions} 
            itemSize={3} 
        />
        <bufferAttribute 
            attach="attributes-color" 
            count={COUNT} 
            array={colors} 
            itemSize={3} 
        />
      </bufferGeometry>
      <foliageMaterial
        ref={materialRef}
        uMap={softTexture}
        transparent={true}
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
};