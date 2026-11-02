import React, { useState, useRef, useEffect, useMemo, useReducer } from "react";
import "./App.css";

const W = 1280;
const H = 720;
const TH = 48;
const TRACKS = ["Overlay", "Video", "Audio"];

const DEF = {
  x: 0,
  y: 0,
  scale: 1,
  opacity: 1,
  volume: 1,
  brightness: 1,
  contrast: 1,
  saturate: 1,
  gray: 0,
  blur: 0,
  fade: 0,
  rot: 0,
  fx: 1,
  fy: 1,
  sepia: 0,
  hue: 0,
  invert: 0,
  vig: 0,
  grain: 0,
  pix: 0,
  sp: 1,
  sp2: 1,
  tin: "none",
  tout: "none",
  td: 0.6,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const srcT = (c, t) => {
  const u = clamp(t - c.start, 0, c.dur);
  return c.in + c.sp * u + ((c.sp2 - c.sp) * u * u) / (2 * c.dur);
};

const spAt = (c, t) =>
  c.sp + (c.sp2 - c.sp) * clamp((t - c.start) / c.dur, 0, 1);

const TRANS = [
  "none",
  "fade",
  "slide left",
  "slide right",
  "slide up",
  "slide down",
  "zoom",
  "spin",
  "wipe",
  "blur",
];

const trn = (y, k) => {
  const r = { a: 1, x: 0, y: 0, s: 1, r: 0, b: 0, w: 1 };
  const j = 1 - k;
  if (y === "fade") r.a = k;
  else if (y === "slide left") r.x = -W * j;
  else if (y === "slide right") r.x = W * j;
  else if (y === "slide up") r.y = -H * j;
  else if (y === "slide down") r.y = H * j;
  else if (y === "zoom") {
    r.s = 0.5 + 0.5 * k;
    r.a = k;
  } else if (y === "spin") {
    r.r = -Math.PI * j;
    r.s = 0.4 + 0.6 * k;
    r.a = k;
  } else if (y === "wipe") r.w = k;
  else if (y === "blur") {
    r.b = 20 * j;
    r.a = k;
  }
  return r;
};

const LOOKS = {
  Vivid: { saturate: 1.5, contrast: 1.15 },
  Noir: { gray: 1, contrast: 1.3, vig: 0.5 },
  Warm: { sepia: 0.3, saturate: 1.2, brightness: 1.05 },
  Cool: { hue: -15, saturate: 0.9, brightness: 1.03 },
  Vintage: { sepia: 0.6, contrast: 0.9, grain: 0.5, vig: 0.4 },
  Clean: {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    gray: 0,
    sepia: 0,
    hue: 0,
    invert: 0,
    vig: 0,
    grain: 0,
    blur: 0,
    pix: 0,
  },
};

const noise = (() => {
  const n = document.createElement("canvas");
  n.width = n.height = 128;
  const x = n.getContext("2d");
  const i = x.createImageData(128, 128);
  for (let k = 0; k < i.data.length; k += 4) {
    const v = Math.random() * 255;
    i.data[k] = i.data[k + 1] = i.data[k + 2] = v;
    i.data[k + 3] = 255;
  }
  x.putImageData(i, 0, 0);
  return n;
})();

const tmp = document.createElement("canvas");

let uid = 1;
const nid = () => "i" + uid++;

const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * 30);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(m)}:${p(s)}:${p(f)}`;
};

const push = (s) => [...s.past.slice(-50), s.clips];

function reducer(s, a) {
  switch (a.t) {
    case "media":
      return { ...s, media: [...s.media, a.m] };
    case "snap":
      return { ...s, past: push(s) };
    case "undo":
      return s.past.length
        ? {
            ...s,
            clips: s.past[s.past.length - 1],
            past: s.past.slice(0, -1),
            sel: null,
          }
        : s;
    case "set":
      return {
        ...s,
        clips: s.clips.map((c) => (c.id === a.id ? { ...c, ...a.p } : c)),
      };
    case "add":
      return { ...s, past: push(s), clips: [...s.clips, a.c], sel: a.c.id };
    case "del":
      return s.sel
        ? {
            ...s,
            past: push(s),
            clips: s.clips.filter((c) => c.id !== s.sel),
            sel: null,
          }
        : s;
    case "sel":
      return { ...s, sel: a.id };
    case "split": {
      const t = a.time;
      const ok = (c) => t > c.start + 0.05 && t < c.start + c.dur - 0.05;
      const c =
        s.clips.find((c) => c.id === s.sel && ok(c)) ||
        s.clips.filter(ok).sort((x, y) => x.track - y.track)[0];
      if (!c) return s;
      const d = t - c.start;
      const sp = spAt(c, t);
      const n = {
        ...c,
        id: nid(),
        start: t,
        in: srcT(c, t),
        dur: c.dur - d,
        sp,
        tin: "none",
      };
      return {
        ...s,
        past: push(s),
        clips: s.clips
          .map((x) =>
            x.id === c.id ? { ...x, dur: d, sp2: sp, tout: "none" } : x,
          )
          .concat(n),
        sel: n.id,
      };
    }
    case "dup": {
      const c = s.clips.find((c) => c.id === s.sel);
      if (!c) return s;
      const n = { ...c, id: nid(), start: c.start + c.dur };
      return { ...s, past: push(s), clips: [...s.clips, n], sel: n.id };
    }
    default:
      return s;
  }
}

export default function App() {
  const [s, d] = useReducer(reducer, {
    media: [],
    clips: [],
    sel: null,
    past: [],
  });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(70);
  const [exp, setExp] = useState(false);

  const cv = useRef();
  const inner = useRef();
  const rows = useRef();
  const file = useRef();
  const els = useRef({});
  const au = useRef({});
  const T = useRef(0);
  const R = useRef({});
  const rec = useRef(null);
  const lastSnap = useRef(0);
  const [over, setOver] = useState(-1);

  const end = useMemo(
    () => Math.max(0, ...s.clips.map((c) => c.start + c.dur)),
    [s.clips],
  );
  const mm = useMemo(
    () => Object.fromEntries(s.media.map((m) => [m.id, m])),
    [s.media],
  );
  R.current = { s, playing, end, mm };
  const sel = s.clips.find((c) => c.id === s.sel);

  const ensure = () => {
    if (!au.current.c) {
      const c = new (window.AudioContext || window.webkitAudioContext)();
      au.current = { c, d: c.createMediaStreamDestination() };
    }
    return au.current;
  };

  const getEl = (c) => {
    if (els.current[c.id]) return els.current[c.id];
    const m = R.current.mm[c.mediaId];
    if (!m) return null;
    let e;
    if (m.type === "image") {
      e = new Image();
      e.src = m.url;
    } else {
      e = document.createElement(m.type);
      e.src = m.url;
      e.preload = "auto";
      e.playsInline = true;
      try {
        const a = ensure();
        const src = a.c.createMediaElementSource(e);
        src.connect(a.d);
        src.connect(a.c.destination);
      } catch (x) {}
    }
    return (els.current[c.id] = e);
  };

  const fade = (c, t) =>
    c.fade > 0
      ? clamp(
          Math.min((t - c.start) / c.fade, (c.start + c.dur - t) / c.fade),
          0,
          1,
        )
      : 1;

  const render = (cx, t, clips, play) => {
    cx.filter = "none";
    cx.globalAlpha = 1;
    cx.shadowBlur = 0;
    cx.fillStyle = "#000";
    cx.fillRect(0, 0, W, H);

    const act = clips.filter((c) => t >= c.start && t < c.start + c.dur);
    const live = new Set();

    for (const c of act) {
      if (c.type === "text") continue;
      live.add(c.id);
      const e = getEl(c);
      if (!e || c.type === "image") continue;
      const lt = srcT(c, t);
      e.playbackRate = clamp(spAt(c, t), 0.0625, 16);
      if (play) {
        if (e.paused) e.play().catch(() => {});
        if (Math.abs(e.currentTime - lt) > 0.3) e.currentTime = lt;
      } else {
        if (!e.paused) e.pause();
        if (Math.abs(e.currentTime - lt) > 0.04) e.currentTime = lt;
      }
      e.volume = clamp(c.volume * fade(c, t), 0, 1);
    }

    for (const id in els.current) {
      const e = els.current[id];
      if (!live.has(id) && e.pause && !e.paused) e.pause();
    }

    for (const tr of [1, 0]) {
      for (const c of act.filter((c) => c.track === tr)) {
        cx.save();
        const ti = trn(c.tin, clamp((t - c.start) / c.td, 0, 1));
        const to = trn(c.tout, clamp((c.start + c.dur - t) / c.td, 0, 1));
        const wk = ti.w * to.w;
        if (wk < 1) {
          cx.beginPath();
          cx.rect(0, 0, W * wk, H);
          cx.clip();
        }
        cx.globalAlpha = clamp(c.opacity * fade(c, t) * ti.a * to.a, 0, 1);
        cx.translate(
          W / 2 + (c.x / 100) * W + ti.x + to.x,
          H / 2 + (c.y / 100) * H + ti.y + to.y,
        );
        cx.rotate((c.rot * Math.PI) / 180 + ti.r + to.r);
        cx.scale(c.scale * ti.s * to.s * c.fx, c.scale * ti.s * to.s * c.fy);

        if (c.type === "text") {
          const z = c.size;
          const ls = c.text.split("\n");
          cx.font = `700 ${z}px "Instrument Sans",system-ui,sans-serif`;
          cx.textAlign = "center";
          cx.textBaseline = "middle";
          cx.fillStyle = c.color;
          cx.shadowColor = "rgba(0,0,0,.55)";
          cx.shadowBlur = z / 6;
          ls.forEach((l, i) =>
            cx.fillText(l, 0, (i - (ls.length - 1) / 2) * z * 1.2),
          );
        } else if (c.type !== "audio") {
          const e = els.current[c.id];
          if (e) {
            const iw = e.videoWidth || e.naturalWidth;
            const ih = e.videoHeight || e.naturalHeight;
            if (iw && ih) {
              const k = Math.min(W / iw, H / ih);
              const dw = iw * k;
              const dh = ih * k;
              cx.filter = `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturate}) grayscale(${c.gray}) sepia(${c.sepia}) hue-rotate(${c.hue}deg) invert(${c.invert}) blur(${c.blur + ti.b + to.b}px)`;
              try {
                if (c.pix > 0) {
                  const p = 1 + c.pix;
                  const w2 = Math.max(1, (dw / p) | 0);
                  const h2 = Math.max(1, (dh / p) | 0);
                  tmp.width = w2;
                  tmp.height = h2;
                  tmp.getContext("2d").drawImage(e, 0, 0, w2, h2);
                  cx.imageSmoothingEnabled = false;
                  cx.drawImage(tmp, -dw / 2, -dh / 2, dw, dh);
                } else {
                  cx.drawImage(e, -dw / 2, -dh / 2, dw, dh);
                }
              } catch (x) {}
            }
          }
        }
        cx.restore();

        if (c.vig > 0 || c.grain > 0) {
          cx.save();
          cx.globalAlpha = clamp(fade(c, t) * ti.a * to.a, 0, 1);
          if (c.vig > 0) {
            const g = cx.createRadialGradient(
              W / 2,
              H / 2,
              H * 0.35,
              W / 2,
              H / 2,
              W * 0.62,
            );
            g.addColorStop(0, "rgba(0,0,0,0)");
            g.addColorStop(1, `rgba(0,0,0,${c.vig})`);
            cx.fillStyle = g;
            cx.fillRect(0, 0, W, H);
          }
          if (c.grain > 0) {
            cx.globalAlpha *= c.grain * 0.35;
            cx.translate(Math.random() * 128, Math.random() * 128);
            cx.fillStyle = cx.createPattern(noise, "repeat");
            cx.fillRect(-128, -128, W + 128, H + 128);
          }
          cx.restore();
        }
      }
    }
  };

  useEffect(() => {
    const cx = cv.current.getContext("2d");
    let raf;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let t = T.current;
      if (R.current.playing) {
        t += dt;
        if (t >= R.current.end) {
          t = R.current.end;
          R.current.playing = false;
          setPlaying(false);
          const r = rec.current;
          rec.current = null;
          if (r) setTimeout(() => r.stop(), 250);
        }
        T.current = t;
        setTime(t);
      }
      render(cx, t, R.current.s.clips, R.current.playing);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = (t) => {
    T.current = clamp(t, 0, R.current.end);
    setTime(T.current);
  };

  const play = async () => {
    if (!R.current.end) return;
    const a = ensure();
    await a.c.resume();
    if (T.current >= R.current.end - 0.01) seek(0);
    R.current.playing = true;
    setPlaying(true);
  };

  const pause = () => {
    R.current.playing = false;
    setPlaying(false);
  };

  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "range")
        return;
      if (e.code === "Space") {
        e.preventDefault();
        playing ? pause() : play();
      } else if (e.key === "s" || e.key === "S") {
        d({ t: "split", time: T.current });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        d({ t: "del" });
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        d({ t: "undo" });
      } else if (e.key === "ArrowLeft") {
        seek(T.current - 1 / 30);
      } else if (e.key === "ArrowRight") {
        seek(T.current + 1 / 30);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const imp = (files) =>
    [...files].forEach((f) => {
      const type = f.type.startsWith("video")
        ? "video"
        : f.type.startsWith("audio")
          ? "audio"
          : f.type.startsWith("image")
            ? "image"
            : null;
      if (!type) return;
      const m = {
        id: nid(),
        name: f.name,
        type,
        url: URL.createObjectURL(f),
        duration: 5,
      };
      if (type === "image") {
        d({ t: "media", m });
      } else {
        const e = document.createElement(type);
        e.preload = "metadata";
        e.onloadedmetadata = () =>
          d({ t: "media", m: { ...m, duration: e.duration || 5 } });
        e.src = m.url;
      }
    });

  const place = (m, start = T.current, track) =>
    d({
      t: "add",
      c: {
        ...DEF,
        id: nid(),
        mediaId: m.id,
        type: m.type,
        track: track ?? (m.type === "audio" ? 2 : 1),
        start,
        in: 0,
        dur: m.duration,
      },
    });

  const addText = () =>
    d({
      t: "add",
      c: {
        ...DEF,
        id: nid(),
        type: "text",
        track: 0,
        start: T.current,
        in: 0,
        dur: 4,
        text: "Your title",
        size: 72,
        color: "#ffffff",
      },
    });

  const U = (p) => {
    if (Date.now() - lastSnap.current > 700) {
      d({ t: "snap" });
      lastSnap.current = Date.now();
    }
    d({ t: "set", id: sel.id, p });
  };

  const snapT = (v, id, len) => {
    const pts = [
      T.current,
      ...R.current.s.clips
        .filter((x) => x.id !== id)
        .flatMap((x) => [x.start, x.start + x.dur]),
    ];
    let best = v;
    let bd = 8 / zoom;
    for (const p of pts) {
      for (const c of [p, p - len]) {
        const e = Math.abs(c - v);
        if (e < bd) {
          bd = e;
          best = c;
        }
      }
    }
    return Math.max(0, best);
  };

  const drag = (e, c, mode) => {
    e.stopPropagation();
    e.preventDefault();
    d({ t: "sel", id: c.id });
    d({ t: "snap" });
    const x0 = e.clientX;
    const o = { ...c };
    const m = mm[c.mediaId];
    const av = c.type === "video" || c.type === "audio";
    const max = av && m ? m.duration : Infinity;

    const mv = (ev) => {
      const dx = (ev.clientX - x0) / zoom;
      let p;
      if (mode === "move") {
        const st = snapT(Math.max(0, o.start + dx), c.id, o.dur);
        const r = rows.current.getBoundingClientRect();
        const row = clamp(Math.floor((ev.clientY - r.top) / TH), 0, 2);
        const ok = c.type === "audio" ? row === 2 : row < 2;
        p = { start: st, track: ok ? row : o.track };
      } else if (mode === "l") {
        let dd = snapT(Math.max(0, o.start + dx), c.id, 0) - o.start;
        dd = clamp(
          dd,
          av ? -Math.min(o.start, o.in / Math.max(o.sp, 0.1)) : -o.start,
          o.dur - 0.1,
        );
        p = {
          start: o.start + dd,
          in: o.in + o.sp * dd + ((o.sp2 - o.sp) * dd * dd) / (2 * o.dur),
          dur: o.dur - dd,
          sp: o.sp + ((o.sp2 - o.sp) * dd) / o.dur,
        };
      } else {
        p = {
          dur: clamp(
            snapT(o.start + o.dur + dx, c.id, 0) - o.start,
            0.1,
            (max - (av ? o.in : 0)) / ((o.sp + o.sp2) / 2),
          ),
        };
      }
      d({ t: "set", id: c.id, p });
    };

    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const scrub = (e) => {
    if (e.target.closest(".clip")) return;
    if (e.currentTarget.className === "row") d({ t: "sel", id: null });
    const at = (ev) =>
      seek((ev.clientX - inner.current.getBoundingClientRect().left) / zoom);
    at(e);
    const up = () => {
      window.removeEventListener("pointermove", at);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", at);
    window.addEventListener("pointerup", up);
  };

  const drop = (e, i) => {
    e.preventDefault();
    setOver(-1);
    const m = mm[e.dataTransfer.getData("text/plain")];
    if (!m) return;
    if ((m.type === "audio") !== (i === 2)) return;
    place(
      m,
      Math.max(
        0,
        (e.clientX - inner.current.getBoundingClientRect().left) / zoom,
      ),
      i,
    );
  };

  const exportV = async () => {
    if (!end || exp) return;
    if (!window.MediaRecorder) {
      alert("This browser can’t record video. Try Chrome, Edge or Firefox.");
      return;
    }
    const a = ensure();
    await a.c.resume();
    const cs = cv.current.captureStream(30);
    a.d.stream.getAudioTracks().forEach((t) => cs.addTrack(t));
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    const ch = [];
    const r = new MediaRecorder(cs, {
      mimeType: mime,
      videoBitsPerSecond: 8e6,
    });
    r.ondataavailable = (ev) => ev.data.size && ch.push(ev.data);
    r.onstop = () => {
      const l = document.createElement("a");
      l.href = URL.createObjectURL(new Blob(ch, { type: "video/webm" }));
      l.download = "reel-bench-export.webm";
      l.click();
      setExp(false);
    };
    rec.current = r;
    setExp(true);
    seek(0);
    r.start(250);
    R.current.playing = true;
    setPlaying(true);
  };

  const SP = (p) => {
    const n = { ...sel, ...p };
    U({
      ...p,
      dur: Math.max(
        0.1,
        (((sel.sp + sel.sp2) / 2) * sel.dur) / ((n.sp + n.sp2) / 2),
      ),
    });
  };

  const Sp = (l, k) => (
    <label className="fld">
      <span>{l}</span>
      <input
        type="range"
        min="0.1"
        max="4"
        step="0.05"
        value={sel[k]}
        onChange={(e) => SP({ [k]: +e.target.value })}
      />
      <output>{sel[k].toFixed(2)}x</output>
    </label>
  );

  const Sl = (l, k, a, b, st) => (
    <label className="fld">
      <span>{l}</span>
      <input
        type="range"
        min={a}
        max={b}
        step={st}
        value={sel[k]}
        onChange={(e) => U({ [k]: +e.target.value })}
      />
      <output>{(+sel[k]).toFixed(2)}</output>
    </label>
  );

  const step = zoom >= 110 ? 1 : zoom >= 55 ? 2 : 5;
  const tw = Math.max(end + 10, 30) * zoom;
  const ticks = [];
  for (let i = 0; i * step * zoom < tw; i++) ticks.push(i * step);

  const label = (c) =>
    c.type === "text" ? c.text.split("\n")[0] : (mm[c.mediaId] || {}).name;

  return (
    <div id="app">
      <header>
        <h1>Reel Bench</h1>
        <input
          ref={file}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          hidden
          onChange={(e) => {
            imp(e.target.files);
            e.target.value = "";
          }}
        />
        <button onClick={() => file.current.click()}>Import media</button>
        <button onClick={addText}>Add text</button>
        <button
          onClick={() => d({ t: "split", time: T.current })}
          disabled={!s.clips.length}
        >
          Split at playhead
        </button>
        <button onClick={() => d({ t: "dup" })} disabled={!sel}>
          Duplicate
        </button>
        <button onClick={() => d({ t: "del" })} disabled={!sel}>
          Delete clip
        </button>
        <button onClick={() => d({ t: "undo" })} disabled={!s.past.length}>
          Undo
        </button>
        <span className="sp"></span>
        <label className="hint">
          Zoom{" "}
          <input
            type="range"
            min="20"
            max="200"
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
        </label>
        <button className="pri" onClick={exportV} disabled={!end || exp}>
          Export WebM
        </button>
      </header>

      <main>
        <aside className="l">
          <h2>Media</h2>
          {!s.media.length && (
            <p className="hint">
              Import videos, audio or images. Drag a file onto a track, or press
              Add.
            </p>
          )}
          {s.media.map((m) => (
            <div
              key={m.id}
              className="mi"
              draggable="true"
              onDragStart={(e) => e.dataTransfer.setData("text/plain", m.id)}
              onDoubleClick={() => place(m)}
            >
              {m.type === "video" ? (
                <video src={m.url + "#t=0.5"} muted preload="metadata"></video>
              ) : m.type === "image" ? (
                <img src={m.url} alt="" />
              ) : (
                <div className="note">♪</div>
              )}
              <div>
                <b title={m.name}>{m.name}</b>
                <small>
                  {m.type}, {m.duration.toFixed(1)}s
                </small>
              </div>
              <button onClick={() => place(m)}>Add</button>
            </div>
          ))}
        </aside>

        <section className="stage">
          <div className="cvw">
            <canvas ref={cv} width={W} height={H}></canvas>
            {!s.clips.length && (
              <div className="empty">
                <b>Your preview appears here</b>
                <span>Import a clip, then add it to the timeline.</span>
                <button onClick={() => file.current.click()}>
                  Import media
                </button>
              </div>
            )}
          </div>
          <div className="tp">
            <button
              onClick={() => (playing ? pause() : play())}
              disabled={!end}
              style={{ minWidth: 70 }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => seek(0)}>Start</button>
            <input
              type="range"
              min="0"
              max={end || 1}
              step="0.01"
              value={time}
              onChange={(e) => seek(+e.target.value)}
              aria-label="Scrub"
            />
            <output>
              {fmt(time)} / {fmt(end)}
            </output>
          </div>
        </section>

        <aside className="r">
          <h2>
            {sel
              ? sel.type === "text"
                ? "Text clip"
                : label(sel)
              : "Inspector"}
          </h2>
          {!sel && (
            <>
              <p className="hint">Select a clip on the timeline to edit it.</p>
              <p className="hint">
                Space plays and pauses. S splits at the playhead. Delete removes
                the clip. Ctrl+Z undoes. Arrow keys step one frame.
              </p>
            </>
          )}
          {sel && sel.type === "text" && (
            <>
              <textarea
                value={sel.text}
                onChange={(e) => U({ text: e.target.value })}
              ></textarea>
              <label className="fld">
                <span>Color</span>
                <input
                  type="color"
                  value={sel.color}
                  onChange={(e) => U({ color: e.target.value })}
                />
                <output></output>
              </label>
              {Sl("Size", "size", 16, 200, 1)}
            </>
          )}
          {sel && sel.type !== "audio" && (
            <>
              {Sl("Scale", "scale", 0.1, 3, 0.01)}
              {Sl("Left / right", "x", -60, 60, 0.5)}
              {Sl("Up / down", "y", -60, 60, 0.5)}
              {Sl("Opacity", "opacity", 0, 1, 0.01)}
              {Sl("Rotate", "rot", -180, 180, 1)}
              <div className="btns">
                <button onClick={() => U({ fx: -sel.fx })}>
                  Flip horizontal
                </button>
                <button onClick={() => U({ fy: -sel.fy })}>
                  Flip vertical
                </button>
              </div>
            </>
          )}
          {sel &&
            (sel.type === "video" || sel.type === "audio") &&
            Sl("Volume", "volume", 0, 1, 0.01)}
          {sel && (
            <>
              {Sl("Fade in/out", "fade", 0, 3, 0.1)}
              <div className="grp">
                <h2>Transitions</h2>
                <label className="fld">
                  <span>In</span>
                  <select
                    value={sel.tin}
                    onChange={(e) => U({ tin: e.target.value })}
                  >
                    {TRANS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <output></output>
                </label>
                <label className="fld">
                  <span>Out</span>
                  <select
                    value={sel.tout}
                    onChange={(e) => U({ tout: e.target.value })}
                  >
                    {TRANS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <output></output>
                </label>
                {Sl("Length", "td", 0.1, 2, 0.05)}
                <p className="hint">
                  For a cross-dissolve, overlap two clips on one track and give
                  both a fade transition.
                </p>
              </div>
              {(sel.type === "video" || sel.type === "audio") && (
                <div className="grp">
                  <h2>Speed and ramping</h2>
                  {Sp("Speed", "sp")}
                  {Sp("Ramp to", "sp2")}
                  <div className="btns">
                    {[
                      ["0.5x", 0.5, 0.5],
                      ["2x", 2, 2],
                      ["Slow-mo ramp", 1, 0.25],
                      ["Speed-up ramp", 1, 3],
                      ["Reset", 1, 1],
                    ].map(([n, a, b]) => (
                      <button key={n} onClick={() => SP({ sp: a, sp2: b })}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {sel && (sel.type === "video" || sel.type === "image") && (
            <div className="grp">
              {Sl("Brightness", "brightness", 0, 2, 0.01)}
              {Sl("Contrast", "contrast", 0, 2, 0.01)}
              {Sl("Saturation", "saturate", 0, 3, 0.01)}
              {Sl("Grayscale", "gray", 0, 1, 0.01)}
              {Sl("Blur", "blur", 0, 20, 0.5)}
              {Sl("Sepia", "sepia", 0, 1, 0.01)}
              {Sl("Hue", "hue", -180, 180, 1)}
              {Sl("Invert", "invert", 0, 1, 0.01)}
              {Sl("Vignette", "vig", 0, 1, 0.01)}
              {Sl("Film grain", "grain", 0, 1, 0.01)}
              {Sl("Pixelate", "pix", 0, 40, 1)}
              <div className="btns">
                {Object.keys(LOOKS).map((n) => (
                  <button key={n} onClick={() => U(LOOKS[n])}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sel && (
            <p className="hint">
              Starts at {fmt(sel.start)}, lasts {sel.dur.toFixed(2)}s
            </p>
          )}
        </aside>
      </main>

      <div className="tl">
        <div className="lab">
          {TRACKS.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
        <div className="tls">
          <div className="inner" ref={inner} style={{ width: tw }}>
            <div className="ruler" onPointerDown={scrub}>
              {ticks.map((t) => (
                <i key={t} style={{ left: t * zoom }}>
                  {t}s
                </i>
              ))}
            </div>
            <div ref={rows}>
              {TRACKS.map((n, i) => (
                <div
                  key={n}
                  className={"row" + (over === i ? " over" : "")}
                  onPointerDown={scrub}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(i);
                  }}
                  onDragLeave={() => setOver(-1)}
                  onDrop={(e) => drop(e, i)}
                >
                  {s.clips
                    .filter((c) => c.track === i)
                    .map((c) => (
                      <div
                        key={c.id}
                        className={
                          "clip " + c.type + (s.sel === c.id ? " on" : "")
                        }
                        style={{
                          left: c.start * zoom,
                          width: Math.max(6, c.dur * zoom),
                        }}
                        onPointerDown={(e) => drag(e, c, "move")}
                      >
                        <i
                          className="h l"
                          onPointerDown={(e) => drag(e, c, "l")}
                        ></i>
                        <span>{label(c)}</span>
                        <i
                          className="h r"
                          onPointerDown={(e) => drag(e, c, "r")}
                        ></i>
                      </div>
                    ))}
                </div>
              ))}
            </div>
            <div className="ph" style={{ left: time * zoom }}></div>
          </div>
        </div>
      </div>

      {exp && (
        <div className="busy">
          <b>Exporting your video</b>
          <span>It records in real time, so keep this tab open.</span>
          <div className="bar">
            <i style={{ width: (end ? (time / end) * 100 : 0) + "%" }}></i>
          </div>
        </div>
      )}
    </div>
  );
}
