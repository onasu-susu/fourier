// フーリエ級数で音をつくる
//   f(x) = a0/2 + Σ(k=1..n) { a_k cos(kπx/L) + b_k sin(kπx/L) }
// x を時間（秒）として鳴らす。周期は 2L 秒、基本周波数は f0 = 1/(2L) Hz。
// 音は Web Audio の PeriodicWave で作る（real が cos の係数 = a_k、imag が sin の係数 = b_k）。
const $ = (sel) => document.querySelector(sel);
const el = {
  a0: $("#a0"), n: $("#n"), ak: $("#ak"), bk: $("#bk"), L: $("#L"),
  readout: $("#readout"), msg: $("#msg"),
  play: $("#play"), vol: $("#vol"),
  wave: $("#wave"), spec: $("#spec"), table: $("#table"),
};
const N_MAX = 200;
const AUDIBLE_MAX = 20000; // これより高い倍音は聞こえない（鳴らすときにも省かれる）

// ---------- 入力を読みとる ----------
function number(text, label) {
  let f;
  try { f = Expr.compile(text); } catch (e) { throw new Error(`${label}：${e.message}`); }
  const v = f({ k: 1, n: 1 });
  if (!Number.isFinite(v)) throw new Error(`${label}：数になりません。`);
  return v;
}

function series(text, label, n) {
  let f;
  try { f = Expr.compile(text); } catch (e) { throw new Error(`${label}：${e.message}`); }
  const out = new Array(n + 1).fill(0); // out[k] が k 番目（out[0] は使わない）
  for (let k = 1; k <= n; k++) {
    const v = f({ k, n });
    if (!Number.isFinite(v)) throw new Error(`${label}：k = ${k} のとき数になりません（0 で割っていませんか？）。`);
    out[k] = v;
  }
  return out;
}

// 入力をまとめて読みとる。まちがいがあれば Error（メッセージつき）
function readInputs() {
  const nRaw = number(el.n.value, "n");
  if (!Number.isInteger(nRaw) || nRaw < 1 || nRaw > N_MAX) throw new Error(`n：1 〜 ${N_MAX} の整数を入れてください。`);
  const n = nRaw;
  const a0 = number(el.a0.value, "a₀");
  const L = number(el.L.value, "L");
  if (!(L > 0)) throw new Error("L：0 より大きい数を入れてください。");
  const ak = series(el.ak.value, "aₖ", n);
  const bk = series(el.bk.value, "bₖ", n);
  return { a0, n, L, ak, bk, f0: 1 / (2 * L) };
}

// f(x)
function wave(p, x) {
  let y = p.a0 / 2;
  const w = (Math.PI * x) / p.L;
  for (let k = 1; k <= p.n; k++) y += p.ak[k] * Math.cos(k * w) + p.bk[k] * Math.sin(k * w);
  return y;
}

// ---------- 表示 ----------
const fmt = (v) => {
  if (v === 0) return "0";
  const a = Math.abs(v);
  return a >= 1e5 || a < 1e-3 ? v.toExponential(3) : String(Number(v.toPrecision(5)));
};

function hz(f) {
  return f >= 1000 ? `${fmt(f / 1000)} kHz` : `${fmt(f)} Hz`;
}

function note(text, error) {
  el.msg.textContent = text;
  el.msg.hidden = !text;
  el.msg.classList.toggle("error", !!error);
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = Math.round((canvas.getAttribute("height") / canvas.getAttribute("width")) * w);
  canvas.style.height = h + "px";
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return { c, w, h };
}

function drawWave(p) {
  const { c, w, h } = setupCanvas(el.wave);
  const pad = { l: 44, r: 12, t: 14, b: 26 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const N = Math.min(1200, Math.max(300, Math.round(pw * 2)));
  const xs = [];
  const ys = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= N; i++) {
    const x = -2 * p.L + (4 * p.L * i) / N;
    const y = wave(p, x);
    xs.push(x);
    ys.push(y);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  // 上下の範囲：0 をふくめ、少し余白をとる
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  if (hi - lo < 1e-12) { hi += 1; lo -= 1; }
  const m = (hi - lo) * 0.08;
  lo -= m;
  hi += m;
  const X = (x) => pad.l + ((x + 2 * p.L) / (4 * p.L)) * pw;
  const Y = (y) => pad.t + (1 - (y - lo) / (hi - lo)) * ph;

  c.font = "12px 'Zen Maru Gothic', sans-serif";
  c.fillStyle = css("--muted");
  c.strokeStyle = css("--line");
  c.lineWidth = 1;
  // 横の目盛（y）
  c.textAlign = "right";
  c.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    let y = lo + ((hi - lo) * i) / 4;
    c.beginPath();
    c.moveTo(pad.l, Y(y));
    c.lineTo(w - pad.r, Y(y));
    c.stroke();
    if (Math.abs(y) < (hi - lo) * 1e-9) y = 0; // 計算のわずかな誤差（1e-16 など）は 0 と表示する
    c.fillText(fmt(Number(y.toPrecision(2))), pad.l - 6, Y(y));
  }
  // 縦の目盛（x）：−2L, −L, 0, L, 2L
  c.textAlign = "center";
  c.textBaseline = "top";
  ["-2L", "-L", "0", "L", "2L"].forEach((t, i) => {
    const x = -2 * p.L + p.L * i;
    c.beginPath();
    c.moveTo(X(x), pad.t);
    c.lineTo(X(x), h - pad.b);
    c.stroke();
    c.fillText(t, X(x), h - pad.b + 6);
  });
  // y = 0 の線
  c.strokeStyle = css("--muted");
  c.beginPath();
  c.moveTo(pad.l, Y(0));
  c.lineTo(w - pad.r, Y(0));
  c.stroke();
  // 波形
  c.strokeStyle = css("--accent");
  c.lineWidth = 2.5;
  c.lineJoin = "round";
  c.beginPath();
  xs.forEach((x, i) => (i ? c.lineTo(X(x), Y(ys[i])) : c.moveTo(X(x), Y(ys[i]))));
  c.stroke();
}

