import { Vector2, Vector3 } from 'three';

export interface PointerState {
  ndc: Vector2;
  world: Vector3;
  worldPlane: Vector3;
  speed: number;
  down: boolean;
  lastMoveAt: number;
  active: boolean;
  velocity: Vector2;
}

export interface ScrollState {
  progress: number;
  velocity: number;
  target: number;
  wheel: number;
}

export class InputState {
  pointer: PointerState;
  scroll: ScrollState;
  keys = new Set<string>();

  constructor() {
    this.pointer = {
      ndc: new Vector2(),
      world: new Vector3(),
      worldPlane: new Vector3(),
      speed: 0,
      down: false,
      lastMoveAt: 0,
      active: false,
      velocity: new Vector2(),
    };
    this.scroll = {
      progress: 0,
      velocity: 0,
      target: 0,
      wheel: 0,
    };
  }
}
