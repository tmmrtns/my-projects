# Cookbook Creator web relay

A small Netlify Function that fetches recipe pages for the Cookbook Creator on GitHub Pages (browsers can't fetch other sites directly).

- GET `/relay?url=<page>` only; allowed caller origin `https://tmmrtns.github.io`.
- Blocks private/internal addresses, follows up to 5 redirects (re-checking each), 3 MB cap, 12 s timeout.

## Deploy
In Netlify: Add new site > Import from GitHub > `tmmrtns/my-projects`, base directory `cookbook-creator/relay`, no build command, publish directory `public`. Name the site `cookbook-relay-tmmrtns` so the address is `https://cookbook-relay-tmmrtns.netlify.app/relay?url={url}` (the default the app already tries). Any other address can be entered under Library > Web relay.
