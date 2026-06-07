// Astro-side wrapper around the topics dictionary. Pages and components use
// getTopics() (reads the CMS-edited data collection); the matching logic comes
// from the shared plain-ESM module so it is identical to the build scripts.
import { getEntry } from 'astro:content';
// @ts-ignore — plain ESM helper, no type declarations needed.
import { buildEntries, topicForTag, articleMatchesEntry } from './topic-matcher.mjs';

export interface Topic {
  label: string;
  slug: string;
  aliases?: string[];
  description?: string;
}

export async function getTopics(): Promise<Topic[]> {
  const entry = await getEntry('topics', 'topics');
  return (entry?.data.topics ?? []) as Topic[];
}

export { buildEntries, topicForTag, articleMatchesEntry };
