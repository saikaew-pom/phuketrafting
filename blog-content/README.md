# blog-content

The source markdown for blog posts (plan §10's content pipeline). One file per
post, named `<slug>.md`, front-matter + `### Article` + the body.

**These files are drafts and a review surface — they are not the live site.**
`blog_posts` in D1 is what the site renders. Editing a file changes nothing
until it is imported; editing a post in the dashboard does not write back here.

## The loop

```bash
npm run blog:generate            # AI-draft any post in scripts/blog-briefs.mjs that has no file yet
npm run blog:generate -- --force # regenerate everything
npm run blog:generate -- <slug>  # just one

# read the files. this is the review gate, and it is the point.

npm run blog:import              # dry run: shows what would change, writes nothing
npm run blog:import -- --apply   # into local D1 — NEW posts only
npm run blog:verify              # exit test: every internal link resolves, no orphans
```

## Existing posts are skipped unless `--overwrite`

Import is INSERT-or-UPDATE by slug, but **it will not touch a post that already
exists in the database unless you pass `--overwrite`.**

That matters because there are two places a post can change and only one of them
is this directory. Staff publish and edit in the dashboard; nobody goes back and
updates a markdown file. So if adding post #11 also pushed these files over the
existing rows, it would shove `published: false` from ten stale files onto ten
**live** posts — the whole blog offline — and revert every dashboard edit along
the way. Adding a post must not be able to unpublish the others.

`--overwrite` is the "the files are right, force them in" path. It lists every
live→draft transition and every content revert it is about to cause, and the dry
run shows the identical list — so look at the dry run first.

## Publishing

Generated posts are always `published: false`. Nothing an AI wrote reaches the
public site because someone ran a script — a human reads the post, flips
`published: true` in the front-matter, and pushes it with `--overwrite`:

```bash
npm run blog:import                              # dry run: read what it says it will do
npm run blog:import -- --apply --overwrite       # local
npm run blog:import -- --apply --overwrite --remote   # PRODUCTION
npm run blog:verify -- --remote
```

Re-importing an already-published post never bumps its `published_at`, so
editing a live post doesn't reshuffle the blog index.

## Front-matter

| Field | Notes |
|---|---|
| `slug` | lowercase-kebab-case, must equal the filename, and is the import identity |
| `title` | quoted |
| `category` | one of `rafting`, `jungle-adventures`, `trip-planning`, `camping`, `nature-culture` — must match `BLOG_CATEGORIES` in `src/lib/queries/blog.ts` |
| `excerpt` | quoted; shown on the blog index |
| `author` | quoted |
| `featured` | `true` / `false` |
| `cover_image_id` | Cloudinary public_id, or blank. Easiest to set by uploading in the dashboard editor |
| `published` | `true` / `false` — the gate above |

## Body rules

The body is rendered by `src/components/public/BlogBody.tsx`, which supports a
deliberate markdown **subset**: `##`/`###`/`####` headings, `**bold**`,
`*italic*`, `- ` bullets, `[text](/url)` links. Anything else renders as
literal text.

- **Never use a `# ` heading.** The title is stored separately and rendered
  above the body; `BlogBody` doesn't handle `#` and would show the raw `#`.
- End with a `## FAQ` section of `### Question` headings. `src/lib/blog-faq.ts`
  parses it into FAQPage JSON-LD, so **the markup is generated from the text
  the reader sees** — never add an FAQ to the markup that isn't in the body.
- Internal links only to real routes (`/en#tours`, `/en#camp-book`,
  `/en/blog/<slug>`). `npm run blog:verify` is what proves it.
