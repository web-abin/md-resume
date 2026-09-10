export type ProtectedBand = {
  top: number;
  bottom: number;
  kind?: 'line' | 'item' | 'heading' | 'row' | 'blockquote';
};

/** Ignore trailing layout whitespace after the final rendered text line. */
export function meaningfulContentHeight(measuredHeight: number, bands: ProtectedBand[]) {
  if (!Number.isFinite(measuredHeight) || measuredHeight < 0) throw new Error('Invalid content height');
  const textBottom = bands.reduce((bottom, band) => band.kind === 'line' ? Math.max(bottom, band.bottom) : bottom, 0);
  return textBottom > 0 ? Math.min(measuredHeight, Math.ceil(textBottom)) : 0;
}

/** Keep text lines and short semantic blocks away from page boundaries. */
export function paginate(totalHeight: number, pageHeight: number, bands: ProtectedBand[]) {
  if (!Number.isFinite(totalHeight) || !Number.isFinite(pageHeight) || totalHeight < 0 || pageHeight <= 0) throw new Error('Invalid page dimensions');
  const pages: Array<{ top: number; height: number }> = [];
  let top = 0;
  while (top < totalHeight) {
    let bottom = Math.min(top + pageHeight, totalHeight);
    if (bottom < totalHeight) {
      const crossing = bands.filter(b => b.top < bottom && b.bottom > bottom && b.top > top + 1 && b.bottom - b.top < pageHeight);
      if (crossing.length) {
        // Resolve only the bands crossed by the natural page boundary. Recursively
        // rechecking the adjusted boundary can walk backwards through overlapping
        // list items and heading guards, leaving most of a page blank.
        const headings = crossing.filter(b => b.kind === 'heading');
        const semantic = crossing.filter(b => b.kind && b.kind !== 'line');
        const candidates = headings.length ? headings : semantic.length ? semantic : crossing;
        // The latest starting candidate wastes the least space. A heading guard is
        // selected above when the boundary lands between it and its first line.
        bottom = Math.max(...candidates.map(b => b.top));
      }
    }
    if (bottom <= top) bottom = Math.min(top + pageHeight, totalHeight);
    pages.push({ top, height: bottom - top });
    top = bottom;
  }
  return pages;
}
