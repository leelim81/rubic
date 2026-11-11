# Trevor’s Real Rubik’s Solver

A 3×3, 4×4 and 5×5 solver that runs as a static site at [https://leelim81.github.io/rubic/](https://leelim81.github.io/rubic/).

4×4 is Expert only and stays in the browser. It solves the centres, pairs the edges (including the parity cases), then finishes with the 3×3 solver. The move count is a correct reduction, not a claim that no shorter sequence exists.

5×5 is Expert only. Choosing 5×5 downloads Tomas Rokicki’s [gullicube](https://github.com/rokicki/gullicube) (MPL-2.0; see `public/gullicube/NOTICE`) and keeps it in this browser. Cancel, a failed download, or a device that cannot give the solver the memory it needs falls back to the built-in reduction solver. The 3×3 solver is unchanged.

Next turns one layer on the cube. Solve 3× plays the remaining moves at three times the selected speed, and Restore before solve puts the cube back to the moment that run started. The solution is Kociemba's two-phase algorithm via cubejs. It is short, and it is not a claim that no shorter sequence exists. Enter colours is the way to type a cube in. Photos and a camera scan are not part of the page.

Drag the cube in **Rotate view** and the surface under your finger follows the drag. Switch to **Turn a face** and drag a sticker the way that layer should slide. Face buttons, speed, scramble, and reset are under **Options**. If the browser asks for reduced motion, a move jumps to its end.

## Assumptions

- Ordinary Western colour scheme only: white opposite yellow, red opposite orange, blue opposite green.
- With white on top and green in front, red is on the right. In the lesson hold, yellow is on top and white is on the bottom, so the right face is orange. The letter R still means the right face.
- Picture cubes, shape mods, and mirror-stickered cubes are out of scope.

## Privacy

The solution and the colours you type stay in this browser (`sessionStorage` remembers the move list). There is no account and no upload.

The footer visit count is the one request that leaves the browser. Once each browser session the page asks [Abacus](https://abacus.jasoncameron.dev/) (`abacus.jasoncameron.dev`) for a number and shows it as muted text such as “12,345 visits”. That request sends no cookies and no cube colours. A reload in the same session shows the stored number and does not count again. Automated browsers (`navigator.webdriver`) and a `?nocount` address are skipped. If Abacus fails or does not answer within about three seconds, the count stays hidden. Contact me opens your mail app; the address is assembled when the page runs.

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
npm run test:batch
npm run build
npm run preview
npm run test:e2e
```

`npm test` covers moves and their inverses, four quarter turns, random legal scrambles, cubie/facelet agreement, impossible cubes (counts, parity, flips, twists, mirror centres), the beginner solver on scrambles and arbitrary legal states, scan orientation, and synthetic colour fixtures. Each large seeded batch keeps a 16-solve sample that still applies the solution and checks the cube is solved. `npm run test:batch` (`FULL_BATCH=1`) restores the full batches: 1,000 4×4 solves, 1,000 5×5 solves, 200 Megaminx solves, 200 Master Pyraminx solves, 100 gullicube solves, and 2,000 beginner legal cubes. Pyraminx optimality, including the 300-solve check, stays in `npm test`.

## Deploy

Push to `main` runs `.github/workflows/pages.yml`. Unit tests run beside the build. Desktop and mobile browser tests reuse that build, and the deploy publishes it. The repository Pages source is **GitHub Actions**. The public site is https://leelim81.github.io/rubic/.

`.github/workflows/batch.yml` runs `npm run test:batch` on a nightly schedule and when started by hand. It does not deploy.

## Licence

Application code is [MIT](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) cover three.js (MIT) and the OFL fonts Outfit and Fraunces, which are bundled by the build. No tutorial videos or external GIFs are included. Move explanations are original.
