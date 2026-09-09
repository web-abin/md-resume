import type { Settings } from './resume';

export async function loadResumeFont(settings: Settings, text: string) {
  const family = settings.template === 'serif' ? 'Noto Serif SC Variable' : 'Noto Sans SC Variable';
  const sample = [...new Set(text)].join('') || '中文简历 ABC 123';
  await Promise.all([400, 600, 650, 700].map(weight => document.fonts.load(`${weight} 16px "${family}"`, sample)));
  await document.fonts.ready;
  if (!document.fonts.check(`400 16px "${family}"`, sample)) throw new Error('中文字体加载失败，请刷新页面后重试。');
}

