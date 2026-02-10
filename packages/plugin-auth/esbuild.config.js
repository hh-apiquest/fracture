import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  // Externalize peerDependencies - runner will provide these
  external: ['@apiquest/fracture'],
  minify: false,
  sourcemap: true,
});

console.log('✓ Built plugin-auth');
