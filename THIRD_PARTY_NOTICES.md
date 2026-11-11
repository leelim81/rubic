# Third-party notices

## three.js

The 3D cube uses three.js 0.180.0, MIT licensed.

Copyright © 2010-2026 three.js authors

https://github.com/mrdoob/three.js/blob/dev/LICENSE

## Outfit and Fraunces

UI type is Outfit and Fraunces, distributed under the SIL Open Font License 1.1 and bundled locally by `@fontsource/outfit` 5.2.8 and `@fontsource/fraunces` 5.2.9. The font files and license text ship inside those packages and are included in the production build. They are not loaded from a third-party font host at runtime.

## cube-solver

The megaminx search places faces in the same order as Nei Chen's cube-solver, and it uses that solver's idea of an edge-orientation table before the last two-face stage. The move model, pruning tables, and last-layer algorithms in this project were built for this cube and are not copied from that repository.

Copyright (c) 2026 Nei Chen

https://github.com/neichen/cube-solver

## cubejs

Solving uses cubejs 1.3.2, an MIT-licensed implementation of Kociemba's two-phase algorithm. Face turns from that library were checked against this cube's own move model.

Copyright © 2014–2018 Petri Lehtinen and contributors

https://github.com/ldez/cubejs/blob/master/LICENSE

## React

React 19.2.0 and React DOM are MIT licensed.

https://github.com/facebook/react/blob/main/LICENSE
