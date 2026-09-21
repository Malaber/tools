# GPX Helper

A static, dependency-free browser tool for combining multiple GPX cycling activities.

## Hosting

Copy the contents of this directory to:

`https://tools.malaber.de/gpx-helper/`

No backend, build step, npm dependencies, service worker, or external CDN is required.

## Features

- Import multiple `.gpx` files via file picker or drag-and-drop
- Reorder activities manually or sort by start timestamp
- Preserve individual GPX track segments or join everything into one segment
- Preserve timestamps, remove timestamps, or shift later activities onto a continuous timeline
- Merge top-level waypoints
- Lightweight SVG route preview generated entirely in the browser
- Download a standards-oriented GPX 1.1 file
- Mobile-friendly and keyboard-accessible native HTML controls

## Recommended mode for Strava activities

Use **Keep source segments separate** + **Preserve original timestamps**.

This avoids inventing a straight-line connection between rides and retains the activity timestamps contained in the source GPX files.

## Notes

- GPX files are processed locally in the browser and are never uploaded.
- The route preview intentionally uses plain SVG instead of a map provider, keeping the tool fully static and offline-capable.
- Track point child elements and extension data are copied into the merged GPX where present.
- This tool merges GPX tracks; it does not currently import FIT or TCX files directly.
