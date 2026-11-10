// Loose stand-ins so `bun run typecheck` runs without Herdr installed. The real
// declarations (gpui-kit.d.ts, herdr.d.ts) are written by the Herdr app into
// ~/.config/herdr-app and are not part of this repo. Everything here is any-typed:
// it checks our own code, not the calls into Herdr.
declare module "gpui-kit";
declare module "gpui-base";
declare module "herdr";

// Node's modules and globals, loosely (no @types/node, to keep dev dependencies to two).
declare module "node:*";
declare const process: any;
declare const console: any;
declare const URL: any;
declare function structuredClone<T>(value: T): T;
interface ImportMeta {
  url: string;
}
declare const localStorage: any;
declare const Buffer: any;
