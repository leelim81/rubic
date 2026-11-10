# Physical Cube Solver

A 3×3 solver that runs as a static site at [https://leelim81.github.io/rubic/](https://leelim81.github.io/rubic/).

Next turns one layer on the cube. Solve 3× plays the remaining moves at three times the selected speed, and Restore before solve puts the cube back to the moment that run started. The solution is Kociemba's two-phase algorithm via cubejs. It is short, and it is not a claim that no shorter sequence exists. Enter colours is the way to type a cube in. Photos and a camera scan are not part of the page.

Drag the cube in **Rotate view** and the surface under your finger follows the drag. Switch to **Turn a face** and drag a sticker the way that layer should slide. Face buttons, speed, scramble, and reset are under **Options**. If the browser asks for reduced motion, a move jumps to its end.

## Assumptions

- Ordinary Western colour scheme only: white opposite yellow, red opposite orange, blue opposite green.
- With white on top and green in front, red is on the right. In the lesson hold, yellow is on top and white is on the bottom, so the right face is orange. The letter R still means the right face.
- Picture cubes, shape mods, and mirror-stickered cubes are out of scope.

## Privacy

The solution and the colours you type stay in this browser (`sessionStorage` remembers the move list). There is no account, no server, and no upload.

A scan can be geometrically legal and still be the wrong cube. The app asks you to compare the 3D reconstruction with the physical cube before the lesson starts. Uncertain sticker colours are flagged and need a tap. Tests of colour use synthetic lighting, not a claim about every real camera and lamp.

Downloadable practice photos, in scan order, are at [/rubic/fixtures/](https://leelim81.github.io/rubic/fixtures/). They are a legal cube after R U R' U', plus one inset front for the crop handles. They are not photographs of a physical cube.

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

Application code is [MIT](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) cover three.js (MIT) and the OFL fonts Outfit and Fraunces, which are bundled by the build. No tutorial videos or external GIFs are included. Move explanations are original.
