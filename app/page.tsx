'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import DOMPurify from 'dompurify';
import { ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, FileText, HelpCircle, LayoutTemplate, PanelLeft, Pencil, Printer, Moon, Sun, Save, FolderOpen, Trash2, Maximize, Minimize, Undo2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULTS, MAX_LENGTH, SAMPLE, STORAGE_KEY, LIBRARY_KEY, readResumeLibrary, saveResumeVersion, updateResumeVersion, deleteResumeVersion, type SavedResume, documentName, normalizeSettings, renderMarkdown, type Settings } from '../lib/resume';
import { SANITIZE_CONFIG } from '../lib/sanitize';
import { measureResumePages, MM_TO_PX } from '../lib/measure-resume';
import { loadResumeFont } from '../lib/resume-fonts';
import { boldSelection, LOCAL_FONT_SIZES, recordEdit, undoEdit, sizeSelection, type EditorHistory } from '../lib/editor-state';

const templates = [
  { id: 'classic', name: '清简', desc: '通用 · 专业' },
  { id: 'modern', name: '秩序', desc: '产品 · 运营' },
  { id: 'serif', name: '书卷', desc: '教育 · 人文' },
  { id: 'technical', name: '工程', desc: '技术 · 高密度' },
  { id: 'timeline', name: '时轴', desc: '经历 · 强时序' },
] as const;
const subscribeToHydration = () => () => {};

const colors = ['#34746a', '#395a89', '#7b5274', '#a66d3c', '#343a40'];

export default function Home() {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  return <ResumeEditor key={hydrated ? 'client' : 'server'} ready={hydrated} />;
}

