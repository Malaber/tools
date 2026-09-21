# Working in this repository

## Scope and architecture

This is a collection of static, browser-only JavaScript tools for `tools.malaber.de`. Keep user data on the device. Do not add application servers, accounts, analytics, third-party uploads, external fonts, or CDN dependencies unless explicitly requested.

The build uses Node.js 24 and built-in modules only. Browser tools use native HTML, CSS, and JavaScript. Prefer small, readable changes over introducing frameworks or dependencies.

## Single sources of truth

- A tool is a root folder with `index.html`; its folder name is its URL slug.
- Tool titles and descriptions come from each entry page's `<title>` and description meta tag. Never maintain a separate tool registry, card list, count, or README catalog.
- `index.html` is the overview template. `scripts/build.mjs` fills its collection placeholders.
- `templates/head.html`, `templates/nav.html`, and `templates/footer.html` own the shared chrome. The build adds them to every published HTML page. Do not duplicate these in tool pages.
- `assets/mark.svg` is the shared logo and favicon, derived from `branding.png`. Preserve the navy/white and magenta-to-cyan identity.
- Edit source, never generated `dist/`. Do not commit build output.

## Tool conventions

Use lowercase hyphenated folder slugs, quoted HTML attributes, a meaningful title and description, and a main landmark. Each published `.html` file must be a full document. Keep tool-specific assets inside its folder and reference them relatively. Root-relative shared links target the custom domain root.

Use `.site-*` classes and `--site-*` properties only for shared chrome. Individual tools may have their own visual style. Keep inputs labelled, keyboard navigation visible, statuses accessible, mobile layouts usable, and reduced-motion preferences respected. Keep `[hidden]` effective even when component styles set `display`.

Public copy can be witty and gently sarcastic. Instructions, errors, and controls must remain clear. Do not claim capabilities or privacy guarantees the implementation does not provide.

## Verification

Run `npm test` and `npm run build` after changes to discovery, templates, or deployment. Build tests cover automatic discovery, removal, metadata validation, shared layout, and exclusion of private source files. Add meaningful regression coverage for changed behavior; avoid tests that merely repeat markup.

Use `npm start` to preview. Check the overview and affected tools on desktop and mobile, confirm home links and favicon resolve, and exercise the affected browser interactions. For GPX changes, check importing, previewing, and downloading sample tracks. Rebuild after edits before refreshing.

## Deployment and repository hygiene

GitHub Actions tests/builds PRs and deploys only `main` to Pages. Upload only `dist/`, preserve least-privilege workflow permissions, and keep the custom domain in `CNAME`. Do not publish a repository snapshot as the artifact. Changes to tool folders must be reflected by discovery, never by hand-edited lists.

Respect existing uncommitted work. Do not commit, push, or change repository settings unless the user asks. Document any changed build or authoring conventions in README.md.
