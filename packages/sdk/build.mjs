import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/cep.js',
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2019',
});
console.log('built dist/cep.js');