function ResumeEditor({ ready }: { ready: boolean }) {
  const [initial] = useState(() => {
    if (ready) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          if (typeof draft.markdown !== 'string' || draft.markdown.length > MAX_LENGTH) throw new Error('invalid draft');
          return { markdown: draft.markdown as string, settings: normalizeSettings(draft.settings), error: '' };
        }
      } catch { return { markdown: SAMPLE, settings: DEFAULTS, error: '无法读取本地草稿。请先导出备份，浏览器可能禁用了存储。' }; }
    }
    return { markdown: SAMPLE, settings: DEFAULTS, error: '' };
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (!ready) return 'light';
    try {
      const stored = localStorage.getItem('resume-ui-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* Theme still works when browser storage is unavailable. */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('resume-ui-theme', theme); } catch { /* Nonessential preference. */ }
  }, [theme, ready]);
  const [editState, setEditState] = useState<EditorHistory>(() => ({ present: { markdown: initial.markdown, settings: initial.settings, start: 0, end: 0 }, past: [], group: null, at: 0 }));
  const { markdown, settings } = editState.present;
  const selection = useRef({ start: 0, end: 0 });
  const composition = useRef<string | null>(null);
  const compositionId = useRef(0);
  const [savedDraft, setSavedDraft] = useState('');
  const [storageError, setStorageError] = useState(false);
  const draft = JSON.stringify({ version: 1, markdown, settings });
  const saved = !ready ? '正在读取' : storageError ? '保存失败，请导出备份' : savedDraft === draft ? '草稿已自动保存' : '草稿保存中…';
  const html = useMemo(() => ready ? DOMPurify.sanitize(renderMarkdown(markdown), SANITIZE_CONFIG) : '', [markdown, ready]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const previewPanel = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [pdfResult, setPdfResult] = useState<{ url: string; name: string } | null>(null);
  const resume = useRef<HTMLDivElement>(null);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState(initial.error);
  const [pageLayout, setPageLayout] = useState<{ signature: string; pages: Array<{ top: number; height: number }>; error: string }>({ signature: '', pages: [{ top: 0, height: 0 }], error: '' });
  const pageSignature = JSON.stringify({ html, settings });
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [canvasWidth, setCanvasWidth] = useState(600);
  const editor = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const libraryDialog = useRef<HTMLDialogElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [versions, setVersions] = useState<SavedResume[]>([]);
  const [libraryError, setLibraryError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);

  useEffect(() => {
    if (libraryOpen) libraryDialog.current?.showModal();
    else libraryDialog.current?.close();
  }, [libraryOpen]);

  useEffect(() => {
    if (!ready) return;
    const refresh = (event: StorageEvent) => {
      if (event.key !== LIBRARY_KEY && event.key !== null) return;
      try { setVersions(readResumeLibrary(localStorage)); setLibraryError(''); }
      catch { setLibraryError('无法读取已保存的简历，原有记录未被覆盖。请检查浏览器存储权限。'); }
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [ready]);

  function openLibrary() {
    try { setVersions(readResumeLibrary(localStorage)); setLibraryError(''); }
    catch { setLibraryError('无法读取已保存的简历，原有记录未被覆盖。请检查浏览器存储权限。'); }
    setDeleteId(null);
    setLibraryOpen(true);
  }

  function saveVersion() {
    if (!markdown.trim()) { setNotice('请先填写简历内容，再保存版本。'); return; }
    try {
      const currentEditingId = editingVersionId;
      setVersions(currentEditingId ? updateResumeVersion(localStorage, currentEditingId, markdown, settings) : saveResumeVersion(localStorage, markdown, settings));
      setEditingVersionId(null);
      setLibraryError('');
      setNotice(currentEditingId ? '已更新此版本，原记录已直接修改。' : '已保存一个新版本，内容和排版设置可在「我的简历」中查看。');
    } catch { setNotice('版本保存失败，已有版本未被覆盖。浏览器存储可能已满或不可用，请先导出备份。'); }
  }

  function restoreVersion(id: string) {
    try {
      const current = readResumeLibrary(localStorage);
      const entry = current.find(item => item.id === id);
      setVersions(current);
      if (!entry) { setLibraryError('此版本已被删除，请选择其他版本。'); return; }
      setEditingVersionId(null);
      changeEditor({ markdown: entry.markdown, settings: { ...entry.settings } }, { start: 0, end: 0 });
      setPdfResult(null);
      setLibraryOpen(false);
      setTab('edit');
      setNotice(`已恢复「${entry.name}」的内容和排版设置。`);
      requestAnimationFrame(() => { editor.current?.scrollTo({ top: 0 }); canvas.current?.scrollTo({ top: 0, left: 0 }); });
    } catch { setLibraryError('无法读取此版本，当前编辑内容未改变。请检查浏览器存储权限。'); }
  }

  function editVersion(id: string) {
    try {
      const current = readResumeLibrary(localStorage);
      const entry = current.find(item => item.id === id);
      setVersions(current);
      if (!entry) { setLibraryError('此版本已被删除，请选择其他版本。'); return; }
      setEditingVersionId(entry.id);
      changeEditor({ markdown: entry.markdown, settings: { ...entry.settings } }, { start: 0, end: 0 });
      setPdfResult(null);
      setLibraryOpen(false);
      setTab('edit');
      setNotice(`已载入「${entry.name}」，修改后点击右上角「保存」会更新原记录。`);
      requestAnimationFrame(() => { editor.current?.focus(); editor.current?.scrollTo({ top: 0 }); canvas.current?.scrollTo({ top: 0, left: 0 }); });
    } catch { setLibraryError('无法读取此版本，当前编辑内容未改变。请检查浏览器存储权限。'); }
  }

  function removeVersion(id: string) {
    try {
      setVersions(deleteResumeVersion(localStorage, id));
      if (editingVersionId === id) setEditingVersionId(null);
      setLibraryError('');
      setDeleteId(null);
      setNotice('已删除该版本，当前编辑内容保持不变。');
    } catch { setLibraryError('删除失败，已有版本未改变。请检查浏览器存储权限后重试。'); }
  }

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) setCanvasWidth(width);
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !resume.current) return;
    const source = resume.current;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const pages = measureResumePages(source, settings.margin);
      setPageLayout({ signature: pageSignature, pages: pages.length ? pages : [{ top: 0, height: 0 }], error: '' });
    };
    const timer = setTimeout(() => {
      void loadResumeFont(settings, source.textContent || '').then(measure).catch(() => {
        if (!cancelled) setPageLayout(current => ({ ...current, signature: pageSignature, error: '字体加载失败，请刷新后重试。' }));
      });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pageSignature, ready, settings]);

  useEffect(() => {
    if (help) dialog.current?.showModal();
    else dialog.current?.close();
  }, [help]);

  useEffect(() => {
    if (!ready) return;
    const save = () => {
      try { localStorage.setItem(STORAGE_KEY, draft); setSavedDraft(draft); setStorageError(false); }
      catch { setStorageError(true); }
    };
    const timer = setTimeout(save, 350);
    window.addEventListener('pagehide', save);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', save); };
  }, [draft, ready]);

  useEffect(() => {
    if (!notice || notice.startsWith('PDF 导出失败')) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function toggleFullscreen() {
    // A full-window view also works inside embedded browsers and on mobile.
    setFullPreview(current => !current);
  }

  useEffect(() => {
    if (!fullPreview || !previewPanel.current) return;
    const panel = previewPanel.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Keep background controls out of keyboard navigation in fallback mode too.
    const background: { element: HTMLElement; inert: boolean }[] = [];
    let active: HTMLElement = panel;
    while (active.parentElement && active.parentElement !== document.body) {
      for (const sibling of active.parentElement.children) {
        if (sibling !== active && sibling instanceof HTMLElement) {
          background.push({ element: sibling, inert: sibling.inert });
          sibling.setAttribute('inert', '');
        }
      }
      active = active.parentElement;
    }
    fullscreenButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFullPreview(false);
      }
      if (event.key === 'Tab') {
        const controls = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]),select,a[href],[tabindex="0"]')].filter(el => el.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = overflow;
      for (const { element, inert } of background) element.toggleAttribute('inert', inert);
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [fullPreview]);

  function changeEditor(patch: Partial<{ markdown: string; settings: Settings }>, after?: { start: number; end: number }, group: string | null = null, at = 0) {
    const before = { ...selection.current };
    const nextSelection = after || before;
    setEditState(current => recordEdit(current, { ...current.present, ...patch, ...nextSelection }, before, group, at));
    selection.current = nextSelection;
    setPdfResult(null);
  }

  function undo() {
    if (!editState.past.length) return;
    const next = undoEdit(editState);
    setEditState(next);
    selection.current = { start: next.present.start, end: next.present.end };
    composition.current = null;
    setPdfResult(null);
    setNotice(`已撤回一步，还可撤回 ${next.past.length} 步。`);
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(next.present.start, next.present.end); });
  }

  function applyBold() {
    const { start, end } = selection.current;
    const result = boldSelection(markdown, start, end);
    if (!result) { setNotice('请先在内容编辑区选中文字，再进行加粗。'); editor.current?.focus(); return; }
    if (result.markdown.length > MAX_LENGTH) { setNotice('添加加粗标记后内容超出长度限制，请先精简内容。'); return; }
    changeEditor({ markdown: result.markdown }, { start: result.start, end: result.end });
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(result.start, result.end); });
  }

  useEffect(() => {
    const onEditorShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing || composition.current) return;
      if (help || libraryOpen || fullPreview || !ready) return;
      const target = event.target;
      if (event.key.toLowerCase() === 'b' && target === editor.current) {
        event.preventDefault();
        applyBold();
        return;
      }
      if (event.key.toLowerCase() !== 'z') return;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      // Suppress native textarea history too, so both controls share the five-step limit.
      undo();
    };
    window.addEventListener('keydown', onEditorShortcut);
    return () => window.removeEventListener('keydown', onEditorShortcut);
  });

  function applyFontSize(size: number) {
    const { start, end } = selection.current;
    const result = sizeSelection(markdown, start, end, size);
    if (!result) { setNotice('请先在内容编辑区选中文字，再选择字号。'); editor.current?.focus(); return; }
    if (result.markdown.length > MAX_LENGTH) { setNotice('添加字号标记后内容超出长度限制，请先精简内容。'); return; }
    changeEditor({ markdown: result.markdown }, { start: result.start, end: result.end });
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(result.start, result.end); });
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K], at?: number) { changeEditor({ settings: { ...settings, [key]: value } }, undefined, at === undefined ? null : `setting-${key}`, at); }
  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${documentName(markdown)}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Markdown 已导出，可作为本地备份。');
  }
  async function importFile(file?: File) {
    if (!file || importing) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) { setNotice('请选择 .md、.markdown 或 .txt 文件。'); return; }
    if (file.size > 300_000) { setNotice('文件过大，请选择小于 300 KB 的文本文件。'); return; }
    setImporting(true);
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      if (text.length > MAX_LENGTH) { setNotice('内容过长，请控制在 10 万字以内。'); return; }
      if (text === markdown || window.confirm('导入将替换当前简历内容。未备份的内容会被覆盖，是否继续？')) {
        changeEditor({ markdown: text }, { start: 0, end: 0 });
        setTab('preview');
        setNotice(`已导入 ${file.name}，简历预览已更新。`);
        requestAnimationFrame(() => { editor.current?.scrollTo({ top: 0 }); canvas.current?.scrollTo({ top: 0, left: 0 }); });
      }
    } catch { setNotice('文件读取失败，请重试。'); }
    finally { setImporting(false); }
  }
  async function exportPdf() {
    if (exporting) return;
    if (!resume.current) { setNotice('预览尚未准备好，请稍后重试。'); return; }
    if (!markdown.trim()) { setNotice('请先填写简历内容。'); return; }
    setExporting(true);
    try {
      const { exportResumePdf } = await import('../lib/export-pdf');
      const url = await exportResumePdf(resume.current, settings, markdown, setExportStatus);
      const name = `${documentName(markdown)}.pdf`;
      setPdfResult({ url, name });
      const link = document.createElement('a');
      link.href = url; link.download = name;
      link.click();
      setNotice('文字 PDF 已导出：中文字体已嵌入，放大仍清晰，支持复制和搜索。');
    } catch (error) { console.error('PDF export failed', error); setNotice(error instanceof Error ? `PDF 导出失败：${error.message}` : 'PDF 导出失败，请重试。'); }
    finally { setExporting(false); setExportStatus(''); }
  }
  async function print() {
    try {
      await loadResumeFont(settings, resume.current?.textContent || markdown);
    } catch { setNotice('中文字体未加载完成，请刷新后重试。'); return; }
    const title = document.title;
    document.title = documentName(markdown);
    const restore = () => { document.title = title; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }
  const style = { '--accent': settings.color, '--resume-size': `${settings.fontSize}px`, '--resume-leading': settings.lineHeight, '--page-margin': `${settings.margin}mm` } as CSSProperties;

  return <main className="app" style={style}>
    <style>{`@page { size: A4; margin: ${settings.margin}mm; }`}</style>
    <header className="topbar">
      <div className="header-left"><div className="brand" aria-label="简历"><span className="brand-icon"><FileText size={21} strokeWidth={1.7} /></span><b>简历<span className="brand-dot">.</span></b><span className="brand-caption">让经历，自有章法</span></div><button className="button secondary library-toggle" disabled={!ready} aria-haspopup="dialog" aria-expanded={libraryOpen} aria-controls="resume-library" onClick={openLibrary}><FolderOpen size={16} />我的简历<ChevronDown size={13} /></button></div>
      <div className="top-actions"><button className="button theme-toggle" aria-label={theme === 'light' ? '切换暗色模式' : '切换亮色模式'} title={theme === 'light' ? '暗色模式' : '亮色模式'} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button><button className="button secondary save-version" disabled={!ready} onClick={saveVersion} title={editingVersionId ? '保存并更新当前版本' : '保存当前内容和排版为一个新版本'}><Save size={16} />{editingVersionId ? '更新版本' : '保存'}</button><button className="button secondary export-md" onClick={download}><ArrowDownToLine size={15} />导出 Markdown</button><button className="button secondary print-button" title="系统打印：可复制文字，分页以打印预览为准" aria-label="打印文字版" onClick={() => void print()}><Printer size={16} /></button><button className="button primary" disabled={!ready || exporting} onClick={() => void exportPdf()}><ArrowDownToLine size={16} />{exporting ? '正在导出…' : '导出 PDF'}</button></div>
    </header>

    <div className="mobile-tabs"><button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>编辑内容</button><button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>简历预览</button></div>

    <div className={`workspace mobile-${tab} ${settingsOpen ? 'settings-open' : 'settings-closed'}`}>
      <section className="editor-panel" aria-label="Markdown 编辑区">
        <div className="panel-heading"><div><PanelLeft size={16} /><b>内容编辑</b><span className="tag">Markdown</span></div><div className="editor-header-actions"><button className="import-button editor-help" aria-label="Markdown 语法指南" title="Markdown 语法指南" onClick={() => setHelp(true)}><HelpCircle size={14} /><span className="guide-label"><span className="guide-prefix">Markdown </span>语法指南</span></button><button className="import-button" disabled={!ready || importing} onClick={() => upload.current?.click()}><ArrowUpFromLine size={14} />{importing ? '正在导入…' : '导入 Markdown'}</button></div></div>
        <input ref={upload} aria-label="选择 Markdown 文件" hidden type="file" accept=".md,.markdown,.txt" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="editor-toolbar">
          <button className="undo-button" aria-label="撤回上一步" title={`撤回（⌘Z / Ctrl+Z），还可撤回 ${editState.past.length} 步`} disabled={!ready || !editState.past.length} onMouseDown={e => e.preventDefault()} onClick={undo}><Undo2 size={15} /><span>撤回</span><small>{editState.past.length}/5</small></button>
          <span className="toolbar-separator" />
          <button title="插入二级标题" onMouseDown={e => e.preventDefault()} onClick={() => insert('## 新的章节\n')}>H₂</button><button title="加粗选中文字（⌘B / Ctrl+B）" onMouseDown={e => e.preventDefault()} onClick={applyBold}>B</button><button title="插入列表" onMouseDown={e => e.preventDefault()} onClick={() => insert('- 描述你的经历与成果\n')}>≡</button>
          <label className="selection-size-control" title="先选中文字，再设置局部字号"><select aria-label="选中文字字号" value="" disabled={!ready} onChange={e => applyFontSize(Number(e.target.value))}><option value="" disabled>字号</option>{LOCAL_FONT_SIZES.map(size => <option key={size} value={size}>{size}px</option>)}</select><ChevronDown size={12} /></label>
        </div>
        <textarea ref={editor} aria-label="简历 Markdown 内容" spellCheck={false} value={markdown} disabled={!ready} maxLength={MAX_LENGTH}
          onSelect={e => { selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
          onBeforeInput={e => { selection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
          onCompositionStart={() => { composition.current = `composition-${++compositionId.current}`; }}
          onCompositionEnd={() => { composition.current = null; }}
          onChange={e => {
            const inputType = (e.nativeEvent as InputEvent).inputType;
            const group = composition.current || (inputType === 'insertText' || inputType === 'deleteContentBackward' || inputType === 'deleteContentForward' ? `typing-${inputType}` : null);
            changeEditor({ markdown: e.target.value }, { start: e.target.selectionStart, end: e.target.selectionEnd }, group, e.timeStamp);
          }} />
        <div className="editor-footer"><span className={`draft-status ${storageError ? 'error' : ''}`} title={`${markdown.length.toLocaleString()} 字符 · UTF-8 · ${saved}`} aria-live="polite">{markdown.length.toLocaleString()} 字符 · {saved}</span><button className="text-button" onClick={() => { if (window.confirm('恢复示例会覆盖当前内容和排版设置，是否继续？')) { changeEditor({ markdown: SAMPLE, settings: DEFAULTS }, { start: 0, end: 0 }); } }}><RotateCcw size={12} />恢复示例</button></div>
      </section>

      <section ref={previewPanel} className={`preview-panel ${fullPreview ? 'is-fullscreen' : ''}`} role={fullPreview ? 'dialog' : undefined} aria-modal={fullPreview || undefined} aria-label={fullPreview ? '全屏简历预览' : '简历预览'}>
        <div className="panel-heading"><div><FileText size={16} /><b>实时预览</b><span className="live-dot" /></div><div className="preview-controls"><span>A4</span><label className="zoom-control"><select aria-label="预览缩放" value={zoom} onChange={e => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}><option value="fit">适应宽度</option><option value={50}>50%</option><option value={65}>65%</option><option value={75}>75%</option><option value={90}>90%</option><option value={100}>100%</option></select><ChevronDown size={12} /></label><button hidden={fullPreview} className="settings-toggle" aria-expanded={settingsOpen} aria-controls="layout-settings" onClick={() => setSettingsOpen(open => !open)}><SlidersHorizontal size={14} />排版设置</button><button ref={fullscreenButton} className="settings-toggle fullscreen-toggle" aria-label={fullPreview ? '退出全屏' : '全屏预览'} title={fullPreview ? '退出全屏（Esc）' : '全屏预览'} onClick={() => void toggleFullscreen()}>{fullPreview ? <Minimize size={14} /> : <Maximize size={14} />}<span>{fullPreview ? '退出全屏' : '全屏预览'}</span></button></div></div>
        <div className={`resume-measure template-${settings.template}`} aria-hidden="true" inert><div ref={resume} className="resume-content" dangerouslySetInnerHTML={{ __html: html }} /></div>
        <div ref={canvas} className="preview-canvas" tabIndex={0} role="region" aria-label="简历预览滚动区域" aria-busy={pageLayout.signature !== pageSignature}>
          <div className="paper-scale paper-stack" style={{ zoom: zoom === 'fit' ? Math.min(1, Math.max(.2, canvasWidth / (210 * MM_TO_PX))) : zoom / 100 }}>
            {pageLayout.pages.map((page, index) => <div className="preview-page" key={index}>
              <article className={`resume-paper paged-paper template-${settings.template}`} aria-label={`第 ${index + 1} 页，共 ${pageLayout.pages.length} 页`}>
                <div className="page-content-window" style={{ height: `${page.height}px` }}>
                  <div className="resume-content" style={{ transform: `translateY(-${page.top}px)` }} dangerouslySetInnerHTML={{ __html: html }} />
                </div>
                {!markdown.trim() && <p className="empty-paper">在左侧写下你的第一段经历。</p>}
              </article>
              <div className="preview-page-number" aria-hidden="true">{index + 1} / {pageLayout.pages.length}</div>
            </div>)}
          </div>
        </div>
        <div className="preview-footer"><span role="status">{pageLayout.error || (pageLayout.signature !== pageSignature ? '正在计算分页…' : `A4 · 共 ${pageLayout.pages.length} 页`)}</span></div>
      </section>

      <aside id="layout-settings" className="settings-panel" aria-label="排版设置" hidden={!settingsOpen}>
        <div className="settings-title"><span><SlidersHorizontal size={16} /><b>排版设置</b></span><button className="text-button reset-layout" title="恢复推荐颜色、15px 字号、1.6 倍行距和 17mm 页边距，保留当前模板及内容" onClick={() => {
          changeEditor({ settings: { ...settings, color: DEFAULTS.color, fontSize: DEFAULTS.fontSize, lineHeight: DEFAULTS.lineHeight, margin: DEFAULTS.margin } });
          setNotice('已恢复推荐排版：松石绿 · 15 px · 1.6 倍行距 · 17 mm 页边距。模板和内容保持不变。');
        }}><RotateCcw size={12} />恢复推荐</button></div>
        <div className="section-label"><LayoutTemplate size={14} />选择模板</div>
        <div className="template-list">{templates.map(t => <button key={t.id} className={`template-option ${settings.template === t.id ? 'selected' : ''}`} onClick={() => update('template', t.id)} aria-pressed={settings.template === t.id}><span className={`template-mini mini-${t.id}`}><i /><i /><i /><i /></span><span><b>{t.name}</b><small>{t.desc}</small></span>{settings.template === t.id && <span className="selected-check"><Check size={12} /></span>}</button>)}</div>
        <div className="settings-divider" /><label className="section-label">主题颜色</label><div className="swatches">{colors.map((color, i) => <button key={color} style={{ background: color }} className={settings.color === color ? 'chosen' : ''} aria-label={['松石绿', '海军蓝', '烟紫色', '焦糖色', '石墨灰'][i]} aria-pressed={settings.color === color} onClick={() => update('color', color)}>{settings.color === color && <Check size={13} />}</button>)}</div>
        <div className="settings-divider" />
        <label className="slider-label" htmlFor="size">正文字号<span>{settings.fontSize} px</span></label><input id="size" type="range" min="11" max="16" step="0.5" value={settings.fontSize} onInput={e => update('fontSize', Number(e.currentTarget.value), e.timeStamp)} />
        <label className="slider-label" htmlFor="leading">行间距<span>{settings.lineHeight.toFixed(1)}</span></label><input id="leading" type="range" min="1.3" max="2" step="0.1" value={settings.lineHeight} onInput={e => update('lineHeight', Number(e.currentTarget.value), e.timeStamp)} />
        <label className="slider-label" htmlFor="margin">页边距<span>{settings.margin} mm</span></label><input id="margin" type="range" min="10" max="25" value={settings.margin} onInput={e => update('margin', Number(e.currentTarget.value), e.timeStamp)} />
        <div className="privacy-note"><span>只属于你的草稿</span><p>内容自动保存在此浏览器，不会上传服务器。记得定期导出备份。</p></div>
        <p className="print-tip">「导出 PDF」生成清晰的文字 PDF，中文字体随文件嵌入，支持复制和搜索。暗色模式不会改变简历纸张和导出颜色。</p>
      </aside>
    </div>
    <footer className="app-footer"><span>专注表达，排版交给我们。</span><span>MARKDOWN → YOUR FUTURE</span></footer>
    {pdfResult && !exporting && <div className="pdf-download-ready" role="status"><span>PDF 已生成</span><a href={pdfResult.url} download={pdfResult.name}>下载 PDF</a><button onClick={() => setPdfResult(null)} aria-label="关闭 PDF 下载提示"><X size={14} /></button></div>}
    {exporting && <div className="export-progress" role="status">{exportStatus || '正在准备导出…'}</div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="关闭提示"><X size={14} /></button></div>}
    <dialog id="resume-library" ref={libraryDialog} className="modal-dialog library-dialog" aria-labelledby="library-title" onCancel={() => setLibraryOpen(false)} onClick={e => { if (e.target === e.currentTarget) setLibraryOpen(false); }}>
      <section className="library-sheet">
        <div className="library-heading"><h2 id="library-title">我的简历</h2><button onClick={() => setLibraryOpen(false)} aria-label="关闭我的简历"><X size={21} /></button></div>
        <p className="library-description">{versions.length} 个已保存版本。点击简历可恢复内容和排版；点击「编辑」后保存会直接更新原记录，不会新增版本。</p>
        {libraryError ? <div className="library-empty" role="alert"><p>{libraryError}</p><button className="button secondary" onClick={openLibrary}>重新读取</button></div> : versions.length === 0 ? <div className="library-empty"><FolderOpen size={34} /><h3>还没有保存的简历</h3><p>关闭窗口后，点击右上角「保存」，<br />就能留下当前简历和排版的完整版本。</p></div> : <ul className="library-list" aria-label="已保存的简历版本">{versions.map(entry => <li key={entry.id} className="saved-resume">
          <button className="saved-resume-main" aria-label={`恢复 ${entry.name}，保存于 ${new Date(entry.savedAt).toLocaleString('zh-CN', { hour12: false })}`} onClick={() => restoreVersion(entry.id)}><FileText size={20} /><span><span className="saved-resume-title-row"><strong>{entry.name}</strong><time dateTime={entry.savedAt}>{new Date(entry.savedAt).toLocaleString('zh-CN', { hour12: false })}</time></span><span className="saved-resume-meta"><i style={{ background: entry.settings.color }} />{templates.find(t => t.id === entry.settings.template)?.name} · {entry.settings.fontSize} px · {entry.settings.lineHeight.toFixed(1)} 倍行距 · {entry.settings.margin} mm 页边距</span></span></button>
          <div className="saved-resume-actions">{deleteId === entry.id ? <><span>确定删除此版本？无法撤销。</span><div><button className="text-button" onClick={() => setDeleteId(null)}>取消</button><button className="delete-version" onClick={() => removeVersion(entry.id)}>确认删除</button></div></> : <><span>{entry.markdown.length.toLocaleString()} 字符 · 点击上方恢复</span><div><button className="edit-version" aria-label={`编辑 ${entry.name}`} onClick={() => editVersion(entry.id)}><Pencil size={13} />编辑</button><button className="delete-version" aria-label={`删除 ${entry.name}`} onClick={() => setDeleteId(entry.id)}><Trash2 size={13} />删除</button></div></>}</div>
        </li>)}</ul>}
        <p className="library-footnote">直接点击「保存」会新增版本；从「编辑」进入后保存会更新原版本。仅保存在当前浏览器；清理浏览器数据会丢失记录，请定期导出备份。</p>
      </section>
    </dialog>
    <dialog ref={dialog} className="modal-dialog" onCancel={() => setHelp(false)} onClick={e => { if (e.target === e.currentTarget) setHelp(false); }}><section role="dialog" aria-modal="true" aria-labelledby="help-title" className="help-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setHelp(false)} aria-label="关闭语法指南"><X size={20} /></button><span className="eyebrow">A LITTLE GUIDE</span><h2 id="help-title">几行文字，一份好简历。</h2><p>用简单的符号告诉我们，你希望怎样呈现。</p><dl><dt>姓名与求职方向</dt><dd><code># 林晓 · 产品设计师</code></dd><dt>章节标题</dt><dd><code>## 工作经历</code></dd><dt>公司与日期左右对齐</dt><dd><code>### 公司 · 职位 || 2023 — 至今</code></dd><dt>公司、职责与日期三段对齐</dt><dd><code>### 某科技公司 || AI 应用开发 || 2023 — 至今</code></dd><dt>突出成果</dt><dd><code>- **核心成果**：描述你带来的改变</code></dd><dt>局部字号（11–24px，以及 26–38px 双数）</dt><dd>选中文字后使用工具栏「字号」；会生成受限的 span 标记，并随 Markdown 保存。</dd><dt>撤回操作</dt><dd>⌘Z / Ctrl+Z 或点击「撤回」，最多五步，刷新后记录清空。</dd><dt>添加链接</dt><dd><code>[作品集](https://example.com)</code></dd></dl><p className="help-footnote">支持标准 Markdown 列表、引用与表格。MVP 暂不支持照片、自定义 HTML 样式或手动分页。示例中的姓名与经历均为虚构。</p><button className="button primary" onClick={() => setHelp(false)}>开始写作</button></section></dialog>
  </main>;

  function insert(text: string) {
    const el = editor.current;
    if (!el || !ready) return;
    const { start, end } = selection.current;
    if (start !== end) {
      const selected = markdown.slice(start, end);
      text = text.startsWith('**') ? `**${selected}**` : selected.split('\n').map(line => (text.startsWith('##') ? '## ' : '- ') + line).join('\n');
    }
    const next = markdown.slice(0, start) + text + markdown.slice(end);
    if (next.length > MAX_LENGTH) return;
    changeEditor({ markdown: next }, { start, end: start + text.length });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start, start + text.length); });
  }
}
