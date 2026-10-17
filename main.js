import { createCity } from "./city.js";
import { createFlight, crossesGate, stepFlight } from "./physics.js";
import * as THREE from "./vendor/three.module.js";

const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const canvas = $("world");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch {
  $("error").hidden = false;
  $("error").textContent =
    "Не удалось запустить WebGL2. Включите аппаратное ускорение в настройках браузера и перезагрузите страницу.";
  throw new Error("WebGL2 unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#b5c8ca");
scene.fog = new THREE.Fog("#b5c8ca", 520, 2250);
scene.add(new THREE.HemisphereLight("#e7f2ec", "#6d7561", 2.0));
const sun = new THREE.DirectionalLight("#ffe2b7", 2.3);
sun.position.set(-420, 700, 250);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(
  57,
  innerWidth / innerHeight,
  0.12,
  3500,
);
let city = createCity(scene, 42);
let obstacles = city.collisionBoxes || [...city.buildings, ...city.bridges];
let flight = createFlight(city.spawn);
const input = { pitch: 0, roll: 0, yaw: 0, collective: 0.5 };
let active = false,
  started = false,
  cockpit = false,
  mouseMode = false,
  mode = "arcade";
let gateIndex = 0,
  elapsed = 0,
  seed = 42,
  toastTimeout;
const keys = new Set();
const stick = { pitch: 0, roll: 0, yaw: 0 };
const routePoints = [
  [-130, 85, 470],
  [-60, 100, 260],
  [100, 110, 40],
  [160, 130, -200],
  [90, 140, -450],
  [-100, 160, -650],
  [-430, 150, -570],
  [-620, 115, -280],
  [-560, 100, 80],
  [-400, 90, 350],
  [-220, 80, 560],
  [-130, 75, 680],
];
const gateGeometry = new THREE.TorusGeometry(19, 0.7, 6, 48);
const activeMaterial = new THREE.MeshBasicMaterial({ color: "#ffb16e" });
const nextMaterial = new THREE.MeshBasicMaterial({
  color: "#e5e9d8",
  transparent: true,
  opacity: 0.48,
});
const doneMaterial = new THREE.MeshBasicMaterial({
  color: "#98cfb2",
  transparent: true,
  opacity: 0.38,
});
const gates = routePoints.map((point, i) => {
  const prior = i
    ? routePoints[i - 1]
    : [city.spawn.x, city.spawn.y, city.spawn.z];
  const dx = point[0] - prior[0],
    dz = point[2] - prior[2],
    length = Math.hypot(dx, dz);
  const mesh = new THREE.Mesh(
    gateGeometry,
    i === 0 ? activeMaterial : nextMaterial,
  );
  mesh.position.set(...point);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(dx / length, 0, dz / length),
  );
  scene.add(mesh);
  return {
    x: point[0],
    y: point[1],
    z: point[2],
    nx: dx / length,
    nz: dz / length,
    radius: 16.5,
    mesh,
  };
});

