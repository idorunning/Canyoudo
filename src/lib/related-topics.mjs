// Pure helper: given, for each article, the set of topic slugs it matches,
// rank the topics that most often co-occur with a given topic on the same
// articles. Used to show "Related topics" on a topic archive page.
//
// articleTopicSlugs: string[][] — one inner array per article, listing the
//   slugs of every topic that article matches.
// currentSlug: the topic whose neighbours we want.
// Returns: [{ slug, count }] sorted by co-occurrence count (desc), then slug.
export function relatedTopics(currentSlug, articleTopicSlugs, limit = 6) {
  const counts = new Map();
  for (const slugs of articleTopicSlugs) {
    if (!slugs.includes(currentSlug)) continue; // only articles under this topic
    for (const s of slugs) {
      if (s === currentSlug) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([slug, count]) => ({ slug, count }));
}
