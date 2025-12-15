import React, { useLayoutEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, extend } from '@react-three/fiber';
import { generateLightSpiral, generateChaosPosition } from '../utils/math';
import { shaderMaterial } from '@react-three/drei';
import { useAppStore } from '../store';
import { TreeState } from '../types';

const LIGHT_COUNT = 2000;
const CHAOS_RADIUS = 40;

// --- CUSTOM SHADER MATERIAL ---
const LightStringMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new THREE.Color('#FFD700'), // Gold
    uColorB: new THREE.Color('#FFF8E7'), // Warm Diamond White
    uHeight: -12.0, 
  },
  // Vertex Shader
  `
    attribute float aRandom;
    varying float vRandom;
    varying float vY;
    
    void main() {
      vRandom = aRandom;
      vec3 transformed = vec3(position);
      
      #ifdef USE_INSTANCING
        transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
      #endif
      
      vY = transformed.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `,
  // Fragment Shader
  `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uHeight;
    
    varying float vRandom;
    varying float vY;
    
    void main() {
      // 1. VISIBILITY: Bottom-up fill
      // Lights below uHeight are visible.
      // Use smoothstep for soft edge: transition from 1.0 (visible) to 0.0 (hidden)
      // Edge is around uHeight.
      float visible = 1.0 - smoothstep(uHeight, uHeight + 1.5, vY);
      
      // Strict discard to prevent depth artifacts or black pixels
      if (visible < 0.01) discard;

      // 2. DRAGON HEAD EFFECT
      // Create a super bright band just below the uHeight cutoff
      // It appears at the "leading edge" of the fill
      float head = smoothstep(uHeight - 2.0, uHeight, vY) * (1.0 - smoothstep(uHeight, uHeight + 0.5, vY));
      
      // 3. TWINKLE LOGIC
      float wave1 = sin(uTime * 3.0 + vRandom * 15.0);
      float wave2 = cos(uTime * 1.5 + vRandom * 5.0);
      float twinkle = (wave1 + wave2) * 0.5 + 0.5;
      
      // 4. COLOR MIXING
      vec3 baseColor = mix(uColorA, uColorB, twinkle * 0.7);
      
      // Head: Super bright white/gold hot tip
      vec3 headColor = vec3(1.0, 0.95, 0.8) * 8.0; 
      
      // Mix base and head
      vec3 finalColor = mix(baseColor, headColor, head * head);
      
      // 5. INTENSITY BOOST
      float intensity = 1.0 + (twinkle * 2.0);
      
      // 6. OUTPUT
      // Use visibility as alpha. Additive blending will take care of the rest.
      gl_FragColor = vec4(finalColor * intensity, visible);
    }
  `
);

extend({ LightStringMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    lightStringMaterial: any;
  }
}

interface LightStringProps {
    heightRef: React.MutableRefObject<number>;
}

export const LightString: React.FC<LightStringProps> = ({ heightRef }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<any>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const treeState = useAppStore((state) => state.treeState);

  const { positions, chaosPositions, randoms } = useMemo(() => {
    const pos = [];
    const chaos = [];
    const rnd = new Float32Array(LIGHT_COUNT);
    
    for (let i = 0; i < LIGHT_COUNT; i++) {
        pos.push(generateLightSpiral(i, LIGHT_COUNT));
        chaos.push(generateChaosPosition(CHAOS_RADIUS));
        rnd[i] = Math.random();
    }
    return { positions: pos, chaosPositions: chaos, randoms: rnd };
  }, []);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    
    positions.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(0.04);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.geometry.setAttribute(
        'aRandom',
        new THREE.InstancedBufferAttribute(randoms, 1)
    );
  }, [positions, chaosPositions, randoms, dummy]);

  useFrame((state, delta) => {
    // 1. Update Shader Uniforms from Parent Ref
    if (materialRef.current) {
        materialRef.current.uTime = state.clock.elapsedTime;
        // The Scene controller drives the height, we just bind it
        materialRef.current.uHeight = heightRef.current; 
    }

    if (!meshRef.current) return;
    
    const isOrdered = treeState === TreeState.ORDER;
    const lerpSpeed = isOrdered ? 0.1 : 0.05; 

    const t = state.clock.elapsedTime;

    for (let i = 0; i < LIGHT_COUNT; i++) {
        const target = isOrdered ? positions[i] : chaosPositions[i];
        
        meshRef.current.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        
        dummy.position.lerp(new THREE.Vector3(target.x, target.y, target.z), lerpSpeed);
        
        if (isOrdered) {
            dummy.position.y += Math.sin(t * 2.0 + i) * 0.005;
        } else {
            dummy.rotation.x += 0.01;
            dummy.rotation.z += 0.01;
        }
        
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, LIGHT_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <lightStringMaterial 
        ref={materialRef} 
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
};