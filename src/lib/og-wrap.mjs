// Line-breaking for the share cards. SVG <text> does not wrap, so the card
// renderers have to decide the breaks themselves — which means knowing how wide
// a line of type will actually be.
//
// That width depends on the font the rasteriser resolves, and the cards name a
// stack (Georgia, Times New Roman, serif) that no build host has in full: each
// falls back to whatever serif it ships. Those faces differ enough to matter —
// the same headline that fits inside the measure on one machine runs off the
// edge of the card on another. So `widthOf` is injected: the OG endpoint passes
// a function that measures the real face on the machine doing the rendering, and
// `estimateWidth` stands in for callers with no rasteriser to hand.

// A rough average glyph advance, for callers that cannot measure. Deliberately
// generous: breaking a line early is survivable, running past the edge is not.
const ESTIMATED_GLYPH_WIDTH = 0.55;

export function estimateWidth(text, fontSize) {
  return String(text ?? '').length * fontSize * ESTIMATED_GLYPH_WIDTH;
}

// Greedy word-wrap to `maxWidth`. Lines beyond `maxLines` are dropped and the
// last kept line gets an ellipsis — a last resort; callers step the size down
// first (see fitLines).
export function wrapToWidth(title, { widthOf = estimateWidth, fontSize, maxWidth, maxLines = 4 } = {}) {
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean);

  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    // A single word longer than the measure still gets its own line: better one
    // over-long line than an empty one.
    if (!line || widthOf(candidate, fontSize) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    // The ellipsis has to fit too, so drop trailing words from the last kept
    // line until it does — otherwise the truncation itself runs off the card.
    const truncate = (words) => `${words.join(' ').replace(/[\s.,;:]+$/, '')}…`;
    const tail = kept[maxLines - 1].split(' ');
    while (tail.length > 1 && widthOf(truncate(tail), fontSize) > maxWidth) tail.pop();
    kept[maxLines - 1] = truncate(tail);
    return kept;
  }
  return lines;
}

// Take the largest size from `sizes` at which the title fits `maxLines`, so a
// short headline reads big and a long one steps down rather than truncating.
export function fitLines(title, {
  widthOf = estimateWidth,
  sizes,
  maxWidth,
  maxLines,
  lineHeightRatio = 1.17,
} = {}) {
  for (const fontSize of sizes) {
    // Probe with room to spare so the line count is the real one, not a clamp.
    const lines = wrapToWidth(title, { widthOf, fontSize, maxWidth, maxLines: maxLines + 3 });
    if (lines.length <= maxLines) {
      return { fontSize, lines, lineHeight: Math.round(fontSize * lineHeightRatio) };
    }
  }
  const fontSize = sizes[sizes.length - 1];
  return {
    fontSize,
    lines: wrapToWidth(title, { widthOf, fontSize, maxWidth, maxLines }),
    lineHeight: Math.round(fontSize * lineHeightRatio),
  };
}
