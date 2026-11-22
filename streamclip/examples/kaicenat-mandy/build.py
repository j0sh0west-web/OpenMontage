"""Build the Kai Cenat StreamClip example: props (cuts, captions, zooms, punches) + audio mix, then render."""
import json, os, subprocess, sys
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../.."))
sys.path.insert(0, REPO); os.chdir(REPO)
from tools.tool_registry import registry

FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
P = os.environ.get("STREAMCLIP_PROJECT", "/home/user/OpenMontage/projects/kai-streamclip-example")  # needs remotion_public/src.mp4 + fonts
SRC = f"{P}/remotion_public/src.mp4"
MUSIC = "/home/user/OpenMontage/music_library/jonasblakewood-trap-623045.mp3"
CHROME = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell"
W = json.load(open(f"{HERE}/c2_words.json"))

# ---- speakers (checked against the game's own subtitles) and caption text fixes ----
def spk(i):
    kai = set(range(68, 77)) | {83, 84, 85, 135, 136, 137} | set(range(144, 157)) | {164, 165, 166}
    jason = {32, 33, 34, 39, 42, 43, 44, 48, 86, 87} | set(range(93, 119)) | set(range(138, 144)) | set(range(159, 164))
    return "kai" if i in kai else "jason" if i in jason else "mandy"
FIX = {34: "do!", 139: "barely", 140: "f***ing", 147: "f***?", 158: "blew it!", 163: "ball sack!"}
words = [dict(w, i=i, spk=spk(i), w=FIX.get(i, w["w"])) for i, w in enumerate(W)]
words[157]["w"] = "you"

# ---- cut list (source seconds) ----
plan = [
    dict(s=40.85, e=43.30),                                   # A cold open: "...supposed to get married" / KAI "okay, we WHAT?"
    dict(freeze=43.12, n=18, faceZoom=[1.0, 1.24], dim=True), # freeze-zoom on Kai's face + boom
    dict(s=9.45, e=14.25, blurIn=9),                          # B whoosh back to the start of the argument
    dict(s=15.05, e=17.55, xfade=4),                          # C
    dict(s=18.95, e=36.48, xfade=4),                          # D1
    dict(s=38.78, e=53.85, xfade=4),                          # D2 (filler "okay listen, back to work" removed)
    dict(freeze=53.40, n=22, faceZoom=[1.0, 1.2], dim=True),  # end freeze on the last "NO!"
]
segs, t = [], 0
for p in plan:
    if "freeze" in p:
        segs.append(dict(from_=t, dur=p["n"], trim=p["freeze"], freeze=True, faceZoom=p["faceZoom"], dim=p["dim"])); t += p["n"]
    else:
        n = round((p["e"] - p["s"]) * FPS)
        segs.append(dict(from_=t, dur=n, trim=p["s"], s=p["s"], e=p["e"], xfade=p.get("xfade"), blurIn=p.get("blurIn"),
                         gz=[1.0, 1.06] if len(segs) % 2 else [1.04, 1.0], focus=[0.5, 0.5])); t += n
TOTAL = t

def outs(src_t):
    """All output frames where a source time appears (cold open repeats part of D2)."""
    return [round(sg["from_"] + (src_t - sg["s"]) * FPS) for sg in segs if not sg.get("freeze") and sg["s"] - 0.02 <= src_t <= sg["e"]]

