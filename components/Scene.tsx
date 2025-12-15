import React, { Suspense, useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, Sparkles, PerspectiveCamera, ContactShadows, Lightformer } from '@react-three/drei';
import { EffectComposer, Vignette, Noise, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Foliage } from './Foliage';
import { Ornaments } from './Ornaments';
import { LightString } from './LightString';
import { Snow } from './Snow';
import { useAppStore } from '../store';
import { TreeState } from '../types';

// Intro Configuration
const INTRO_START_Y = -12;
const INTRO_END_Y = 12; // The top (Star position)
const STRING_DURATION = 4.0; // Seconds to climb

// --- GOLDEN CURSOR COMPONENT ---
const GoldenCursor: React.FC = () => {
    const cursor = useAppStore(state => state.cursor);
    const treeState = useAppStore(state => state.treeState);
    const hoveredPhotoIndex = useAppStore(state => state.hoveredPhotoIndex);
    const { camera } = useThree();
    
    const meshRef = useRef<THREE.Mesh>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    const vec = useMemo(() => new THREE.Vector3(), []);

    useFrame((state) => {
        if (!meshRef.current || !lightRef.current) return;
        
        const shouldShow = cursor.active && treeState !== TreeState.PHOTO_FOCUS;
        const isHovering = hoveredPhotoIndex !== null;

        if (shouldShow) {
            vec.set(cursor.x, cursor.y, 0.5);
            vec.unproject(camera);
            vec.sub(camera.position).normalize();
            
            const distance = 15;
            vec.multiplyScalar(distance).add(camera.position);

            meshRef.current.position.lerp(vec, 0.4);
            
            const t = state.clock.elapsedTime;
            const targetScale = isHovering ? 1.0 : 0.6;
            const pulseSpeed = isHovering ? 15 : 5;
            const pulseAmp = isHovering ? 0.3 : 0.1;
            
            const scale = targetScale + Math.sin(t * pulseSpeed) * pulseAmp;
            
            meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.2);
            lightRef.current.intensity = isHovering ? 4.0 : 2.0;
            
            (meshRef.current.material as THREE.MeshBasicMaterial).color.set(isHovering ? "#FFFFAA" : "#FFD700");

        } else {
            meshRef.current.scale.lerp(new THREE.Vector3(0,0,0), 0.2);
        }
    });

    return (
        <group>
            <mesh ref={meshRef}>
                <sphereGeometry args={[0.25, 32, 32]} />
                <meshBasicMaterial color="#FFD700" transparent opacity={0.9} depthTest={false} />
            </mesh>
            <pointLight ref={lightRef} color="#FFD700" distance={6} decay={2} />
        </group>
    );
};