function drawSpectrum(p) {
  const { c, w, h } = setupCanvas(el.spec);
  const pad = { l: 44, r: 12, t: 12, b: 34 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;
  const amp = [];
  let max = 0;
  for (let k = 1; k <= p.n; k++) {
    const a = Math.hypot(p.ak[k], p.bk[k]);
    amp.push(a);
    max = Math.max(max, a);
  }
  c.font = "12px 'Zen Maru Gothic', sans-serif";
  c.fillStyle = css("--muted");
  c.strokeStyle = css("--line");
  c.lineWidth = 1;
  c.textAlign = "right";
  c.textBaseline = "middle";
  for (let i = 0; i <= 2; i++) {
    const y = pad.t + ph - (ph * i) / 2;
    c.beginPath();
    c.moveTo(pad.l, y);
    c.lineTo(w - pad.r, y);
    c.stroke();
    c.fillText(max ? fmt(Number(((max * i) / 2).toPrecision(2))) : "0", pad.l - 6, y);
  }
  const slot = pw / p.n;
  const bar = Math.max(1, Math.min(24, slot * 0.7));
  amp.forEach((a, i) => {
    const k = i + 1;
    const audible = k * p.f0 <= AUDIBLE_MAX;
    c.fillStyle = audible ? css("--accent") : css("--line");
    const bh = max ? (a / max) * ph : 0;
    c.fillRect(pad.l + slot * i + (slot - bar) / 2, pad.t + ph - bh, bar, bh);
  });
  // k の目盛
  c.fillStyle = css("--muted");
  c.textAlign = "center";
  c.textBaseline = "top";
  const step = p.n <= 12 ? 1 : p.n <= 30 ? 5 : p.n <= 80 ? 10 : 20;
  for (let k = 1; k <= p.n; k++) {
    if (k === 1 || k % step === 0) c.fillText(String(k), pad.l + slot * (k - 0.5), pad.t + ph + 6);
  }
  c.fillText("k（k 番目の倍音）", pad.l + pw / 2, pad.t + ph + 20);
}

function fillTable(p) {
  const rows = ['<tr><th>k</th><th>aₖ</th><th>bₖ</th><th>振幅</th><th>周波数</th></tr>'];
  for (let k = 1; k <= p.n; k++) {
    rows.push(`<tr><td>${k}</td><td>${fmt(p.ak[k])}</td><td>${fmt(p.bk[k])}</td><td>${fmt(Math.hypot(p.ak[k], p.bk[k]))}</td><td>${hz(k * p.f0)}</td></tr>`);
  }
  el.table.innerHTML = rows.join("");
}

// ---------- 音 ----------
let ctx;
let osc;
let gain;
let playing = false;
let lastWave = null; // 鳴らしている（最後に正しく読みとれた）音

const volume = () => Math.pow(el.vol.value / 100, 2); // 音量つまみは 2 乗にして、小さいほうを細かく

function soundOf(p) {
  const real = new Float32Array(p.n + 1);
  const imag = new Float32Array(p.n + 1);
  let peak = 0;
  for (let k = 1; k <= p.n; k++) {
    real[k] = p.ak[k];
    imag[k] = p.bk[k];
    if (k * p.f0 <= AUDIBLE_MAX) peak = Math.max(peak, Math.hypot(p.ak[k], p.bk[k]));
  }
  return { real, imag, f0: p.f0, silent: peak < 1e-12 };
}

function applySound(s) {
  if (!ctx || !osc) return;
  const t = ctx.currentTime;
  osc.setPeriodicWave(ctx.createPeriodicWave(s.real, s.imag)); // 既定のまま：いちばん大きい山が 1 になるよう自動で整える
  osc.frequency.setTargetAtTime(Math.min(s.f0, ctx.sampleRate / 2), t, 0.01);
  gain.gain.setTargetAtTime(s.silent ? 0 : volume(), t, 0.02);
}

async function start() {
  if (!lastWave) return;
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") await ctx.resume();
  gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  osc = ctx.createOscillator();
  osc.connect(gain);
  osc.start();
  applySound(lastWave);
  playing = true;
  el.play.textContent = "■ 停止";
  el.play.classList.add("on");
}

function stop() {
  if (!osc) return;
  const o = osc;
  const g = gain;
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setTargetAtTime(0, t, 0.015);
  o.stop(t + 0.12);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  osc = gain = null;
  playing = false;
  el.play.textContent = "▶ 再生";
  el.play.classList.remove("on");
}

el.play.addEventListener("click", () => (playing ? stop() : start()));
el.vol.addEventListener("input", () => {
  if (playing && lastWave && !lastWave.silent) gain.gain.setTargetAtTime(volume(), ctx.currentTime, 0.02);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && playing) stop();
});

