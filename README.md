# Rubic

A learning-first 3×3 lesson that runs as a static site at [https://leelim81.github.io/rubic/](https://leelim81.github.io/rubic/).

The app teaches a beginner layer-by-layer method (white cross, white corners, second layer, yellow cross, matching the cross, placing corners, twisting corners). It solves whatever legal position you scramble or scan. It does not undo the scramble backwards, and it does not pretend a short computer search is mathematically optimal.

Drag the cube in **Rotate view** to look around; that drag does not turn a layer. Switch to **Turn a face** and drag a sticker the way that layer should slide. A single piece cannot turn on its own. The buttons under the cube (`Top, front edge left`, and the rest) do the same turns without a drag, and they follow the hold even after the view has moved.

A scan says **Face 1 of 6**, then one main button: **Capture photo**, then **Confirm colours & next face**, then **Review cube**, then **Start solving**. Drag the photo's corners onto the face before confirming. Uncertain colours, including a background that only looks like a sticker, have to be chosen by hand.

## Assumptions

- Ordinary Western colour scheme only: white opposite yellow, red opposite orange, blue opposite green.
- With white on top and green in front, red is on the right. In the lesson hold, yellow is on top and white is on the bottom, so the right face is orange. The letter R still means the right face.
- Picture cubes, shape mods, and mirror-stickered cubes are out of scope.

## Privacy

Photos, sampled colours, and the lesson stay in your browser (`sessionStorage` remembers the lesson text, not the photos). There is no account, no server, and no automatic upload. Camera tracks are stopped when you leave the scanner. A denied or missing camera falls back to an upload or to typing the colours.

A scan can be geometrically legal and still be the wrong cube. The app asks you to compare the 3D reconstruction with the physical cube before the lesson starts. Uncertain sticker colours are flagged and need a tap. Tests of colour use synthetic lighting, not a claim about every real camera and lamp.

## Local development

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/rubic/`. The dev server uses the same `/rubic/` base as GitHub Pages.

```bash
npm test
npm run build
npm run preview
npm run test:e2e
```

`npm test` covers moves and their inverses, four quarter turns, random legal scrambles, cubie/facelet agreement, impossible cubes (counts, parity, flips, twists, mirror centres), the beginner solver on scrambles and arbitrary legal states, scan orientation, and synthetic colour fixtures.

## Deploy

Push to `main` runs `.github/workflows/pages.yml`, which tests, builds, and deploys with GitHub Actions. The repository Pages source is **GitHub Actions**. The public site is https://leelim81.github.io/rubic/.

## Licence

Application code is [MIT](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) cover three.js (MIT) and the OFL fonts Outfit and Fraunces, which are bundled by the build. No tutorial videos or external GIFs are included. Finger cues and explanations are original.
