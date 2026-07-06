// "Download PDF" for a research review — a real, designed PDF report built
// client-side with jsPDF (dynamically imported, so it never weighs down the
// page bundle). Not a print of the website: a standalone briefing document a
// reader can file, forward round a force, or bring to a meeting.
//
// Design follows the research/policy briefing genre (see
// docs/research-assistant-v4.md for the sourced rationale): A4, built to
// print to about two pages, the site's branding, the question as the title,
// a short "The problem" lead, the evidence-rating table (drawn as a real
// table — this IS the reference list; there's no separate references
// section), three boxed "what to do" tiers side by side, then a short rules-
// and-policy checklist and a closing note. Page footers with numbers.
//
// Safety is the same discipline as the page: everything is drawn as TEXT from
// the validated ReviewResult (jsPDF has no HTML path here), and only http(s)
// URLs become link annotations (safeHttpUrl).

import { CONFIDENCE_LABELS } from './citation-render';
import { safeHttpUrl } from './cards';
import {
  parseSections,
  stripInline,
  looksLikeTable,
  tableRow,
  tableStudyNumbers,
  ACTION_TIERS,
  type ReviewResult,
} from './review';

const SITE_NAME = 'THINKING ABOUT POLICING';
const SITE_URL = 'thinkingaboutpolicing.org';

// The site accent (--accent in global.css, light theme) and inks — print is
// always light.
const ACCENT: [number, number, number] = [13, 148, 136];
const ACCENT_DARK: [number, number, number] = [15, 118, 110];
const ACCENT_WASH: [number, number, number] = [237, 247, 245]; // ~6% accent over white
const INK: [number, number, number] = [23, 25, 29];
const GREY: [number, number, number] = [85, 96, 107];
const HAIRLINE: [number, number, number] = [201, 206, 212];
const PAPER_200: [number, number, number] = [233, 236, 239];
const PAPER_100: [number, number, number] = [244, 245, 247];

// Effectiveness badge fill/text per label — weight, not a red/amber/green
// traffic light (a stoplight implies more precision than a plain-English
// reading of an abstract can bear); mirrors review.ts's web styling.
const EFFECTIVENESS_FILL: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
  'Well-established': { bg: ACCENT, text: [255, 255, 255] },
  Promising: { bg: ACCENT_WASH, text: ACCENT_DARK },
  'Mixed evidence': { bg: PAPER_200, text: [57, 66, 76] },
  'Early or limited evidence': { bg: PAPER_100, text: GREY },
};
const EFFECTIVENESS_DEFAULT = { bg: PAPER_100, text: GREY };

// A4 in mm.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const TOP = 16;
const BOTTOM = 20; // footer zone
const W = PAGE_W - 2 * MARGIN;

const PT_TO_MM = 0.3528;
const lineHeight = (pt: number, factor = 1.4) => pt * PT_TO_MM * factor;

type Doc = any; // jsPDF instance — imported dynamically, typed loosely

/** Cursor-based writer: tracks y, breaks pages, keeps margins honest. */
class Writer {
  y = TOP;
  constructor(private doc: Doc) {}

  /** Make room for `h` mm, breaking to a new page when it won't fit. */
  ensure(h: number) {
    if (this.y + h > PAGE_H - BOTTOM) {
      this.doc.addPage();
      this.y = TOP;
    }
  }

  gap(h: number) {
    this.y += h;
  }

  /** A wrapped block of text at the cursor. Returns nothing; advances y. */
  text(
    str: string,
    pt: number,
    style: 'normal' | 'bold' | 'italic' = 'normal',
    colour: [number, number, number] = INK,
    opts: { x?: number; width?: number; factor?: number } = {}
  ) {
    const { x = MARGIN, width = W, factor = 1.4 } = opts;
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(pt);
    this.doc.setTextColor(...colour);
    const lh = lineHeight(pt, factor);
    const lines: string[] = this.doc.splitTextToSize(str, width);
    for (const line of lines) {
      this.ensure(lh);
      this.doc.text(line, x, this.y + lh * 0.75);
      this.y += lh;
    }
  }

  rule(colour: [number, number, number], thickness: number, width = W) {
    this.ensure(thickness + 1);
    this.doc.setDrawColor(...colour);
    this.doc.setLineWidth(thickness);
    this.doc.line(MARGIN, this.y, MARGIN + width, this.y);
    this.y += thickness + 1;
  }
}

/** Markdown section body → paragraph/bullet blocks (plain text, [n] kept).
 *  Blocks may MIX bullets and prose (a list closed by a plain sentence is
 *  common), so group consecutive runs rather than judging all-or-nothing. */
