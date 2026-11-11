import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const TITLE = "Trevor\u2019s Real Rubik\u2019s Solver \u2014 3\u00d73, 4\u00d74, 5\u00d75";
const DESCRIPTION = "Trevor\u2019s Real Rubik\u2019s Solver helps you solve a physical 3\u00d73, 4\u00d74 or 5\u00d75. Enter the colours you see, then follow a step-by-step 3D solution in your browser.";

function meta(name: string, attr = "name"): string {
  const pattern = new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`, "u");
  const match = pattern.exec(html);
  expect(match, name).toBeTruthy();
  return match?.[1] ?? "";
}

describe("the page head that Vite copies into the build", () => {
  it("names the app in the title, description, canonical link, and heading", () => {
    expect(html).toContain(`<html lang="en">`);
    expect(html).toContain(`<title>${TITLE}</title>`);
    expect(TITLE.length).toBeLessThanOrEqual(65);
    expect(meta("description")).toBe(DESCRIPTION);
    expect(DESCRIPTION.length).toBeGreaterThanOrEqual(140);
    expect(DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(html).toContain(`<link rel="canonical" href="https://leelim81.github.io/rubic/" />`);
    expect(html).toContain(`<h1 class="mark" data-testid="brand"`);
    expect(html).toContain("Trevor\u2019s Real Rubik\u2019s Solver");
    expect(meta("theme-color")).toBe("#0b1020");
  });

  it("includes Open Graph, Twitter, and JSON-LD", () => {
    expect(meta("og:title", "property")).toBe(TITLE);
    expect(meta("og:description", "property")).toBe(DESCRIPTION);
    expect(meta("og:type", "property")).toBe("website");
    expect(meta("og:url", "property")).toBe("https://leelim81.github.io/rubic/");
    expect(meta("og:site_name", "property")).toBe("Trevor\u2019s Real Rubik\u2019s Solver");
    expect(meta("og:image", "property")).toBe("https://leelim81.github.io/rubic/og.png");
    expect(meta("twitter:card")).toBe("summary_large_image");
    expect(meta("twitter:image")).toBe("https://leelim81.github.io/rubic/og.png");
    expect(html).toContain(`"@type": "WebApplication"`);
    expect(html).toContain(`"applicationCategory": "GameApplication"`);
    expect(html).toContain(`"price": "0"`);
    expect(html).toContain("<noscript>");
  });
});
