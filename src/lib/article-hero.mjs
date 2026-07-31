// The one picture an article leads with. In Influential People, a profile opens
// with the person's face, so a portrait takes the hero slot when one is set;
// everywhere else the hero image is the hero image.
//
// Shared by the article page (src/pages/[section]/[slug].astro) and the
// share-card endpoint (src/pages/og/[section]/[slug].jpg.ts) so the picture in
// someone's X timeline is always the picture at the top of the article.
export function articleHero(data) {
  if (data.section === 'influential-people' && data.portrait) return data.portrait;
  return data.heroImage;
}
