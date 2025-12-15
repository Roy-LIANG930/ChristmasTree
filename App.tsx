import React from 'react';
import { Scene } from './components/Scene';
import { Overlay } from './components/Overlay';
import { HandTracker } from './components/HandTracker';
import { MouseController } from './components/MouseController';
import { useAppStore } from './store';

const App: React.FC = () => {
  const started = useAppStore((state) => state.started);

  return (
    // Add cursor-none when started so we only see the Golden 3D Cursor
    <div className={`relative w-full h-screen bg-black overflow-hidden ${started ? 'cursor-none' : ''}`}>
      {/* Scene Container with Blur/Grayscale Transition */}
      <div className={`w-full h-full transition-all duration-1000 ease-in-out ${started ? 'blur-0 grayscale-0' : 'blur-md grayscale'}`}>
        <Scene />
      </div>
      <Overlay />
      <HandTracker />
      <MouseController />
    </div>
  );
};

export default App;