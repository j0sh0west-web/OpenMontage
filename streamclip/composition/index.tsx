// StreamClip — third-party Twitch streamer clip, 1080x1920 @30fps.
// Layout: facecam panel on top (the streamer is the star), gameplay panel below, blurred fill behind.
// Word-by-word speaker-coloured captions on the seam, facecam punch-ins on outbursts, gameplay push/focus zooms,
// freeze-frame hook + whoosh-blur into the story, soft crossfades on jump cuts. No logos (campaign rule).
import React from "react";
import {
  AbsoluteFill, Composition, Freeze, OffthreadVideo, Sequence, interpolate, registerRoot, spring, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from "remotion";

type Rect = { x: number; y: number; w: number; h: number };
type Seg = {
  from: number; dur: number; trim: number;            // output frame, frames, source seconds
  freeze?: boolean; xfade?: number; blurIn?: number;   // freeze on trim frame; crossfade-in frames; whoosh blur-in frames
  gz?: [number, number]; focus?: [number, number];     // gameplay zoom start/end, focus point (0..1 in crop)
  faceZoom?: [number, number]; dim?: boolean;
};
type Zoom = { from: number; dur: number; z: number; focus: [number, number] }; // gameplay focus zoom (output frames)
type Word = { t: number; w: string };                  // t = frames from caption start
type Cap = { from: number; dur: number; spk: "kai" | "mandy" | "jason"; words: Word[] };
type Props = {
  fps: number; durationInFrames: number; src: string; face: Rect; game: Rect;
  segs: Seg[]; zooms: Zoom[]; punches: number[]; caps: Cap[];
  hook: { text: string; dur: number }; credit: string;
  censor?: { keys: [number, number][]; end: number; boxes?: { from: number; to: number; x: number; y: number; w: number; h: number }[] };   // [frame, band top in gameplay panel px]
};

const W = 1080, FACE_Y = 130, FACE_H = 596, GAME_Y = FACE_Y + FACE_H, GAME_H = 1920 - GAME_Y;
const COL = { kai: "#FFD400", mandy: "#FF4FD8", jason: "#4FD8FF" };
const NAME = { kai: "KAI", mandy: "MANDY", jason: "JASON" };
const fontCss = `@font-face{font-family:'MX';src:url('${staticFile("font/montserrat-latin-800-normal.woff2")}') format('woff2');font-weight:800;}
@font-face{font-family:'MXI';src:url('${staticFile("font/montserrat-latin-900-italic.woff2")}') format('woff2');font-weight:900;font-style:italic;}`;
const EMOJI = "'Noto Color Emoji'";

// Crop a source rect into a panel, with an extra zoom around a focus point (0..1 of the rect).
const Cropped: React.FC<{ src: string; trim: number; r: Rect; pw: number; ph: number; z: number;
  focus: [number, number]; freeze?: boolean; filter?: string }> = ({ src, trim, r, pw, ph, z, focus, freeze, filter }) => {
  const s = pw / r.w;
  const vid = (
    <OffthreadVideo src={staticFile(src)} startFrom={Math.round(trim * 30)} muted
      style={{ position: "absolute", width: 1920 * s, height: 1080 * s, left: -r.x * s, top: -r.y * s, maxWidth: "none" }} />
  );
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: pw, height: ph, transform: `scale(${z})`,
        transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`, filter }}>
        {freeze ? <Freeze frame={0}>{vid}</Freeze> : vid}
      </div>
    </div>
  );
};

const punchAmount = (f: number, punches: number[]) => {
  let a = 0;
  for (const p of punches) {
    const d = f - p;
    if (d < 0 || d > 22) continue;
    a = Math.max(a, interpolate(d, [0, 3, 22], [0, 1, 0], { easing: Easing.out(Easing.cubic) }));
  }
  return a;
};

const SegView: React.FC<{ s: Seg; p: Props }> = ({ s, p }) => {
  const f = useCurrentFrame();
  const g = f + s.from;                                   // global frame
  const k = interpolate(f, [0, s.dur], [0, 1], { extrapolateRight: "clamp" });
  // gameplay zoom: segment push + any focus zoom window
  let gz = interpolate(k, [0, 1], s.gz || [1.0, 1.05]);
  let focus: [number, number] = s.focus || [0.5, 0.5];
  for (const z of p.zooms) {
    if (g < z.from - 1 || g > z.from + z.dur + 8) continue;
    const a = interpolate(g, [z.from, z.from + 14, z.from + z.dur, z.from + z.dur + 6], [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
    gz = gz * (1 + (z.z - 1) * a); focus = [focus[0] + (z.focus[0] - focus[0]) * a, focus[1] + (z.focus[1] - focus[1]) * a];
  }
  const pa = punchAmount(g, p.punches);
  const fz = (s.faceZoom ? interpolate(k, [0, 1], s.faceZoom) : 1) * (1 + 0.16 * pa);
  const shake = pa > 0.05 ? `translate(${Math.sin(g * 2.7) * 6 * pa}px, ${Math.cos(g * 3.1) * 5 * pa}px)` : "";
  const fadeIn = s.xfade ? interpolate(f, [0, s.xfade], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const blur = s.blurIn ? interpolate(f, [0, s.blurIn], [26, 0], { extrapolateRight: "clamp" }) : 0;
  const bz = s.blurIn ? interpolate(f, [0, s.blurIn], [1.08, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }) : 1;
  const dim = s.dim ? interpolate(f, [0, 8], [1, 0.45], { extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={{ opacity: fadeIn, filter: blur ? `blur(${blur}px)` : undefined, transform: `scale(${bz})` }}>
      {/* blurred fill behind everything */}
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#0b0614" }}>
        <Cropped src={p.src} trim={s.trim} r={{ x: 300, y: 0, w: 1300, h: 1080 }} pw={W} ph={1920} z={1.25} focus={[0.5, 0.5]}
          freeze={s.freeze} filter="blur(40px) brightness(0.45) saturate(1.3)" />
      </AbsoluteFill>
      {/* gameplay panel */}
      <div style={{ position: "absolute", left: 0, top: GAME_Y, width: W, height: GAME_H, overflow: "hidden" }}>
        <Cropped src={p.src} trim={s.trim} r={p.game} pw={W} ph={GAME_H} z={gz} focus={focus} freeze={s.freeze}
          filter={`brightness(${dim * 1.12}) contrast(1.06) saturate(1.12)`} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.4) 100%)" }} />
      </div>
      {/* facecam panel */}
      <div style={{ position: "absolute", left: 0, top: FACE_Y, width: W, height: FACE_H, overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}>
        <div style={{ position: "absolute", inset: 0, transform: shake }}>
          <Cropped src={p.src} trim={s.trim} r={p.face} pw={W} ph={FACE_H} z={fz} focus={[0.52, 0.42]} freeze={s.freeze}
            filter="contrast(1.08) saturate(1.1)" />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Nudity censor: heavy blur over the lower gameplay panel (body), face kept visible; band top animates between keys.
const BLUR = "blur(34px) brightness(0.8)";
const Censor: React.FC<{ keys: [number, number][]; end: number; boxes?: { from: number; to: number; x: number; y: number; w: number; h: number }[] }> = ({ keys, end, boxes }) => {
  const f = useCurrentFrame();
  const bx = (boxes || []).filter((b) => f >= b.from - 4 && f <= b.to + 4).map((b, i) => (
    <div key={i} style={{ position: "absolute", left: b.x, top: GAME_Y + b.y, width: b.w, height: b.h, borderRadius: 40,
      opacity: interpolate(f, [b.from - 4, b.from, b.to, b.to + 4], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      backdropFilter: BLUR, WebkitBackdropFilter: BLUR }} />));
  if (f > end + 8) return <>{bx}</>;
  const top = interpolate(f, keys.map((k) => k[0]), keys.map((k) => k[1]), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const o = interpolate(f, [end, end + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const mask = "linear-gradient(180deg, rgba(0,0,0,0) 0px, #000 46px, #000 100%)";
  return (<>
    <div style={{ position: "absolute", left: 0, top: GAME_Y + top - 46, width: W, height: GAME_H - top + 46, opacity: o,
      backdropFilter: BLUR, WebkitBackdropFilter: BLUR, maskImage: mask, WebkitMaskImage: mask }} />{bx}</>
  );
};

const CapView: React.FC<{ c: Cap }> = ({ c }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const pop = spring({ frame: f, fps, config: { damping: 13, stiffness: 320, mass: 0.5 } });
  const out = interpolate(f, [c.dur - 3, c.dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const col = COL[c.spk];
  const big = c.spk === "kai";
  return (
    <AbsoluteFill style={{ top: GAME_Y - (big ? 92 : 78), alignItems: "center", opacity: out }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
        transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])}) rotate(${big ? -2 : 0}deg)` }}>
        <div style={{ fontFamily: "MX", fontWeight: 800, fontSize: 30, letterSpacing: 3, color: "#111", background: col,
          padding: "3px 14px", borderRadius: 8, marginBottom: 6, boxShadow: "0 3px 10px rgba(0,0,0,0.5)" }}>
          {NAME[c.spk]}{big ? " 😭" : ""}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", maxWidth: 900 }}>
          {c.words.map((w, i) => {
            const on = f >= w.t;
            const next = i + 1 < c.words.length ? c.words[i + 1].t : 9999;
            const active = on && f < next;
            const ws = spring({ frame: f - w.t, fps, config: { damping: 12, stiffness: 380, mass: 0.4 } });
            return (
              <span key={i} style={{ fontFamily: `MXI, ${EMOJI}`, fontWeight: 900, fontStyle: "italic", textTransform: "uppercase",
                fontSize: big ? 92 : 68, lineHeight: 1.0, color: active ? col : "#fff", opacity: on ? 1 : 0.0,
                WebkitTextStroke: `${big ? 14 : 11}px #000`, paintOrder: "stroke fill" as const,
                textShadow: `0 7px 0 #000${active ? `, 0 0 26px ${col}` : ""}`,
                transform: `scale(${on ? interpolate(ws, [0, 1], [1.25, active ? 1.06 : 1]) : 1})`, display: "inline-block" }}>{w.w}</span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ text: string; dur: number }> = ({ text, dur }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 14, stiffness: 220 } });
  const out = interpolate(f, [dur - 6, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ top: GAME_Y + 120, alignItems: "center", opacity: out }}>
      <div style={{ maxWidth: 960, background: "#fff", color: "#111", fontFamily: `MX, ${EMOJI}`, fontWeight: 800, fontSize: 50,
        lineHeight: 1.18, padding: "18px 30px", borderRadius: 20, textAlign: "center", boxShadow: "0 8px 26px rgba(0,0,0,0.45)",
        transform: `translateY(${interpolate(s, [0, 1], [-40, 0])}px) scale(${interpolate(s, [0, 1], [0.9, 1])})` }}>{text}</div>
    </AbsoluteFill>
  );
};

