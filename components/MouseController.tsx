import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { TreeState } from '../types';

export const MouseController: React.FC = () => {
  // Use refs for tracking drag state to avoid stale closures in event listeners
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });
  const dragDistance = useRef(0);

  // We access the store via getState() inside events
  const setCursor = useAppStore((state) => state.setCursor);
  const setSceneRotation = useAppStore((state) => state.setSceneRotation);
  const setPhotoRotation = useAppStore((state) => state.setPhotoRotation);
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = useAppStore.getState();
      
      // 1. Update Golden Cursor Position (Normalized -1 to 1)
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      
      if (state.started) {
        // Attempt to update with MOUSE source. Store will block if Hand is active.
        setCursor(x, y, true, 'MOUSE');
      }

      // 2. Handle Rotation (If Dragging)
      if (isDragging.current && state.started) {
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        
        dragDistance.current += Math.abs(dx) + Math.abs(dy);

        const SENSITIVITY = 0.005;

        if (state.treeState === TreeState.CHAOS) {
          setSceneRotation(
             state.sceneRotation.x + dy * SENSITIVITY,
             state.sceneRotation.y + dx * SENSITIVITY,
             'MOUSE'
          );
        } else if (state.treeState === TreeState.PHOTO_FOCUS) {
          setPhotoRotation(
             state.photoRotation.x + dy * SENSITIVITY * 2.0,
             state.photoRotation.y + dx * SENSITIVITY * 2.0,
             'MOUSE'
          );
        }
      }
      
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!useAppStore.getState().started) return;
      isDragging.current = true;
      startPos.current = { x: e.clientX, y: e.clientY };
      lastPos.current = { x: e.clientX, y: e.clientY };
      dragDistance.current = 0;
    };

    const handleMouseUp = (e: MouseEvent) => {
      isDragging.current = false;
      const state = useAppStore.getState();
      if (!state.started) return;

      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input') || target.closest('a')) {
          return;
      }

      // 3. Click Logic (Only if NOT dragged significantly)
      if (dragDistance.current < 5) {
        
        if (state.treeState === TreeState.CHAOS) {
            if (state.hoveredPhotoIndex !== null) {
                state.setTreeState(TreeState.PHOTO_FOCUS);
                state.setSelectedPhotoIndex(state.hoveredPhotoIndex);
                state.setPhotoRotation(0, 0, 'MOUSE');
            } else {
                state.setTreeState(TreeState.ORDER);
                state.setSceneRotation(0, 0, 'MOUSE'); 
            }
        } 
        else if (state.treeState === TreeState.ORDER) {
            state.setTreeState(TreeState.CHAOS);
        }
        else if (state.treeState === TreeState.PHOTO_FOCUS) {
            state.setTreeState(TreeState.CHAOS);
            state.setSelectedPhotoIndex(null);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setCursor, setSceneRotation, setPhotoRotation]);

  return null;
};