export enum TreeState {
  CHAOS = 'CHAOS',
  FORMING = 'FORMING',
  ORDER = 'ORDER',
  PHOTO_FOCUS = 'PHOTO_FOCUS'
}

export interface ParticleData {
  id: number;
  speed: number;
  offset: number;
  color: string;
}

export interface OrnamentData {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  type: 'gold' | 'red' | 'gift';
}
