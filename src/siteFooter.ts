const SESSION_KEY = "rubic-visit-counted";
const COUNT_URL = "https://abacus.jasoncameron.dev/hit/trevors-real-rubiks-solver/visits";
const SUBJECT = "Trevor\u2019s Real Rubik\u2019s Solver";

type SessionStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type CountTarget = { hidden: boolean; textContent: string };

export function contactHref(): string {
  const local = ["lee", "lim", "81"].join("");
  const host = ["gm", "ail", ".com"].join("");
  return `mailto:${local}@${host}?subject=${encodeURIComponent(SUBJECT)}`;
}

export function mountContact(anchor: HTMLAnchorElement): void {
  anchor.href = contactHref();
}

export async function resolveVisitCount(input: {
  fetchImpl?: typeof fetch;
  session: SessionStore;
  webdriver: boolean;
  nocount: boolean;
  timeoutMs?: number;
  url?: string;
}): Promise<number | null> {
  if (input.webdriver || input.nocount) return null;
  const stored = input.session.getItem(SESSION_KEY);
  if (stored != null) {
    const cached = Number(stored);
    return Number.isFinite(cached) ? cached : null;
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 3000);
  try {
    const response = await fetchImpl(input.url ?? COUNT_URL, {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { value?: unknown };
    if (typeof body.value !== "number" || !Number.isFinite(body.value)) return null;
    input.session.setItem(SESSION_KEY, String(body.value));
    return body.value;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function showVisitCount(el: CountTarget, value: number | null): void {
  if (value == null) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = `${value.toLocaleString("en-US")} visits`;
}

export function mountSiteFooter(): void {
  const link = document.querySelector<HTMLAnchorElement>("[data-testid=contact-link]");
  if (link) mountContact(link);
  const count = document.querySelector<HTMLElement>("[data-testid=visit-count]");
  if (!count) return;
  const params = new URLSearchParams(location.search);
  void resolveVisitCount({
    session: sessionStorage,
    webdriver: navigator.webdriver,
    nocount: params.has("nocount"),
  }).then((value) => showVisitCount(count, value));
}
