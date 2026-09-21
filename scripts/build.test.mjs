import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build, discoverTools } from './build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'malaber-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['index.html', 'templates', 'assets', 'CNAME']) await cp(join(root, name), join(directory, name), { recursive: true });
  return directory;
}
async function tool(root, slug, title = slug) {
  await mkdir(join(root, slug), { recursive: true });
  await writeFile(join(root, slug, 'index.html'), `<!doctype html><html><head><title>${title}</title><meta content='Do &quot;useful&quot; things &amp; more.' name='description'></head><body><main><h1>${title}</h1></main></body></html>`);
}

test('folder changes drive cards, count, routes and shared shell; builds are repeatable', async t => {
  const directory = await fixture(t);
  await tool(directory, 'zebra');
  await tool(directory, 'alpha', 'Alpha &amp; friends');
  await mkdir(join(directory, 'not-a-tool'));
  await writeFile(join(directory, 'alpha', 'README.md'), 'Private build notes');
  await writeFile(join(directory, 'alpha', '.secret'), 'not public');
  await symlink(join(directory, 'CNAME'), join(directory, 'alpha', 'linked-file'));
  assert.deepEqual((await build(directory)).map(tool => tool.slug), ['alpha', 'zebra']);
  const home = await readFile(join(directory, 'dist', 'index.html'), 'utf8');
  assert.match(home, /2 tools\. Zero sales pitches/);
  assert.match(home, /href="\/alpha\/"/);
  assert.match(home, /Alpha &amp; friends/);
  assert.match(home, /Do &quot;useful&quot; things &amp; more/);
  assert.doesNotMatch(home, /\{\{/);
  const page = await readFile(join(directory, 'dist', 'alpha', 'index.html'), 'utf8');
  assert.match(page, /<main id="main">/);
  assert.match(page, /aria-label="Main navigation"/);
  assert.match(page, /class="site-footer"/);
  assert.match(page, /rel="icon"/);
  assert.deepEqual(await readdir(join(directory, 'dist', 'alpha')), ['index.html']);
  await build(directory);
  assert.equal(await readFile(join(directory, 'dist', 'index.html'), 'utf8'), home);
  await rm(join(directory, 'zebra'), { recursive: true });
  await build(directory);
  assert.match(await readFile(join(directory, 'dist', 'index.html'), 'utf8'), /1 tool\. Zero sales pitches/);
  assert.ok(!(await readdir(join(directory, 'dist'))).includes('zebra'));
});

test('missing metadata fails instead of silently omitting a tool', async t => {
  const directory = await fixture(t);
  await tool(directory, 'broken');
  await writeFile(join(directory, 'broken', 'index.html'), '<title>Broken</title>');
  await assert.rejects(discoverTools(directory), /needs a title and meta description/);
});

test('existing main IDs survive and empty collections render cleanly', async t => {
  const directory = await fixture(t);
  await build(directory);
  assert.match(await readFile(join(directory, 'dist', 'index.html'), 'utf8'), /No tools yet/);
  await tool(directory, 'test');
  const path = join(directory, 'test', 'index.html');
  await writeFile(path, (await readFile(path, 'utf8')).replace('<main>', '<main id="workspace">'));
  await build(directory);
  assert.match(await readFile(join(directory, 'dist', 'test', 'index.html'), 'utf8'), /href="#workspace"/);
});