export const StreamClip: React.FC<Props> = (p) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <style>{fontCss}</style>
    {p.segs.map((s, i) => (
      <Sequence key={`s${i}`} from={s.from} durationInFrames={s.dur + (p.segs[i + 1]?.xfade || 0)} layout="none">
        <SegView s={s} p={p} />
      </Sequence>))}
    {p.censor ? <Censor keys={p.censor.keys} end={p.censor.end} boxes={p.censor.boxes} /> : null}
    {p.caps.map((c, i) => (
      <Sequence key={`c${i}`} from={c.from} durationInFrames={c.dur} layout="none"><CapView c={c} /></Sequence>))}
    <Sequence from={0} durationInFrames={p.hook.dur} layout="none"><Hook text={p.hook.text} dur={p.hook.dur} /></Sequence>
    <AbsoluteFill style={{ top: 1548, left: 40 }}>
      <div style={{ fontFamily: `MX, ${EMOJI}`, fontWeight: 800, fontSize: 30, color: "#fff", textShadow: "0 2px 6px #000, 0 0 2px #000" }}>
        {p.credit}</div>
    </AbsoluteFill>
  </AbsoluteFill>
);

const placeholder = { fps: 30, durationInFrames: 30 } as unknown as Props;
const Root: React.FC = () => (
  <Composition id="StreamClip" component={StreamClip as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={30} fps={30} width={1080} height={1920}
    defaultProps={placeholder as unknown as Record<string, unknown>}
    calculateMetadata={({ props }) => ({ durationInFrames: (props as unknown as Props).durationInFrames })} />
);
registerRoot(Root);
