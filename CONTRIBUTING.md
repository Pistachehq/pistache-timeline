# Contributing to Timeline

Thank you for helping build Timeline. This project is an independent, community-developed nonlinear video editor. It is inspired by professional editing workflows, not affiliated with any commercial vendor.

## Development setup

- Node.js 22.12 or later (see `.nvmrc`)
- [pnpm](https://pnpm.io/) 12 (the repo pins the version in `package.json`)

```bash
pnpm install
pnpm dev:web
```

For the desktop app:

```bash
pnpm dev:desktop
```

Optional: install [FFmpeg](https://ffmpeg.org/) so the desktop app can use `ffprobe` for media metadata. Without it, Timeline falls back to the browser media element.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev:web` | Run the web app |
| `pnpm dev:desktop` | Run the Electron app |
| `pnpm lint` | ESLint across the workspace |
| `pnpm typecheck` | TypeScript `--noEmit` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Playwright tests for the web app |
| `pnpm build` | Production builds |
| `pnpm format` | Prettier |

Please run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before opening a pull request.

Web end-to-end tests need Playwright’s Chromium build once per machine:

```bash
pnpm --filter @timeline/web exec playwright install chromium
pnpm test:e2e
```

## Architecture

Keep platform-specific code in `apps/`. Shared editing logic belongs in `packages/`:

- `packages/core` — project model, operations, history, serialization
- `packages/media` — media engine interfaces and adapters
- `packages/editor` — workspace UI and Zustand stores
- `packages/ui` — visual primitives
- `packages/shared` — utilities used by every package

Do not import Node.js or Electron APIs from `packages/editor`, `packages/core`, or `packages/ui`.

Editing changes should go through core operations and the project store (`apply`) so they remain undoable. Do not mutate project objects in React components.

## Pull requests

1. Open a focused PR with a short description of *why* the change exists.
2. Add or update unit tests for core operations and serialization when you touch them.
3. Do not present unfinished features as working in the UI. Disabled controls and explicit “not implemented yet” copy are preferred.
4. Do not add Adobe branding, assets, or proprietary code.

## License

Contributions are accepted under the MIT License. Dependencies and distributed media codecs may have their own terms.
