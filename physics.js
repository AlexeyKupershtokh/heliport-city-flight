const GRAVITY = 9.81;
const MASS = 1200;
const RADIUS = 2.2;
const FIXED_STEP = 1 / 120;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function createFlight(spawn = { x: -130, y: 75, z: 680 }) {
  return {
    position: { ...spawn },
    velocity: { x: 0, y: 0, z: 0 },
    pitch: 0,
    roll: 0,
    yaw: 0,
    angularVelocity: { x: 0, y: 0, z: 0 },
    collective: 0.5,
    rotorThrust: MASS * GRAVITY,
    crashed: false,
    grounded: false,
  };
}

// Sweeping the fuselage through expanded boxes prevents tunnelling at high speed.
function boxHit(x, y, z, dx, dy, dz, box) {
  let enter = 0;
  let exit = 1;
  const origin = [x, y, z];
  const delta = [dx, dy, dz];
  const min = [
    box.x - box.w / 2 - RADIUS,
    (box.y ?? 0) - RADIUS,
    box.z - box.d / 2 - RADIUS,
  ];
  const max = [
    box.x + box.w / 2 + RADIUS,
    (box.y ?? 0) + box.h + RADIUS,
    box.z + box.d / 2 + RADIUS,
  ];
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(delta[axis]) < 1e-10) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return Infinity;
      continue;
    }
    const a = (min[axis] - origin[axis]) / delta[axis];
    const b = (max[axis] - origin[axis]) / delta[axis];
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return Infinity;
  }
  return enter;
}

function crash(state) {
  state.crashed = true;
  state.velocity.x = state.velocity.y = state.velocity.z = 0;
  state.angularVelocity.x =
    state.angularVelocity.y =
    state.angularVelocity.z =
      0;
}

// Arcade assists amplify horizontal thrust, compensate tilt-induced altitude loss,
// and turn momentum with the nose. Drag and damped angular response retain inertia.
// shortcut: no blade aerodynamics or vortex-ring state; upgrade for training use.
export function stepFlight(state, input, dt, obstacles = [], bounds = 1200) {
  if (state.crashed || !Number.isFinite(dt) || dt <= 0) return state;
  const duration = Math.min(dt, 0.25);
  const steps = Math.ceil(duration / FIXED_STEP);
  const h = duration / steps;
  const pitch = clamp(input.pitch ?? 0, -1, 1);
  const roll = clamp(input.roll ?? 0, -1, 1);
  const yaw = clamp(input.yaw ?? 0, -1, 1);
  state.collective = clamp(input.collective ?? 0.5, 0, 1);
  const p = state.position;
  const v = state.velocity;
  const av = state.angularVelocity;

  for (let step = 0; step < steps; step++) {
    const horizontalSpeed = Math.hypot(v.x, v.z);
    av.x += ((pitch * 0.48 - state.pitch) * 42 - av.x * 11) * h;
    av.z += ((roll * 0.55 - state.roll) * 42 - av.z * 11) * h;
    const turnRate = Math.min(1.4, 55 / Math.max(horizontalSpeed, 1));
    av.y += (yaw * turnRate - av.y) * (1 - Math.exp(-h * 6));
    state.pitch += av.x * h;
    state.roll += av.z * h;
    const turn = av.y * h;
    state.yaw += turn;
    const turnedX = v.x * Math.cos(turn) - v.z * Math.sin(turn);
    v.z = v.x * Math.sin(turn) + v.z * Math.cos(turn);
    v.x = turnedX;
    state.rotorThrust +=
      (state.collective * 2 * MASS * GRAVITY - state.rotorThrust) *
      (1 - Math.exp(-h / 0.18));

    const verticalFactor = Math.cos(state.roll) * Math.cos(state.pitch);
    const thrust = state.rotorThrust / MASS / Math.max(0.4, verticalFactor);
    const localX = Math.sin(state.roll) * Math.cos(state.pitch);
    const localZ = -Math.sin(state.pitch);
    const cosYaw = Math.cos(state.yaw);
    const sinYaw = Math.sin(state.yaw);
    const drag = 0.16 + horizontalSpeed * 0.003;
    v.x +=
      ((localX * cosYaw - localZ * sinYaw) * thrust * 3.9 - v.x * drag) * h;
    v.y +=
      (verticalFactor * thrust -
        GRAVITY -
        v.y * (0.13 + Math.abs(v.y) * 0.01)) *
      h;
    v.z +=
      ((localX * sinYaw + localZ * cosYaw) * thrust * 3.9 - v.z * drag) * h;

    const dx = v.x * h;
    const dy = v.y * h;
    const dz = v.z * h;
    let impact = Infinity;
    for (const box of obstacles) {
      // Most city blocks are far from the short movement segment.
      if (
        Math.abs(p.x - box.x) > box.w / 2 + RADIUS + Math.abs(dx) ||
        Math.abs(p.z - box.z) > box.d / 2 + RADIUS + Math.abs(dz)
      )
        continue;
      impact = Math.min(impact, boxHit(p.x, p.y, p.z, dx, dy, dz, box));
    }
    if (impact <= 1) {
      p.x += dx * impact;
      p.y += dy * impact;
      p.z += dz * impact;
      crash(state);
      break;
    }
    p.x += dx;
    p.y += dy;
    p.z += dz;
    state.grounded = p.y <= RADIUS;
    if (state.grounded) {
      p.y = RADIUS;
      if (
        v.y < -4 ||
        Math.hypot(v.x, v.z) > 9 ||
        Math.abs(state.pitch) > 0.3 ||
        Math.abs(state.roll) > 0.3
      ) {
        crash(state);
        break;
      }
      v.y = Math.max(0, v.y);
      v.x *= Math.exp(-3 * h);
      v.z *= Math.exp(-3 * h);
    }
    for (const axis of ["x", "z"]) {
      if (Math.abs(p[axis]) > bounds - RADIUS) {
        p[axis] = clamp(p[axis], -bounds + RADIUS, bounds - RADIUS);
        if (p[axis] * v[axis] > 0) v[axis] *= -0.15;
      }
    }
  }
  return state;
}

export function crossesGate(previous, current, gate) {
  const length = Math.hypot(gate.nx, gate.nz);
  if (!length || gate.radius <= 0) return false;
  const nx = gate.nx / length;
  const nz = gate.nz / length;
  const start = (previous.x - gate.x) * nx + (previous.z - gate.z) * nz;
  const end = (current.x - gate.x) * nx + (current.z - gate.z) * nz;
  if (start === 0 || start * end > 0 || start === end) return false;
  const t = start / (start - end);
  const x = previous.x + (current.x - previous.x) * t - gate.x;
  const y = previous.y + (current.y - previous.y) * t - gate.y;
  const z = previous.z + (current.z - previous.z) * t - gate.z;
  return (x * nz - z * nx) ** 2 + y ** 2 <= gate.radius ** 2;
}
