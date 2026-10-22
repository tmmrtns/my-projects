# Cookbook Creator

A single-page recipe collector: scan or paste a recipe, store it, export PDFs and cookbooks.
Everything runs in the browser. There is no server and no build step.

## Publish on GitHub Pages
1. Put `index.html` and `data/recipes.json` in a repository (repo root or `/docs`).
2. Settings, Pages, "Deploy from a branch", pick the branch and folder.
3. Open `https://<user>.github.io/<repo>/`.

## Where recipes are stored
- **In the visitor's browser** (IndexedDB). This is the working copy.
- **In the repo** as `data/recipes.json`. The site loads this file on every visit and merges it in, so anything committed there appears for everyone.
- **Library button**: export or import a JSON backup, or sync with the repo.

### Syncing with the repo from the page
Create a fine-grained personal access token (GitHub, Settings, Developer settings): only this repository, permission *Contents: read and write*.
Paste it in Library once (it stays in that browser). "Sync" loads the file, merges, and commits the result. Pages redeploys in about a minute.
Without a token you can still export a backup and commit `data/recipes.json` yourself.

## Scans
Text recognition is Tesseract.js, loaded from jsDelivr, and runs on the device. The first scan downloads the language data.
Mark the ingredients, steps, title/info, notes and picture on the scan so only those areas are read.

## Webpages
"Fetch page" uses public CORS relays (allorigins, corsproxy.io). It can fail; saving the page or pasting text always works.
