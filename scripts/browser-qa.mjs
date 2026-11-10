import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Dependency-free Chrome DevTools Protocol driver. Start Chrome with
// --headless=new --remote-debugging-port=9222 and the local server before running.
const address = process.env.SERPENT_CDP ?? 'http://127.0.0.1:9222';
const origin = process.env.SERPENT_URL ?? 'http://127.0.0.1:4173';
const applicationExpression = origin.startsWith('file:') ? 'window.SERPENT' : "(await import('/src/main.js')).app";
const targets = await (await fetch(`${address}/json`)).json();
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No Chrome page target available.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0; const pending = new Map(); const errors = []; const responses = []; const checks = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const handler = pending.get(message.id); pending.delete(message.id);
    if (message.error) handler?.reject(new Error(JSON.stringify(message.error))); else handler?.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
  if (message.method === 'Network.responseReceived') responses.push({ url: message.params.response.url, status: message.params.response.status });
});
function command(method, params = {}) {
  const id = ++nextId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true, replMode: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(expression, milliseconds = 5000) {
  const deadline = Date.now() + milliseconds;
  do {
    try { if (await evaluate(expression)) return; } catch { /* Navigation can temporarily replace the execution context. */ }
    await sleep(80);
  } while (Date.now() < deadline);
  throw new Error(`Timeout: ${expression}`);
}
const directory = fileURLToPath(new URL('../artifacts/', import.meta.url)); await mkdir(directory, { recursive: true });
async function screenshot(name) { const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(`${directory}/${name}.png`, Buffer.from(capture.data, 'base64')); }
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function key(code, keyName = code) { await command('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName }); await command('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName }); }

