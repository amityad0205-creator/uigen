# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Initial setup (install deps + generate Prisma client + run migrations)
npm run setup

# Development server (Turbopack)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Run all tests
npm test

# Run a single test file
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx

# Database reset (destructive)
npm run db:reset

# Regenerate Prisma client after schema changes
npx prisma generate

# Apply new migrations
npx prisma migrate dev
```

## Architecture

UIGen is a Next.js 15 App Router application where users describe React components in a chat, Claude generates them via tool calls, and a live preview renders the result inside an iframe — all without writing any files to disk.

### Request/response flow

1. User types a prompt → `ChatProvider` (`src/lib/contexts/chat-context.tsx`) calls `useAIChat` from `@ai-sdk/react`, posting to `/api/chat`.
2. The API route (`src/app/api/chat/route.ts`) streams a `streamText` response using `claude-3-7-sonnet-latest` (or a `MockLanguageModel` when `ANTHROPIC_API_KEY` is absent). The model is given two tools: `str_replace_editor` and `file_manager`.
3. As tool call events arrive, `onToolCall` fires → `handleToolCall` in `FileSystemContext` mutates an in-memory `VirtualFileSystem`.
4. `refreshTrigger` increments → `PreviewFrame` regenerates the iframe HTML via `createImportMap` + `createPreviewHTML` (`src/lib/transform/jsx-transformer.ts`).

### Virtual file system

`VirtualFileSystem` (`src/lib/file-system.ts`) is an in-memory tree of `FileNode` objects. It is the source of truth for all generated code and never touches the disk. `FileSystemContext` wraps it in React state, exposes CRUD helpers, and is the only place that calls `triggerRefresh`. The `serialize()` / `deserializeFromNodes()` methods convert between the `Map`-based tree and plain JSON for API transport and Prisma storage.

### Preview pipeline

`PreviewFrame` reads the virtual FS via `getAllFiles()`, then:
1. **`createImportMap`** — Babel-transforms each `.jsx`/`.tsx`/`.js`/`.ts` file to plain JS via `@babel/standalone`, creates Blob URLs, and builds a browser import map. Third-party imports (no `./`, `/`, or `@/` prefix) resolve to `https://esm.sh/<pkg>`. The `@/` alias maps to the virtual root `/`.
2. **`createPreviewHTML`** — Produces a full HTML document with Tailwind CDN, the import map, and a `<script type="module">` that mounts the React app at `/App.jsx` inside an error boundary.
3. The HTML is written to `iframe.srcdoc`. The iframe needs `sandbox="allow-scripts allow-same-origin allow-forms"` because Blob URL imports require `allow-same-origin`.

### Auth

JWT sessions via `jose` (`src/lib/auth.ts`), stored in an `httpOnly` cookie (`auth-token`). Middleware (`src/middleware.ts`) protects `/api/projects` and `/api/filesystem` routes. `/api/chat` is intentionally unprotected — project persistence is skipped server-side when no valid session exists.

Anonymous work is tracked in `sessionStorage` (`src/lib/anon-work-tracker.ts`) so it can be offered for save-on-signup.

### Database

SQLite via Prisma. Schema is defined in `prisma/schema.prisma` — consult it for the authoritative data model. The generated client lives in `src/generated/prisma/`. Two models: `User` and `Project`. `Project.messages` and `Project.data` are JSON strings — messages are the full Vercel AI SDK message array; data is the serialized virtual FS.

### AI provider fallback

`getLanguageModel()` in `src/lib/provider.ts` returns `anthropic("claude-3-7-sonnet-latest")` when `ANTHROPIC_API_KEY` is set, or a `MockLanguageModel` otherwise. The mock streams canned tool calls to create a static counter/form/card component, so the app is fully functional without an API key.

### Tools exposed to the model

- **`str_replace_editor`** (`src/lib/tools/str-replace.ts`) — `create`, `str_replace`, `insert`, `view` commands on the virtual FS.
- **`file_manager`** (`src/lib/tools/file-manager.ts`) — `rename` and `delete` commands.

## Code style

Use comments sparingly — only when the code itself cannot convey the *why* (a non-obvious constraint, subtle invariant, or workaround). Don't comment what the code obviously does.

### Testing

Vitest + jsdom + Testing Library. Tests live in `__tests__/` subdirectories next to the code they cover. Run with `npm test`.
