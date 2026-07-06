// Article editor (replaces Sveltia). Mirrors public/admin/config.yml's
// collections field-for-field, reading/writing the exact same files under
// src/content/ so nothing about how the Astro site reads content changes.
//
// Storage: local writes straight to your working copy while running
// `npm run dev` (same convenience as Sveltia's `local_backend: true`); in
// production it commits through GitHub, which needs a one-time GitHub OAuth
// App set up separately from Sveltia's (see docs/keystatic-setup.md).
//
// Known gap vs. Sveltia: "articles_interactive" (the handful of .mdx pieces
// with embedded layout components like <Tabs>/<Callout>) are NOT editable
// here. Keystatic's rich content editor would reparse and rewrite those
// component blocks on every save, risking corruption — the same risk
// Sveltia's config avoided by using a plain-text box for that one field.
// Continue editing those specific files directly in GitHub or your code
// editor, exactly as Sveltia's own config already asked you to do for their
// body text.
import { config, fields, collection, singleton } from '@keystatic/core';

const SECTION_OPTIONS = [
  { label: 'Evidence & Practice', value: 'police-policy' },
  { label: 'Leadership & Culture', value: 'public-policy' },
  { label: 'Influential People', value: 'influential-people' },
  { label: 'History & Curiosities', value: 'other' },
  { label: 'Technology & Innovation', value: 'data-stories' },
];

const stringList = (label: string, description?: string) =>
  fields.array(fields.text({ label: 'Entry' }), { label, description, itemLabel: (props) => props.value || 'Entry' });

