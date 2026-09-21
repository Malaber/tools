import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const reserved = new Set(['assets', 'scripts', 'templates', 'dist', 'node_modules']);
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, key) => {
  if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(key[1].toLowerCase() === 'x' ? 2 : 1), key[1].toLowerCase() === 'x' ? 16 : 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[key.toLowerCase()] ?? entity;
});

export async function discoverTools(root) {
  const tools = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || reserved.has(entry.name)) continue;
    const index = join(root, entry.name, 'index.html');
    if (!(await stat(index).catch(() => null))?.isFile()) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) throw new Error(`Tool folder must be a lowercase URL slug: ${entry.name}`);
    const html = await readFile(index, 'utf8');
    const title = html.match(/<title>\s*([\s\S]*?)\s*<\/title>/i)?.[1];
    let description;
    for (const meta of html.matchAll(/<meta\s+[^>]*>/gi)) {
      const attributes = Object.fromEntries([...meta[0].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(([, key, , value]) => [key.toLowerCase(), value]));
      if (attributes.name?.toLowerCase() === 'description') description = attributes.content;
    }
    if (!title?.trim() || !description?.trim()) throw new Error(`${entry.name}/index.html needs a title and meta description.`);
    tools.push({ slug: entry.name, title: decode(title.trim()), description: decode(description.trim()) });
  }
  return tools.sort((a, b) => a.slug.localeCompare(b.slug, 'en'));
}

function renderCards(tools) {
  return tools.map(tool => `
        <a class="tool-card" href="/${tool.slug}/">
          <span class="tool-icon" aria-hidden="true">${escape(tool.slug.slice(0, 3).toUpperCase())}</span>
          <div class="tool-card-body"><h3>${escape(tool.title)}</h3><p>${escape(tool.description)}</p><span class="tool-path">/${tool.slug}/</span></div>
          <span class="tool-arrow" aria-hidden="true">↗</span>
        </a>`).join('') || '<p>No tools yet. Apparently nothing has annoyed me enough.</p>';
}

function addShell(html, shell, filename) {
  for (const pattern of [/<\/head>/i, /<body\b[^>]*>/i, /<\/body>/i]) {
    if (!pattern.test(html)) throw new Error(`${filename} must be a complete HTML document.`);
  }
  // The shared skip link works without requiring every tool to repeat an ID convention.
  const main = html.match(/<main\b[^>]*>/i);
  if (!main) throw new Error(`${filename} needs a main landmark.`);
  const mainId = main[0].match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2];
  if (!mainId) html = html.replace(/<main\b/i, '<main id="main"');
  const nav = shell.nav.replace('href="#main"', `href="#${escape(mainId || 'main')}"`);
  return html.replace(/<\/head>/i, () => `${shell.head}\n</head>`)
    .replace(/<body\b[^>]*>/i, match => `${match}\n${nav}`)
    .replace(/<\/body>/i, () => `${shell.footer}\n</body>`);
}

async function decoratePages(directory, shell) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) await decoratePages(filename, shell);
    else if (entry.name.endsWith('.html')) await writeFile(filename, addShell(await readFile(filename, 'utf8'), shell, filename));
  }
}

export async function build(root = projectRoot) {
  const tools = await discoverTools(root);
  const shell = Object.fromEntries(await Promise.all(['head', 'nav', 'footer'].map(async name => [name, await readFile(join(root, 'templates', `${name}.html`), 'utf8')])));
  const output = join(root, 'dist');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });
  for (const tool of tools) {
    const destination = join(output, tool.slug);
    await cp(join(root, tool.slug), destination, {
      recursive: true,
      filter: async source => {
        const name = basename(source);
        return !name.startsWith('.') && name !== 'node_modules' && !/\.md$/i.test(name) && !(await lstat(source)).isSymbolicLink();
      }
    });
    await decoratePages(destination, shell);
  }
  const html = (await readFile(join(root, 'index.html'), 'utf8')).replace(/\{\{(toolCount|toolNoun|toolCards)\}\}/g, (_, token) => ({ toolCount: tools.length, toolNoun: tools.length === 1 ? 'tool' : 'tools', toolCards: renderCards(tools) })[token]);
  await writeFile(join(output, 'index.html'), addShell(html, shell, 'index.html'));
  await cp(join(root, 'CNAME'), join(output, 'CNAME'));
  await writeFile(join(output, '.nojekyll'), '');
  return tools;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tools = await build();
  console.log(`Built ${tools.length} tool${tools.length === 1 ? '' : 's'} into dist/: ${tools.map(tool => `/${tool.slug}/`).join(', ')}`);
}