function createHelicopter() {
  const group = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: "#dc7746" });
  const dark = new THREE.MeshLambertMaterial({ color: "#243737" });
  const glass = new THREE.MeshPhongMaterial({
    color: "#345357",
    shininess: 90,
    specular: "#b1d3d2",
  });
  const metal = new THREE.MeshLambertMaterial({ color: "#c6c9b8" });
  const part = (geometry, material, position, scale = [1, 1, 1]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    group.add(mesh);
    return mesh;
  };
  part(
    new THREE.SphereGeometry(1, 16, 10),
    orange,
    [0, 0, 0],
    [1.5, 1.45, 3.1],
  );
  part(
    new THREE.SphereGeometry(1, 16, 10),
    glass,
    [0, 0.35, -1.3],
    [1.44, 1.21, 1.92],
  );
  part(
    new THREE.BoxGeometry(0.12, 2.05, 0.12),
    orange,
    [0, 0.8, -2.65],
  ).rotation.x = -0.45;
  part(new THREE.BoxGeometry(2.7, 0.14, 0.16), orange, [0, 1.26, -1.63]);
  part(new THREE.BoxGeometry(2.8, 0.18, 2.8), orange, [0, -0.55, -0.7]);
  part(
    new THREE.SphereGeometry(1, 12, 8),
    dark,
    [0, 1.25, 0.8],
    [1.05, 0.65, 1.7],
  );
  const boom = part(
    new THREE.CylinderGeometry(0.19, 0.65, 6.3, 8),
    orange,
    [0, 0.7, 5.2],
  );
  boom.rotation.x = Math.PI / 2;
  const fin = part(
    new THREE.BoxGeometry(0.16, 2.1, 1.65),
    orange,
    [0, 1.6, 7.6],
  );
  fin.rotation.x = 0.25;
  part(new THREE.BoxGeometry(3.2, 0.1, 0.75), orange, [0, 0.9, 6.7]);
  const tube = (start, end, radius, material) => {
    const a = new THREE.Vector3(...start),
      b = new THREE.Vector3(...end),
      direction = b.clone().sub(a);
    const p = part(
      new THREE.CylinderGeometry(radius, radius, direction.length(), 6),
      material,
      a.add(b).multiplyScalar(0.5).toArray(),
    );
    p.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return p;
  };
  for (const x of [-1.5, 1.5]) {
    tube([x, -1.9, -2.4], [x, -1.9, 2.6], 0.1, dark);
    tube([x, -1.9, -2.4], [x, -1.65, -2.85], 0.1, dark);
    for (const z of [-1.15, 1.4])
      tube([x * 0.6, -0.8, z], [x, -1.9, z], 0.08, metal);
  }
  part(new THREE.CylinderGeometry(0.16, 0.2, 1.0, 8), metal, [0, 2.1, 0.3]);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.6, 0.3);
  group.add(rotor);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 6.1), dark);
    const holder = new THREE.Group();
    holder.rotation.y = (i * Math.PI) / 2;
    blade.position.z = 2.7;
    holder.add(blade);
    rotor.add(holder);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.06, 0.4), metal);
    tip.position.z = 5.55;
    holder.add(tip);
  }
  const tail = new THREE.Group();
  tail.position.set(0.32, 1.2, 7.65);
  group.add(tail);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 2, 0.12), dark);
    blade.rotation.x = (i * Math.PI) / 2;
    tail.add(blade);
  }
  part(new THREE.BoxGeometry(0.08, 0.2, 0.5), metal, [1.48, 0.1, 0.8]);
  part(new THREE.BoxGeometry(0.08, 0.2, 0.5), metal, [-1.48, 0.1, 0.8]);
  group.rotation.order = "YZX";
  scene.add(group);
  return { group, rotor, tail };
}
const heli = createHelicopter();
const targetPosition = new THREE.Vector3(),
  desiredCamera = new THREE.Vector3(),
  lookTarget = new THREE.Vector3();
const direction = new THREE.Vector3(),
  projected = new THREE.Vector3();
const previous = { x: 0, y: 0, z: 0 };
const mapBase = document.createElement("canvas");
mapBase.width = mapBase.height = 400;
const mapBaseCtx = mapBase.getContext("2d");
const mapCtx = $("minimap").getContext("2d");
city.drawMap(mapBaseCtx, 400);
let audio,
  oscillator,
  rotorGain,
  audioEnabled = false;
