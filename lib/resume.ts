import { Marked } from 'marked';

export const SAMPLE = `# 林晓 · 产品设计师
上海 ｜ 138 0000 0000 ｜ linxiao@example.com

专注于将复杂问题转化为清晰、友好的产品体验。3 年 B 端与消费产品设计经验，擅长从用户研究到设计落地的完整流程。

## 工作经历
### 远山科技 || 产品设计师 || 2023.07 — 至今
- **主导工作台改版**：梳理 12 个核心使用场景，重构信息架构，使关键任务完成时间缩短 28%。
- **搭建设计系统**：沉淀 40+ 个基础组件及交互规范，覆盖 Web 与移动端，提升团队协作效率。
- 与产品、研发紧密合作，完成需求分析、交互原型、视觉设计与上线验收。

### 星野工作室 || 设计实习生 || 2022.06 — 2023.06
- 参与生活方式类 App 的体验设计，独立完成搜索与收藏模块的交互方案。
- 开展 15 场用户访谈，将反馈整理为可执行的产品优化建议。

## 项目经历
### 让数据更易读 · 经营分析平台 || 核心设计负责人 || 2024.03 — 2024.08
- 面向中小企业经营者，设计从数据概览到异常归因的完整分析路径。
- 统一图表、筛选器与指标卡片规范，交付 30+ 页面，并协同研发完成上线。
- 上线后核心功能使用率提升 22%（示例数据，请替换为真实成果）。

## 教育经历
### 江南大学 · 视觉传达设计 / 本科 || 2019.09 — 2023.06
专业成绩前 10%，获得校级优秀毕业设计。主修交互设计、信息可视化与设计研究。

## 专业技能
- **设计能力：** 用户研究、交互设计、视觉设计、设计系统、可用性测试
- **常用工具：** Figma、Sketch、Adobe Illustrator、基础 HTML / CSS
- **语言能力：** 英语 CET-6，可阅读英文文档并进行日常沟通
`;

export type ResumeTemplate = 'classic' | 'modern' | 'serif' | 'technical' | 'timeline';
export type Settings = { template: ResumeTemplate; color: string; fontSize: number; lineHeight: number; margin: number };
export const DEFAULTS: Settings = { template: 'classic', color: '#34746a', fontSize: 15, lineHeight: 1.6, margin: 17 };
export const STORAGE_KEY = 'jianli-markdown-v1';
export const MAX_LENGTH = 100_000;
const bounded = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function normalizeSettings(value: unknown): Settings {
  const s = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    template: s.template === 'modern' || s.template === 'serif' || s.template === 'technical' || s.template === 'timeline' ? s.template : 'classic',
    color: typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : DEFAULTS.color,
    fontSize: bounded(s.fontSize, 11, 16, DEFAULTS.fontSize),
    lineHeight: bounded(s.lineHeight, 1.3, 2, DEFAULTS.lineHeight),
    margin: bounded(s.margin, 10, 25, DEFAULTS.margin),
  };
}
export function documentName(markdown: string) {
  return (markdown.match(/^#\s+(.+)$/m)?.[1] || '我的简历').replace(/<\/?span\b[^>]*>/gi, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 70) || '我的简历';
}

const parser = new Marked({ gfm: true, breaks: true });
function resumeRow(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p', html: string) {
  const parts = html.split(' || ');
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !part.trim())) return `<${tag}>${html}</${tag}>`;
  const middle = parts.length === 3 ? `<span class="row-role">${parts[1]}</span>` : '';
  const right = parts.at(-1);
  return `<${tag} class="resume-row resume-row-${parts.length}"><span class="row-main">${parts[0]}</span>${middle}<span class="row-right">${right}</span></${tag}>`;
}
parser.use({ renderer: {
  heading({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    return resumeRow(`h${depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', html);
  },
  paragraph({ tokens }) {
    const html = this.parser.parseInline(tokens);
    return resumeRow('p', html);
  },
} });
// Sanitize this HTML with DOMPurify before inserting it in the document.
export function renderMarkdown(markdown: string): string {
  return parser.parse(markdown.slice(0, MAX_LENGTH), { async: false }) as string;
}

// Manual versions are separate from the automatically saved working draft.
export const LIBRARY_KEY = 'jianli-library-v1';
export type SavedResume = { id: string; name: string; savedAt: string; markdown: string; settings: Settings };
type ResumeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readResumeLibrary(storage: ResumeStorage): SavedResume[] {
  const raw = storage.getItem(LIBRARY_KEY);
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !Array.isArray(data.resumes)) throw new Error('简历列表格式异常');
  const ids = new Set<string>();
  return data.resumes.map((item: unknown) => {
    const entry = item as Partial<SavedResume> | null;
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
      || typeof entry.name !== 'string' || typeof entry.savedAt !== 'string' || !Number.isFinite(Date.parse(entry.savedAt))
      || typeof entry.markdown !== 'string' || entry.markdown.length > MAX_LENGTH) throw new Error('简历记录格式异常');
    ids.add(entry.id);
    return { id: entry.id, name: entry.name.slice(0, 70), savedAt: entry.savedAt, markdown: entry.markdown, settings: normalizeSettings(entry.settings) };
  });
}

export function saveResumeVersion(storage: ResumeStorage, markdown: string, settings: Settings): SavedResume[] {
  if (!markdown.trim() || markdown.length > MAX_LENGTH) throw new Error('请先填写有效的简历内容');
  // Read immediately before writing, so versions saved in other tabs are retained.
  // Invalid data or quota failures throw without replacing existing versions.
  const current = readResumeLibrary(storage);
  const entry: SavedResume = { id: crypto.randomUUID(), name: documentName(markdown), savedAt: new Date().toISOString(), markdown, settings: normalizeSettings(settings) };
  const next = [entry, ...current];
  storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, resumes: next }));
  return next;
}

export function deleteResumeVersion(storage: ResumeStorage, id: string): SavedResume[] {
  const next = readResumeLibrary(storage).filter(entry => entry.id !== id);
  storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, resumes: next }));
  return next;
}
