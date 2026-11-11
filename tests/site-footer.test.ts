import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { contactHref, resolveVisitCount, showVisitCount } from "../src/siteFooter";

const SUBJECT = "Trevor\u2019s Real Rubik\u2019s Solver";

function session(initial?: string) {
  const data = new Map<string, string>();
  if (initial != null) data.set("rubic-visit-counted", initial);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("contact link", () => {
  it("assembles a mailto link with the subject at runtime", () => {
    const href = contactHref();
    expect(href.startsWith("mailto:leelim81@gmail.com?subject=")).toBe(true);
    expect(new URL(href).searchParams.get("subject")).toBe(SUBJECT);
    const source = readFileSync(new URL("../src/siteFooter.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(source.includes("leelim81@gmail.com")).toBe(false);
    expect(page.includes("leelim81@gmail.com")).toBe(false);
  });
});

describe("visit count", () => {
  it("shows a formatted number when the counter answers", async () => {
    const store = session();
    const fetchImpl = vi.fn(async () => Response.json({ value: 12345 }));
    const value = await resolveVisitCount({ fetchImpl, session: store, webdriver: false, nocount: false });
    expect(value).toBe(12345);
    expect(store.getItem("rubic-visit-counted")).toBe("12345");
    const el = { hidden: true, textContent: "" };
    showVisitCount(el, value);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("12,345 visits");
  });

  it("hides the counter when the request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const value = await resolveVisitCount({ fetchImpl, session: session(), webdriver: false, nocount: false });
    expect(value).toBeNull();
    const el = { hidden: false, textContent: "12,345 visits" };
    showVisitCount(el, value);
    expect(el.hidden).toBe(true);
    expect(el.textContent).toBe("");
  });

  it("hides the counter when the response is not a number", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const value = await resolveVisitCount({ fetchImpl, session: session(), webdriver: false, nocount: false });
    expect(value).toBeNull();
  });

  it("hides the counter when the request times out", async () => {
    const fetchImpl: typeof fetch = (input, init) => new Promise<Response>((resolve, reject) => {
      void input;
      void resolve;
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const value = await resolveVisitCount({
      fetchImpl,
      session: session(),
      webdriver: false,
      nocount: false,
      timeoutMs: 20,
    });
    expect(value).toBeNull();
  });

  it("does not ask the counter for an automated browser or a nocount visit", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ value: 1 }));
    expect(await resolveVisitCount({ fetchImpl, session: session(), webdriver: true, nocount: false })).toBeNull();
    expect(await resolveVisitCount({ fetchImpl, session: session(), webdriver: false, nocount: true })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("shows the stored number on a later load without asking again", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ value: 99 }));
    const value = await resolveVisitCount({
      fetchImpl,
      session: session("12345"),
      webdriver: false,
      nocount: false,
    });
    expect(value).toBe(12345);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
