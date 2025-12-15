import React, { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { TreeState } from '../types';

export const Overlay: React.FC = () => {
  const { treeState, toggleState, isReady, started, start, assets } = useAppStore();
  const isOrdered = treeState === TreeState.ORDER;
  
  // Audio Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);

  // Main Experience Start
  const handleStart = () => {
    if (isReady) {
        start();
        // Slight delay to ensure DOM update picked up the new src if changed
        setTimeout(() => {
            if (audioRef.current && !audioError) {
                audioRef.current.volume = 0.5;
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => setIsPlaying(true))
                        .catch(e => {
                            // Auto-play policy might block this
                            if (e.name !== 'AbortError') {
                                console.log("Audio play failed on start:", e);
                            }
                            setIsPlaying(false);
                        });
                }
            }
        }, 100);
    }
  };

  const toggleMusic = () => {
      if (!audioRef.current || audioError) return;
      
      if (audioRef.current.paused) {
          audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
      } else {
          audioRef.current.pause();
          setIsPlaying(false);
      }
  };

  // Reload audio when asset changes (rare in static mode, but good practice)
  useEffect(() => {
      if (audioRef.current) {
          audioRef.current.load();
      }
  }, [assets.audio]);

  return (
    <>
      <audio 
        ref={audioRef} 
        loop 
        onError={() => setAudioError(true)}
      >
        <source src={assets.audio} type="audio/mpeg" />
      </audio>

      {/* --- CINEMATIC INTRO (Initial View) --- */}
      <div 
        className={`absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center transition-all duration-1000 ease-in-out ${started ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <div className="text-center p-12 max-w-2xl border-y border-[#FFD700]/20 bg-black/40">
            {/* Title */}
            <h1 className="font-serif text-4xl md:text-6xl text-[#C5A059] mb-4 tracking-wider italic drop-shadow-lg">
              A Signature Gift For You
            </h1>
            
            {/* Subtitle */}
            <p className="lato text-gray-400 text-[10px] md:text-xs tracking-[0.3em] uppercase mb-12">
              Exclusively Created with Roy
            </p>

            {/* Button */}
            <button
              onClick={handleStart}
              disabled={!isReady}
              className={`
                group relative px-12 py-3 overflow-hidden border border-[#C5A059] 
                transition-all duration-500 ease-out
                ${isReady ? 'hover:bg-[#C5A059]/10 cursor-pointer' : 'opacity-50 cursor-not-allowed'}
              `}
            >
                <div className="absolute inset-0 w-0 bg-[#C5A059] transition-all duration-[400ms] ease-out group-hover:w-full opacity-20"></div>
                <span className={`cinzel text-sm md:text-base tracking-[0.2em] uppercase font-bold text-[#C5A059] group-hover:text-[#FFD700] transition-colors`}>
                    {isReady ? "Open Gift" : "Wrapping..."}
                </span>
            </button>
            
            {audioError && (
              <div className="mt-8 border border-[#FFD700]/30 bg-black/50 px-6 py-2 flex items-center gap-3 justify-center">
                  <div className="w-1.5 h-1.5 bg-[#FFD700] rounded-full animate-pulse"></div>
                  <span className="cinzel text-[#FFD700] text-[10px] tracking-widest opacity-80">
                      AUDIO FILE MISSING ({assets.audio})
                  </span>
              </div>
            )}
        </div>
      </div>

      {/* --- HUD LAYER (Visible after start) --- */}
      <div 
        className={`absolute inset-0 pointer-events-none z-40 flex flex-col justify-between p-8 text-white transition-opacity duration-1000 delay-1000 ${started ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="flex flex-col items-center mt-4 opacity-90 relative w-full pointer-events-auto">
          <h1 className="cinzel text-2xl md:text-3xl font-bold tracking-widest text-[#FFD700] drop-shadow-[0_0_10px_rgba(255,215,0,0.3)] text-center">
            榴莲&咪宝的圣诞树
          </h1>
          
          <div className="mt-2 flex items-center gap-2">
            {audioError ? (
                 <div className="flex items-center gap-2 border border-[#C5A059]/30 px-3 py-1 bg-black/40 rounded-full">
                     <span className="lato text-[9px] tracking-widest text-[#C5A059] uppercase">
                        Silent Mode
                     </span>
                 </div>
            ) : (
                <>
                    <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-[#FFD700] shadow-[0_0_5px_#FFD700] animate-pulse' : 'bg-gray-600'}`}></div>
                    <span className="lato text-[10px] tracking-widest text-[#C5A059] uppercase">
                        {isPlaying ? "Now Playing" : "Music Paused"}
                    </span>
                </>
            )}
          </div>
          
          {!audioError && (
              <button 
                 onClick={toggleMusic}
                 className="mt-2 cinzel text-[10px] border border-[#C5A059]/50 px-3 py-1 hover:border-[#FFD700] hover:text-[#FFD700] transition-colors rounded-full uppercase tracking-widest text-[#C5A059]"
              >
                 {isPlaying ? "Pause Music" : "Play Music"}
              </button>
          )}
        </div>

        <div className="mb-8 flex flex-col items-center pointer-events-auto">
          <p className="lato text-sm text-gray-400 mb-4 tracking-widest text-center max-w-md drop-shadow-md">
              {isOrdered 
                  ? "The tree stands in perfect harmony." 
                  : "Chaos reigns. Bring the ornaments together."}
          </p>
          
          <button
            onClick={toggleState}
            className={`
              cinzel px-8 py-3 rounded-full border border-[#FFD700] 
              transition-all duration-500 ease-out
              hover:bg-[#FFD700] hover:text-black hover:shadow-[0_0_20px_#FFD700]
              uppercase tracking-widest font-bold text-sm backdrop-blur-sm
              ${isOrdered ? 'bg-black/30 text-[#FFD700]' : 'bg-[#C41E3A] border-[#C41E3A] text-white'}
            `}
          >
            {isOrdered ? "Unleash Chaos" : "Assemble Tree"}
          </button>

          <div className="mt-4 text-[10px] text-gray-500 font-mono">
              v3.0 Classic Edition
          </div>
        </div>
        
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"></div>
      </div>
    </>
  );
};