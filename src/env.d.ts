// Values injected by esbuild at build time (see scripts/build.mjs).
declare const __DEV__: boolean;
declare const __VERSION__: string;
/** False in the store build, which leaves out the Google Photos source. */
declare const __GOOGLE_PHOTOS__: boolean;

declare module '*.css';
