import { useEffect, useState } from "react";
import { getPalette, setPalette, subscribePalette, type PaletteName } from "./palette";

/** Same row as the letter-sticker checkbox. The choice is stored by `setPalette`. */
export function PaletteToggle() {
  const [palette, setShown] = useState<PaletteName>(getPalette);

  useEffect(() => subscribePalette(() => setShown(getPalette())), []);

  return (
    <label className="check palette-switch">
      <span className="switch-ui">
        <input
          type="checkbox"
          role="switch"
          data-testid="palette-toggle"
          checked={palette === "pastel"}
          onChange={(event) => setPalette(event.target.checked ? "pastel" : "standard")}
        />
        <span className="switch-knob" aria-hidden="true" />
      </span>
      Pastel colours
    </label>
  );
}
