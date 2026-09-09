import { documentName, type Settings } from './resume';
import { measureResumePages, MM_TO_PX } from './measure-resume';
import { loadResumeFont } from './resume-fonts';


export async function exportResumePdf(source: HTMLElement, settings: Settings, markdown: string, progress: (message: string) => void) {
  const content = source.cloneNode(true) as HTMLElement;
  progress('正在加载中文字体…');
  await loadResumeFont(settings, content.textContent || markdown);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const width = (210 - settings.margin * 2) * MM_TO_PX;
  const stage = document.createElement('div');
  stage.className = 'pdf-export-stage';
  stage.setAttribute('aria-hidden', 'true');
  Object.assign(stage.style, { position: 'fixed', left: '-20000px', top: '0', width: `${width}px`, background: '#fff', pointerEvents: 'none', overflow: 'hidden' });
  stage.style.setProperty('--accent', settings.color);
  stage.style.setProperty('--resume-size', `${settings.fontSize}px`);
  stage.style.setProperty('--resume-leading', String(settings.lineHeight));
  const sheet = document.createElement('article');
  sheet.className = `resume-paper template-${settings.template}`;
  Object.assign(sheet.style, { width: `${width}px`, minHeight: '0', padding: '0', margin: '0', border: '0', boxShadow: 'none', overflow: 'visible' });
  sheet.appendChild(content);
  stage.appendChild(sheet);
  document.body.appendChild(stage);
  try {
    const pages = measureResumePages(content, settings.margin);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    pdf.setProperties({ title: documentName(markdown), subject: '简历 · 清晰文字 PDF', creator: 'Markdown Resume' });
    const family = settings.template === 'serif' ? 'Noto Serif SC Variable' : 'Noto Sans SC Variable';
    const prefix = settings.template === 'serif' ? 'noto-serif-sc' : 'noto-sans-sc';
    const fontBuffers = await Promise.all([400, 700].map(async weight => {
      const response = await fetch(`/fonts/pdf/${prefix}-${weight}.ttf`);
      if (!response.ok) throw new Error('中文字体文件读取失败，请刷新后重试。');
      return { weight, buffer: new Uint8Array(await response.arrayBuffer()) };
    }));
    for (const { weight, buffer } of fontBuffers) {
      let binary = '';
      for (let offset = 0; offset < buffer.length; offset += 32768) binary += String.fromCharCode(...buffer.subarray(offset, offset + 32768));
      const filename = `${prefix}-${weight}.ttf`;
      pdf.addFileToVFS(filename, btoa(binary));
      pdf.addFont(filename, family, weight === 700 ? 'bold' : 'normal');
    }
    // Use jsPDF's vector Canvas2D adapter, not a bitmap canvas. Chinese glyphs
    // are embedded as subset fonts; CSS paths and text remain resolution-independent.
    pdf.context2d.autoPaging = false;
    pdf.context2d.posX = 0;
    pdf.context2d.posY = 0;
    // PDF clipping hides drawings but does not remove hidden text from search/copy.
    // Filter text runs outside the current page so each paragraph is embedded once.
    const vectorContext = pdf.context2d as typeof pdf.context2d & {
      ctx: { transform: { applyToPoint(point: { x: number; y: number }): { x: number; y: number } } };
    };
    const fillText = vectorContext.fillText.bind(vectorContext);
    const strokeText = vectorContext.strokeText.bind(vectorContext);
    let textPageBottom = 297 - settings.margin;
    const isOnPage = (x: number, y: number) => {
      const point = vectorContext.ctx.transform.applyToPoint({ x, y });
      return point.y >= settings.margin - .5 && point.y <= textPageBottom + .5;
    };
    vectorContext.fillText = (text, x, y, maxWidth) => {
      if (isOnPage(x, y)) fillText(text, x, y, maxWidth);
    };
    vectorContext.strokeText = (text, x, y, maxWidth) => {
      if (isOnPage(x, y)) strokeText(text, x, y, maxWidth);
    };
    for (let i = 0; i < pages.length; i++) {
      progress(`正在生成文字 PDF（${i + 1}/${pages.length}）…`);
      const page = pages[i];
      textPageBottom = settings.margin + page.height / MM_TO_PX;
      if (i > 0) pdf.addPage();
      stage.style.height = `${page.height}px`;
      sheet.style.transform = `translateY(-${page.top}px)`;
      pdf.context2d.save();
      pdf.context2d.translate(settings.margin, settings.margin);
      await html2canvas(stage, {
        canvas: pdf.canvas as unknown as HTMLCanvasElement,
        backgroundColor: '#ffffff', scale: 1 / MM_TO_PX, logging: false,
        width, height: page.height, windowWidth: 1440,
        onclone(clonedDocument) {
          const clone = clonedDocument.querySelector<HTMLElement>('.pdf-export-stage');
          if (clone) clone.style.left = '0';
        },
      });
      pdf.context2d.restore();
    }
    return pdf.output('datauristring');
  } finally { stage.remove(); }
}
