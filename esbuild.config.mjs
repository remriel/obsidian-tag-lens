import esbuild from 'esbuild';
import { builtinModules } from 'node:module';

await esbuild.build({
  entryPoints: ['main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtinModules],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  outfile: 'main.js',
  sourcemap: false,
});