# ---- captions: per segment, chunk same-speaker words (max 3, break on gaps / sentence ends) ----
caps = []
for k, sg in enumerate(segs):
    if sg.get("freeze"):
        continue
    ws = [w for w in words if w["s"] >= sg["s"] - 0.05 and w["e"] <= sg["e"] + 0.15]
    chunks, cur = [], []
    for w in ws:
        if cur and (w["spk"] != cur[-1]["spk"] or len(cur) >= 3 or sum(len(x["w"]) for x in cur) + len(w["w"]) > 13 or w["s"] - cur[-1]["e"] > 0.4
                    or cur[-1]["w"][-1:] in ".?!"):
            chunks.append(cur); cur = []
        cur.append(w)
    if cur: chunks.append(cur)
    seg_end = sg["from_"] + sg["dur"]
    for j, ch in enumerate(chunks):
        f0 = round(sg["from_"] + (ch[0]["s"] - sg["s"]) * FPS)
        last = round(sg["from_"] + (ch[-1]["e"] - sg["s"]) * FPS) + 10
        nxt = round(sg["from_"] + (chunks[j + 1][0]["s"] - sg["s"]) * FPS) if j + 1 < len(chunks) else seg_end
        end = min(max(last, f0 + 9), nxt, seg_end)
        if j + 1 == len(chunks) and k + 1 < len(segs) and segs[k + 1].get("freeze"):
            end = segs[k + 1]["from_"] + segs[k + 1]["dur"]          # hold "WE WHAT?!" / "NO!" through the freeze
        caps.append(dict(**{"from": f0, "dur": max(3, end - f0)}, spk=ch[0]["spk"],
                         words=[dict(t=max(0, round(sg["from_"] + (w["s"] - sg["s"]) * FPS) - f0), w=w["w"].strip(",")) for w in ch]))

# ---- punches on Kai's outbursts, Mandy focus zoom on "married" ----
punch_words = [68, 72, 83, 137, 144, 145, 148, 164, 165, 166]
punches = sorted({f for i in punch_words for f in outs(W[i]["s"])})
zooms = []
for f0 in outs(41.25):
    f1 = outs(42.35)
    zooms.append(dict(**{"from": f0, "dur": min(x for x in f1 if x > f0) - f0}, z=1.3, focus=[0.506, 0.52]))

props = dict(fps=FPS, durationInFrames=TOTAL, src="src.mp4",
             face=dict(x=2, y=436, w=388, h=214), game=dict(x=520, y=0, w=850, h=940),
             segs=[{("from" if k == "from_" else k): v for k, v in sg.items() if v is not None and k not in ("s", "e")} for sg in segs],
             zooms=zooms, punches=punches, caps=caps,
             hook=dict(text="KAI CENAT'S GTA 6 GIRLFRIEND WANTS TO GET MARRIED 😭", dur=96),
             credit="🎥 Kai Cenat · twitch.tv/kaicenat",
             censor=dict(keys=json.load(open(f"{HERE}/censor_keys.json")), end=1172,
                         boxes=[dict(**{"from": 1160, "to": 1235}, x=700, y=250, w=380, h=944)]))
json.dump(props, open(f"{P}/artifacts/remotion_props.json", "w"), indent=1, ensure_ascii=False)

# ---- audio: dialogue segments + SFX + ducked music, normalised to -14 LUFS ----
A = f"{P}/assets/audio"
def sfx(name, expr, dur, filt=""):
    out = f"{A}/{name}.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"aevalsrc='{expr}':s=48000:d={dur}",
                    "-af", (filt + "," if filt else "") + "aformat=channel_layouts=stereo", out], check=True)
    return out
boom = sfx("boom", "0.9*sin(2*PI*(62*t-26*t*t))*exp(-3.2*t)+0.25*sin(2*PI*31*t)*exp(-2*t)", 1.1, "lowpass=f=180,volume=1.6")
whoosh_raw = f"{A}/whoosh.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=c=pink:r=48000:d=0.55:a=0.8",
                "-af", "highpass=f=500,lowpass=f=7000,volume='if(lt(t,0.38),t/0.38,(0.55-t)/0.17)':eval=frame,aformat=channel_layouts=stereo",
                whoosh_raw], check=True)