// ---------- 更新 ----------
function update() {
  let p;
  try {
    p = readInputs();
  } catch (e) {
    note(e.message + (lastWave ? "（音と図は、直前の正しい入力のままです）" : ""), true);
    return;
  }
  const high = [];
  for (let k = 1; k <= p.n; k++) if (k * p.f0 > AUDIBLE_MAX && (p.ak[k] || p.bk[k])) high.push(k);
  const s = soundOf(p);
  lastWave = s;

  el.readout.textContent = `周期 2L = ${fmt(2 * p.L * 1000)} ミリ秒　／　基本周波数 f₀ = ${hz(p.f0)}　／　最も高い倍音 n·f₀ = ${hz(p.n * p.f0)}`;
  const warns = [];
  if (s.silent) warns.push("aₖ と bₖ が（聞こえる範囲で）すべて 0 なので、音は出ません。");
  if (p.f0 < 20) warns.push(`f₀ が ${hz(p.f0)} と低いので、音の高さというより「ブツブツ」という刻みに聞こえます。`);
  if (high.length) warns.push(`k·f₀ が ${AUDIBLE_MAX / 1000} kHz をこえる倍音（k = ${high.length > 4 ? high.slice(0, 4).join(", ") + " …" : high.join(", ")}）は、人の耳には聞こえないので鳴らしません。`);
  note(warns.join(" "), false);

  drawWave(p);
  drawSpectrum(p);
  fillTable(p);
  applySound(s);
  saveToUrl();
  current = p;
}
let current = null;

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 150); };
[el.a0, el.n, el.ak, el.bk, el.L].forEach((i) => i.addEventListener("input", schedule));
window.addEventListener("resize", () => current && (drawWave(current), drawSpectrum(current)));
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => current && (drawWave(current), drawSpectrum(current)));

// ---------- 例と音の高さ ----------
const PRESETS = {
  sine: { a0: "0", n: "1", ak: "0", bk: "eq(k,1)" },
  square: { a0: "0", n: "20", ak: "0", bk: "4*mod(k,2)/(k*pi)" },
  saw: { a0: "0", n: "30", ak: "0", bk: "2*(-1)^(k+1)/(k*pi)" },
  triangle: { a0: "1", n: "10", ak: "-4*mod(k,2)/(k^2*pi^2)", bk: "0" },
  pulse: { a0: "0", n: "30", ak: "1", bk: "0" },
};
document.querySelectorAll("[data-preset]").forEach((b) =>
  b.addEventListener("click", () => {
    const p = PRESETS[b.dataset.preset];
    el.a0.value = p.a0;
    el.n.value = p.n;
    el.ak.value = p.ak;
    el.bk.value = p.bk;
    update();
  })
);
document.querySelectorAll("[data-note]").forEach((b) =>
  b.addEventListener("click", () => {
    el.L.value = `1/(2*${b.dataset.note})`;
    update();
  })
);

// ---------- 入力を URL に残す（URL をコピーすれば同じ設定を人に見せられる） ----------
const KEYS = ["a0", "n", "ak", "bk", "L"];
function saveToUrl() {
  const q = new URLSearchParams();
  KEYS.forEach((k) => q.set(k, el[k].value));
  try { history.replaceState(null, "", "?" + q.toString()); } catch {}
}
function loadFromUrl() {
  const q = new URLSearchParams(location.search);
  KEYS.forEach((k) => { if (q.has(k)) el[k].value = q.get(k).slice(0, 200); });
}

// テストやデバッグ用に、計算の関数を出しておく
window.fourier = { readInputs, wave };

loadFromUrl();
update();
