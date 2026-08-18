import './style.css';
import { Engine } from './core/engine';
import { World } from './world/world';

const stage = document.getElementById('stage')!;

const engine = new Engine(stage);
const world = new World(engine);

engine.start();

window.addEventListener('beforeunload', () => {
  engine.dispose();
  world.dispose();
});