function blocksOf(body: string): { list: boolean; lines: string[] }[] {
  const out: { list: boolean; lines: string[] }[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let items: string[] = [];
    const flushPara = () => {
      if (para.length) out.push({ list: false, lines: [stripInline(para.join(' '))] });
      para = [];
    };
    const flushItems = () => {
      if (items.length) out.push({ list: true, lines: items });
      items = [];
    };
    for (const l of lines) {
      if (/^([-*]|\d+\.)\s+/.test(l)) {
        flushPara();
        items.push(stripInline(l.replace(/^([-*]|\d+\.)\s+/, '')));
      } else {
        flushItems();
        para.push(l);
      }
    }
    flushPara();
    flushItems();
  }
  return out;
}

/** Strip `[n]`/`[n][m]` citation markers from a line — the PDF has no
 *  reference list to link to (the table above is it), so citation markers
 *  would be dangling noise; the table itself carries the sourcing. Tidies the
 *  holes stripped markers leave behind ("word  ." → "word."), the same
 *  cleanup sanitizeCitations does for the web view (citations.mjs). */
function stripCitations(s: string): string {
  return s
    .replace(/\[\d{1,3}\]/g, '')
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function drawBlocks(w: Writer, doc: Doc, blocks: { list: boolean; lines: string[] }[], pt = 9.5) {
  for (const block of blocks) {
    if (block.list) {
      for (const item of block.lines) {
        const lh = lineHeight(pt);
        w.ensure(lh);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(pt);
        doc.setTextColor(...ACCENT);
        doc.text('•', MARGIN + 1.5, w.y + lh * 0.75);
        w.text(stripCitations(item), pt, 'normal', INK, { x: MARGIN + 6, width: W - 6 });
        w.gap(0.75);
      }
      w.gap(1.5);
    } else {
      w.text(stripCitations(block.lines[0]), pt);
      w.gap(2);
    }
  }
}

// ---- the evidence-rating table ---------------------------------------------

// Column widths (mm), summing to W. Key finding gets the most room; it's the
// substantive content. Recomputed if MARGIN/W ever changes.
const COL = { n: 9, study: 30, finding: 0, effect: 30 };
COL.finding = W - COL.n - COL.study - COL.effect;
const CELL_PAD = 1.8;

/** The evidence-rating table: # / Study / Key finding / Effectiveness. This
 *  IS the document's reference list — each Study cell links out to the real
 *  source URL. Breaks across pages if needed, repeating the header row. */
function drawTable(w: Writer, doc: Doc, header: string[], rows: string[][], references: ReviewResult['references']) {
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase().includes(name));
  const nCol = idx('#');
  const studyCol = idx('stud');
  const findingCol = idx('finding');
  const effCol = idx('effective');
  if (nCol === -1 || studyCol === -1 || findingCol === -1) return; // unrecognised shape — skip rather than guess

  const HEAD_PT = 7.5;
  const BODY_PT = 8.7;
  const headH = lineHeight(HEAD_PT) + CELL_PAD * 2;

  const drawHeader = () => {
    doc.setFillColor(...PAPER_200);
    doc.rect(MARGIN, w.y, W, headH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(HEAD_PT);
    doc.setTextColor(...GREY);
    const ty = w.y + headH / 2 + lineHeight(HEAD_PT) * 0.28;
    let x = MARGIN + CELL_PAD;
    for (const [label, width] of [['#', COL.n], ['STUDY', COL.study], ['KEY FINDING', COL.finding], ['EFFECTIVENESS', COL.effect]] as const) {
      doc.text(label, x, ty);
      x += width;
    }
    w.y += headH;
  };

  w.ensure(headH * 2); // header + at least one row before breaking
  drawHeader();

  for (const row of rows) {
    const n = Number((row[nCol] ?? '').replace(/[^\d]/g, ''));
    if (!Number.isInteger(n) || n < 1) continue;
    const work = references[n - 1];
    const studyText = row[studyCol] ?? '';
    // The model writes the whole cell on one raw-markdown line, using literal
    // `<br>` tags where the paragraph breaks into bullets — turn those into
    // real newlines so splitTextToSize wraps each piece on its own line(s).
    const findingText = stripCitations(row[findingCol] ?? '').replace(/<br\s*\/?>/gi, '\n');
    const effText = (effCol >= 0 ? row[effCol] : '')?.trim();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(BODY_PT);
    const studyLines: string[] = doc.splitTextToSize(studyText, COL.study - 2 * CELL_PAD);
    const findingLines: string[] = doc.splitTextToSize(findingText, COL.finding - 2 * CELL_PAD);
    const lh = lineHeight(BODY_PT);
    const rowH = Math.max(studyLines.length, findingLines.length, 1) * lh + 2 * CELL_PAD;

    if (w.y + rowH > PAGE_H - BOTTOM) {
      doc.addPage();
      w.y = TOP;
      drawHeader();
    }

    const rowTop = w.y;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, rowTop + rowH, MARGIN + W, rowTop + rowH);

    let x = MARGIN + CELL_PAD;
    // # — grey, matches the citation-marker style used in the prose.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(BODY_PT);
    doc.setTextColor(...GREY);
    doc.text(`[${n}]`, x, rowTop + CELL_PAD + lh * 0.75);
    x = MARGIN + CELL_PAD + COL.n;

    // Study — a real link when the source has a safe URL.
    const url = work ? safeHttpUrl(work.doi) || safeHttpUrl(work.oaUrl) || safeHttpUrl(work.pdfUrl) : null;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(url ? ACCENT[0] : INK[0], url ? ACCENT[1] : INK[1], url ? ACCENT[2] : INK[2]);
    studyLines.forEach((line, i) => {
      const ly = rowTop + CELL_PAD + lh * (i + 0.75);
      if (url) doc.textWithLink(line, x, ly, { url });
      else doc.text(line, x, ly);
    });
    x += COL.study;

    // Key finding
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    findingLines.forEach((line: string, i: number) => doc.text(line, x, rowTop + CELL_PAD + lh * (i + 0.75)));
    x += COL.finding;

    // Effectiveness — a filled chip, same visual weight logic as the web page.
    if (effText) {
      const style = EFFECTIVENESS_FILL[effText] ?? EFFECTIVENESS_DEFAULT;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      const chipLines: string[] = doc.splitTextToSize(effText, COL.effect - 2 * CELL_PAD - 2);
      const chipH = chipLines.length * lineHeight(7.3) + 2;
      doc.setFillColor(...style.bg);
      doc.roundedRect(x, rowTop + CELL_PAD - 0.5, COL.effect - CELL_PAD - 1, Math.min(chipH, rowH - CELL_PAD), 1, 1, 'F');
      doc.setTextColor(...style.text);
      chipLines.forEach((line: string, i: number) =>
        doc.text(line, x + 1.3, rowTop + CELL_PAD + lineHeight(7.3) * (i + 0.75))
      );
    }

    w.y = rowTop + rowH;
  }
  w.gap(3);
}

