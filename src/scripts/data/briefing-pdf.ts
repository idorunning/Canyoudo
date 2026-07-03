// "Download PDF" for a force briefing — a real, designed A4 document built
// client-side with jsPDF (dynamically imported, so it never weighs down the
// page bundle), following the same conventions as the research review's PDF
// (pdf-report.ts): the site's branding, drawn text only (no HTML path),
// a genuinely drawn table for "What's moving" with a weight-not-traffic-light
// chip per Reading label, honest provenance and the figure-check note, page
// footers with numbers.

import { BRIEFING_HEADINGS, TREND_LABELS } from '../../lib/dashboard-prompts';

const SITE_NAME = 'THINKING ABOUT POLICING';
const SITE_URL = 'thinkingaboutpolicing.org';

const ACCENT: [number, number, number] = [13, 148, 136];
const ACCENT_DARK: [number, number, number] = [15, 118, 110];
const ACCENT_WASH: [number, number, number] = [237, 247, 245];
const INK: [number, number, number] = [23, 25, 29];
const GREY: [number, number, number] = [85, 96, 107];
const HAIRLINE: [number, number, number] = [201, 206, 212];
const PAPER_200: [number, number, number] = [233, 236, 239];
const PAPER_100: [number, number, number] = [244, 245, 247];

// Reading chip fills — visual weight, not a red/amber/green traffic light,
// matching the site-wide convention.
const READING_FILL: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
  Rising: { bg: ACCENT, text: [255, 255, 255] },
  Falling: { bg: ACCENT_WASH, text: ACCENT_DARK },
  Steady: { bg: PAPER_200, text: [57, 66, 76] },
  'Too early to say': { bg: PAPER_100, text: GREY },
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const TOP = 16;
const BOTTOM = 20;
const W = PAGE_W - 2 * MARGIN;
const PT_TO_MM = 0.3528;
const lineHeight = (pt: number, factor = 1.4) => pt * PT_TO_MM * factor;

type Doc = any;

class Writer {
  y = TOP;
  constructor(private doc: Doc) {}
  ensure(h: number) {
    if (this.y + h > PAGE_H - BOTTOM) {
      this.doc.addPage();
      this.y = TOP;
    }
  }
  gap(h: number) {
    this.y += h;
  }
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

const stripInline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

interface Section {
  heading: string;
  body: string;
}

/** Split the briefing markdown into its ### sections, in document order. */
export function parseBriefingSections(markdown: string): Section[] {
  const out: Section[] = [];
  const parts = markdown.split(/^###\s+/m).filter((p) => p.trim());
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = nl === -1 ? '' : part.slice(nl + 1).trim();
    out.push({ heading, body });
  }
  return out;
}

/** Pull the pipe-table rows out of a section body: [Category, Last 12, vs prev, Reading]. */
export function parseTable(body: string): { rows: string[][]; rest: string[] } {
  const rows: string[][] = [];
  const rest: string[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) {
      if (/^\|[\s:|-]+\|$/.test(t)) continue; // separator
      const cells = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => stripInline(c.trim()));
      if (cells.length >= 2 && !/^Category$/i.test(cells[0])) rows.push(cells);
    } else if (t) {
      rest.push(t);
    }
  }
  return { rows, rest };
}

export interface BriefingPdfInput {
  markdown: string;
  confidence: string;
  forceName: string;
  dataMonth: string;
  model: string;
  figureNote: string;
}

