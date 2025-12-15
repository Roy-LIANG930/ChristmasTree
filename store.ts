import { create } from 'zustand';
import { TreeState } from './types';

interface AppState {
  treeState: TreeState;
  setTreeState: (state: TreeState) => void;
  toggleState: () => void;
  
  isReady: boolean;
  setIsReady: (ready: boolean) => void;
  started: boolean;
  start: () => void;
  
  // Asset Management
  assets: {
    images: string[];
    audio: string;
  };
  setAssets: (images: string[], audio: string) => void;

  // --- INTERACTION STATE ---
  inputSource: 'MOUSE' | 'HAND';
  lastHandActivity: number; // Timestamp

  // Interaction Setters with Source Arbitration
  setCursor: (x: number, y: number, active: boolean, source: 'MOUSE' | 'HAND') => void;
  setSceneRotation: (x: number, y: number, source: 'MOUSE' | 'HAND') => void;
  setPhotoRotation: (x: number, y: number, source: 'MOUSE' | 'HAND') => void;

  // Read-only state for components
  cursor: { x: number; y: number; active: boolean }; 
  sceneRotation: { x: number; y: number };
  photoRotation: { x: number; y: number };

  // Photo Interaction
  hoveredPhotoIndex: number | null;
  setHoveredPhotoIndex: (index: number | null) => void;
  
  selectedPhotoIndex: number | null;
  setSelectedPhotoIndex: (index: number | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  treeState: TreeState.ORDER,
  setTreeState: (state) => set({ treeState: state }),
  toggleState: () => set((state) => {
    const nextState = state.treeState === TreeState.ORDER ? TreeState.CHAOS : TreeState.ORDER;
    const nextRotation = nextState === TreeState.ORDER ? { x: 0, y: 0 } : state.sceneRotation;
    
    return {
      treeState: nextState,
      sceneRotation: nextRotation
    };
  }),
  
  isReady: false,
  setIsReady: (ready) => set({ isReady: ready }),
  started: false,
  start: () => set({ started: true }),
  
  assets: {
    images: [
        '/images/1.jpg',
        '/images/2.jpg',
        '/images/3.jpg',
        '/images/4.jpg',
        '/images/5.jpg',
        '/images/6.jpg',
        '/images/7.jpg',
        '/images/8.jpg',
        '/images/9.jpg',
        '/images/10.jpg',
        '/images/11.jpg',
        '/images/12.jpg',
        '/images/13.jpg',
        '/images/14.jpg',
        '/images/15.jpg',
        '/images/16.jpg',
        '/images/17.jpg',
        '/images/18.jpg',
        '/images/19.jpg',
        '/images/20.jpg',
        '/images/21.jpg',
        '/images/22.jpg',
        '/images/23.jpg',
        '/images/24.jpg',
        '/images/25.jpg',
        '/images/26.jpg',
        '/images/27.jpg',
        '/images/28.jpg',
        '/images/29.jpg',
        '/images/30.jpg',
    ],
    audio: '/music/bgm.mp3'
  },
  setAssets: (images, audio) => set({ assets: { images, audio } }),

  // --- ARBITER LOGIC ---
  inputSource: 'MOUSE',
  lastHandActivity: 0,

  cursor: { x: 0, y: 0, active: false },
  
  setCursor: (x, y, active, source) => {
      const state = get();
      const now = Date.now();

      if (source === 'HAND') {
          // Hand always wins and updates timestamp
          set({ 
              cursor: { x, y, active }, 
              inputSource: 'HAND', 
              lastHandActivity: now 
          });
      } else {
          // Mouse only works if Hand hasn't been active for 1 second
          if (now - state.lastHandActivity > 1000) {
              set({ 
                  cursor: { x, y, active }, 
                  inputSource: 'MOUSE' 
              });
          }
      }
  },

  sceneRotation: { x: 0, y: 0 },
  setSceneRotation: (x, y, source) => {
      const state = get();
      const now = Date.now();

      if (source === 'HAND') {
          set({ 
              sceneRotation: { x, y }, 
              inputSource: 'HAND', 
              lastHandActivity: now 
          });
      } else {
          if (now - state.lastHandActivity > 1000) {
              set({ 
                  sceneRotation: { x, y }, 
                  inputSource: 'MOUSE' 
              });
          }
      }
  },

  photoRotation: { x: 0, y: 0 },
  setPhotoRotation: (x, y, source) => {
      const state = get();
      const now = Date.now();
      
      if (source === 'HAND') {
          set({ 
              photoRotation: { x, y }, 
              inputSource: 'HAND', 
              lastHandActivity: now 
          });
      } else {
           if (now - state.lastHandActivity > 1000) {
              set({ 
                  photoRotation: { x, y }, 
                  inputSource: 'MOUSE' 
              });
           }
      }
  },

  hoveredPhotoIndex: null,
  setHoveredPhotoIndex: (index) => set({ hoveredPhotoIndex: index }),

  selectedPhotoIndex: null,
  setSelectedPhotoIndex: (index) => set({ selectedPhotoIndex: index }),
}));