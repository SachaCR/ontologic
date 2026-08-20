# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
yarn
```

## Local Development

```bash
yarn start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
yarn build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

Using SSH:

```bash
USE_SSH=true yarn deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

## Do not run a site build while the dev server is running

`docusaurus build` and `docusaurus start` share `website/.docusaurus/`, and a
build leaves it configured for the **last locale it built**. Docusaurus always
builds the default locale first, so the last one is `fr` — and a dev server that
was already running then serves the French route table, where `/domain-explorer`
does not exist. The symptom is a "Page introuvable" 404 on a page that worked a
minute earlier.

Restarting the dev server fixes it; nothing is wrong with the site. Reordering
the locales does not help either, because `docusaurus build --locale en` clears
`build/` and would delete the French output.

Note the root `pnpm build` runs this build too, so it hits the same thing
whenever the site has changed since the last build.
