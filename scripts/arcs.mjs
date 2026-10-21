// noArcs rewrites SVG path data that has arcs (A, a), which the device can't
// draw, with absolute M L C Q Z commands, each arc as cubic curves. Other
// paths come back as they are. After d200-deck's path parser, which takes
// M L H V C S Q T Z.

const counts = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

export function noArcs(d) {
  if (!/[Aa]/.test(d)) return d;
  let toks = tokens(d);
  let out = "";
  let x = 0, y = 0, sx = 0, sy = 0; // current point, subpath start
  let cx = 0, cy = 0; // last control point, for S and T
  let cmd = "", prev = "";
  const put = (c, ...v) => {
    out += c;
    v.forEach((f, i) => {
      let s = String(Math.round(f * 1000) / 1000);
      if (s === "-0") s = "0";
      if (i > 0 && !s.startsWith("-")) out += " ";
      out += s;
    });
  };
  while (toks.length) {
    if (typeof toks[0] === "string") {
      cmd = toks.shift();
    } else if (!cmd) {
      throw new Error("number before any command");
    }
    const c = cmd.toUpperCase();
    const n = counts[c];
    if (n === undefined) throw new Error(`unknown command ${cmd}`);
    const v = toks.slice(0, n);
    if (v.length < n || v.some((t) => typeof t === "string")) throw new Error(`${cmd}: too few numbers`);
    toks = toks.slice(n);
    const [ox, oy] = cmd === c ? [0, 0] : [x, y];
    // the control point S and T reflect, if the last command had one
    let [rx, ry] = [x, y];
    if ((c === "S" && (prev === "C" || prev === "S")) || (c === "T" && (prev === "Q" || prev === "T"))) {
      [rx, ry] = [2 * x - cx, 2 * y - cy];
    }
    switch (c) {
      case "M":
        [x, y] = [ox + v[0], oy + v[1]];
        [sx, sy] = [x, y];
        put("M", x, y);
        cmd = cmd === "m" ? "l" : "L";
        break;
      case "L":
        [x, y] = [ox + v[0], oy + v[1]];
        put("L", x, y);
        break;
      case "H":
        x = ox + v[0];
        put("L", x, y);
        break;
      case "V":
        y = oy + v[0];
        put("L", x, y);
        break;
      case "C":
        [cx, cy] = [ox + v[2], oy + v[3]];
        put("C", ox + v[0], oy + v[1], cx, cy, ox + v[4], oy + v[5]);
        [x, y] = [ox + v[4], oy + v[5]];
        break;
      case "S":
        [cx, cy] = [ox + v[0], oy + v[1]];
        put("C", rx, ry, cx, cy, ox + v[2], oy + v[3]);
        [x, y] = [ox + v[2], oy + v[3]];
        break;
      case "Q":
        [cx, cy] = [ox + v[0], oy + v[1]];
        put("Q", cx, cy, ox + v[2], oy + v[3]);
        [x, y] = [ox + v[2], oy + v[3]];
        break;
      case "T":
        [cx, cy] = [rx, ry];
        put("Q", cx, cy, ox + v[0], oy + v[1]);
        [x, y] = [ox + v[0], oy + v[1]];
        break;
      case "A": {
        const [ex, ey] = [ox + v[5], oy + v[6]];
        for (const b of arc(x, y, v[0], v[1], v[2], v[3] !== 0, v[4] !== 0, ex, ey)) put("C", ...b);
        [x, y] = [ex, ey];
        break;
      }
      case "Z":
        [x, y] = [sx, sy];
        put("Z");
        break;
    }
    prev = c;
  }
  return out;
}

// tokens splits path data into commands (strings) and numbers. Arc flags
// may run into the next number ("011.5" is 0, 1, 1.5), so a number right
// after an arc's first three is one digit.
function tokens(d) {
  const toks = [];
  let argc = 0; // numbers since the last command, to spot arc flags
  let cmd = "";
  const num = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/;
  for (let i = 0; i < d.length; ) {
    const c = d[i];
    if (" ,\n\t\r".includes(c)) {
      i++;
    } else if (/[a-zA-Z]/.test(c) && c !== "e" && c !== "E") {
      toks.push(c);
      [cmd, argc] = [c, 0];
      i++;
    } else if (cmd.toUpperCase() === "A" && (argc % 7 === 3 || argc % 7 === 4)) {
      if (c !== "0" && c !== "1") throw new Error(`bad arc flag at ${i}`);
      toks.push(Number(c));
      argc++;
      i++;
    } else {
      const m = num.exec(d.slice(i));
      if (!m) throw new Error(`bad number at ${i}`);
      toks.push(Number(m[0]));
      argc++;
      i += m[0].length;
    }
  }
  return toks;
}

// arc turns an SVG arc from (x1, y1) to (x2, y2) into cubic curves of at
// most 90 degrees each, as control, control, end points (SVG 1.1 F.6).
export function arc(x1, y1, rx, ry, angle, large, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (angle * Math.PI) / 180;
  const [sin, cos] = [Math.sin(phi), Math.cos(phi)];
  const [dx, dy] = [(x1 - x2) / 2, (y1 - y2) / 2];
  const [x1p, y1p] = [cos * dx + sin * dy, -sin * dx + cos * dy];
  const l = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (l > 1) [rx, ry] = [rx * Math.sqrt(l), ry * Math.sqrt(l)];
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const [cxp, cyp] = [(k * rx * y1p) / ry, (-k * ry * x1p) / rx];
  const [cx, cy] = [cos * cxp - sin * cyp + (x1 + x2) / 2, sin * cxp + cos * cyp + (y1 + y2) / 2];
  const vang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = vang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = vang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
  const step = dt / n;
  const h = (4 / 3) * Math.tan(step / 4);
  // a point on the ellipse at t, and its tangent
  const pt = (t) => {
    const [st, ct] = [Math.sin(t), Math.cos(t)];
    const [px, py, tx, ty] = [rx * ct, ry * st, -rx * st, ry * ct];
    return [cos * px - sin * py + cx, sin * px + cos * py + cy, cos * tx - sin * ty, sin * tx + cos * ty];
  };
  const out = [];
  let t = t1;
  let [ax, ay, adx, ady] = pt(t);
  for (let i = 0; i < n; i++) {
    let [bx, by, bdx, bdy] = pt(t + step);
    if (i === n - 1) [bx, by] = [x2, y2];
    out.push([ax + h * adx, ay + h * ady, bx - h * bdx, by - h * bdy, bx, by]);
    t += step;
    [ax, ay, adx, ady] = [bx, by, bdx, bdy];
  }
  return out;
}
