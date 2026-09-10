export type PdfFontStyle = 'normal' | 'bold';

export function pdfFontStyleForCanvasFont(font: string, family: string): PdfFontStyle | null {
  if (!font.toLocaleLowerCase().includes(family.toLocaleLowerCase())) return null;
  const weight = font.match(/(?:^|\s)(bold|[1-9]\d{2})(?=\s)/i)?.[1];
  return weight?.toLowerCase() === 'bold' || Number(weight) >= 600 ? 'bold' : 'normal';
}
