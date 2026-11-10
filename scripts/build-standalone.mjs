import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

// The modular source remains authoritative. This deterministic, dependency-free
// bundler creates a portable single HTML file that also works under file://.
const root = fileURLToPath(new URL('..', import.meta.url));
const modules = [
  'config.js', 'core/EventBus.js', 'core/GameStateManager.js', 'core/Storage.js', 'core/Random.js',
  'game/SnakeLogic.js', 'game/PhysicsEngine.js', 'game/GameSession.js',
  'render/math.js', 'render/geometry.js', 'render/shaders.js', 'render/ParticleSystem.js', 'render/RenderPipeline.js',
  'audio/AudioSynthesizer.js', 'input/InputEngine.js', 'ui/UserInterface.js', 'main.js',
];
const sources = [];
for (const module of modules) {
  let source = await readFile(path.join(root, 'dist', 'src', module), 'utf8');
  source = source.replace(/^import .+;\r?\n/gm, '').replace(/^export /gm, '');
  if (module === 'render/shaders.js') {
    const names = [...source.matchAll(/^const (\w+) = `/gm)].map((match) => match[1]);
    source += `\nconst shaders = { ${names.join(', ')} };\n`;
  }
  sources.push(`// ─── ${module} ───\n${source}`);
}
const code = `${sources.join('\n')}\nwindow.SERPENT = app;\n`;
new vm.Script(code, { filename: 'SERPENT.inline.js' });
const style = await readFile(path.join(root, 'dist/style.css'), 'utf8');
const html = (await readFile(path.join(root, 'dist/index.html'), 'utf8'))
  .replace('<link rel="stylesheet" href="./style.css">', `<style>\n${style}\n</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', '')
  .replace('<a href="./" class="wordmark"', '<a href="./SERPENT.html" class="wordmark"')
  .replace('</body>', `<script type="module">\n${code}\n</script>\n</body>`);
await writeFile(path.join(root, 'SERPENT.html'), html);
console.log(`SERPENT.html créé : ${Buffer.byteLength(html).toLocaleString('fr-FR')} octets, aucune ressource externe.`);
