import { defineConfig } from 'tsup';

// Two entry points: the full package, and `./calc` (calculator only, no XML dependency).
export default defineConfig({
  entry: { index: 'src/index.ts', calc: 'src/calc-entry.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