// ---- the three action tiers, side by side ----------------------------------

const TIER_GAP = 3;
const TIER_W = (W - 2 * TIER_GAP) / 3;
const TIER_STYLE: Record<string, { border: [number, number, number]; bg: [number, number, number] }> = {
  'Quick wins': { border: ACCENT, bg: ACCENT_WASH },
  'Medium term': { border: [148, 158, 168], bg: PAPER_100 },
  'Long term — higher effort': { border: HAIRLINE, bg: [255, 255, 255] },
};

/** Measure one tier box's content height at TIER_W, without drawing. */
function measureTier(doc: Doc, body: string): number {
  const PAD = 3.5;
  const headPt = 7.3;
  const bodyPt = 8.3;
  let h = PAD * 2 + lineHeight(headPt) + 1;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyPt);
  for (const block of blocksOf(body)) {
    for (const item of block.list ? block.lines : [block.lines[0]]) {
      const lines: string[] = doc.splitTextToSize(stripCitations(item), TIER_W - 2 * PAD - 3);
      h += lines.length * lineHeight(bodyPt) + 0.8;
    }
    h += 1;
  }
  return h;
}

/** Draw the (up to 3) present tiers as boxes side by side, all sharing the
 *  tallest box's height so the row lines up. Breaks as one unit — a tier
 *  box is never split across a page. */
function drawTierRow(w: Writer, doc: Doc, tiers: { heading: string; body: string }[]) {
  if (!tiers.length) return;
  const heights = tiers.map((t) => measureTier(doc, t.body));
  const rowH = Math.max(...heights);
  w.ensure(rowH + 4);
  const top = w.y;

  tiers.forEach((tier, i) => {
    const style = TIER_STYLE[tier.heading] ?? { border: HAIRLINE, bg: PAPER_100 };
    const x = MARGIN + i * (TIER_W + TIER_GAP);
    const PAD = 3.5;
    doc.setFillColor(...style.bg);
    doc.rect(x, top, TIER_W, rowH, 'F');
    doc.setFillColor(...style.border);
    doc.rect(x, top, 1.3, rowH, 'F');

    let y = top + PAD;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...INK);
    doc.text(tier.heading.toUpperCase(), x + PAD, y + lineHeight(7.3) * 0.75);
    y += lineHeight(7.3) + 1;

    const bodyPt = 8.3;
    const lh = lineHeight(bodyPt);
    for (const block of blocksOf(tier.body)) {
      const items = block.list ? block.lines : [block.lines[0]];
      for (const item of items) {
        const lines: string[] = doc.splitTextToSize(stripCitations(item), TIER_W - 2 * PAD - 3);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(bodyPt);
        doc.setTextColor(...ACCENT);
        doc.text('•', x + PAD, y + lh * 0.75);
        doc.setTextColor(...INK);
        lines.forEach((line: string, li: number) => doc.text(line, x + PAD + 3, y + lh * (li + 0.75)));
        y += lines.length * lh + 0.8;
      }
      y += 1;
    }
  });

  w.y = top + rowH + 5;
}

