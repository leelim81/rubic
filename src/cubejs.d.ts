declare module "cubejs" {
  interface Cube {
    move(algorithm: string): this;
    solve(maxDepth?: number): string;
    asString(): string;
    isSolved(): boolean;
  }
  interface CubeStatic {
    new (): Cube;
    initSolver(): void;
    fromString(facelets: string): Cube;
  }
  const Cube: CubeStatic;
  export default Cube;
}
