export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function orthographic(out, extent, near, far) {
  out.fill(0); out[0] = 1 / extent; out[5] = 1 / extent; out[10] = -2 / (far - near);
  out[14] = -(far + near) / (far - near); out[15] = 1; return out;
}
export function perspective(out, fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2); const range = 1 / (near - far);
  out.fill(0); out[0] = f / aspect; out[5] = f; out[10] = (far + near) * range;
  out[11] = -1; out[14] = 2 * far * near * range; return out;
}
export function lookAt(out, eye, target, up = [0, 1, 0]) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let length = Math.hypot(zx, zy, zz); zx /= length; zy /= length; zz /= length;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  length = Math.hypot(xx, xy, xz); xx /= length; xy /= length; xz /= length;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]); out[15] = 1; return out;
}
export function multiply(out, a, b) {
  for (let column = 0; column < 4; column++) {
    const x = b[column * 4], y = b[column * 4 + 1], z = b[column * 4 + 2], w = b[column * 4 + 3];
    for (let row = 0; row < 4; row++) out[column * 4 + row] = a[row] * x + a[row + 4] * y + a[row + 8] * z + a[row + 12] * w;
  }
  return out;
}
