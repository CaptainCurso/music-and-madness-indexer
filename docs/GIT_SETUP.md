# Git Setup

This project currently has source files and dependencies, but it is not initialized as a git repository yet.

## What git is

- `git` is a version control system. It records snapshots of your project so you can review changes, make commits, and push the project to GitHub.

## Files used for git hygiene

- `/Users/nicholasmcdowell/Developer/music and madness indexer/.gitignore`

`.gitignore` tells git which generated or local-only files should stay out of commits.

## First-time local setup

Run these commands from:

- `/Users/nicholasmcdowell/Developer/music and madness indexer`

```bash
git init
git add .
git status --short
git commit -m "Initial commit"
```

What each command does:

- `git init`
  - Creates a new local git repository in this folder.
- `git add .`
  - Stages the current files for the next commit.
- `git status --short`
  - Shows a compact list of staged and unstaged files so you can verify the snapshot before committing.
- `git commit -m "Initial commit"`
  - Creates the first saved snapshot in git history.

Risk notes:

- `git add .` stages every file not excluded by `.gitignore`, so `git status --short` is the safety check before you commit.

## Connect to GitHub

After you create an empty GitHub repository, connect this local project to it:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

What each command does:

- `git remote add origin ...`
  - Saves the GitHub repository URL under the standard remote name `origin`.
- `git branch -M main`
  - Renames the current branch to `main`.
- `git push -u origin main`
  - Uploads the local `main` branch to GitHub and sets it as the default upstream branch.

Risk notes:

- `git remote add origin ...` fails if an `origin` remote already exists.
- `git push -u origin main` publishes the current commit history to GitHub, so double-check the repo name and visibility first.

## GitHub Pages setup for this project

This project now includes a small static site in:

- `/Users/nicholasmcdowell/Developer/music and madness indexer/docs/index.html`
- `/Users/nicholasmcdowell/Developer/music and madness indexer/docs/privacy.html`
- `/Users/nicholasmcdowell/Developer/music and madness indexer/docs/oauth/callback.html`

Those files are meant for GitHub Pages, which is GitHub's static website hosting feature.

### Recommended approach

Use a repository named `music-and-madness-indexer` and publish GitHub Pages from the `main` branch using the `/docs` folder.

If your GitHub username is `CaptainCurso`, the final URLs will be:

- Website: `https://captaincurso.github.io/music-and-madness-indexer/`
- Privacy policy: `https://captaincurso.github.io/music-and-madness-indexer/privacy.html`
- Redirect URL: `https://captaincurso.github.io/music-and-madness-indexer/oauth/callback.html`

### Publish steps

1. Initialize git locally:

   ```bash
   git init
   git add .
   git commit -m "Initial scanner and GitHub Pages site"
   ```

2. Create the GitHub repository:

   ```bash
   gh repo create music-and-madness-indexer --public --source=. --remote=origin --push
   ```

   What it does:
   - Creates a new GitHub repository.
   - Connects this folder to it as `origin`.
   - Pushes your current commit.

   Risk:
   - `--public` means the repository contents will be visible to anyone on the internet, except files excluded by `.gitignore` like `.env`.

3. Turn on GitHub Pages from the `/docs` folder:

   - Open the repository on GitHub.
   - Go to `Settings` -> `Pages`.
   - Under `Build and deployment`, choose:
     - `Source`: `Deploy from a branch`
     - `Branch`: `main`
     - `Folder`: `/docs`
   - Save.

4. Wait a minute or two for the site to publish, then open the URLs above.

### Why `/docs`

GitHub Pages can publish static files from a `/docs` folder in the main branch. That makes it a good fit for a small project site without adding a build system.

## Daily workflow after setup

```bash
git status
git add <files>
git commit -m "Describe the change"
git push
```

What each command does:

- `git status`
  - Shows modified, staged, and untracked files.
- `git add <files>`
  - Stages only the files you want in the next commit.
- `git commit -m "..."`
  - Records a named snapshot.
- `git push`
  - Sends committed changes to GitHub.