// --- CLASSIC STAR (With Intro Support) ---
const ClassicStar: React.FC<{ introState: React.MutableRefObject<any> }> = ({ introState }) => {
    const ref = useRef<THREE.Mesh>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    
    const starGeometry = useMemo(() => {
        const shape = new THREE.Shape();
        const points = 5;
        const outerRadius = 1.2;
        const innerRadius = 0.5;

        for (let i = 0; i < points * 2; i++) {
            const angle = (i / (points * 2)) * Math.PI * 2;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.sin(angle) * radius;
            const y = Math.cos(angle) * radius;
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        }
        shape.closePath();

        const extrudeSettings = {
            depth: 0.2, 
            bevelEnabled: true,
            bevelThickness: 1.0, 
            bevelSize: 0.5,      
            bevelSegments: 2,    
        };

        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }, []);

    useFrame((state) => {
        if (!ref.current || !lightRef.current) return;
        
        ref.current.rotation.y = state.clock.elapsedTime * 0.4;

        if (introState.current.flashed) {
            const timeSinceFlash = state.clock.elapsedTime - introState.current.flashTime;
            // Star lights up WITH the flash
            if (timeSinceFlash < 1.0) {
                 lightRef.current.intensity = THREE.MathUtils.lerp(0, 2.0, timeSinceFlash); // Ramp up
                 (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = THREE.MathUtils.lerp(0, 0.8, timeSinceFlash);
            } else {
                 lightRef.current.intensity = 2.0;
                 (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
            }
        } else {
            // Dead black before flash
            lightRef.current.intensity = 0;
            (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        }
    });

    return (
        <group position={[0, 8.4, 0]}>
            <mesh ref={ref} geometry={starGeometry}>
                <meshStandardMaterial 
                    color="#FFD700" 
                    emissive="#FFAA00"
                    emissiveIntensity={0} 
                    roughness={0.1} 
                    metalness={1.0}
                    toneMapped={false}
                />
            </mesh>
            <pointLight ref={lightRef} name="starLight" color="#FFD700" intensity={0} distance={20} decay={2} />
        </group>
    );
};

// --- LIGHTING CONTROLLER ---
const LightingController: React.FC<{ introState: React.MutableRefObject<any>, lightStringHeightRef: React.MutableRefObject<number> }> = ({ introState, lightStringHeightRef }) => {
    const { scene, gl, camera } = useThree();
    const started = useAppStore(s => s.started);
    const startTimeRef = useRef<number>(-1);
    const scannerLightRef = useRef<THREE.PointLight>(null);

    // Helper: Aggressively kill lights
    const forceDarkness = () => {
        if ('environmentIntensity' in scene) {
            (scene as any).environmentIntensity = 0;
        }
        // Iterate and kill standard lights
        scene.traverse(obj => {
            if (obj instanceof THREE.Light && obj.name !== 'starLight' && obj.name !== 'scannerLight') {
                obj.intensity = 0;
            }
        });
    };

    // Initial Setup
    useEffect(() => {
        // Start DIM - but not 0 to allow the light string to be seen
        gl.toneMappingExposure = 0.2; 
        forceDarkness();
    }, [scene, gl]);

    useFrame((state) => {
        const tTotal = state.clock.elapsedTime;

        // --- PRE-START: TOTAL DARKNESS ---
        if (!started) {
            if (scannerLightRef.current) scannerLightRef.current.intensity = 0;
            forceDarkness(); // CRITICAL: Continuously force environment to 0
            gl.toneMappingExposure = 0.1; // Very dark, just enough for potential UI glow? Or 0.
            return;
        }

        if (startTimeRef.current === -1) {
            startTimeRef.current = tTotal;
        }

        const t = tTotal - startTimeRef.current;

        // --- 1. CLIMBING PHASE (0s -> 4s) ---
        if (t <= STRING_DURATION + 0.5 && !introState.current.flashed) { 
            // While climbing, ensure environment is OFF
            forceDarkness();
            gl.toneMappingExposure = 0.2; // Keep exposure low so only emissive light string pops

            const progress = Math.min(t / STRING_DURATION, 1.0);
            
            // Animate Light String Height
            const currentH = THREE.MathUtils.lerp(INTRO_START_Y, INTRO_END_Y, progress);
            introState.current.height = currentH;
            lightStringHeightRef.current = currentH;

            // Animate Scanner Light (Follows the head)
            if (scannerLightRef.current) {
                // Only turn on scanner if we are climbing
                if (progress < 1.0) {
                    scannerLightRef.current.position.set(0, currentH, 2); 
                    scannerLightRef.current.intensity = 2.0; 
                } else {
                     scannerLightRef.current.intensity = THREE.MathUtils.lerp(scannerLightRef.current.intensity, 0, 0.1);
                }
            }

            // TRIGGER FLASH at Top
            if (progress >= 1.0 && !introState.current.finished) {
                introState.current.finished = true;
                introState.current.flashed = true;
                introState.current.flashTime = tTotal; 
            }
        }

        // --- 2. CLIMAX MOMENT (Flash & Reveal) ---
        if (introState.current.flashed) {
            const timeSinceFlash = tTotal - introState.current.flashTime;

            // A. FLASH EFFECT (Exposure Spike)
            if (timeSinceFlash < 0.2) {
                // Rise fast
                const spike = timeSinceFlash / 0.2;
                gl.toneMappingExposure = THREE.MathUtils.lerp(0.2, 3.5, spike);
            } else if (timeSinceFlash < 2.0) {
                // Decay slowly
                const decay = (timeSinceFlash - 0.2) / 1.8;
                // Reduce final exposure target from 0.8 to 0.6
                gl.toneMappingExposure = THREE.MathUtils.lerp(3.5, 0.6, decay); 
            } else {
                // Steady state exposure reduced to 0.6
                gl.toneMappingExposure = 0.6;
            }

            // B. LIGHTS TURN ON (Synced with Flash)
            const lightFade = Math.min(timeSinceFlash / 0.5, 1.0);
            
            // Reduce max environment intensity from 2.5 to 2.0
            const T_ENV = 2.0;
            if ('environmentIntensity' in scene) {
                (scene as any).environmentIntensity = THREE.MathUtils.lerp(0, T_ENV, lightFade);
            }

            const setInt = (name: string, val: number) => {
                const obj = scene.getObjectByName(name);
                if (obj && 'intensity' in obj) (obj as any).intensity = THREE.MathUtils.lerp(0, val, lightFade);
            };

            setInt('ambient', 0.3);
            setInt('keyLight', 1.5);
            setInt('fillLight', 1.0);
            setInt('rimLight', 1.5);
            setInt('backLight', 0.5);
            
            scene.traverse(c => {
                 if (c.name === 'internalLight' && 'intensity' in c) {
                     (c as any).intensity = THREE.MathUtils.lerp(0, 1.0, lightFade);
                 }
            });
        }
    });

    return (
        <pointLight 
            ref={scannerLightRef} 
            name="scannerLight"
            color="#FFD700" 
            distance={8} 
            decay={2} 
            castShadow={false}
        />
    );
};

const RotatableGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const sceneRotation = useAppStore(state => state.sceneRotation);
    const groupRef = useRef<THREE.Group>(null);

    useFrame(() => {
        if (groupRef.current) {
            groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, sceneRotation.x, 0.1);
            groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, sceneRotation.y, 0.1);
        }
    });

    return <group ref={groupRef}>{children}</group>;
};

