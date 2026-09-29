# How did carnivorous plants evolve? (Year 6 explainer)

A 90 second, 1920x1080, 30 fps, silent HyperFrames video. All content is in `index.html`.

## Editing captions and key terms

Captions are plain HTML near the top of each scene in `index.html`:

- Captions: `<div id="c1a">…</div>` (scene number, then a, b, c).
- Key-term labels: `<div class="term" id="t…">` with a `.name` (the term) and `.mean` (plain-English meaning).
- On-screen tags: elements with `class="tag"`.

Caption *timing* is at the bottom of each scene's script block, for example `show("#c1a", 3.9, 7.3)`
(start second, end second). Keep text at 44px or larger and at most two short sentences.

## Re-rendering

```bash
npx hyperframes@0.8.86 check          # lint, layout, contrast
npx hyperframes@0.8.86 preview        # Studio preview
npx hyperframes@0.8.86 render --quality delivery --fps 30 --output outputs/how-did-carnivorous-plants-evolve.mp4
```

Requires Node.js 22+ and FFmpeg. GSAP is vendored in `vendor/` and fonts in `fonts/`, so renders do not need the network.

## Determinism

All "random" placement (soil specks, hairs, dots, background circles) uses the seeded `mulberry32` generator.
The 12-generation selection simulation in scene 4 uses seed `8`. No `Math.random` or clocks are used.

## Scene map

| Scene | Time | Topic |
| --- | --- | --- |
| 1 | 0-12s | Poor soil (nutrients) |
| 2 | 12-26s | A defence turns into a trap (adaptation) |
| 3 | 26-34s | Digestive enzymes |
| 4 | 34-54s | Natural selection (variation, inheritance, natural selection) |
| 5 | 54-68s | Leaves reshape into a pitcher |
| 6 | 68-82s | Convergent evolution |
| 7 | 82-90s | Discussion question |
