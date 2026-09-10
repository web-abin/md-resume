import { meaningfulContentHeight, paginate, type ProtectedBand } from './pagination';

export const MM_TO_PX = 96 / 25.4;
export function measureResumePages(content: HTMLElement, margin: number) {
    const pageHeight = (297 - margin * 2) * MM_TO_PX;
    // Measure at full A4 content width, independent of preview zoom and hidden panels.
    const origin = content.getBoundingClientRect().top;
    const bands: ProtectedBand[] = [];
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let textNode: Node | null;
    while ((textNode = walker.nextNode())) {
      if (!textNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      for (const rect of range.getClientRects()) {
        if (rect.height) bands.push({ top: Math.max(0, rect.top - origin - 2), bottom: rect.bottom - origin + 2, kind: 'line' });
      }
    }
    for (const block of content.querySelectorAll('li,tr,blockquote,h1,h2,h3,h4,h5,h6')) {
      const rect = block.getBoundingClientRect();
      let bottom = rect.bottom - origin + 2;
      if (/^H[1-6]$/.test(block.tagName)) {
        // Keep the heading with at least the first line of its following content.
        const nextLine = bands.filter(b => b.kind === 'line' && b.top >= rect.bottom - origin).sort((a, b) => a.top - b.top)[0];
        if (nextLine) bottom = nextLine.bottom;
      }
      if (bottom - (rect.top - origin) < pageHeight * .6) {
        const kind = /^H[1-6]$/.test(block.tagName) ? 'heading' : block.tagName === 'LI' ? 'item' : block.tagName === 'TR' ? 'row' : 'blockquote';
        bands.push({ top: Math.max(0, rect.top - origin - 2), bottom, kind });
      }
    }
    const measuredHeight = Math.ceil(content.getBoundingClientRect().height + 2);
    // Bottom margins and fractional layout rounding can cross an A4 boundary
    // even when no glyph does. Paginate through the last real text line only.
    const totalHeight = meaningfulContentHeight(measuredHeight, bands);
    return paginate(totalHeight, pageHeight, bands);
}
