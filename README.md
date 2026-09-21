# Malaber Tools

Small tools. Suspiciously useful.

A collection of JavaScript browser helpers I needed, built, and made public. No accounts, no subscriptions, no discovery calls. Apparently sharing a folder can be a product strategy.

**Website:** [tools.malaber.de](https://tools.malaber.de)

Everything runs in the browser. User files stay on the user's device. There is no application backend, analytics, CDN, or runtime framework.

## Run locally

Requires Node.js 24 or newer. There are no npm dependencies to install.

```sh
npm start
```

Open [localhost:4173](http://localhost:4173). This builds the site and serves `dist/`. After editing source files, run `npm run build` and refresh. Set `PORT` to change the preview port.

```sh
npm test
npm run build
```

The source HTML is build input: preview `dist/` to see the complete site with the generated collection, navigation, footer, and favicon.

## Add a tool

1. Create a root folder with a lowercase URL slug, such as `my-tool/`.
2. Add a complete `index.html` containing a concise `<title>`, a `<meta name="description" content="…">`, and a `<main>` landmark. Use quoted HTML attributes.
3. Keep the tool's JavaScript, CSS, and assets in that folder. Use relative URLs for its own assets.
4. Build and check the overview and the tool at `/my-tool/`.

That's the whole registration process. The build discovers root folders containing `index.html` and sorts them by folder name. The title and description are the single source for each overview card. Adding, renaming, or removing a folder updates the collection and count automatically. For the live list, use the [website](https://tools.malaber.de/#tools); this README deliberately does not maintain another one.

Infrastructure folders (`assets`, `scripts`, `templates`, `dist`, `node_modules`) and hidden folders are excluded. The build copies tool assets but excludes Markdown, hidden files, `node_modules`, and symbolic links. Every tool HTML page must be a complete document with a main landmark; shared chrome is injected at build time, including on nested pages. HTML fragments should use another extension.

## Shared layout and branding

- `index.html`: overview template and copy; tool cards and counts are generated.
- `templates/`: shared head tags, navbar, and footer. Do not copy them into individual tools.
- `assets/site.css`: namespaced shared styles and overview design. Tools may keep their own styles; avoid overriding `.site-*` or `--site-*` names.
- `assets/mark.svg`: scalable interpretation of the M/code mark in `branding.png`, reused for the logo and SVG favicon.
- `branding.png`: original visual reference; not shipped in the build.
- `scripts/build.mjs`: dependency-free static generator. Generated `dist/` is ignored by Git and recreated from scratch.

The global palette follows the reference: navy, white, magenta, violet, and cyan. The overview has a sense of humor. Form labels should still make sense before coffee.

## Deployment

`.github/workflows/pages.yml` tests and builds pull requests. Every push to `main` tests, builds, uploads **only `dist/`**, and deploys to GitHub Pages. A manual run on `main` can deploy too. PRs never deploy.

The repository's Pages publishing source must be **GitHub Actions** (already configured). The custom domain must be set to `tools.malaber.de` in Pages settings with its DNS pointing to GitHub Pages. `CNAME` records the domain in source and is copied into the artifact; Actions deployments use the domain configured in Pages settings. The site uses root-relative shared URLs and is intended for that custom domain.

No generated HTML commits or separate publishing branch are needed. The workflow uses GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) actions.
