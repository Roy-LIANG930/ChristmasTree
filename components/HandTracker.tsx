import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useAppStore } from '../store';
import { TreeState } from '../types';

export const HandTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Feedback UI State
  const [borderStyle, setBorderStyle] = useState<string>("border-[#FFD700]/30");
  const [feedbackText, setFeedbackText] = useState<string>("HAND INTERFACE");
  
  // Logic Refs
  const previousLandmarksRef = useRef<{x: number, y: number}[]>([]);
  const gestureHoldCounter = useRef<number>(0);
  const currentHeldGesture = useRef<string>('NEUTRAL');
  const prevPalmRef = useRef<{x: number, y: number} | null>(null);

  // Store actions
  const setCursor = useAppStore(state => state.setCursor);
  const setSceneRotation = useAppStore(state => state.setSceneRotation);
  const setPhotoRotation = useAppStore(state => state.setPhotoRotation);
  const setTreeState = useAppStore(state => state.setTreeState);
  const setSelectedPhotoIndex = useAppStore(state => state.setSelectedPhotoIndex);

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let animationFrameId: number;

    const setupHandTracking = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        setIsLoaded(true);
        startWebcam(handLandmarker);
      } catch (err) {
        console.error("Error initializing hand tracking:", err);
        setError("AI MODEL FAILED");
        setFeedbackText("MOUSE MODE ACTIVE");
        setBorderStyle("border-red-500/30");
      }
    };

    const startWebcam = (landmarker: HandLandmarker) => {
      // Robust check for mediaDevices
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640 }, 
                height: { ideal: 480 },
                frameRate: { ideal: 30 }
            } 
        }).then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.addEventListener("loadeddata", () => {
              predictWebcam(landmarker);
            });
          }
        }).catch((err) => {
          console.warn("Webcam access denied/failed:", err);
          setError("CAMERA DENIED");
          setFeedbackText("MOUSE MODE ACTIVE");
          setBorderStyle("border-red-500/30");
        });
      } else {
          setError("NO CAMERA FOUND");
          setFeedbackText("MOUSE MODE ACTIVE");
          setBorderStyle("border-red-500/30");
      }
    };

    const detectGesture = (landmarks: any[]) => {
      const wrist = landmarks[0];
      const tips = [4, 8, 12, 16, 20];
      const middleMCP = landmarks[9]; // Middle finger knuckle
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      
      const scale = Math.sqrt(
        Math.pow(middleMCP.x - wrist.x, 2) + 
        Math.pow(middleMCP.y - wrist.y, 2)
      ) || 0.1;

      // 1. Pinch Detection
      const pinchDist = Math.sqrt(
          Math.pow(thumbTip.x - indexTip.x, 2) + 
          Math.pow(thumbTip.y - indexTip.y, 2)
      );
      
      if (pinchDist / scale < 0.25) return 'PINCH';

      // 2. Open / Fist Detection
      let totalDist = 0;
      tips.forEach(t => {
        const tip = landmarks[t];
        const d = Math.sqrt(
          Math.pow(tip.x - wrist.x, 2) + 
          Math.pow(tip.y - wrist.y, 2)
        );
        totalDist += d;
      });
      
      const avgFingerExtension = (totalDist / 5) / scale;

      if (avgFingerExtension < 1.3) return 'FIST';
      if (avgFingerExtension > 1.5) return 'OPEN';
      
      return 'NEUTRAL';
    };

    const triggerFeedback = (type: string) => {
        if (type === 'FIST') {
            setBorderStyle("border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.9)]");
            setFeedbackText("LOCKED // ORDER");
        } else if (type === 'OPEN') {
            setBorderStyle("border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.9)]");
            setFeedbackText("RELEASE // CHAOS");
        } else if (type === 'PINCH') {
            setBorderStyle("border-[#FFD700] shadow-[0_0_20px_#FFD700]");
            setFeedbackText("INTERACT // INSPECT");
        }
        
        setTimeout(() => {
            setBorderStyle("border-[#FFD700]/30");
            setFeedbackText("HAND INTERFACE");
        }, 1200);
    };

    const predictWebcam = (landmarker: HandLandmarker) => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
         canvas.width = video.videoWidth;
         canvas.height = video.videoHeight;
      }

      if (ctx) {
         let startTimeMs = performance.now();
         const results = landmarker.detectForVideo(video, startTimeMs);
         
         ctx.clearRect(0, 0, canvas.width, canvas.height);
         
         const state = useAppStore.getState();

         if (results.landmarks && results.landmarks.length > 0) {
            const rawLandmarks = results.landmarks[0]; 
            const width = canvas.width;
            const height = canvas.height;
            const lerpFactor = 0.6;

            if (previousLandmarksRef.current.length !== rawLandmarks.length) {
                previousLandmarksRef.current = rawLandmarks.map(l => ({ x: l.x, y: l.y }));
            }

            // 1. UPDATE SMOOTH POSITIONS
            rawLandmarks.forEach((landmark, i) => {
                const prev = previousLandmarksRef.current[i];
                const smoothX = prev.x + (landmark.x - prev.x) * lerpFactor;
                const smoothY = prev.y + (landmark.y - prev.y) * lerpFactor;
                previousLandmarksRef.current[i] = { x: smoothX, y: smoothY };
            });

            const smoothedLandmarks = previousLandmarksRef.current;

            // 2. CURSOR LOGIC (Index Finger Tip)
            const cursorX = (1 - smoothedLandmarks[8].x) * 2 - 1; 
            const cursorY = -(smoothedLandmarks[8].y * 2 - 1);    
            
            // --- SOURCE ARBITER: FORCE 'HAND' SOURCE ---
            if (state.started && state.treeState !== TreeState.ORDER) {
                 setCursor(cursorX, cursorY, true, 'HAND');
            } else {
                 // Even if inactive, we report HAND to keep mouse from stealing it instantly
                 setCursor(0, 0, false, 'HAND');
            }

            // 3. DRAW VISUALIZATION
            const fingerPaths = [
              [0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], 
              [0, 13, 14, 15, 16], [0, 17, 18, 19, 20], [0, 5, 9, 13, 17, 0]
            ];

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#FFD700';

            fingerPaths.forEach(path => {
                if (path.length < 2) return;
                ctx.beginPath();
                const start = smoothedLandmarks[path[0]];
                ctx.moveTo(start.x * width, start.y * height);
                for (let i = 1; i < path.length; i++) {
                    const pt = smoothedLandmarks[path[i]];
                    ctx.lineTo(pt.x * width, pt.y * height);
                }
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
                ctx.stroke();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(255, 255, 220, 0.9)';
                ctx.stroke();
            });

            smoothedLandmarks.forEach((landmark, i) => {
                const cx = landmark.x * width;
                const cy = landmark.y * height;
                const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6);
                gradient.addColorStop(0, '#FFFFFF');        
                gradient.addColorStop(0.3, '#FFD700');      
                gradient.addColorStop(1, 'rgba(255, 215, 0, 0)'); 
                
                ctx.shadowBlur = 10;
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
                ctx.fill();
            });

            // 4. GESTURE & INTERACTION LOGIC
            const gesture = detectGesture(rawLandmarks);
            
            ctx.font = 'bold 24px monospace';
            ctx.fillStyle = gesture === 'PINCH' ? '#FFD700' : (gesture === 'FIST' ? '#FF4444' : (gesture === 'OPEN' ? '#44FF44' : '#888888'));
            ctx.fillText(gesture, 20, 40);

            if (gesture === currentHeldGesture.current) {
                gestureHoldCounter.current++;
            } else {
                gestureHoldCounter.current = 0;
                currentHeldGesture.current = gesture;
            }

            // --- PALM MOVEMENT (ROTATION) ---
            const palmX = smoothedLandmarks[9].x;
            const palmY = smoothedLandmarks[9].y;
            
            if (prevPalmRef.current && state.started) {
                 const SENSITIVITY = 7.0; 
                 const dx = (palmX - prevPalmRef.current.x) * SENSITIVITY; 
                 const dy = (palmY - prevPalmRef.current.y) * SENSITIVITY;
                 
                 // Mode A: Scene Rotation (Earth Spin)
                 if (state.treeState === TreeState.CHAOS && gesture === 'OPEN') {
                      const rotX = state.sceneRotation.x + dy; 
                      const rotY = state.sceneRotation.y - dx; 
                      setSceneRotation(rotX, rotY, 'HAND'); // Force Hand Source
                 }

                 // Mode B: Photo Inspection (360 Spin)
                 if (state.treeState === TreeState.PHOTO_FOCUS && gesture === 'PINCH') {
                      const rotX = state.photoRotation.x + dy * 2.0; 
                      const rotY = state.photoRotation.y - dx * 2.0;
                      setPhotoRotation(rotX, rotY, 'HAND'); // Force Hand Source
                 }
            }
            prevPalmRef.current = { x: palmX, y: palmY };

            // --- STATE TRANSITIONS ---
            if (gestureHoldCounter.current > 3 && state.started) {
                
                if (gesture === 'FIST' && state.treeState !== TreeState.ORDER) {
                    setTreeState(TreeState.ORDER);
                    setSceneRotation(0, 0, 'HAND'); 
                    triggerFeedback('FIST');
                } 
                else if (gesture === 'OPEN' && state.treeState === TreeState.ORDER) {
                    setTreeState(TreeState.CHAOS);
                    triggerFeedback('OPEN');
                }
                else if (gesture === 'PINCH' && state.treeState === TreeState.CHAOS) {
                    if (state.hoveredPhotoIndex !== null) {
                        setTreeState(TreeState.PHOTO_FOCUS);
                        setSelectedPhotoIndex(state.hoveredPhotoIndex);
                        triggerFeedback('PINCH');
                        setPhotoRotation(0, 0, 'HAND'); 
                    }
                }
                else if (gesture !== 'PINCH' && state.treeState === TreeState.PHOTO_FOCUS) {
                     setTreeState(TreeState.CHAOS);
                     setSelectedPhotoIndex(null);
                     triggerFeedback('OPEN');
                }
            }
            
         } else {
            // No hand detected
            previousLandmarksRef.current = [];
            gestureHoldCounter.current = 0;
            currentHeldGesture.current = 'NEUTRAL';
            prevPalmRef.current = null;
            // DO NOT call setCursor(false) here. Let the cursor stay or let Mouse take over.
         }
      }
      
      animationFrameId = requestAnimationFrame(() => predictWebcam(landmarker));
    };

    setupHandTracking();
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (handLandmarker) handLandmarker.close();
    };
  }, []);

  return (
    <div className={`absolute top-5 right-5 z-50 w-64 rounded-xl border ${borderStyle} overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.6)] bg-black/40 backdrop-blur-md transition-all duration-300`}>
      <div className="relative aspect-[4/3]">
        {/* Error Overlay */}
        {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 p-4 text-center">
                <span className="text-red-500 font-bold text-2xl mb-2">⚠</span>
                <span className="text-red-400 cinzel text-[10px] tracking-widest uppercase">{error}</span>
                <span className="text-gray-500 lato text-[9px] mt-1 tracking-wider">MOUSE CONTROLS ENABLED</span>
            </div>
        )}

        {!isLoaded && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-[#FFD700]/50 text-[10px] tracking-widest animate-pulse font-mono">
                INITIALIZING...
            </div>
        )}
        <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ 
                transform: 'scaleX(-1)', 
                filter: 'sepia(0.3) contrast(1.1) brightness(0.9)'
            }} 
        />
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }} 
        />
        <div className="absolute bottom-3 left-3 flex flex-col items-start gap-1 pointer-events-none z-30">
            <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isLoaded && !error ? 'bg-[#FFD700] shadow-[0_0_8px_#FFD700]' : 'bg-red-500'}`}></div>
                <span className={`cinzel text-[10px] font-bold tracking-widest opacity-90 drop-shadow-md ${feedbackText !== "HAND INTERFACE" ? 'text-white' : 'text-[#FFD700]'}`}>
                    {feedbackText}
                </span>
            </div>
        </div>
      </div>
    </div>
  );
};