function updateAudio() {
  if (audio && rotorGain) {
    rotorGain.gain.setTargetAtTime(
      audioEnabled && active ? 0.035 : 0,
      audio.currentTime,
      0.2,
    );
    oscillator.frequency.setTargetAtTime(
      24 + flight.collective * 23,
      audio.currentTime,
      0.2,
    );
  }
}
function toggleAudio() {
  if (!audio) {
    audio = new AudioContext();
    oscillator = audio.createOscillator();
    oscillator.type = "sawtooth";
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 190;
    rotorGain = audio.createGain();
    rotorGain.gain.value = 0;
    oscillator.connect(filter).connect(rotorGain).connect(audio.destination);
    oscillator.start();
  }
  audio.resume();
  audioEnabled = !audioEnabled;
  $("audio-button").setAttribute(
    "aria-label",
    audioEnabled ? "Выключить звук" : "Включить звук",
  );
  $("audio-button").style.color = audioEnabled ? "#ffc394" : "";
  updateAudio();
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("toast").classList.remove("visible"), 2600);
}
function neutral(notify = true) {
  dragId = null;
  joystickId = null;
  keys.clear();
  stick.pitch = stick.roll = stick.yaw = 0;
  input.pitch = input.roll = input.yaw = 0;
  input.collective = 0.5;
  $("collective").value = 50;
  $("joystick").firstElementChild.style.transform = "translate(-50%,-50%)";
  if (notify) toast("Нейтраль · скорость гасится постепенно");
}
function setActive(value) {
  active = value && started && !flight.crashed && gateIndex < gates.length;
  $("pause-label").textContent = active ? "Пауза" : "Продолжить";
  $("state-label").textContent = active ? "В ПОЛЁТЕ" : "ПАУЗА";
  $("flight-state").hidden = !started;
  if (!active) {
    dragId = null;
    joystickId = null;
    keys.clear();
    stick.pitch = stick.roll = stick.yaw = 0;
  }
  updateAudio();
}
function start() {
  started = true;
  $("intro").hidden = true;
  $("mission").hidden = false;
  document.body.classList.remove("intro-visible");
  setActive(true);
  toast("↑ — набрать высоту · W — полететь вперёд");
}
function reset() {
  flight = createFlight(city.spawn);
  gateIndex = 0;
  elapsed = 0;
  neutral(false);
  $("result").hidden = true;
  gates.forEach((gate, i) => {
    gate.mesh.material = i === 0 ? activeMaterial : nextMaterial;
  });
  $("progress-fill").style.width = "0%";
  if (started) setActive(true);
  else setActive(false);
  updateHUD();
}
function setMode(next) {
  mode = next;
  $("free-mode").classList.toggle("selected", mode === "free");
  $("arcade-mode").classList.toggle("selected", mode === "arcade");
  $("free-mode").setAttribute("aria-pressed", String(mode === "free"));
  $("arcade-mode").setAttribute("aria-pressed", String(mode === "arcade"));
  gates.forEach((g) => {
    g.mesh.visible = mode === "arcade";
  });
  $("mission-label").textContent =
    mode === "arcade" ? "ВОЗДУШНЫЙ МАРШРУТ" : "СВОБОДНЫЙ ПОЛЁТ";
  $("mission-title").textContent =
    mode === "arcade" ? "Над новым берегом" : "Исследуйте город";
  reset();
}
function setCamera() {
  cockpit = !cockpit;
  $("cockpit-frame").hidden = !cockpit;
  $("camera-label").textContent = cockpit ? "Из кабины" : "Вид сзади";
  heli.group.visible = !cockpit;
  toast(cockpit ? "Камера · из кабины" : "Камера · вид сзади");
}
function setMouse() {
  mouseMode = !mouseMode;
  neutral(false);
  document.body.classList.toggle("mouse-active", mouseMode);
  $("mouse-button").setAttribute("aria-pressed", String(mouseMode));
  $("input-label").textContent = mouseMode ? "Мышь" : "Клавиатура";
  toast(
    mouseMode
      ? "Зажмите мышь и ведите по небу · колесо — общий шаг"
      : "Клавиатура · WASD, QE, ↑↓",
  );
}
function finish(crashed) {
  setActive(false);
  $("result").hidden = false;
  $("result-kicker").textContent = crashed
    ? "ПОТЕРЯ КОНТАКТА"
    : "МАРШРУТ ЗАВЕРШЁН";
  $("result-title").textContent = crashed
    ? "Полёт завершён"
    : "Отличный полёт.";
  $("result-copy").textContent = crashed
    ? "Столкновение с поверхностью. Держите безопасную высоту и помните: вертолёту нужно время, чтобы затормозить."
    : `Все ${gates.length} ворот пройдены за ${formatTime(elapsed)}. Город ждёт следующего вылета.`;
}
function formatTime(time) {
  return `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
}
$("start-button").onclick = start;
$("neutral-button").onclick = () => neutral();
$("pause-button").onclick = () => {
  if (!started) start();
  else setActive(!active);
};
$("camera-button").onclick = setCamera;
$("mouse-button").onclick = setMouse;
$("audio-button").onclick = toggleAudio;
$("restart-button").onclick = reset;
$("free-mode").onclick = () => setMode("free");
$("arcade-mode").onclick = () => setMode("arcade");
$("collective").oninput = (e) =>
  (input.collective = Number(e.currentTarget.value) / 100);
$("new-city").onclick = () => {
  city.dispose();
  seed += 1;
  city = createCity(scene, seed);
  obstacles = city.collisionBoxes || [...city.buildings, ...city.bridges];
  city.drawMap(mapBaseCtx, 400);
  $("map-seed").textContent = `СЕКТОР ${String(seed).padStart(3, "0")}`;
  reset();
  toast(`Новый город · сектор ${seed}`);
};
let resumeAfterHelp = false;
$("help-button").onclick = () => {
  resumeAfterHelp = active;
  setActive(false);
  $("help-dialog").showModal();
};
function closeHelp() {
  $("help-dialog").close();
}
$("close-help").onclick = closeHelp;
$("help-done").onclick = closeHelp;
$("help-dialog").addEventListener("close", () => {
  if (resumeAfterHelp) setActive(true);
});
const flightKeys = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ArrowUp",
  "ArrowDown",
  "ShiftLeft",
  "ControlLeft",
  "Space",
];
addEventListener("keydown", (e) => {
  if (
    $("help-dialog").open ||
    e.target.matches(
      "input:not([type=range]),textarea,select,[contenteditable=true]",
    )
  )
    return;
  if (flightKeys.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === "Space") {
    neutral();
    return;
  }
  if (e.code === "KeyC") {
    setCamera();
    return;
  }
  if (e.code === "KeyM") {
    setMouse();
    return;
  }
  if (e.code === "KeyP" || e.code === "Escape") {
    if (started) setActive(!active);
    return;
  }
  if (e.code === "KeyR") {
    reset();
    return;
  }
  if (flightKeys.includes(e.code)) keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  if (active) setActive(false);
  keys.clear();
  stick.pitch = stick.roll = stick.yaw = 0;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setActive(false);
});
let dragId = null,
  dragOrigin = { x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => {
  if (!mouseMode || e.button !== 0) return;
  dragId = e.pointerId;
  dragOrigin = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!mouseMode || e.pointerId !== dragId) return;
  stick.roll = clamp((e.clientX - dragOrigin.x) / 170, -1, 1);
  stick.pitch = clamp((dragOrigin.y - e.clientY) / 170, -1, 1);
});
function releaseDrag() {
  dragId = null;
  stick.pitch = stick.roll = 0;
}
canvas.addEventListener("pointerup", releaseDrag);
canvas.addEventListener("pointercancel", releaseDrag);
canvas.addEventListener(
  "wheel",
  (e) => {
    if (!mouseMode) return;
    e.preventDefault();
    input.collective = clamp(input.collective - e.deltaY * 0.00045, 0, 1);
  },
  { passive: false },
);
const joystick = $("joystick");
let joystickId = null;
function moveJoystick(e) {
  const rect = joystick.getBoundingClientRect();
  const x = clamp((e.clientX - rect.left - rect.width / 2) / 34, -1, 1),
    y = clamp((e.clientY - rect.top - rect.height / 2) / 34, -1, 1);
  stick.roll = x;
  stick.pitch = -y;
  joystick.firstElementChild.style.transform = `translate(calc(-50% + ${x * 24}px),calc(-50% + ${y * 24}px))`;
}
joystick.addEventListener("pointerdown", (e) => {
  joystickId = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  moveJoystick(e);
});
joystick.addEventListener("pointermove", (e) => {
  if (e.pointerId === joystickId) moveJoystick(e);
});
for (const type of ["pointerup", "pointercancel"])
  joystick.addEventListener(type, () => {
    joystickId = null;
    stick.pitch = stick.roll = 0;
    joystick.firstElementChild.style.transform = "translate(-50%,-50%)";
  });
for (const [id, sign] of [
  ["yaw-left", -1],
  ["yaw-right", 1],
]) {
  const button = $(id);
  button.addEventListener("pointerdown", (e) => {
    button.setPointerCapture(e.pointerId);
    stick.yaw = sign;
  });
  for (const event of ["pointerup", "pointercancel"])
    button.addEventListener(event, () => (stick.yaw = 0));
}
function readInput(dt) {
  input.pitch = clamp(
    Number(keys.has("KeyW")) - Number(keys.has("KeyS")) + stick.pitch,
    -1,
    1,
  );
  input.roll = clamp(
    Number(keys.has("KeyD")) - Number(keys.has("KeyA")) + stick.roll,
    -1,
    1,
  );
  input.yaw = clamp(
    Number(keys.has("KeyE")) - Number(keys.has("KeyQ")) + stick.yaw,
    -1,
    1,
  );
  input.collective = clamp(
    input.collective +
      dt *
        0.25 *
        (Number(keys.has("ArrowUp") || keys.has("ShiftLeft")) -
          Number(keys.has("ArrowDown") || keys.has("ControlLeft"))),
    0,
    1,
  );
}
function updatePhysics(dt) {
  readInput(dt);
  Object.assign(previous, flight.position);
  stepFlight(flight, input, dt, obstacles, city.bounds);
  elapsed += dt;
  if (
    flight.position.y < 3.5 &&
    Math.abs(
      flight.position.x - (80 + Math.sin(flight.position.z / 350) * 140),
    ) < 62
  ) {
    flight.crashed = true;
  }
  if (flight.crashed) {
    finish(true);
    return;
  }
  if (
    mode === "arcade" &&
    gateIndex < gates.length &&
    crossesGate(previous, flight.position, gates[gateIndex])
  ) {
    gates[gateIndex].mesh.material = doneMaterial;
    gateIndex++;
    if (gateIndex < gates.length) {
      gates[gateIndex].mesh.material = activeMaterial;
      toast(`Ворота ${gateIndex} / ${gates.length} · отлично!`);
    } else finish(false);
    $("progress-fill").style.width = `${(gateIndex / gates.length) * 100}%`;
  }
}
function updateCamera(dt, instant = false) {
  const p = flight.position;
  heli.group.position.set(p.x, p.y, p.z);
  heli.group.rotation.set(-flight.pitch, -flight.yaw, -flight.roll, "YZX");
  targetPosition.set(p.x, p.y, p.z);
  direction.set(Math.sin(flight.yaw), 0, -Math.cos(flight.yaw));
  if (cockpit) {
    camera.position
      .set(0.0, 0.8, -1.7)
      .applyQuaternion(heli.group.quaternion)
      .add(targetPosition);
    camera.quaternion.copy(heli.group.quaternion);
  } else {
    if (!started) {
      desiredCamera.set(p.x - 38, p.y + 42, p.z + 65);
      lookTarget.set(p.x + 65, p.y - 18, p.z - 150);
    } else {
      desiredCamera.copy(targetPosition).addScaledVector(direction, -31);
      desiredCamera.y += 12;
      lookTarget.copy(targetPosition).addScaledVector(direction, 28);
      lookTarget.y += 1.5;
    }
    camera.position.lerp(desiredCamera, instant ? 1 : 1 - Math.exp(-dt * 4));
    camera.lookAt(lookTarget);
  }
}
function drawMap() {
  const size = 400,
    scale = size / (city.bounds * 2);
  mapCtx.drawImage(mapBase, 0, 0);
  const px = (x) => (x + city.bounds) * scale;
  if (mode === "arcade") {
    mapCtx.strokeStyle = "#dca37566";
    mapCtx.lineWidth = 1;
    mapCtx.setLineDash([4, 4]);
    mapCtx.beginPath();
    gates.forEach((g, i) => {
      if (i) mapCtx.lineTo(px(g.x), px(g.z));
      else mapCtx.moveTo(px(g.x), px(g.z));
    });
    mapCtx.stroke();
    mapCtx.setLineDash([]);
    gates.forEach((g, i) => {
      mapCtx.strokeStyle =
        i < gateIndex ? "#9dc3a4" : i === gateIndex ? "#ffc18a" : "#a4b5a4";
      mapCtx.lineWidth = i === gateIndex ? 2.5 : 1;
      mapCtx.beginPath();
      mapCtx.arc(px(g.x), px(g.z), i === gateIndex ? 6 : 3.3, 0, Math.PI * 2);
      mapCtx.stroke();
    });
  }
  mapCtx.save();
  mapCtx.translate(px(flight.position.x), px(flight.position.z));
  mapCtx.rotate(flight.yaw);
  mapCtx.fillStyle = "#fce5c2";
  mapCtx.shadowBlur = 9;
  mapCtx.shadowColor = "#f4d2a0";
  mapCtx.beginPath();
  mapCtx.moveTo(0, -8);
  mapCtx.lineTo(5.5, 6);
  mapCtx.lineTo(0, 3.5);
  mapCtx.lineTo(-5.5, 6);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}
function updateHUD() {
  const speed = Math.hypot(flight.velocity.x, flight.velocity.z) * 3.6;
  $("speed").textContent = Math.round(speed);
  $("altitude").textContent = Math.round(flight.position.y);
  $("climb").textContent =
    `${flight.velocity.y >= 0 ? "+" : ""}${flight.velocity.y.toFixed(1)} м/с`;
  $("speed-bar").style.width = `${Math.min((speed / 150) * 100, 100)}%`;
  $("altitude-bar").style.width =
    `${Math.min((flight.position.y / 300) * 100, 100)}%`;
  $("thrust-value").textContent = `${Math.round(input.collective * 100)}%`;
  $("collective").value = Math.round(input.collective * 100);
  $("attitude").style.transform =
    `rotate(${(-flight.roll * 180) / Math.PI}deg) translateY(${flight.pitch * 28}px)`;
  const heading = ((((flight.yaw * 180) / Math.PI) % 360) + 360) % 360;
  const dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
  $("heading").textContent =
    `${String(Math.round(heading) % 360).padStart(3, "0")}° ${dirs[Math.round(heading / 45) % 8]}`;
  $("timer").textContent = formatTime(elapsed);
  $("gate-count").textContent =
    mode === "arcade"
      ? `${String(gateIndex).padStart(2, "0")} / ${gates.length}`
      : "∞";
  gates.forEach((g, i) => {
    g.mesh.visible = mode === "arcade" && i >= gateIndex && i < gateIndex + 3;
  });
  const gate = gates[gateIndex];
  $("gate-distance").textContent =
    mode === "arcade" && gate
      ? `Следующие ворота · ${Math.round(Math.hypot(gate.x - flight.position.x, gate.y - flight.position.y, gate.z - flight.position.z))} м`
      : "Свободный маршрут · без ограничений";
  $("coordinates").textContent =
    `${Math.round(flight.position.x)} / ${Math.round(flight.position.z)}`;
  drawMap();
  updateAudio();
}
function updateTarget() {
  const label = $("target-label"),
    g = gates[gateIndex];
  if (!started || mode !== "arcade" || !g) {
    label.hidden = true;
    return;
  }
  projected.set(g.x, g.y + 25, g.z).project(camera);
  label.hidden =
    projected.z > 1 ||
    projected.z < -1 ||
    Math.abs(projected.x) > 0.95 ||
    Math.abs(projected.y) > 0.7;
  if (!label.hidden) {
    label.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
    label.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight}px`;
    label.innerHTML = `${String(gateIndex + 1).padStart(2, "0")} <span>ВОРОТА</span>`;
  }
}
// GPU timer queries measure completed GPU work without stalling the render loop.
const gl = renderer.getContext(),
  timerExtension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
