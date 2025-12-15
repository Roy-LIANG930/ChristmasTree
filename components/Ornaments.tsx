import React, { useMemo, useRef, useLayoutEffect, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, extend } from '@react-three/fiber';
import { useAppStore } from '../store';
import { TreeState } from '../types';
import { generateLightSpiral, TREE_HEIGHT as MATH_HEIGHT, BASE_RADIUS as MATH_RADIUS } from '../utils/math';
import { shaderMaterial } from '@react-three/drei';

// --- CONFIGURATION ---
const GIFT_COUNT = 55;    
const COLOR_BALL_COUNT = 100; 
const GINGERBREAD_COUNT = 40; 
const LIGHT_COUNT = 500;  
const PHOTO_COUNT = 200; 
const CANDY_COUNT = 50; 
const BELL_COUNT = 50;  

// Sync with utils/math
const TREE_HEIGHT = MATH_HEIGHT; 
const BASE_RADIUS = MATH_RADIUS; 
const CHAOS_RADIUS = 45;

const BALL_PALETTE = [
  "#FFD700", // Gold
  "#C41E3A", // Cardinal Red
  "#C0C0C0", // Silver
  "#0047AB", // Cobalt Blue
  "#50C878", // Emerald Green
  "#9932CC", // Dark Orchid
];

// --- ORNAMENT LIGHT SHADER ---
// A special material that is only visible when y < uHeight
const OrnamentLightMaterial = shaderMaterial(
  {
    uTime: 0,
    uHeight: -20.0, // Start very low
    uColor: new THREE.Color('#ffaa33'),
  },
  // Vertex
  `
    varying float vY;
    varying vec3 vPosition;
    void main() {
      vPosition = position;
      vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
        transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
      #endif
      vY = transformed.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `,
  // Fragment
  `
    uniform float uTime;
    uniform float uHeight;
    uniform vec3 uColor;
    varying float vY;
    
    void main() {
      // Visibility Logic: "Dead Black" until uHeight passes vY
      // Sharp cutoff to match the main light string
      float visible = 1.0 - smoothstep(uHeight, uHeight + 1.0, vY);
      
      if (visible < 0.01) discard;

      // Twinkle effect
      float twinkle = 0.8 + 0.4 * sin(uTime * 3.0 + vY * 10.0);
      
      vec3 finalColor = uColor * twinkle * 2.0; // Boost intensity
      
      gl_FragColor = vec4(finalColor, visible);
    }
  `
);
extend({ OrnamentLightMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    ornamentLightMaterial: any;
  }
}

// --- HELPER: Luxury Fallback Texture (Gold/Black) ---
const createFallbackTexture = (text: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, 512, 512);
        
        ctx.strokeStyle = '#C5A059'; 
        ctx.lineWidth = 12;
        ctx.strokeRect(20, 20, 472, 472);
        
        ctx.lineWidth = 2;
        ctx.strokeRect(36, 36, 440, 440);

        ctx.fillStyle = '#C5A059';
        ctx.beginPath();
        ctx.moveTo(256, 120);
        ctx.lineTo(280, 160);
        ctx.lineTo(256, 200);
        ctx.lineTo(232, 160);
        ctx.fill();

        ctx.fillStyle = '#E5C079'; 
        ctx.font = '400 32px "Times New Roman", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('榴莲&咪宝的圣诞树', 256, 280);
        
        ctx.fillStyle = '#888888';
        ctx.font = 'italic 24px Arial';
        ctx.fillText('Image Asset Pending', 256, 330);

        ctx.fillStyle = '#555555';
        ctx.font = '16px monospace';
        ctx.fillText(text, 256, 450);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

