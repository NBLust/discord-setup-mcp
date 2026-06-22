# Content Layer — Implementation Plan (Subsystem 2 of 5)

> REQUIRED SUB-SKILL: superpowers:executing-plans. Builds on subsystem 1 (REST foundation).

**Goal:** Give the MCP the ability to put CONTENT into a server — messages, rich embeds, pins, forum posts, webhook personas, and link-button messages — so a built server is non-empty.

**Architecture:** `services/content.ts` holds pure builders (`buildEmbed`, `buildLinkButtons`) that validate against Discord limits, plus thin REST senders. `tools/content.ts` exposes 6 tools. All over the REST singleton. Interactive components are NOT supported (no gateway listener) — only link buttons (style 5).

**Permissions note:** the bot invite must include SEND_MESSAGES, EMBED_LINKS, MANAGE_WEBHOOKS, CREATE_PUBLIC_THREADS, ADD_REACTIONS, MANAGE_MESSAGES (all in the Administrator invite).

### Task 1: Pure builders + unit tests
- Create `src/services/content.ts` with `buildEmbed(input)` (limits: title 256, description 4096, ≤25 fields, field name 256 / value 1024, footer 2048, total ≤6000; hex/int color → int) and `buildLinkButtons(buttons)` (http(s) urls only, label ≤80, ≤25 buttons chunked into action rows of 5).
- Test `tests/content.test.ts`: valid embed → object with int color; over-limit title → throws; valid buttons → action rows of 5; non-http url → throws; >25 buttons → throws.
- Run `npx vitest run tests/content.test.ts` → PASS. Commit.

### Task 2: Content tools
- Create `src/tools/content.ts` with: `send_message`, `post_embed`, `pin_message`, `create_forum_post`, `post_via_webhook` (create webhook → execute → delete; message persists), `post_message_with_components` (link buttons).
- Use `Routes.channelMessages`, `Routes.channelMessage`, `Routes.channelPin`, `Routes.threads`, `Routes.channelWebhooks`, `Routes.webhook`.
- Typecheck clean. Commit.

### Task 3: Register + build
- Register all 6 tools in `src/index.ts`. `npm run build && npx tsc --noEmit && npx vitest run` all green. Commit.

### Task 4: Live smoke on mcp-test
- Extend `tests/live-smoke-content.mjs`: in a temp channel — send message, post embed, pin it (verify pin route; fall back to `/channels/{id}/messages/pins/{m}` if legacy 404s), create a forum post in a temp forum, post via webhook, post link-button message. Assert + self-clean. Commit.