const queries = [];
const stats = {
  cpu: [],
  gpu: [],
  frame: [],
  drawCalls: 0,
  triangles: 0,
  pixelRatio: renderer.getPixelRatio(),
  gpuAvailable: !!timerExtension,
};
function remember(array, value) {
  array.push(value);
  if (array.length > 300) array.shift();
}
const percentile = (array, p) =>
  array.length
    ? [...array].sort((a, b) => a - b)[
        Math.min(array.length - 1, Math.floor(array.length * p))
      ]
    : null;
let last = performance.now(),
  accumulator = 0,
  hudClock = 0,
  statsClock = 0,
  frameNumber = 0,
  warmup = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const cpuStart = performance.now();
  const frameDt = (now - last) / 1000;
  const dt = Math.min(0.05, Math.max(0, frameDt));
  last = now;
  if (active) {
    accumulator += dt;
    while (accumulator >= 1 / 120) {
      updatePhysics(1 / 120);
      accumulator -= 1 / 120;
      if (!active) {
        accumulator = 0;
        break;
      }
    }
  } else accumulator = 0;
  if (active || !started) {
    heli.rotor.rotation.y += dt * 37;
    heli.tail.rotation.x += dt * 65;
  }
  updateCamera(dt);
  hudClock += dt;
  statsClock += dt;
  if (hudClock > 0.1) {
    updateHUD();
    hudClock = 0;
  }
  updateTarget();
  let query;
  if (timerExtension && frameNumber % 10 === 0 && queries.length < 4) {
    query = gl.createQuery();
    gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, query);
  }
  renderer.render(scene, camera);
  if (query) {
    gl.endQuery(timerExtension.TIME_ELAPSED_EXT);
    queries.push(query);
  }
  if (timerExtension && queries.length) {
    const disjoint = gl.getParameter(timerExtension.GPU_DISJOINT_EXT);
    while (
      queries.length &&
      gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)
    ) {
      const ready = queries.shift();
      if (!disjoint && warmup > 120)
        remember(stats.gpu, gl.getQueryParameter(ready, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(ready);
    }
  }
  stats.drawCalls = renderer.info.render.calls;
  stats.triangles = renderer.info.render.triangles;
  const cpu = performance.now() - cpuStart;
  if (warmup++ > 120) {
    remember(stats.cpu, cpu);
    if (frameDt < 0.1) remember(stats.frame, frameDt * 1000);
  }
  if (statsClock > 1) {
    const cpuMs = percentile(stats.cpu, 0.5),
      gpuMs = percentile(stats.gpu, 0.5),
      frameMs = percentile(stats.frame, 0.5);
    $("fps").textContent = frameMs
      ? `${Math.round(1000 / frameMs)} FPS`
      : "— FPS";
    $("frame-time").textContent =
      `CPU ${cpuMs?.toFixed(1) ?? "—"} · GPU ${gpuMs?.toFixed(1) ?? "н/д"} мс`;
    if (gpuMs > 5 && stats.gpu.length > 12 && renderer.getPixelRatio() > 0.65) {
      renderer.setPixelRatio(Math.max(0.65, renderer.getPixelRatio() - 0.1));
      renderer.setSize(innerWidth, innerHeight);
      stats.pixelRatio = renderer.getPixelRatio();
      stats.gpu.length = 0;
    }
    statsClock = 0;
  }
  frameNumber++;
}
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  setActive(false);
  $("error").hidden = false;
  $("error").textContent =
    "Графический контекст потерян. Перезагрузите страницу, чтобы продолжить полёт.";
});
document.body.classList.add("intro-visible");
updateCamera(0, true);
updateHUD();
requestAnimationFrame(animate);
if (new URLSearchParams(location.search).has("qa"))
  window.__heliport = {
    get flight() {
      return flight;
    },
    input,
    stats,
    gates,
    get city() {
      return city;
    },
    get active() {
      return active;
    },
    get gateIndex() {
      return gateIndex;
    },
    get cockpit() {
      return cockpit;
    },
    get mode() {
      return mode;
    },
    get seed() {
      return seed;
    },
    reset,
    snapshot: () => ({
      cpuP50: percentile(stats.cpu, 0.5),
      cpuP95: percentile(stats.cpu, 0.95),
      gpuP50: percentile(stats.gpu, 0.5),
      gpuP95: percentile(stats.gpu, 0.95),
      frameP50: percentile(stats.frame, 0.5),
      drawCalls: stats.drawCalls,
      triangles: stats.triangles,
      pixelRatio: stats.pixelRatio,
      gpuAvailable: stats.gpuAvailable,
      city: city.counts,
      position: { ...flight.position },
      velocity: { ...flight.velocity },
      gateIndex,
      active,
      cockpit,
      mode,
    }),
  };