// --- INDIVIDUAL POLAROID COMPONENT ---
const Polaroid: React.FC<{
  index: number;
  targetPos: THREE.Vector3;
  chaosPos: THREE.Vector3;
  tilt: number;
  randomRotation: THREE.Euler;
  texture: THREE.Texture;
}> = ({ index, targetPos, chaosPos, tilt, randomRotation, texture }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const treeState = useAppStore((state) => state.treeState);
  const cursor = useAppStore(state => state.cursor);
  const setHoveredPhotoIndex = useAppStore(state => state.setHoveredPhotoIndex);
  const hoveredPhotoIndex = useAppStore(state => state.hoveredPhotoIndex);
  const selectedPhotoIndex = useAppStore(state => state.selectedPhotoIndex);
  const photoRotation = useAppStore(state => state.photoRotation);
  
  const { camera, raycaster } = useThree();
  const [hovered, setHovered] = useState(false);

  // Reusable objects to prevent GC
  const vec = useMemo(() => new THREE.Vector3(), []);
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const targetWorldPos = useMemo(() => new THREE.Vector3(), []);
  const parentWorldQuat = useMemo(() => new THREE.Quaternion(), []);
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    const isOrdered = treeState === TreeState.ORDER;
    const isSelected = selectedPhotoIndex === index;
    const isSomeoneSelected = selectedPhotoIndex !== null;
    
    // --- 1. RAYCASTING (HOVER) LOGIC ---
    // Only raycast if in CHAOS mode and cursor is active
    if (treeState === TreeState.CHAOS && cursor.active) {
        raycaster.setFromCamera(new THREE.Vector2(cursor.x, cursor.y), camera);
        
        // Project world position to NDC to check distance
        vec.copy(groupRef.current.position);
        if (groupRef.current.parent) {
            groupRef.current.parent.localToWorld(vec);
        }
        vec.project(camera);
        
        const dist = Math.sqrt(Math.pow(vec.x - cursor.x, 2) + Math.pow(vec.y - cursor.y, 2));
        
        if (dist < 0.15) { 
             if (!hovered) {
                 setHovered(true);
                 setHoveredPhotoIndex(index);
             }
        } else {
             if (hovered) {
                 setHovered(false);
                 if (hoveredPhotoIndex === index) setHoveredPhotoIndex(null);
             }
        }
    } else if (treeState !== TreeState.CHAOS && hovered) {
        setHovered(false);
    }
    
    // --- 2. POSITIONING LOGIC ---
    
    if (isSelected && groupRef.current.parent) {
        // === CAMERA-RELATIVE CENTER LOGIC ===
        // Position directly in front of camera
        
        // 1. Calculate target world position: Camera Pos + (Camera Forward * 5)
        vec.set(0, 0, -1);
        vec.applyQuaternion(camera.quaternion);
        vec.multiplyScalar(5.0); // 5 units in front of camera
        targetWorldPos.copy(camera.position).add(vec);

        // 2. Convert this WORLD position into the Parent's LOCAL space
        groupRef.current.parent.updateWorldMatrix(true, false);
        groupRef.current.parent.worldToLocal(targetWorldPos);
        
        // Lerp position (0.1 for weighty flight)
        groupRef.current.position.lerp(targetWorldPos, 0.1);

        // === ROTATION LOGIC (FIXED FOR STRICT ALIGNMENT) ===
        // We want the photo to have the EXACT SAME world orientation as the camera,
        // plus any user interaction spin.
        
        // A. Setup dummy with Camera World Rotation + User Spin
        dummyObj.quaternion.copy(camera.quaternion);
        dummyObj.rotateX(photoRotation.x);
        dummyObj.rotateY(photoRotation.y);
        
        // B. Calculate necessary LOCAL rotation
        // LocalQuat = Inverse(ParentWorldQuat) * TargetWorldQuat
        
        // Get parent's World Quaternion
        groupRef.current.parent.getWorldQuaternion(parentWorldQuat);
        parentWorldQuat.invert(); // Invert it
        
        const targetQuat = dummyObj.quaternion.clone();
        targetQuat.premultiply(parentWorldQuat);
        
        // Slerp rotation (0.3 for snappy alignment)
        groupRef.current.quaternion.slerp(targetQuat, 0.3);
        
        // Scale up for "Zoom" effect
        groupRef.current.scale.lerp(new THREE.Vector3(3.5, 3.5, 3.5), 0.1);

    } else {
        // === NORMAL / CHAOS LOGIC ===
        let finalTarget = vec.copy(chaosPos); 

        if (isOrdered) {
            finalTarget.copy(targetPos);
        } else if (isSomeoneSelected) {
            // Push background items further back and spread them out
            finalTarget.copy(chaosPos).multiplyScalar(1.5); 
        }

        // Standard position update
        const speed = isOrdered ? 0.04 : 0.02;
        groupRef.current.position.lerp(finalTarget, speed);

        // Rotation logic
        if (isOrdered) {
            // Face outward from center
            groupRef.current.lookAt(0, groupRef.current.position.y, 0);
            groupRef.current.rotateY(Math.PI); 
            groupRef.current.rotateZ(tilt);
        } else {
            // Floating spin
            groupRef.current.rotation.x += 0.005;
            groupRef.current.rotation.y += 0.005;
        }

        // Scale Logic
        const targetScale = hovered ? 1.5 : 1.0;
        groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Paper Frame */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.8, 1.0, 0.02]} /> 
        <meshStandardMaterial 
            color="#fafafa"
            roughness={0.6} 
            metalness={0.0}
            emissive={hovered || selectedPhotoIndex === index ? "#FFD700" : "#000000"}
            emissiveIntensity={hovered ? 0.8 : (selectedPhotoIndex === index ? 0.1 : 0)}
        />
      </mesh>
      
      {/* Photo Image Layer */}
      <mesh position={[0, 0.1, 0.011]}> 
        <planeGeometry args={[0.72, 0.54]} />
        <meshBasicMaterial 
            map={texture} 
            toneMapped={false}
            color={selectedPhotoIndex !== null && selectedPhotoIndex !== index ? "#444444" : "#ffffff"}
        />
      </mesh>
    </group>
  );
};