export async function buildBriefingPdf(input: BriefingPdfInput): Promise<Doc> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = new Writer(doc);

  // Masthead
  w.text(SITE_NAME, 8.5, 'bold', ACCENT_DARK, { factor: 1.1 });
  w.rule(ACCENT, 0.8);
  w.gap(4);
  w.text('FORCE BRIEFING', 9, 'bold', GREY, { factor: 1.1 });
  w.gap(1);
  w.text(input.forceName, 19, 'bold', INK, { factor: 1.15 });
  w.gap(1.5);
  const meta = [
    input.dataMonth ? `Data to ${input.dataMonth}` : '',
    input.confidence ? `Data completeness: ${input.confidence}` : '',
    `Written by ${input.model}`,
    'Source: data.police.uk (OGL v3.0)',
  ]
    .filter(Boolean)
    .join('   ·   ');
  w.text(meta, 8.5, 'normal', GREY, { factor: 1.2 });
  w.gap(4);

  const sections = parseBriefingSections(input.markdown);
  for (const section of sections) {
    if (!(BRIEFING_HEADINGS as readonly string[]).includes(section.heading) && !section.body) continue;
    w.ensure(14);
    w.gap(3);
    w.text(section.heading, 12.5, 'bold', INK, { factor: 1.2 });
    w.rule(ACCENT, 0.5, 24);
    w.gap(1.5);

    const isTableSection = section.heading === BRIEFING_HEADINGS[1]; // "What's moving"
    const { rows, rest } = isTableSection ? parseTable(section.body) : { rows: [], rest: [] };
    const bodyText = isTableSection ? rest.join('\n') : section.body;

    for (const block of bodyText.split(/\n{2,}/)) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (/^[-*]\s+/.test(line)) {
          const item = stripInline(line.replace(/^[-*]\s+/, ''));
          w.text(`•  ${item}`, 9.5, 'normal', INK, { x: MARGIN + 2, width: W - 4, factor: 1.35 });
          w.gap(0.8);
        } else {
          w.text(stripInline(line), 9.5, 'normal', INK, { factor: 1.4 });
          w.gap(1.2);
        }
      }
    }

    if (rows.length) {
      w.gap(2);
      // Column layout in mm: Category | Last 12 | vs prev | Reading
      const cols = [64, 30, 28, 40];
      const colX = [MARGIN, MARGIN + cols[0], MARGIN + cols[0] + cols[1], MARGIN + cols[0] + cols[1] + cols[2]];
      const headers = ['Category', 'Last 12 months', 'vs previous 12', 'Reading'];
      w.ensure(8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...GREY);
      headers.forEach((h, i) => doc.text(h, colX[i], w.y + 3));
      w.gap(4.2);
      w.rule(HAIRLINE, 0.4);
      for (const row of rows) {
        const [category = '', last = '', prev = '', reading = ''] = row;
        const catLines: string[] = doc.splitTextToSize(category, cols[0] - 3);
        const rowH = Math.max(catLines.length * lineHeight(9, 1.25), 7);
        w.ensure(rowH + 2);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        catLines.forEach((l, li) => doc.text(l, colX[0], w.y + 3.2 + li * lineHeight(9, 1.25)));
        doc.text(last, colX[1], w.y + 3.2);
        doc.text(prev, colX[2], w.y + 3.2);
        // Reading chip
        const fill = READING_FILL[reading] ?? READING_FILL['Too early to say'];
        doc.setFontSize(7.5);
        const chipW = doc.getTextWidth(reading) + 5;
        doc.setFillColor(...fill.bg);
        doc.roundedRect(colX[3], w.y + 0.4, Math.min(chipW, cols[3] - 2), 4.6, 2.3, 2.3, 'F');
        doc.setTextColor(...fill.text);
        doc.text(reading, colX[3] + 2.5, w.y + 3.6);
        w.gap(rowH + 1);
        w.rule(HAIRLINE, 0.2);
      }
      w.gap(2);
    }
  }

  // Closing notes
  w.gap(4);
  w.rule(HAIRLINE, 0.4);
  w.gap(1.5);
  w.text(input.figureNote, 8, 'italic', GREY, { factor: 1.3 });
  w.gap(1);
  w.text(
    'AI-generated from aggregate open data, not reviewed by a human editor. Recorded figures describe recording, not the underlying reality; verify against data.police.uk before acting on this briefing.',
    8,
    'italic',
    GREY,
    { factor: 1.3 }
  );

  // Footers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(SITE_URL, MARGIN, PAGE_H - 10);
    doc.text(`${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
  }
  return doc;
}

export async function downloadBriefingPdf(input: BriefingPdfInput): Promise<void> {
  const doc = await buildBriefingPdf(input);
  const slug = input.forceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'england-and-wales';
  doc.save(`force-briefing-${slug}.pdf`);
}