export const Scene: React.FC = () => {
  const setIsReady = useAppStore(state => state.setIsReady);
  const started = useAppStore(state => state.started);
  const treeState = useAppStore(state => state.treeState);
  
  // Track animation state
  const introState = useRef({ 
      height: INTRO_START_Y, 
      finished: false, 
      flashed: false, 
      flashTime: 0 
  });
  
  // Ref passed to LightString AND Ornaments to control visibility
  const lightStringHeightRef = useRef(INTRO_START_Y);
  
  const lightTarget = useMemo(() => {
      const obj = new THREE.Object3D();
      obj.position.set(0, 5, 0); 
      return obj;
  }, []);

  return (
    <div 
        className="w-full h-screen relative"
        style={{
            background: 'radial-gradient(circle at center, #4a3322 0%, #15100a 45%, #000000 100%)'
        }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: false, toneMapping: THREE.ReinhardToneMapping, toneMappingExposure: 0.1 }}
        onCreated={() => setIsReady(true)}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 32]} fov={45} />
        
        <OrbitControls 
            enablePan={false} 
            enableZoom={true} 
            minDistance={15} 
            maxDistance={60}
            maxPolarAngle={Math.PI / 1.8}
            autoRotate={started && treeState === TreeState.ORDER}
            autoRotateSpeed={0.5}
            target={[0, 0, 0]}
            makeDefault
            enabled={treeState === TreeState.ORDER} 
        />

        {/* Start intensities at 0. LightingController handles the flash. */}
        <ambientLight name="ambient" intensity={0} color="#001a0f" />
        <spotLight 
            name="keyLight"
            position={[10, 20, 10]} 
            angle={0.25} 
            penumbra={1} 
            intensity={0}
            color="#FFD700" 
            castShadow 
            shadow-bias={-0.0001}
        />
        <primitive object={lightTarget} />
        <directionalLight 
            name="fillLight"
            position={[0, 10, 20]} 
            target={lightTarget}   
            intensity={0}        
            color="#fff0dd" 
        />
        <spotLight 
            name="rimLight"
            position={[0, 10, -10]} 
            intensity={0} 
            color="#ddeeff" 
            angle={0.6}
            penumbra={0.5}
        />
        <pointLight name="backLight" position={[-10, 5, -10]} intensity={0} color="#1a2b3c" />

        <LightingController introState={introState} lightStringHeightRef={lightStringHeightRef} />
        
        <Environment resolution={512}>
            <group rotation={[-Math.PI / 3, 0, 1]}>
                <Lightformer form="circle" intensity={5} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={2} color="#ffeebb" />
                <Lightformer form="rect" intensity={5} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[10, 5, 1]} color="#ffddaa" />
                <Lightformer form="rect" intensity={3} rotation-y={Math.PI / 2} position={[-5, -1, -1]} scale={[10, 2, 1]} color="#ffd700" />
                <Lightformer form="rect" intensity={3} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[20, 10, 1]} color="#ffffff" />
                <Lightformer form="ring" color="#FFD700" intensity={2} scale={10} position={[0, 5, 0]} onUpdate={(self) => self.lookAt(0, 0, 0)} />
            </group>
        </Environment>

        <GoldenCursor />

        <RotatableGroup>
            <Suspense fallback={null}>
                {[0, 3, 6].map((y, i) => (
                    <pointLight 
                        key={i}
                        name="internalLight"
                        position={[0, y, 0]}
                        color="#ff9900"
                        intensity={0}
                        distance={8}
                        decay={2}
                    />
                ))}

                <ClassicStar introState={introState} />
                <Foliage heightRef={lightStringHeightRef} />
                <Ornaments heightRef={lightStringHeightRef} />
                <LightString heightRef={lightStringHeightRef} />
                <Snow /> 
            </Suspense>
            
            <Sparkles 
                count={200} 
                scale={[12, 14, 12]} 
                size={4} 
                speed={0.4} 
                opacity={0.5} 
                color="#FFD700"
            />
        </RotatableGroup>

        <ContactShadows 
            position={[0, -10, 0]}
            opacity={0.6} 
            scale={30} 
            blur={2.5} 
            far={4.0} 
            color="#000000" 
        />

        <EffectComposer enableNormalPass={false}>
            {/* Reduced intensity from 1.2 to 0.6 */}
            <Bloom luminanceThreshold={0.8} mipmapBlur intensity={0.6} radius={0.5} />
            <Noise opacity={0.03} />
            <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>

      </Canvas>
    </div>
  );
};