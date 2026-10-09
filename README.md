# Timeline

Timeline is an open-source, cross-platform nonlinear video editor for the web and desktop. It is an independent, community-developed project inspired by professional editing workflows. It is **not** affiliated with Adobe or any other commercial vendor.

The same editor, project model, and media abstractions run in the browser and in Electron.

## Current status

This repository is an **early foundation**, not a complete editor.

Working today:

- Shared dark workspace (project bin, source/program monitors, timeline, inspector)
- Strongly typed project model (sequences, tracks, clips, media references)
- Import local video/audio, preview it, and place clips on the timeline
- Playhead, zoom, clip selection, clip move, split, and undo/redo
- Single-clip sequence playback (topmost visible video clip under the playhead)
- Save and reopen `.timeline` project files
- Web app and desktop app from one codebase
- **Export to WebM (VP9 + Opus)** in Chromium via WebCodecs (configurable resolution/frame rate)

Not implemented yet (the UI says so rather than faking it):

- Multi-track compositing and standalone audio playback
- MP4/MOV export and FFmpeg desktop pipeline
- Transitions, effects, keyframes, titles, color correction
- Proxy media and background rendering

## Goals

- One editor for web and desktop, with platform adapters only at the edges
- Integer-frame editing math and versioned project files
- Secure Electron defaults (context isolation, no Node in the renderer)
- A maintainable monorepo that can grow into a full NLE

## Technology

React, TypeScript, Vite, Electron, Tailwind CSS, Zustand, Lucide React, pnpm workspaces, Turborepo, Vitest, Playwright.

Media:

- **Web:** browser `File` objects, object URLs, native `<video>` playback, WebCodecs export to WebM
- **Desktop:** file access and optional FFprobe in the Electron main process; the renderer only receives `timeline-media://` URLs

## Repository layout

```text
apps/web            Browser entry point
apps/desktop        Electron main, preload, IPC, and renderer
packages/editor     Shared workspace, stores, commands, playback
packages/core       Project model, operations, history, serialization
packages/media      Media engine interfaces and adapters
packages/ui         Visual components and design tokens
packages/shared     Utilities, constants, desktop IPC contract
packages/config     Shared ESLint, TypeScript, and Prettier config
```

## Requirements

- [Node.js](https://nodejs.org/) 22.12 or later (see `.nvmrc`)
- [pnpm](https://pnpm.io/) 12 (`corepack enable` is the easiest way to get it)

Optional for desktop metadata:

- [FFmpeg](https://ffmpeg.org/) on your `PATH` (`ffprobe`). If it is missing, Timeline still imports media using the Chromium media element.

Packaging installers (`pnpm package:desktop`) needs platform build tools used by [electron-builder](https://www.electron.build/).

## Installation

```bash
pnpm install
```

## Run the web application

```bash
pnpm dev:web
```

Open [http://localhost:5173](http://localhost:5173). In Chromium, Save uses the File System Access API. Firefox and Safari download a `.timeline` file instead. Browsers cannot reopen media from a saved path, so assets are offline after a new session until you relink them.

## Run the desktop application

```bash
pnpm dev:desktop
```

The desktop app can reopen media from paths stored in the project file on the same machine.

## Build

```bash
pnpm build
pnpm build:web
pnpm build:desktop
pnpm package:desktop   # installers via electron-builder (optional)
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @timeline/web exec playwright install chromium
pnpm test:e2e
```

## License

[MIT](LICENSE). Timeline’s own code is MIT-licensed. **Dependencies and media codecs may have their own licensing requirements.** Distributing a packaged editor that decodes H.264/AAC (and similar formats) can involve patent or codec licenses that this project does not grant.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
