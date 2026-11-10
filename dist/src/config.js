const freeze = (object) => {
  for (const value of Object.values(object)) {
    if (value && typeof value === 'object') freeze(value);
  }
  return Object.freeze(object);
};

export const CONFIG = freeze({
  board: { size: 24, initialLength: 6, pointsPerFood: 100, foodSeed: 0x5e7e17 },
  simulation: { fixedStep: 1 / 120, maxFrameDelta: 0.1, maxCatchupSteps: 13, inputBuffer: 2, clockEpsilon: 1e-9 },
  gameplay: {
    initialInterval: 0.155, minimumInterval: 0.075, acceleration: 0.0025,
    boostFactor: 0.58, boostDrain: 0.32, boostRecovery: 0.16, minimumBoost: 0.12,
    comboWindow: 6, maxCombo: 5, countdown: 2.4,
    obstaclePeriod: 9, obstacleWarning: 2.4, obstacleLimit: 60,
    fluxPeriod: 18, fluxDuration: 6, fluxSpeedFactor: 0.76,
    portalPeriod: 3, portalMinimumDistance: 7,
    foodEnergy: 0.12, obstacleBatch: 3, obstacleSafetyDistance: 5,
  },
  render: {
    maxPixelRatio: 2, balancedPixelRatio: 1.35, frameSample: 0.5,
    near: 0.1, far: 170, fieldOfView: Math.PI / 3.5,
    bloomScale: 0.5, bloomStrength: 0.65, exposure: 1.15,
    shadowSize: 1024, shadowExtent: 22, depthOfField: 1.8, radialBlur: 0.009,
    cameraSmoothing: 5, shakeDecay: 5, foodHeight: 0.9,
    particles: 640, stars: 85, particleGravity: 2.8,
    background: [0.018, 0.031, 0.033],
    mint: [0.32, 1, 0.71], teal: [0.04, 0.55, 0.58],
    amber: [1, 0.62, 0.19], danger: [1, 0.22, 0.3],
  },
  camera: { isometric: [19, 22, 24], topHeight: 32, chaseDistance: 8.5, chaseHeight: 9, lookAhead: 4, portraitFit: 1.08 },
  ui: { refreshInterval: 0.05, toastDuration: 2600, miniMapSize: 112 },
  audio: { master: 0.45, music: 0.22, effects: 0.7, tempo: 100, lookahead: 0.16, pollMs: 45, maxVoices: 48 },
  storage: { key: 'serpent-neon-protocol-v1', version: 1 },
  modes: {
    classic: { name: 'Néon', subtitle: 'Le classique, transcendé.', code: '01', wrap: false, speed: 1, multiplier: 1, color: '#81ffd1', description: 'Absorbez les noyaux. Évitez les murs et votre propre trace. Chaque noyau accélère le rythme.' },
    flux: { name: 'Flux', subtitle: 'Défiez les frontières.', code: '02', wrap: true, speed: 0.92, multiplier: 1.5, color: '#a8a0ff', description: 'Traversez les bords et les portails. Une surcharge accélère le temps toutes les 18 secondes.' },
    survival: { name: 'Survie', subtitle: 'L’arène se referme.', code: '03', wrap: false, speed: 1.05, multiplier: 2, color: '#ffc278', description: 'Des obstacles apparaissent toutes les 9 secondes. Les cases rouges annoncent leur arrivée : restez en mouvement.' },
  },
  cameras: [
    { id: 'isometric', name: 'Isométrique', short: 'ISO', description: 'Perspective de l’arène' },
    { id: 'top', name: 'Tactique', short: '2D', description: 'Vue verticale précise' },
    { id: 'chase', name: 'Poursuite', short: '3D', description: 'Gauche / droite : virages relatifs' },
  ],
});

export const DIRECTIONS = freeze({ up: { x: 0, z: -1 }, right: { x: 1, z: 0 }, down: { x: 0, z: 1 }, left: { x: -1, z: 0 } });
export const DIRECTION_NAMES = Object.freeze(['up', 'right', 'down', 'left']);