export const Ornaments: React.FC<{ heightRef?: React.MutableRefObject<number> }> = ({ heightRef }) => {
  const imageUrls = useAppStore((state) => state.assets.images);

  // --- TEXTURE LOADING WITH ERROR HANDLING ---
  const [textures, setTextures] = useState<THREE.Texture[]>([]);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const loaded: THREE.Texture[] = [];
    let loadCount = 0;

    imageUrls.forEach((url, i) => {
        loader.load(
            url,
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                loaded[i] = tex;
                loadCount++;
                if (loadCount === imageUrls.length) {
                    setTextures([...loaded]);
                }
            },
            undefined, 
            (err) => {
                console.warn(`Failed to load image index ${i}. Using fallback.`);
                loaded[i] = createFallbackTexture(`Slot ${i+1}`);
                loadCount++;
                if (loadCount === imageUrls.length) {
                    setTextures([...loaded]);
                }
            }
        );
    });
  }, [imageUrls]); 


  // References
  const giftsRef = useRef<THREE.InstancedMesh>(null); 
  const colorBallsRef = useRef<THREE.InstancedMesh>(null);
  const gingerbreadRef = useRef<THREE.InstancedMesh>(null); 
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  const lightMatRef = useRef<any>(null); // For shader uniform updates
  const candiesRef = useRef<THREE.InstancedMesh>(null);
  const bellsRef = useRef<THREE.InstancedMesh>(null);

  // --- GEOMETRIES ---
  const giftGeometry = useMemo(() => new THREE.BoxGeometry(0.85, 0.85, 0.85), []);
  const ballGeometry = useMemo(() => new THREE.SphereGeometry(0.7, 32, 32), []);
  const lightGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);
  const bellGeometry = useMemo(() => new THREE.ConeGeometry(0.5, 0.8, 16), []);
  
  const gingerbreadGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.3);
    shape.bezierCurveTo(0.1, -0.3, 0.25, -0.55, 0.3, -0.55); 
    shape.bezierCurveTo(0.4, -0.55, 0.4, -0.25, 0.3, -0.1); 
    shape.lineTo(0.3, 0.1);
    shape.bezierCurveTo(0.5, 0.1, 0.65, 0.05, 0.65, 0.15); 
    shape.bezierCurveTo(0.65, 0.25, 0.45, 0.3, 0.3, 0.25); 
    shape.quadraticCurveTo(0.2, 0.35, 0.15, 0.4);
    shape.absarc(0, 0.55, 0.22, -0.6, Math.PI + 0.6); 
    shape.quadraticCurveTo(-0.2, 0.35, -0.3, 0.25);
    shape.bezierCurveTo(-0.45, 0.3, -0.65, 0.25, -0.65, 0.15);
    shape.bezierCurveTo(-0.65, 0.05, -0.5, 0.1, -0.3, 0.1);
    shape.lineTo(-0.3, -0.1);
    shape.bezierCurveTo(-0.4, -0.25, -0.4, -0.55, -0.3, -0.55);
    shape.bezierCurveTo(-0.25, -0.55, -0.1, -0.3, 0, -0.3);
    const extrudeSettings = { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    return geom;
  }, []);

  const candyGeometry = useMemo(() => {
    const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -1.0, 0), 
        new THREE.Vector3(0, 1.0, 0),  
        new THREE.Vector3(0, 1.35, 0.25), 
        new THREE.Vector3(0, 1.1, 0.6), 
        new THREE.Vector3(0, 0.7, 0.5)  
    ]);
    return new THREE.TubeGeometry(path, 32, 0.12, 12, false);
  }, []);

  const candyTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#C41E3A'; 
        const h = 512;
        for (let i = -h; i < h * 2; i += 160) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + 80, 0);
            ctx.lineTo(i + 80 - 200, h);
            ctx.lineTo(i - 200, h);
            ctx.fill();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 4);
    tex.anisotropy = 16;
    return tex;
  }, []);


  // --- MATERIALS ---
  const colorBallMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#ffffff",      
    metalness: 0.9,         
    roughness: 0.15,        
    envMapIntensity: 1.5,
    toneMapped: false, 
  }), []);

  const giftMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#D00020", 
    roughness: 0.15,
    metalness: 0.1,   
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.5,
    toneMapped: false,
  }), []);

  const candyMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    map: candyTexture,
    color: "#ffffff",
    roughness: 0.2,
    metalness: 0.0,
    clearcoat: 1.0,         
    clearcoatRoughness: 0.05,
    envMapIntensity: 2.0,
    emissive: "#ff0000",    
    emissiveIntensity: 0.05
  }), [candyTexture]);
  
  const gingerbreadMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#CD853F", 
    roughness: 0.8,   
    metalness: 0.0,
    envMapIntensity: 1.0,
    emissive: "#8B4513",
    emissiveIntensity: 0.1 
  }), []);

  // Removed Standard Light Material, replaced with shader below in render
  // const lightMaterial = useMemo(() => new THREE.MeshStandardMaterial({ ... }), []);

  const bellMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#FFD700', 
    roughness: 0.15,
    metalness: 1.0,
    envMapIntensity: 4.0,
    emissive: "#FFD700",
    emissiveIntensity: 0.5
  }), []);

  // --- DISTRIBUTION LOGIC ---
  const { giftData, gingerbreadData, lightData, photoData, candyData, bellData, colorBallData } = useMemo(() => {
    const occupied: { pos: THREE.Vector3, radius: number }[] = [];
    
    const generateChaos = () => {
        const u = Math.random();
        const v = Math.random();
        const phi = Math.acos(2 * v - 1);
        const rot = 2 * Math.PI * u;
        const cr = Math.cbrt(Math.random()) * CHAOS_RADIUS;
        return new THREE.Vector3(
          cr * Math.sin(phi) * Math.cos(rot),
          cr * Math.sin(phi) * Math.sin(rot),
          cr * Math.cos(phi)
        );
    };

    const generateSpiralData = (count: number) => {
        const targetPos: THREE.Vector3[] = [];
        const chaosPos: THREE.Vector3[] = [];
        const tilts: number[] = [];
        const randomRotations: THREE.Euler[] = [];

        for (let i = 0; i < count; i++) {
            const p = generateLightSpiral(i, count);
            const vec = new THREE.Vector3(p.x, p.y, p.z);
            targetPos.push(vec);
            occupied.push({ pos: vec, radius: 0.6 }); 
            chaosPos.push(generateChaos());
            tilts.push((Math.random() - 0.5) * 0.5);
            randomRotations.push(new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI));
        }
        return { targetPos, chaosPos, tilts, randomRotations };
    };

    const generateGaussianData = (count: number, radiusScale = 1.0, withWeights = false) => {
        const targetPos: THREE.Vector3[] = [];
        const chaosPos: THREE.Vector3[] = [];
        const tilts: number[] = [];
        const randomRotations: THREE.Euler[] = [];
        const weights: number[] = [];
        const colors: THREE.Color[] = [];
        const myRadius = 0.5 * radiusScale;

        for (let i = 0; i < count; i++) {
            let found = false;
            let attempts = 0;
            let finalPos = new THREE.Vector3();

            while (!found && attempts < 50) {
                attempts++;
                const randStd = Math.random() + Math.random() + Math.random() + Math.random() - 2;
                let y = randStd * (TREE_HEIGHT / 3.5);

                const maxY = TREE_HEIGHT / 2 - 1.0;
                const minY = -TREE_HEIGHT / 2 + 1.0;
                
                if (y > maxY) y = maxY;
                if (y < minY) y = minY;

                const yNorm = (y + TREE_HEIGHT / 2) / TREE_HEIGHT;
                const rBase = (1 - yNorm) * BASE_RADIUS;
                const r = rBase * (0.8 + Math.random() * 0.3);
                
                const theta = Math.random() * Math.PI * 2;
                const candidate = new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta));

                let collision = false;
                for (const item of occupied) {
                    if (candidate.distanceTo(item.pos) < (myRadius + item.radius + 0.35)) {
                        collision = true;
                        break;
                    }
                }
                
                if (!collision) {
                    finalPos = candidate;
                    found = true;
                    occupied.push({ pos: finalPos, radius: myRadius });
                }
            }
            if (!found) {
                const t = Math.random();
                const y = (t * 0.9 + 0.05) * TREE_HEIGHT - (TREE_HEIGHT / 2);
                const r = (1 - t) * BASE_RADIUS;
                const theta = Math.random() * Math.PI * 2;
                finalPos.set(r * Math.cos(theta), y, r * Math.sin(theta));
            }

            targetPos.push(finalPos);
            chaosPos.push(generateChaos());
            tilts.push(0);
            randomRotations.push(new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI));
            
            if (withWeights) {
                 weights.push(0.5 + Math.random() * 1.5);
                 colors.push(new THREE.Color(BALL_PALETTE[Math.floor(Math.random() * BALL_PALETTE.length)]));
            }
        }
        return { targetPos, chaosPos, tilts, randomRotations, weights, colors };
    };

    const generateRandomData = (count: number, radiusScale = 1.0) => {
        const targetPos: THREE.Vector3[] = [];
        const chaosPos: THREE.Vector3[] = [];
        const tilts: number[] = [];
        const randomRotations: THREE.Euler[] = [];
        
        for (let i = 0; i < count; i++) {
           const t = Math.random();
           const y = (t * 0.9 + 0.05) * TREE_HEIGHT - (TREE_HEIGHT / 2);
           const r = (1 - t) * BASE_RADIUS;
           const theta = Math.random() * Math.PI * 2;
           targetPos.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
           chaosPos.push(generateChaos());
           tilts.push(0);
           randomRotations.push(new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI));
        }
        return { targetPos, chaosPos, tilts, randomRotations };
    };

    const photoData = generateSpiralData(PHOTO_COUNT);
    const giftData = generateGaussianData(GIFT_COUNT, 1.0, true); 
    const colorBallData = generateGaussianData(COLOR_BALL_COUNT, 0.7, true); 
    const gingerbreadData = generateRandomData(GINGERBREAD_COUNT, 0.7); 
    const candyData = generateRandomData(CANDY_COUNT, 0.6);
    const bellData = generateRandomData(BELL_COUNT, 0.6);
    const lightData = generateRandomData(LIGHT_COUNT, 0.1); 

    return { giftData, gingerbreadData, lightData, photoData, candyData, bellData, colorBallData };
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempTarget = useMemo(() => new THREE.Vector3(), []);
  const treeState = useAppStore((state) => state.treeState);

  useLayoutEffect(() => {
    const initMesh = (mesh: THREE.InstancedMesh | null, data: any, scale: number, ignoreColors = false) => {
      if (!mesh) return;
      for (let i = 0; i < data.chaosPos.length; i++) {
        dummy.position.copy(data.chaosPos[i]);
        dummy.scale.set(scale, scale, scale);
        dummy.rotation.copy(data.randomRotations[i]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        
        if (!ignoreColors && data.colors && data.colors[i]) {
            mesh.setColorAt(i, data.colors[i]);
        }
      }
      if (!ignoreColors && data.colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    };

    initMesh(giftsRef.current, giftData, 1.0, true); 
    initMesh(colorBallsRef.current, colorBallData, 0.6); 
    initMesh(gingerbreadRef.current, gingerbreadData, 0.6); 
    initMesh(lightsRef.current, lightData, 0.1);
    initMesh(candiesRef.current, candyData, 0.4); 
    initMesh(bellsRef.current, bellData, 0.5);   
  }, [giftData, gingerbreadData, lightData, candyData, bellData, colorBallData, dummy]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const isOrdered = treeState === TreeState.ORDER;
    const isPhotoFocus = treeState === TreeState.PHOTO_FOCUS;

    // UPDATE SHADER UNIFORMS
    if (lightMatRef.current) {
        lightMatRef.current.uTime = t;
        // If heightRef is provided, use it; otherwise show all (-20 = always visible)
        // But logic says: visible if y < uHeight. 
        // So if NO ref (edit mode), we want visible, so uHeight = 999.
        lightMatRef.current.uHeight = heightRef ? heightRef.current : 999.0;
    }

    // Standard InstancedMesh Update Loop for Non-Interactive Elements
    const updateLayer = (
      mesh: THREE.InstancedMesh | null, 
      data: any, 
      baseScale: number, 
      baseLerpSpeed: number, 
      mode: 'static' | 'twinkle' | 'candy' | 'bell' | 'sway' | 'balls'
    ) => {
      if (!mesh) return;

      for (let i = 0; i < data.targetPos.length; i++) {
        const target = data.targetPos[i];
        const chaos = data.chaosPos[i];
        
        // Logic: if Ordered -> Target; if Chaos -> Chaos; if Focus -> Chaos (Background)
        const destination = isOrdered ? target : chaos;

        tempTarget.copy(destination);
        if (isOrdered) {
            const breatheY = Math.sin(t * 1.5 + i * 0.5) * 0.15;
            tempTarget.y += breatheY;
        } else if (isPhotoFocus) {
             // Push background back slightly in focus mode
             tempTarget.multiplyScalar(1.2);
        }

        mesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        let speed = baseLerpSpeed;
        if (mode === 'balls' && data.weights) {
            speed = baseLerpSpeed / data.weights[i];
        }
        
        // Slow down background movement in focus mode for "Freeze" effect
        if (isPhotoFocus) speed *= 0.1;

        dummy.position.lerp(tempTarget, speed);

        if (isOrdered) {
             if (mode === 'candy') {
                 dummy.rotation.x = data.randomRotations[i].x + Math.sin(t + i) * 0.1;
                 dummy.rotation.z = data.randomRotations[i].z + Math.cos(t + i) * 0.1;
                 dummy.rotation.y += 0.01;
            } else if (mode === 'bell') {
                 dummy.rotation.set(0, 0, 0);
                 dummy.rotation.z = Math.sin(t * 2 + i) * 0.1;
            } else if (mode === 'sway') { 
                 dummy.rotation.set(0, 0, 0);
                 dummy.lookAt(0, dummy.position.y, 0);
                 dummy.rotation.z += Math.sin(t * 2 + i) * 0.1; 
            } else {
                 dummy.rotation.x = Math.sin(t * 0.5 + i) * 0.2;
                 dummy.rotation.y += 0.01;
            }
        } else {
            dummy.rotation.x += 0.01;
            dummy.rotation.y += 0.01;
        }

        let s = baseScale;
        if (isOrdered) {
            if (mode === 'twinkle') {
                s = baseScale * (0.7 + Math.sin(t * 3 + i * 10) * 0.5);
            } else if (mode === 'static' || mode === 'candy' || mode === 'bell' || mode === 'sway' || mode === 'balls') {
                s = baseScale * (1.0 + Math.sin(t + i) * 0.05);
            }
        }
        
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    updateLayer(giftsRef.current, giftData, 1.0, 0.05, 'balls'); 
    updateLayer(colorBallsRef.current, colorBallData, 0.6, 0.05, 'balls');
    updateLayer(gingerbreadRef.current, gingerbreadData, 0.6, 0.025, 'sway');
    updateLayer(lightsRef.current, lightData, 0.1, 0.12, 'twinkle');
    updateLayer(candiesRef.current, candyData, 0.4, 0.03, 'candy');
    updateLayer(bellsRef.current, bellData, 0.5, 0.03, 'bell');
  });

  return (
    <group>
      <instancedMesh ref={giftsRef} args={[giftGeometry, giftMaterial, GIFT_COUNT]} castShadow receiveShadow />
      <instancedMesh ref={colorBallsRef} args={[ballGeometry, colorBallMaterial, COLOR_BALL_COUNT]} castShadow />
      <instancedMesh ref={gingerbreadRef} args={[gingerbreadGeometry, gingerbreadMaterial, GINGERBREAD_COUNT]} castShadow receiveShadow />
      <instancedMesh ref={candiesRef} args={[candyGeometry, candyMaterial, CANDY_COUNT]} castShadow receiveShadow />
      <instancedMesh ref={bellsRef} args={[bellGeometry, bellMaterial, BELL_COUNT]} castShadow receiveShadow />
      
      {/* Lights using Custom Shader for visibility sync */}
      <instancedMesh ref={lightsRef} args={[lightGeometry, undefined, LIGHT_COUNT]}>
          <ornamentLightMaterial 
              ref={lightMatRef} 
              transparent 
              depthWrite={false} 
              blending={THREE.AdditiveBlending}
          />
      </instancedMesh>
      
      {photoData.targetPos.map((pos, i) => (
        <Polaroid 
            key={i} 
            index={i}
            targetPos={pos}
            chaosPos={photoData.chaosPos[i]}
            tilt={photoData.tilts[i]}
            randomRotation={photoData.randomRotations[i]}
            texture={textures.length > 0 ? textures[i % textures.length] : createFallbackTexture('Slot ' + (i % 3 + 1))}
        />
      ))}
    </group>
  );
};