export default config({
  storage: import.meta.env.DEV
    ? { kind: 'local' }
    : { kind: 'github', repo: 'idorunning/thinkingaboutpolicing' },

  collections: {
    articles: collection({
      label: 'Articles',
      slugField: 'title',
      path: 'src/content/articles/*',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'section', 'pubDate', 'draft'],
      schema: {
        title: fields.slug({ name: { label: 'Title', validation: { isRequired: true } } }),
        section: fields.select({
          label: 'Section — change this to move the article between areas',
          options: SECTION_OPTIONS,
          defaultValue: 'police-policy',
        }),
        description: fields.text({
          label: 'Description — the standfirst, and the search/social summary',
          multiline: true,
        }),
        pubDate: fields.date({ label: 'Publish date', validation: { isRequired: true } }),
        updatedDate: fields.date({ label: 'Updated date (optional)' }),
        author: fields.text({ label: 'Author', defaultValue: 'Nathan Tracey' }),
        // Plain text, not fields.image(): Keystatic's image field manages its
        // own upload/asset bookkeeping and doesn't recognise pre-existing
        // plain-string paths written by Sveltia — the first save silently
        // dropped these fields entirely in testing. A text field with the
        // existing path is guaranteed not to lose the reference; paste a new
        // path under public/images/ to change the image.
        thumbnail: fields.text({ label: 'Thumbnail / card image path (optional)', description: 'e.g. /images/my-photo.png — upload the file to public/images/ first.' }),
        heroImage: fields.text({ label: 'Hero image path (optional)', description: 'e.g. /images/my-photo.png — upload the file to public/images/ first.' }),
        portrait: fields.text({
          label: 'Portrait path (optional) — head-and-shoulders photo for Influential People cards',
          description: 'e.g. /images/my-photo.png — upload the file to public/images/ first.',
        }),
        tags: stringList('Tags', 'One per entry, e.g. policing, policy, evidence-based-policing.'),
        keyTakeaways: stringList('Key takeaways (optional)', 'Three to five scannable points readers should leave with.'),
        discussionQuestions: stringList('Discussion questions (optional)', 'Up to three questions shown at the end of the article.'),
        redirectFrom: stringList(
          'Redirect from (old paths)',
          'If you move this article to a different section, paste its old path here (e.g. /police-policy/the-old-slug) so the old link keeps working.'
        ),
        draft: fields.checkbox({
          label: 'Keep hidden on the live site',
          defaultValue: false,
          description: 'On = saved but not shown on the site. Off = live on the next build.',
        }),
        body: fields.markdoc({
          label: 'Body',
          extension: 'md',
          description: 'Footnotes use [^1] in the text and [^1]: ... at the foot, as in the existing pieces.',
        }),
      },
    }),
  },

  singletons: {
    about: singleton({
      label: 'Pages / About',
      path: 'src/content/pages/about',
      format: { contentField: 'body' },
      schema: {
        title: fields.text({ label: 'Page heading' }),
        description: fields.text({ label: 'Meta description (search/social summary)', multiline: true }),
        body: fields.markdoc({ label: 'Content', extension: 'md' }),
      },
    }),
    contact: singleton({
      label: 'Pages / Contact',
      path: 'src/content/pages/contact',
      format: { contentField: 'body' },
      schema: {
        title: fields.text({ label: 'Page heading' }),
        description: fields.text({ label: 'Meta description (search/social summary)', multiline: true }),
        body: fields.markdoc({ label: 'Content', extension: 'md' }),
      },
    }),
    howIBuiltThis: singleton({
      label: 'Pages / How I built this',
      path: 'src/content/pages/how-i-built-this',
      format: { contentField: 'body' },
      schema: {
        title: fields.text({ label: 'Page heading' }),
        description: fields.text({ label: 'Meta description (search/social summary)', multiline: true }),
        draft: fields.checkbox({
          label: 'Keep hidden on the live site',
          defaultValue: false,
          description: 'On = the page 404s and its nav link disappears. Off = live on the next build.',
        }),
        body: fields.markdoc({ label: 'Content', extension: 'md' }),
      },
    }),

    topics: singleton({
      label: 'Topics dictionary',
      path: 'src/content/topics/topics',
      format: 'json',
      schema: {
        topics: fields.array(
          fields.object({
            label: fields.text({ label: 'Display label' }),
            slug: fields.text({ label: 'URL slug', description: 'lowercase-hyphenated, e.g. stop-and-search' }),
            aliases: stringList('Aliases / other phrasings', "Other ways the term appears in articles, e.g. 'stop & search'."),
            description: fields.text({ label: 'Short description', multiline: true }),
          }),
          { label: 'Topics', itemLabel: (props) => props.fields.label.value || 'Topic' }
        ),
      },
    }),

    books: singleton({
      label: 'Books',
      path: 'src/content/books/books',
      format: 'json',
      schema: {
        books: fields.array(
          fields.object({
            title: fields.text({ label: 'Title' }),
            cover: fields.text({ label: 'Cover image path (optional)', description: 'e.g. /images/my-cover.png — upload the file to public/images/ first.' }),
            blurb: fields.text({ label: 'Blurb', multiline: true }),
            buyUrl: fields.url({ label: 'Buy link', validation: { isRequired: true } }),
            buyLabel: fields.text({ label: 'Button label', defaultValue: 'Get the book' }),
            price: fields.text({ label: 'Price (optional)' }),
            tags: stringList('Related tags', "If one of these matches an article's tag, the book is promoted at the foot of that article."),
          }),
          { label: 'Books', itemLabel: (props) => props.fields.title.value || 'Book' }
        ),
      },
    }),

    resources: singleton({
      label: 'Further reading',
      path: 'src/content/resources/resources',
      format: 'json',
      schema: {
        resources: fields.array(
          fields.object({
            label: fields.text({ label: 'Title' }),
            url: fields.url({ label: 'URL', validation: { isRequired: true } }),
            note: fields.text({ label: 'Note (optional)', multiline: true }),
            category: fields.text({ label: 'Category (optional)', description: "Groups links on the page, e.g. 'Evidence and research'." }),
          }),
          { label: 'Links', itemLabel: (props) => props.fields.label.value || 'Link' }
        ),
      },
    }),

    changelog: singleton({
      label: 'Change log',
      path: 'src/content/changelog/changelog',
      format: 'json',
      schema: {
        changelog: fields.array(
          fields.object({
            date: fields.date({ label: 'Date', validation: { isRequired: true } }),
            title: fields.text({ label: 'Title', description: "A short headline, e.g. 'Fixed a broken link in the stop & search piece'." }),
            description: fields.text({ label: 'What changed and why', multiline: true }),
            type: fields.select({
              label: 'Type (optional)',
              options: [
                { label: 'New — a new page or feature', value: 'new' },
                { label: 'Fix — something corrected', value: 'fix' },
                { label: 'Update — content refreshed', value: 'update' },
                { label: 'Article — a new piece published', value: 'article' },
                { label: 'Note — a learning note', value: 'note' },
              ],
              defaultValue: 'update',
            }),
          }),
          { label: 'Entries', itemLabel: (props) => `${props.fields.date.value ?? ''} — ${props.fields.title.value ?? ''}` }
        ),
      },
    }),
  },
});