# stage 1: dialogue track (each piece read as its own input, no shared branches)
src_wav = f"{A}/src.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-vn", "-ac", "2", "-ar", "48000", src_wav], check=True, timeout=120)
ins, fc, lab, n = [], [], [], 0
for sg in segs:
    if sg.get("freeze"):
        continue
    d = sg["dur"] / FPS
    ins += ["-ss", f"{sg['s']:.3f}", "-t", f"{d:.3f}", "-i", src_wav]
    fc.append(f"[{n}:a]afade=t=in:d=0.012,afade=t=out:st={d - 0.015:.3f}:d=0.015,adelay={int(sg['from_'] / FPS * 1000)}:all=1[d{n}]")
    lab.append(f"[d{n}]"); n += 1
fc.append("".join(lab) + f"amix=inputs={n}:normalize=0,apad,atrim=0:{TOTAL / FPS}[out]")
dlg = f"{A}/dialogue.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(fc), "-map", "[out]", dlg], check=True, timeout=120)
# stage 2: music ducked under the dialogue
hits = [segs[1]["from_"], outs(W[148]["s"])[-1], segs[-1]["from_"]]          # freeze, "no no no", final freeze
ms = segs[2]["from_"] / FPS; mend = segs[-1]["from_"] / FPS
mus = f"{A}/music_ducked.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", MUSIC, "-i", dlg, "-filter_complex",
    f"[0:a]atrim=0:{mend - ms + 0.6},asetpts=PTS-STARTPTS,volume=0.32,afade=t=in:d=0.25,afade=t=out:st={mend - ms - 0.2:.3f}:d=0.8,"
    f"adelay={int(ms * 1000)}:all=1,apad,atrim=0:{TOTAL / FPS},aformat=sample_rates=48000:channel_layouts=stereo[m];"
    f"[1:a]aformat=sample_rates=48000:channel_layouts=stereo[k];"
    f"[m][k]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[out]", "-map", "[out]", mus], check=True, timeout=120)
# stage 3: final mix with SFX
ins = ["-i", dlg, "-i", mus]; fc = []; lab = ["[0:a]", "[1:a]"]
for j, h in enumerate(hits):
    ins += ["-i", boom]; fc.append(f"[{2 + j}:a]volume=0.9,adelay={int(h / FPS * 1000)}:all=1[b{j}]"); lab.append(f"[b{j}]")
wh = segs[2]["from_"] - 8
ins += ["-i", whoosh_raw]; fc.append(f"[{2 + len(hits)}:a]volume=0.8,adelay={int(wh / FPS * 1000)}:all=1[w0]"); lab.append("[w0]")
fc.append("".join(lab) + f"amix=inputs={len(lab)}:normalize=0,atrim=0:{TOTAL / FPS},alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=11[out]")
mix = f"{A}/mix.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(fc), "-map", "[out]", "-ac", "2", "-ar", "48000", mix], check=True, timeout=180)
if os.environ.get("AUDIO_ONLY"):
    print("audio ok"); sys.exit(0)

# ---- render ----
registry.discover()
edit = {"version": "1.0", "render_runtime": "remotion", "composition_mode": "atelier",
        "cuts": [{"id": f"c{i}", "source": "src.mp4", "in_seconds": sg["from_"] / FPS, "out_seconds": (sg["from_"] + sg["dur"]) / FPS,
                  "layer": "primary"} for i, sg in enumerate(segs)],
        "bespoke": {"entry": f"{P}/composition/index.tsx", "composition_id": "StreamClip",
                    "props_path": f"{P}/artifacts/remotion_props.json", "public_dir": f"{P}/remotion_public", "crf": 17,
                    "art_direction": "StreamClip: facecam-top/gameplay-bottom, word-by-word speaker captions, punch-ins, freeze hook."}}
json.dump(edit, open(f"{P}/artifacts/edit_decisions.json", "w"), indent=1)
r = registry._tools["video_compose"].execute({"operation": "render", "edit_decisions": edit, "output_path": f"{P}/renders/final.mp4",
                                               "audio_path": mix, "remotion_browser_executable": CHROME})
print("frames", TOTAL, "secs", round(TOTAL / FPS, 2), "caps", len(caps), "punches", punches, "zooms", zooms)
print(r.success, r.error, (r.data or {}).get("final_review_status"))