try {
  await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Log.enable'), command('Network.enable')]);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: origin });
  await waitFor(`document.body.dataset.state === 'Menu'`);
  await evaluate('localStorage.clear()'); await command('Page.reload'); await waitFor(`document.body.dataset.state === 'Menu'`);
  await evaluate(`window.qaApp = ${applicationExpression}`);
  await sleep(1800);
  assert.equal(await evaluate(`document.getElementById('fatal-error').hidden`), true);
  assert.equal(await evaluate(`qaApp.renderer.gl.getError()`), 0);
  assert.equal(await evaluate('qaApp.storage.data.settings.quality'), 'high');
  await screenshot('desktop-menu'); checks.push('Desktop menu + WebGL shaders compiled without errors');

  await click('[data-mode=flux]'); assert.equal(await evaluate('qaApp.session.mode'), 'flux');
  await click('[data-action=start]'); await waitFor(`document.body.dataset.state === 'Playing'`);
  await waitFor('qaApp.session.countdown === 0');
  assert.equal(await evaluate('qaApp.audio.context.state'), 'running');
  await evaluate(`qaApp.session.food = {x: qaApp.session.snake.body[0].x + 1, z: qaApp.session.snake.body[0].z}`);
  await waitFor('qaApp.session.foods > 0');
  assert.ok(await evaluate('qaApp.session.score > 0')); checks.push('Real start, countdown, movement, food collection and HUD');
  await key('ArrowUp', 'ArrowUp'); await sleep(180);
  assert.equal(await evaluate('qaApp.session.snake.direction'), 'up');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ' }); await sleep(180);
  assert.ok(await evaluate('qaApp.session.energy < 1'));
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ' }); checks.push('Keyboard direction and held boost');
  await key('Escape', 'Escape'); assert.equal(await evaluate('qaApp.state.current'), 'Paused');
  const pausedTime = await evaluate('qaApp.session.elapsed'); await sleep(250);
  assert.equal(await evaluate('qaApp.session.elapsed'), pausedTime);
  await screenshot('desktop-paused');
  await click('[data-action=resume]'); assert.equal(await evaluate('qaApp.state.current'), 'Playing'); checks.push('Pause freezes simulation and resumes correctly');
  await click('[data-camera=top]'); await sleep(1000); await screenshot('desktop-tactical');
  assert.equal(await evaluate('qaApp.renderer.camera'), 'top');
  await click('[data-camera=chase]'); await key('ArrowLeft', 'ArrowLeft'); await sleep(200);
  assert.equal(await evaluate('qaApp.session.snake.direction'), 'left');
  await sleep(800); await screenshot('desktop-chase'); checks.push('Live camera changes + relative pursuit controls');
  await click('[data-action=settings]'); assert.equal(await evaluate('qaApp.state.current'), 'Paused');
  assert.equal(await evaluate(`document.getElementById('settings-dialog').open`), true);
  await evaluate(`document.getElementById('volume').value = '29'; document.getElementById('volume').dispatchEvent(new Event('input', { bubbles: true }));`);
  assert.equal(await evaluate('qaApp.storage.data.settings.volume'), 0.29);
  await evaluate(`document.getElementById('quality').value = 'balanced'; document.getElementById('quality').dispatchEvent(new Event('change', {bubbles:true}))`);
  assert.equal(await evaluate('qaApp.renderer.gl.getError()'), 0);
  await screenshot('desktop-settings'); await click('#settings-dialog [data-close]'); checks.push('Accessible settings dialog + live volume and quality');
  await click('[data-action=resume]');
  await evaluate(`qaApp.session.snake.body = [{x: 12,z:12},{x:11,z:12},{x:11,z:13},{x:12,z:13},{x:13,z:13},{x:13,z:12},{x:14,z:12}]; qaApp.session.snake.direction='right'; qaApp.session.snake.queue=[];`);
  await waitFor(`qaApp.state.current === 'GameOver'`);
  assert.equal(await evaluate(`document.getElementById('result-stats').hidden`), false);
  await screenshot('desktop-gameover'); checks.push('Self-collision + results + local record');
  await click('#overlay-primary'); await waitFor(`qaApp.state.current === 'Playing'`);
  assert.equal(await evaluate('qaApp.session.score'), 0); checks.push('Restart resets run');
  await click('[data-action=menu]'); await click('[data-mode=survival]'); await click('[data-camera=isometric]'); await click('[data-action=start]');
  await evaluate(`qaApp.session.countdown=0; qaApp.session.elapsed=9; qaApp.session.nextObstacle=9;`);
  await waitFor('qaApp.session.warnings.length > 0');
  await key('Escape', 'Escape'); checks.push('Survival warnings appear in running game');
  await click('[data-action=menu]');

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Emulation.setTouchEmulationEnabled', { enabled: true }); await sleep(900);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await screenshot('mobile-menu');
  await click('[data-mode=classic]'); await click('[data-action=start]'); await sleep(400);
  await screenshot('mobile-playing');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('touch-controls')).display`), 'flex');
  await evaluate(`document.querySelector('[data-direction=up]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true, pointerId:2}));`);
  assert.ok(await evaluate(`qaApp.session.snake.queue.includes('up')`));
  checks.push('390px mobile layout, no horizontal overflow, touch directions');
  await key('Escape', 'Escape');
  const restoredVolume = await evaluate('qaApp.storage.data.settings.volume');
  await command('Page.reload'); await waitFor(`document.body.dataset.state === 'Menu'`);
  await evaluate(`window.qaApp = ${applicationExpression}`);
  assert.equal(await evaluate('qaApp.storage.data.settings.volume'), restoredVolume); checks.push('Settings persistence across page reload');

  await evaluate(`window.qaLose = qaApp.renderer.gl.getExtension('WEBGL_lose_context'); qaLose.loseContext()`);
  await waitFor('qaApp.renderer.lost'); await sleep(180);
  await evaluate('qaLose.restoreContext()'); await waitFor('!qaApp.renderer.lost');
  assert.equal(await evaluate('qaApp.renderer.gl.getError()'), 0); checks.push('WebGL context loss + restoration');
  const measurement = await evaluate(`({fps:document.getElementById('fps').textContent, renderer:qaApp.renderer.gl.getParameter(qaApp.renderer.gl.RENDERER), audio:qaApp.audio.context?.state ?? 'not activated after reload', resources:qaApp.renderer.resources.length})`);
  const networkProblems = responses.filter((response) => response.status >= 400);
  assert.deepEqual(networkProblems, []); assert.deepEqual(errors, []);
  const externalRequests = responses.filter((response) => !response.url.startsWith(origin) && !response.url.startsWith('data:'));
  assert.deepEqual(externalRequests, []); checks.push('No external asset request, no browser error');
  await evaluate('qaApp.dispose()'); assert.equal(await evaluate('qaApp.disposed'), true); checks.push('Explicit disposal');
  const result = { checks, errors, measurement, screenshots: directory };
  await writeFile(`${directory}/browser-qa.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await screenshot('failure').catch(() => {});
  console.error(JSON.stringify({ errors, page: await evaluate('({url:location.href,state:document.body?.dataset.state,error:document.getElementById("fatal-error")?.innerText})').catch(() => null) }, null, 2));
  throw error;
} finally { socket.close(); }
