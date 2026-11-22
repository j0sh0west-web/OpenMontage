# StreamClip — vertical edits of authorised third-party Twitch clips

A Remotion template (`composition/index.tsx`) that turns a 16:9 streamer clip into a 1080×1920 short:
facecam panel on top (the streamer is the star), gameplay below, word-by-word captions coloured by
speaker, punch-in zooms on outbursts, a freeze-frame hook, whoosh/boom sound effects, music ducked
under speech, loudness at -14 LUFS, and an optional face-following nudity blur.

Kept separate on purpose: nothing here touches stream-clipper, clipbot or any Discord integration.

- `creators/<name>.json` — per-streamer layout (facecam/gameplay crops) and campaign rules.
- `examples/kaicenat-mandy/` — the approved first example: build script, word timings, blur keys, props.
  Run with `STREAMCLIP_PROJECT=<folder with remotion_public/src.mp4 + fonts + composition/>`.

## Done by hand in the example (still to automate)
- choosing the clip and the hook moment
- who is speaking (checked against the game's own subtitles)
- spotting nudity (the blur itself follows the face automatically) — always human-check these
- chat-activity scoring is not built yet

Every edited clip should be approved by a person before it is posted or submitted.
