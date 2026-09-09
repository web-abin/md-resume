import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '简历 · 用 Markdown 写好你的下一步',
  description: '专注内容，轻松排版。支持实时预览、模板切换与 PDF 导出的本地 Markdown 简历编辑器。',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
