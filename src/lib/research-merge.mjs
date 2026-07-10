// Cross-source dedup + merge for the "All sources" research search — pure and
// unit-tested (tests/research-merge.test.mjs), like research-sources.mjs.
//
// Identity: a work's normalized DOI when it has one, else normalized
// title + year. Records found by several catalogues are merged into one,
// keeping the richest copy of each field and recording provenance in
// `sources`, and independent corroboration (2+ catalogues) promotes a work
// up the ranking.

/** "https://doi.org/10.1093/POLICING/X" → "10.1093/policing/x" */
export function normalizeDoi(doi) {
  if (!doi) return null;
  const d = String(doi)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  return d || null;
}

/** Lowercase, strip diacritics/punctuation, collapse whitespace. */
export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The identity used for dedup, both server-side and for the client's
 *  already-shown set across "More results" pages. */
export function workMergeKey(work) {
  const doi = normalizeDoi(work?.doi);
  if (doi) return `doi:${doi}`;
  const title = normalizeTitle(work?.title);
  return title ? `t:${title}|${work?.year ?? ''}` : null;
}

// The richest record wins as the base: prefer a longer abstract, then a
// TL;DR, then the higher citation count.
function richness(w) {
  return [(w.abstract ?? '').length, w.tldr ? 1 : 0, w.citedBy ?? 0];
}

function richer(a, b) {
  const ra = richness(a);
  const rb = richness(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b;
  }
  return a;
}

function mergePair(a, b) {
  const base = richer(a, b);
  const other = base === a ? b : a;
  const merged = {
    ...base,
    // Field-level fill: take whatever the leaner record knew that the richer
    // one didn't. PDFs beat landing pages; citation counts take the max.
    doi: base.doi ?? other.doi,
    pdfUrl: base.pdfUrl ?? other.pdfUrl,
    oaUrl: base.pdfUrl ?? other.pdfUrl ?? base.oaUrl ?? other.oaUrl,
    venue: base.venue ?? other.venue,
    publisher: base.publisher ?? other.publisher,
    year: base.year ?? other.year,
    abstract: base.abstract ?? other.abstract,
    ...(base.tldr || other.tldr ? { tldr: base.tldr ?? other.tldr } : {}),
    isOa: Boolean(base.isOa || other.isOa),
    citedBy: Math.max(base.citedBy ?? 0, other.citedBy ?? 0),
    authors: (base.authors?.length ?? 0) >= (other.authors?.length ?? 0) ? base.authors : other.authors,
    moreAuthors: Math.max(base.moreAuthors ?? 0, other.moreAuthors ?? 0),
  };
  // A merged record is a preprint only when BOTH copies are — if any catalogue
  // found the published version of the same work, "not yet peer reviewed"
  // would be wrong (and ...base could leak the flag from a preprint base).
  if (base.preprint && other.preprint) merged.preprint = true;
  else delete merged.preprint;
  return merged;
}

/**
 * Merge several catalogues' result lists (each already mapped to the page's
 * Work shape and relevance-filtered) into one deduplicated, ranked list.
 *
 * Ranking: works found by 2+ catalogues first (independent corroboration is
 * a real relevance signal), then by the best upstream position any catalogue
 * gave the work, citations as the tiebreak.
 */
export function mergeWorks(lists) {
  const byKey = new Map();
  let fallback = 0; // keyless works are kept, never merged
  for (const list of lists) {
    (list ?? []).forEach((work, rank) => {
      const key = workMergeKey(work) ?? `nokey:${fallback++}`;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, {
          work: { ...work, sources: [work.source] },
          bestRank: rank,
        });
      } else {
        const merged = mergePair(prev.work, work);
        merged.sources = [...new Set([...(prev.work.sources ?? []), work.source])];
        byKey.set(key, { work: merged, bestRank: Math.min(prev.bestRank, rank) });
      }
    });
  }
  return [...byKey.values()]
    .sort((a, b) => {
      const corrA = (a.work.sources?.length ?? 1) > 1 ? 1 : 0;
      const corrB = (b.work.sources?.length ?? 1) > 1 ? 1 : 0;
      if (corrA !== corrB) return corrB - corrA;
      if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
      return (b.work.citedBy ?? 0) - (a.work.citedBy ?? 0);
    })
    .map((e) => e.work);
}