/** Every page gets the footer: hairline, site, page X of Y. */
function drawFooters(doc: Doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const y = PAGE_H - 11;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, MARGIN + W, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...GREY);
    doc.text(`${SITE_URL} — Research briefing`, MARGIN, y + 4.2);
    doc.text(`Page ${i} of ${pages}`, MARGIN + W, y + 4.2, { align: 'right' });
  }
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'research-briefing';

/**
 * Build the review as a jsPDF document (separated from the download so the
 * layout is testable headlessly). Dynamic-import jsPDF so the ~350KB library
 * loads only when someone actually clicks Download.
 */
export async function buildReviewPdf(result: ReviewResult): Promise<Doc> {
  const { jsPDF } = await import('jspdf');
  const doc: Doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = new Writer(doc);

  doc.setProperties({
    title: `Research briefing — ${result.problem.slice(0, 120)}`,
    subject: 'A short evidence briefing from the open research record',
    author: 'Thinking About Policing',
    creator: SITE_URL,
  });

  // ---- brand header ------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...ACCENT);
  doc.text(SITE_NAME, MARGIN, w.y + 3.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`RESEARCH BRIEFING · ${dateLabel.toUpperCase()}`, MARGIN + W, w.y + 3.5, { align: 'right' });
  w.gap(6);
  w.rule(ACCENT, 1);
  w.gap(5);

  // ---- title + meta -------------------------------------------------------
  w.text(result.problem, 17, 'bold', INK, { factor: 1.18 });
  w.gap(2);
  const tableNums = tableStudyNumbers(result.briefing);
  const studyCount = tableNums.size || result.references.length;
  const metaBits = [
    CONFIDENCE_LABELS[result.confidence] ?? CONFIDENCE_LABELS.mixed,
    `${studyCount} studies reviewed`,
    result.model ? `report produced by an AI model (${result.model})` : null,
  ].filter(Boolean);
  w.text(metaBits.join('   ·   ').toUpperCase(), 7.5, 'normal', GREY);
  w.gap(4);

  // ---- sections: table + tiers rendered specially, everything else as prose
  const sections = parseSections(result.briefing);
  const tierHeadings = new Set(ACTION_TIERS.map((t) => t.heading));
  let pendingTiers: { heading: string; body: string }[] = [];
  const flushTiers = () => {
    if (pendingTiers.length) drawTierRow(w, doc, pendingTiers);
    pendingTiers = [];
  };

  for (const sec of sections) {
    if (sec.heading && tierHeadings.has(sec.heading)) {
      pendingTiers.push({ heading: sec.heading, body: sec.body });
      continue;
    }
    flushTiers();

    if (sec.heading) {
      w.ensure(lineHeight(11.5) + 12);
      w.gap(2.5);
      w.text(sec.heading, 11.5, 'bold', INK, { factor: 1.2 });
      const y = w.y + 0.5;
      doc.setDrawColor(...ACCENT);
      doc.setLineWidth(0.6);
      doc.line(MARGIN, y, MARGIN + 10, y);
      w.gap(3.5);
    }

    // A section body may be "short prose, then a table" (What the evidence
    // says) — render each block on its own terms rather than assuming one
    // shape for the whole section.
    for (const block of sec.body.split(/\n{2,}/)) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (looksLikeTable(lines)) {
        drawTable(w, doc, tableRow(lines[0]), lines.slice(2).map(tableRow), result.references);
      } else {
        drawBlocks(w, doc, blocksOf(block));
      }
    }
    w.gap(1.5);
  }
  flushTiers();

  // ---- closing note + footers ----------------------------------------------
  w.gap(3);
  if (result.caveat) {
    w.text(result.caveat, 8, 'italic', GREY);
    w.gap(1.5);
  }
  w.text(
    `Generated by the research assistant at ${SITE_URL}. Guidance with sources, not a verdict, and not legal advice. Weigh the study, not the summary.`,
    7.5,
    'normal',
    GREY
  );

  drawFooters(doc);
  return doc;
}

/** Build and download the review as a real PDF file. */
export async function downloadReviewPdf(result: ReviewResult): Promise<void> {
  const doc = await buildReviewPdf(result);
  doc.save(`research-briefing-${slug(result.problem)}.pdf`);
}
