declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
}

declare module "node:os" {
  export function tmpdir(): string;
  export function availableParallelism(): number;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare module "node:worker_threads" {
  interface ParentPort {
    on(event: "message", listener: (value: string) => void): void;
    postMessage(message: unknown): void;
  }
  export const parentPort: ParentPort | null;
  export class Worker {
    constructor(filename: string, options?: { type?: "module" });
    on(event: "message", listener: (value: { ok: boolean; moves?: string[]; error?: string; ms: number }) => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    postMessage(message: unknown): void;
    terminate(): Promise<number>;
  }
}

declare const process: { cwd(): string; env: Record<string, string | undefined> };
