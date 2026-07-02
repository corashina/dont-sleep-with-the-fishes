export interface Scene {
  enter(): void;
  exit(): void;
  update(dt: number): void;
}
