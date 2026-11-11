import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles.css";
import { App } from "./App";
import { mountSiteFooter } from "./siteFooter";
import { applyPalette } from "./view/palette";

applyPalette();
mountSiteFooter();

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
