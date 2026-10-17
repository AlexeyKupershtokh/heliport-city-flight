import * as THREE from "./vendor/three.module.js";

const BOUNDS = 1200;
const RIVER_WIDTH = 124;
const riverX = (z) => 80 + Math.sin(z / 350) * 140;
const FLIGHT_ROUTE = [
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

export function createCity(scene, seed = 42) {
  let state = seed >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const group = new THREE.Group();
  group.name = "procedural-city";
  scene.add(group);
  const buildings = [];
  const bridges = [];
  const bridgePiers = [];
  const fields = [
    { x: -810, z: 630, w: 104, d: 142 },
    { x: 630, z: -630, w: 104, d: 142 },
  ];
  const parks = [
    { x: -810, z: -630, w: 156, d: 156 },
    { x: 630, z: 630, w: 156, d: 156 },
    { x: -450, z: 810, w: 156, d: 156 },
    { x: 990, z: -90, w: 156, d: 156 },
  ];
  const river = [];
  const spawn = { x: -130, y: 75, z: 680 };
  const geometrySet = new Set();
  const materialSet = new Set();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  geometrySet.add(boxGeometry);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const white = new THREE.Color(0xffffff);
  const buildingPalette = [
    "#c9c4b5",
    "#afbebc",
    "#d7d0bf",
    "#a6afb0",
    "#c3b8a7",
    "#b8c4c5",
    "#dcdbcc",
  ];
  const material = (color) => {
    const result = new THREE.MeshLambertMaterial({ color });
    materialSet.add(result);
    return result;
  };
  const instantiate = (name, entries, geometry, color) => {
    if (!entries.length) return;
    geometrySet.add(geometry);
    const mesh = new THREE.InstancedMesh(
      geometry,
      material(color),
      entries.length,
    );
    mesh.name = name;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      position.set(entry.x, entry.y, entry.z);
      scale.set(entry.w, entry.h, entry.d);
      quaternion.setFromAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        entry.rotation || 0,
      );
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      if (entry.color) mesh.setColorAt(index, new THREE.Color(entry.color));
      else if (mesh.instanceColor) mesh.setColorAt(index, white);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  const quads = (name, points, color, depthOffset = 0) => {
    if (!points.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    geometry.computeVertexNormals();
    geometrySet.add(geometry);
    const surface = material(color);
    // Centimetre-separated ground layers need a depth bias at city-scale distances.
    surface.polygonOffset = depthOffset !== 0;
    surface.polygonOffsetFactor = depthOffset;
    surface.polygonOffsetUnits = depthOffset;
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    group.add(mesh);
  };
  const rectangle = (points, x, z, w, d, y) => {
    points.push(
      x - w / 2,
      y,
      z - d / 2,
      x - w / 2,
      y,
      z + d / 2,
      x + w / 2,
      y,
      z + d / 2,
      x - w / 2,
      y,
      z - d / 2,
      x + w / 2,
      y,
      z + d / 2,
      x + w / 2,
      y,
      z - d / 2,
    );
  };
  const roadPoints = [];
  const sidewalkPoints = [];
  const markings = [];
  const greenery = [];
  const concrete = [];
  const water = [];
  const bank = [];
  const flow = [];
  const linePoints = [];
  const sportsPoints = [];
  const bodyEntries = [];
  const roofEntries = [];
  const glassEntries = [];
  const trunkEntries = [];
  const crownEntries = [];
  const bridgeEntries = [];
  const lampEntries = [];
  const line = (points, ax, ay, az, bx, by, bz) =>
    points.push(ax, ay, az, bx, by, bz);
  const lines = (name, points, color) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    geometrySet.add(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color });
    materialSet.add(lineMaterial);
    const mesh = new THREE.LineSegments(geometry, lineMaterial);
    mesh.name = name;
    group.add(mesh);
  };
  const tree = (x, z, size = 1) => {
    const height = (7 + random() * 5) * size;
    trunkEntries.push({
      x,
      y: height * 0.3,
      z,
      w: 0.8 * size,
      d: 0.8 * size,
      h: height * 0.6,
    });
    crownEntries.push({
      x,
      y: height * 0.72,
      z,
      w: height * 0.42,
      d: height * 0.42,
      h: height * 0.78,
      color: random() > 0.45 ? "#718568" : "#829375",
    });
  };
  const nearWater = (x, z, margin = 0) =>
    Math.abs(x - riverX(z)) < RIVER_WIDTH / 2 + margin;
  const inReserved = (x, z, margin = 0) =>
    [...fields, ...parks].some(
      (area) =>
        Math.abs(x - area.x) < area.w / 2 + margin &&
        Math.abs(z - area.z) < area.d / 2 + margin,
    );
  const clearsRoute = (x, z, w, d, h) =>
    FLIGHT_ROUTE.every(
      ([gx, gy, gz]) =>
        h < gy - 40 ||
        Math.abs(x - gx) > w / 2 + 44 ||
        Math.abs(z - gz) > d / 2 + 44,
    );

  rectangle(greenery, 0, 0, 3100, 3100, -0.25);
  for (let z = -BOUNDS - 240; z < BOUNDS + 240; z += 20) {
    const nextZ = z + 20;
    const a = riverX(z);
    const b = riverX(nextZ);
    river.push({ x: a, z, width: RIVER_WIDTH });
    water.push(
      a - 62,
      0.08,
      z,
      b - 62,
      0.08,
      nextZ,
      b + 62,
      0.08,
      nextZ,
      a - 62,
      0.08,
      z,
      b + 62,
      0.08,
      nextZ,
      a + 62,
      0.08,
      z,
    );
    for (const side of [-1, 1]) {
      const innerA = a + side * 63;
      const outerA = a + side * 73;
      const innerB = b + side * 63;
      const outerB = b + side * 73;
      if (side === 1)
        bank.push(
          innerA,
          0.18,
          z,
          innerB,
          0.18,
          nextZ,
          outerB,
          0.18,
          nextZ,
          innerA,
          0.18,
          z,
          outerB,
          0.18,
          nextZ,
          outerA,
          0.18,
          z,
        );
      else
        bank.push(
          outerA,
          0.18,
          z,
          outerB,
          0.18,
          nextZ,
          innerB,
          0.18,
          nextZ,
          outerA,
          0.18,
          z,
          innerB,
          0.18,
          nextZ,
          innerA,
          0.18,
          z,
        );
    }
    if (Math.abs(z) < 1160 && z % 80 === 0) {
      tree(a - 81, z, 0.85);
      tree(a + 81, z, 0.85);
    }
    if (z % 60 === 0) {
      const offset = (random() - 0.5) * 80;
      line(flow, a + offset, 0.12, z, b + offset + 2, 0.12, z + 12);
    }
  }
  river.push({ x: riverX(BOUNDS + 240), z: BOUNDS + 240, width: RIVER_WIDTH });

  for (let street = -1080; street <= 1080; street += 180) {
    for (let along = -1200; along < 1200; along += 20) {
      const center = along + 10;
      if (!nearWater(center, street, 22)) {
        rectangle(sidewalkPoints, center, street, 20, 27, 0.2);
        rectangle(roadPoints, center, street, 20, 18, 0.23);
        if (!nearWater(center, street, 27) && Math.abs(center % 180) > 14)
          rectangle(markings, center, street, 7, 0.35, 0.25);
      }
      if (!nearWater(street, center, 22)) {
        rectangle(sidewalkPoints, street, center, 27, 20, 0.2);
        rectangle(roadPoints, street, center, 18, 20, 0.23);
        if (Math.abs(center % 180) > 14)
          rectangle(markings, street, center, 0.35, 7, 0.26);
      }
    }
  }

  for (const z of [-720, -180, 360, 900]) {
    const x = riverX(z);
    const width = 188;
    const height = 9;
    bridges.push({ x, z, w: width, d: 25, y: height - 2.6, h: 2.6 });
    bridgeEntries.push({ x, y: height - 1.3, z, w: width, d: 25, h: 2.6 });
    rectangle(roadPoints, x, z, width, 18, height + 0.02);
    for (const side of [-1, 1]) {
      bridgeEntries.push({ x: x + side * 42, y: 3.3, z, w: 5, d: 20, h: 6.6 });
      bridgePiers.push({ x: x + side * 42, y: 0, z, w: 5, d: 20, h: 6.6 });
      bridgeEntries.push({
        x,
        y: height + 0.65,
        z: z + side * 11,
        w: width,
        d: 0.45,
        h: 1.3,
      });
      for (let dx = -84; dx <= 84; dx += 28)
        lampEntries.push({
          x: x + dx,
          y: height + 3.5,
          z: z + side * 10,
          w: 0.45,
          d: 0.45,
          h: 7,
        });
      const near = x + (side * width) / 2;
      const far = near + side * 55;
      const a = Math.min(near, far);
      const b = Math.max(near, far);
      const ya = side < 0 ? 0.3 : height;
      const yb = side < 0 ? height : 0.3;
      roadPoints.push(
        a,
        ya,
        z - 9,
        a,
        ya,
        z + 9,
        b,
        yb,
        z + 9,
        a,
        ya,
        z - 9,
        b,
        yb,
        z + 9,
        b,
        yb,
        z - 9,
      );
    }
    for (let dx = -84; dx < 90; dx += 18)
      rectangle(markings, x + dx, z, 9, 0.35, height + 0.04);
  }

  for (let blockX = -990; blockX <= 990; blockX += 180) {
    for (let blockZ = -990; blockZ <= 990; blockZ += 180) {
      const residential = Math.hypot(blockX + 330, blockZ + 180) > 660;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          const x = blockX + ix * 49 + (random() - 0.5) * 5;
          const z = blockZ + iz * 49 + (random() - 0.5) * 5;
          const w = 27 + random() * 13;
          const d = 27 + random() * 13;
          if (nearWater(x, z, Math.max(w, d) / 2 + 20) || inReserved(x, z, 26))
            continue;
          if (
            Math.abs(x - spawn.x) < w / 2 + 38 &&
            Math.abs(z - spawn.z) < d / 2 + 47
          )
            continue;
          if (x > -177 && x < -83 && z > 320 && z < 740) continue;
          if (
            bridges.some(
              (bridge) =>
                Math.abs(z - bridge.z) < d / 2 + 20 &&
                Math.abs(x - bridge.x) < bridge.w / 2 + 75,
            )
          )
            continue;
          const downtown = Math.exp(
            -((x + 330) ** 2 + (z + 180) ** 2) / 210000,
          );
          let h = residential
            ? 12 + random() * 24
            : 22 + random() * 34 + downtown * random() * 108;
          if (!clearsRoute(x, z, w, d, h)) h = Math.min(h, 30);
          const item = { x, z, w, d, h };
          buildings.push({ ...item, h: h + 4 });
          bodyEntries.push({
            ...item,
            y: h / 2,
            color:
              buildingPalette[Math.floor(random() * buildingPalette.length)],
          });
          roofEntries.push({
            x,
            y: h + 0.5,
            z,
            w: w + 0.7,
            d: d + 0.7,
            h: 1,
            color: "#b3b8b0",
          });
          if (random() > 0.32)
            roofEntries.push({
              x: x + w * 0.18,
              y: h + 2.1,
              z: z - d * 0.2,
              w: w * 0.28,
              d: d * 0.32,
              h: 3.2,
              color: "#a4aaa6",
            });
          const floorStep = residential ? 4.7 : 5.5;
          for (let y = 4.4; y < h - 2; y += floorStep) {
            glassEntries.push({
              x,
              y,
              z,
              w: w + 0.12,
              d: d + 0.12,
              h: residential ? 1.2 : 2.1,
              color: residential ? "#748b8c" : "#739293",
            });
          }
          if (random() > 0.6) tree(x + w / 2 + 4, z + d / 2 + 4, 0.8);
        }
      }
    }
  }

  for (const park of parks) {
    rectangle(greenery, park.x, park.z, park.w, park.d, 0.28);
    rectangle(sidewalkPoints, park.x, park.z, 5, park.d, 0.33);
    rectangle(sidewalkPoints, park.x, park.z, park.w, 5, 0.33);
    for (let index = 0; index < 38; index++) {
      const x = park.x + (random() - 0.5) * 135;
      const z = park.z + (random() - 0.5) * 135;
      if (Math.abs(x - park.x) > 6 && Math.abs(z - park.z) > 6)
        tree(x, z, 1.15);
    }
  }

  for (const field of fields) {
    rectangle(concrete, field.x, field.z, field.w, field.d, 0.3);
    rectangle(sportsPoints, field.x, field.z, 70, 108, 0.38);
    for (let stripe = -4; stripe <= 4; stripe++)
      if (stripe % 2 === 0)
        rectangle(greenery, field.x, field.z + stripe * 12, 69, 12, 0.4);
    const fieldLine = (x1, z1, x2, z2, y = 0.44) =>
      line(
        linePoints,
        field.x + x1,
        y,
        field.z + z1,
        field.x + x2,
        y,
        field.z + z2,
      );
    const outline = (x1, z1, x2, z2) => {
      fieldLine(x1, z1, x2, z1);
      fieldLine(x2, z1, x2, z2);
      fieldLine(x2, z2, x1, z2);
      fieldLine(x1, z2, x1, z1);
    };
    outline(-34, -52.5, 34, 52.5);
    fieldLine(-34, 0, 34, 0);
    for (let segment = 0; segment < 48; segment++) {
      const a = (segment * Math.PI) / 24;
      const b = ((segment + 1) * Math.PI) / 24;
      fieldLine(
        Math.cos(a) * 9.15,
        Math.sin(a) * 9.15,
        Math.cos(b) * 9.15,
        Math.sin(b) * 9.15,
      );
    }
    for (const side of [-1, 1]) {
      outline(-20.15, side * 52.5, 20.15, side * 36);
      outline(-9.16, side * 52.5, 9.16, side * 47);
      for (const post of [-1, 1]) {
        line(
          linePoints,
          field.x + post * 3.66,
          0.4,
          field.z + side * 52.5,
          field.x + post * 3.66,
          2.84,
          field.z + side * 52.5,
        );
        line(
          linePoints,
          field.x + post * 3.66,
          2.84,
          field.z + side * 52.5,
          field.x + post * 3.66,
          0.4,
          field.z + side * 55,
        );
      }
      line(
        linePoints,
        field.x - 3.66,
        2.84,
        field.z + side * 52.5,
        field.x + 3.66,
        2.84,
        field.z + side * 52.5,
      );
      for (let dx = -3.6; dx <= 3.6; dx += 0.9)
        line(
          linePoints,
          field.x + dx,
          2.84,
          field.z + side * 52.5,
          field.x + dx,
          0.4,
          field.z + side * 55,
        );
    }
    for (const side of [-1, 1]) {
      roofEntries.push({
        x: field.x + side * 44,
        y: 1.5,
        z: field.z,
        w: 5,
        d: 62,
        h: 3,
        color: "#b6bbb4",
      });
      for (let z = -60; z <= 60; z += 30)
        tree(field.x + side * 49, field.z + z, 0.7);
    }
  }

  rectangle(concrete, spawn.x, spawn.z, 67, 67, 0.45);
  const helipad = [];
  const helipadLines = [];
  rectangle(helipad, spawn.x, spawn.z, 46, 46, 0.48);
  for (let index = 0; index < 64; index++) {
    const a = (index * Math.PI) / 32;
    const b = ((index + 1) * Math.PI) / 32;
    line(
      helipadLines,
      spawn.x + Math.cos(a) * 18,
      0.51,
      spawn.z + Math.sin(a) * 18,
      spawn.x + Math.cos(b) * 18,
      0.51,
      spawn.z + Math.sin(b) * 18,
    );
  }
  rectangle(markings, spawn.x - 5, spawn.z, 2, 15, 0.53);
  rectangle(markings, spawn.x + 5, spawn.z, 2, 15, 0.53);
  rectangle(markings, spawn.x, spawn.z, 10, 2, 0.53);

  quads("terrain-and-lawns", greenery, "#8f9d7c");
  quads("river", water, "#719b9e");
  quads("embankments", bank, "#c4c5b7");
  quads("sidewalks", sidewalkPoints, "#b8bbb1", -1);
  quads("roads", roadPoints, "#667171", -2);
  quads("road-markings", markings, "#e4dec3", -3);
  quads("sports-surrounds-and-helipad-base", concrete, "#b0b5a6");
  quads("football-pitches", sportsPoints, "#6f8d64");
  quads("helipad", helipad, "#5f7569");
  lines("pitch-lines-and-goals", linePoints, "#eeeede");
  lines("helipad-ring", helipadLines, "#e8d4a2");
  lines("water-highlights", flow, "#a6bec0");
  instantiate("buildings", bodyEntries, boxGeometry, "#ffffff");
  instantiate("rooftop-details", roofEntries, boxGeometry, "#ffffff");
  instantiate("window-bands", glassEntries, boxGeometry, "#ffffff");
  instantiate("bridge-decks-and-rails", bridgeEntries, boxGeometry, "#c6c5b9");
  instantiate("bridge-lampposts", lampEntries, boxGeometry, "#899591");
  instantiate("tree-trunks", trunkEntries, boxGeometry, "#8a8270");
  instantiate(
    "tree-crowns",
    crownEntries,
    new THREE.IcosahedronGeometry(1, 0),
    "#ffffff",
  );

  function drawMap(ctx, size) {
    const ratio = size / (BOUNDS * 2);
    const px = (x) => (x + BOUNDS) * ratio;
    const pz = (z) => (z + BOUNDS) * ratio;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#283d3e";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#435451";
    ctx.lineWidth = Math.max(1, 18 * ratio);
    ctx.beginPath();
    for (let street = -1080; street <= 1080; street += 180) {
      ctx.moveTo(px(street), 0);
      ctx.lineTo(px(street), size);
      ctx.moveTo(0, pz(street));
      ctx.lineTo(size, pz(street));
    }
    ctx.stroke();
    ctx.fillStyle = "#315f6a";
    ctx.beginPath();
    river.forEach((point, index) => {
      if (index === 0) ctx.moveTo(px(point.x - point.width / 2), pz(point.z));
      else ctx.lineTo(px(point.x - point.width / 2), pz(point.z));
    });
    for (let index = river.length - 1; index >= 0; index--) {
      const point = river[index];
      ctx.lineTo(px(point.x + point.width / 2), pz(point.z));
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#617772";
    for (const bridge of bridges)
      ctx.fillRect(
        px(bridge.x - bridge.w / 2),
        pz(bridge.z - bridge.d / 2),
        bridge.w * ratio,
        bridge.d * ratio,
      );
    ctx.fillStyle = "#60706b";
    for (const building of buildings)
      ctx.fillRect(
        px(building.x - building.w / 2),
        pz(building.z - building.d / 2),
        Math.max(1, building.w * ratio),
        Math.max(1, building.d * ratio),
      );
    ctx.fillStyle = "#436b54";
    for (const area of [...parks, ...fields])
      ctx.fillRect(
        px(area.x - area.w / 2),
        pz(area.z - area.d / 2),
        area.w * ratio,
        area.d * ratio,
      );
    ctx.strokeStyle = "#a9c4a4";
    ctx.lineWidth = 0.7;
    for (const field of fields)
      ctx.strokeRect(
        px(field.x - 34),
        pz(field.z - 52.5),
        68 * ratio,
        105 * ratio,
      );
    ctx.fillStyle = "#d6c8a3";
    ctx.beginPath();
    ctx.arc(px(spawn.x), pz(spawn.z), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    buildings,
    bridges,
    fields,
    river,
    spawn,
    bounds: BOUNDS,
    seed,
    collisionBoxes: [...buildings, ...bridges, ...bridgePiers],
    counts: {
      buildings: buildings.length,
      bridges: bridges.length,
      fields: fields.length,
      trees: trunkEntries.length,
      drawCalls: group.children.length,
    },
    drawMap,
    dispose() {
      scene.remove(group);
      for (const child of group.children)
        if (child.isInstancedMesh) child.dispose();
      for (const geometry of geometrySet) geometry.dispose();
      for (const entry of materialSet) entry.dispose();
      group.clear();
    },
  };
}
