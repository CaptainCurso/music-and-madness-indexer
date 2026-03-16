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

You need a Notion integration token and the Music and Madness pages/databases shared with that integration.

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

3. Open `/Users/nicholasmcdowell/Developer/music and madness indexer/.env` and fill in:

   - `NOTION_TOKEN`: your Notion integration token.
   - `NOTION_ROOT_PAGE_URL_OR_ID`: the Music and Madness root page URL or raw page ID.
   - `NOTION_CATALOG_DATABASE_URL_OR_ID`: the M&M Index / Catalog database URL or raw database ID.
   - `NOTION_WORK_QUEUE_PAGE_URL_OR_ID`: the Scanner Work Queue page URL or raw page ID.
   - `NOTION_EXCLUDED_PAGE_URLS_OR_IDS`: the excluded subtree page URLs or IDs, separated by commas or new lines.

4. Make sure your integration has access:

   - Open each required page/database in Notion.
   - Use the Share menu.
   - Invite your integration so it can read the wiki, query the catalog, and write to the queue page.

## Git setup

This project is not yet a git repository. If you want local history and a GitHub remote, use:

- `/Users/nicholasmcdowell/Developer/music and madness indexer/docs/GIT_SETUP.md`

That guide covers:

- creating the local git repository
- checking what will be committed
- making the first commit
- adding a GitHub `origin` remote
- pushing the `main` branch

## Run the scanner

During development, the simplest command is:

```bash
npm run scan
```

What it does: compiles the TypeScript files into `/Users/nicholasmcdowell/Developer/music and madness indexer/dist`, then runs the built script with Node.js.

Risk: medium. It reads from Notion and rewrites the content of the configured Scanner Work Queue page.

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
