# Music and Madness Scanner

This project is a small command-line script that:

1. Crawls the Music and Madness wiki in Notion.
2. Queries the M&M Index / Catalog database.
3. Compares the two.
4. Rewrites the Scanner Work Queue page with a fresh summary and actionable entries.

## Project layout

- `/Users/nicholasmcdowell/Developer/music and madness indexer/package.json` - project metadata and commands.
- `/Users/nicholasmcdowell/Developer/music and madness indexer/.env.example` - example configuration values you can copy into a real `.env` file.
- `/Users/nicholasmcdowell/Developer/music and madness indexer/src/config.ts` - loads and validates environment variables.
- `/Users/nicholasmcdowell/Developer/music and madness indexer/src/notion-api.ts` - small Notion API client with rate limiting.
- `/Users/nicholasmcdowell/Developer/music and madness indexer/src/queue-blocks.ts` - formats the summary and queue entries as Notion blocks.
- `/Users/nicholasmcdowell/Developer/music and madness indexer/src/index.ts` - the main scanner workflow.

## Before you run it

You need either:

- an internal Notion integration token, or
- a public Notion OAuth integration that can produce an access token for this script

In both cases, the Music and Madness pages/databases still need to be shared with the integration.

Important: this script treats the Scanner Work Queue page as a managed page. Each run replaces the page body with a new summary plus a fresh queue. If you want to keep handwritten notes, keep them on a different page.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

   What it does: downloads the TypeScript tooling used by this project into `node_modules`.

   Risk: low. It adds local project dependencies and creates a `package-lock.json` file.

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   What it does: makes a real `.env` file from the example template.

   Risk: low. It creates a new `.env` file in this folder. If you already have a `.env` file, this command would overwrite it, so check first.

3. Open `/Users/nicholasmcdowell/Developer/music and madness indexer/.env` and fill in the shared fields:

   - `NOTION_ROOT_PAGE_URL_OR_ID`: the Music and Madness root page URL or raw page ID.
   - `NOTION_CATALOG_DATABASE_URL_OR_ID`: the M&M Index / Catalog database URL or raw database ID.
   - `NOTION_WORK_QUEUE_PAGE_URL_OR_ID`: the Scanner Work Queue page URL or raw page ID.
   - `NOTION_EXCLUDED_PAGE_URLS_OR_IDS`: the excluded subtree page URLs or IDs, separated by commas or new lines.

4. Choose one auth mode:

   Internal integration mode:
   - put the bearer token in `NOTION_TOKEN`

   Public OAuth mode:
   - put your client ID in `OAUTH_CLIENT_ID`
   - put your redirect URI in `OAUTH_REDIRECT_URI`
   - put the full authorize URL in `NOTION_AUTH_URL`
   - put your client secret in `OAUTH_CLIENT_SECRET`
   - after the browser step, the helper script will save `NOTION_ACCESS_TOKEN` and `NOTION_REFRESH_TOKEN` for you

   Note:
   - If you already pasted your OAuth client secret into `NOTION_TOKEN`, the OAuth helper can use that as a fallback.

5. Make sure your integration has access:

   - Open each required page/database in Notion.
   - Use the Share menu.
   - Invite your integration so it can read the wiki, query the catalog, and write to the queue page.

## Git and Pages

This project is already a git repository and is published on GitHub:

- [https://github.com/CaptainCurso/music-and-madness-indexer](https://github.com/CaptainCurso/music-and-madness-indexer)

The GitHub Pages site is:

- [https://captaincurso.github.io/music-and-madness-indexer/](https://captaincurso.github.io/music-and-madness-indexer/)

If you want the git workflow and Pages details in one place, use:

- `/Users/nicholasmcdowell/Developer/music and madness indexer/docs/GIT_SETUP.md`

That guide covers the repository, GitHub Pages, and the final hosted URLs.

## OAuth helper

If your Notion integration is public, use the OAuth helper scripts first.

1. Print the authorization URL:

   ```bash
   npm run oauth:url
   ```

   What it does:
   - Builds the project and prints the Notion authorization URL from `.env`.

   Risk:
   - Low. It only reads local config and prints instructions.

2. Open the URL in your browser and approve the app.

   The redirect page at:

   - [https://captaincurso.github.io/music-and-madness-indexer/oauth/callback.html](https://captaincurso.github.io/music-and-madness-indexer/oauth/callback.html)

   will show the returned `code` value clearly.

3. Exchange the returned code for real tokens:

   ```bash
   npm run oauth:exchange -- --code=<code-or-full-callback-url>
   ```

   What it does:
   - Sends the authorization code to Notion's OAuth token endpoint.
   - Saves `NOTION_ACCESS_TOKEN` and `NOTION_REFRESH_TOKEN` into `/Users/nicholasmcdowell/Developer/music and madness indexer/.env`.

   Risk:
   - Medium. It stores live OAuth tokens in your local `.env` file, which should stay private.

4. Optional: refresh tokens manually later:

   ```bash
   npm run oauth:refresh
   ```

   What it does:
   - Uses the saved refresh token to request a new access token from Notion.

   Risk:
   - Low to medium. It updates the stored OAuth tokens in `.env`.

## Run the scanner

During development, the simplest command is:

```bash
npm run scan
```

What it does: compiles the TypeScript files into `/Users/nicholasmcdowell/Developer/music and madness indexer/dist`, then runs the built script with Node.js.

Risk: medium. It reads from Notion and rewrites the content of the configured Scanner Work Queue page.

For the nightly automation or a fresh worktree, use:

```bash
npm run scan:nightly
```

What it does: runs a preflight check, which is a quick setup check before the real work starts. It makes sure this worktree has local dependencies installed and that Notion credentials are available through either `.env` or shell environment variables. If those checks pass, it runs `npm run scan`.

Risk: medium. Once the preflight checks pass, it performs the same scan and queue-page rewrite as `npm run scan`.

If you run the nightly command from a git worktree, it will try to reuse the main checkout's `.env` file and `node_modules` folder automatically when this worktree does not have its own copies yet.

Advanced option:
- Set `SCANNER_ENV_FILE` if you want the scanner and OAuth helper to read and write tokens in a specific `.env` file path instead of the default `.env` in the current folder.

In public OAuth mode, `npm run scan` uses `NOTION_ACCESS_TOKEN`. If that access token has expired and `NOTION_REFRESH_TOKEN` is available, the scanner will refresh it once and retry automatically.

If you want a compiled JavaScript build first:

```bash
npm run build
npm run start
```

## What the scanner writes

The output page is rewritten in this order:

1. A summary section with scan date and counts.
2. A `QUEUE START` heading.
3. One Heading 3 entry per actionable item:
   - `ACTION: INDEX`
   - `ACTION: REVIEW_DUPLICATE`
   - `ACTION: REVIEW_ORPHAN`

## Notes about matching

- Matching is done by Notion page ID, not title.
- The script accepts either full Notion URLs or raw IDs in `.env`.
- `child_database` blocks are skipped.
- Excluded subtrees are skipped entirely and not recursed into.
- If the catalog query fails, the script exits before it writes anything to the queue page.
