import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// FIX 1: "First Snow" Settings
const COUNT = 150; 
const Y_RANGE = 35;
const Y_OFFSET = 18;
const XZ_RANGE = 40;

export const Snow: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Initialize random positions and speeds
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() - 0.5) * XZ_RANGE;
      const y = Math.random() * Y_RANGE - (Y_RANGE / 2);
      const z = (Math.random() - 0.5) * XZ_RANGE;
      
      const speed = 0.02 + Math.random() * 0.04; 
      
      // FIX: Vary wobbleSpeed more (was 0.3 + rand * 0.5 -> now 0.2 + rand * 0.8)
      // "Slightly vary the wobbleSpeed" + "dynamic effect"
      const wobbleSpeed = 0.2 + Math.random() * 0.8; 
      
      const scale = 0.4 + Math.random() * 0.6; 
      const timeOffset = Math.random() * 100;
      
      temp.push({ x, y, z, speed, wobbleSpeed, scale, timeOffset });
    }
    return temp;
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;

    const t = state.clock.elapsedTime;

    particles.forEach((particle, i) => {
      // Fall down
      particle.y -= particle.speed;

      // Reset to top if below bottom threshold
      if (particle.y < -Y_OFFSET) {
        particle.y = Y_OFFSET;
      }

      // FIX: Increase amplitude by 50% (0.5 -> 0.75)
      const xDrift = Math.sin(t * particle.wobbleSpeed + particle.timeOffset) * 0.75;
      const zDrift = Math.cos(t * particle.wobbleSpeed * 0.8 + particle.timeOffset) * 0.75;

      dummy.position.set(
        particle.x + xDrift,
        particle.y,
        particle.z + zDrift
      );

      dummy.scale.setScalar(particle.scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
        {/* Falling Snow Particles */}
        <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </instancedMesh>
    </group>
  );
};