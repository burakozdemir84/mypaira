# CLAUDE.md

Read `AGENTS.md` in this directory first, and follow it. It is the operating guide for
this repo: what the project is, the rules that break production, how to change a page,
how to deploy, and what to do when the Cloudflare credentials expire.

Quick orientation:

- **Live site:** https://www.mypaira.com — Cloudflare Pages project `paira`.
- **No build step.** `site/` is deployed as-is. There is no bundler and no `npm run build`.
- **Deploy with `./deploy.sh`** and nothing else. The bare
  `wrangler pages deploy site` form drops the D1 binding and silently breaks `/api/lead`.
- **Never edit `site/support.js`.** It is a compiled runtime whose source is not in this
  bundle and cannot be regenerated here. Every page depends on it.
- **Never touch the mail DNS records** (`MX`, SPF, `_dmarc`, `autodiscover`, …). The
  values and rollback procedure are in `DEPLOY.md`.
- **Never delete a `paira:*:start` / `paira:*:end` comment.** They delimit generated
  blocks; the tools in `tools/` locate their work by them.
- **This repo is not in version control.** It is the only copy of the source for a live
  site. Put it in a private git repo before making changes.

If `./deploy.sh` reports missing credentials, that is an auth problem, not a code
problem — go to `AGENTS.md` §5 and do not start editing files.
