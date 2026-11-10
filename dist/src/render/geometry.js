/** A bevelled cube, generated analytically: no mesh, material, or texture assets. */
export function roundedBox(subdivisions = 8, radius = 0.12) {
  const vertices = [];
  const faces = [
    [1, 0, 0, 0, 1, 0, 0, 0, 1], [-1, 0, 0, 0, 1, 0, 0, 0, -1],
    [0, 1, 0, 0, 0, 1, 1, 0, 0], [0, -1, 0, 0, 0, 1, -1, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 1, 0], [0, 0, -1, -1, 0, 0, 0, 1, 0],
  ];
  const vertex = (face, u, v) => {
    const point = [0, 1, 2].map((axis) => face[axis] * 0.5 + face[axis + 3] * u + face[axis + 6] * v);
    const core = point.map((value) => Math.max(-0.5 + radius, Math.min(0.5 - radius, value)));
    const normal = point.map((value, axis) => value - core[axis]);
    const length = Math.hypot(...normal);
    normal.forEach((value, axis) => { normal[axis] = value / length; });
    vertices.push(...core.map((value, axis) => value + normal[axis] * radius), ...normal);
  };
  for (const face of faces) for (let y = 0; y < subdivisions; y++) for (let x = 0; x < subdivisions; x++) {
    const u = x / subdivisions - 0.5, v = y / subdivisions - 0.5, d = 1 / subdivisions;
    vertex(face, u, v); vertex(face, u + d, v); vertex(face, u + d, v + d);
    vertex(face, u, v); vertex(face, u + d, v + d); vertex(face, u, v + d);
  }
  return new Float32Array(vertices);
}

export function torus(segments = 48, sides = 6, thickness = 0.025) {
  const vertices = [];
  const vertex = (u, v) => {
    const angle = u * Math.PI * 2, tube = v * Math.PI * 2;
    const radius = 0.5 + Math.cos(tube) * thickness;
    vertices.push(Math.cos(angle) * radius, Math.sin(tube) * thickness, Math.sin(angle) * radius,
      Math.cos(angle) * Math.cos(tube), Math.sin(tube), Math.sin(angle) * Math.cos(tube));
  };
  for (let u = 0; u < segments; u++) for (let v = 0; v < sides; v++) {
    vertex(u / segments, v / sides); vertex((u + 1) / segments, v / sides); vertex((u + 1) / segments, (v + 1) / sides);
    vertex(u / segments, v / sides); vertex((u + 1) / segments, (v + 1) / sides); vertex(u / segments, (v + 1) / sides);
  }
  return new Float32Array(vertices);
}
