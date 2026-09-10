import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { DEFAULTS, SAMPLE, documentName, normalizeSettings, renderMarkdown } from './lib/resume.ts';
import { SANITIZE_CONFIG } from './lib/sanitize.ts';

const window = new JSDOM('').window;
const purifier = createDOMPurify(window);
const parse = text => new JSDOM(purifier.sanitize(renderMarkdown(text), SANITIZE_CONFIG)).window.document;

test('sample has a name, four sections, and work achievements', () => {
  const doc = parse(SAMPLE);
  assert.equal(doc.querySelector('h1').textContent, '林晓 · 产品设计师');
  assert.equal(doc.querySelectorAll('h2').length, 4);
  assert.ok(doc.querySelectorAll('li').length >= 10);
});

test('two- and three-column resume rows retain inline Markdown and semantic fields', () => {
  const doc = parse('### **某公司** || 2024 — 至今\n\n### 数据平台 || 核心开发 || 2023 — 2024\n\n设计师 || 上海');
  assert.equal(doc.querySelectorAll('.resume-row').length, 3);
  assert.equal(doc.querySelector('h3 strong').textContent, '某公司');
  assert.equal(doc.querySelector('h3 .row-right').textContent, '2024 — 至今');
  const triple = doc.querySelector('.resume-row-3');
  assert.equal(triple.querySelector('.row-main').textContent, '数据平台');
  assert.equal(triple.querySelector('.row-role').textContent, '核心开发');
  assert.equal(triple.querySelector('.row-right').textContent, '2023 — 2024');
});

test('ordinary Markdown tables, links, emphasis and lists retain semantics', () => {
  const doc = parse('| 技能 | 水平 |\n| --- | --- |\n| TypeScript | 熟悉 |\n\n- **设计**\n- [作品集](https://example.com)');
  assert.equal(doc.querySelector('td').textContent, 'TypeScript');
  assert.equal(doc.querySelector('a').getAttribute('href'), 'https://example.com');
  assert.equal(doc.querySelectorAll('li').length, 2);
});

test('imported scripts, event handlers, embeds and tracking images are removed', () => {
  const doc = parse('<script>alert(1)</script>\n\n<img src="https://tracker.test/secret" onerror="alert(1)"><iframe src="https://evil.test"></iframe><p style="color:red" onclick="alert(1)">安全正文</p>');
  assert.equal(doc.querySelectorAll('script,img,iframe,[onclick],[onerror],[style]').length, 0);
  assert.ok(doc.body.textContent.includes('安全正文'));
});

test('JavaScript and data URLs cannot become executable resume links', () => {
  const doc = parse('<a href="javascript:alert(1)">危险链接</a> <a href="data:text/html,boom">危险内容</a> <a href="mailto:a@example.com">邮件</a>');
  const links = [...doc.querySelectorAll('a')];
  assert.equal(links[0].hasAttribute('href'), false);
  assert.equal(links[1].hasAttribute('href'), false);
  assert.equal(links[2].getAttribute('href'), 'mailto:a@example.com');
});

test('untrusted saved settings cannot inject CSS or produce invalid page sizes', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULTS);
  const settings = normalizeSettings({ template: '<script>', color: 'red; } body{display:none}', fontSize: Infinity, margin: -999, lineHeight: 900 });
  assert.equal(settings.template, 'classic');
  assert.equal(settings.color, DEFAULTS.color);
  assert.equal(settings.fontSize, DEFAULTS.fontSize);
  assert.equal(settings.margin, 10);
  assert.equal(settings.lineHeight, 2);
});

test('all five resume templates survive settings normalization', () => {
  for (const template of ['classic', 'modern', 'serif', 'technical', 'timeline']) {
    assert.equal(normalizeSettings({ template }).template, template);
  }
});

test('filenames handle empty resumes and remove filesystem separators', () => {
  assert.equal(documentName(''), '我的简历');
  assert.equal(documentName('# A/B:设计师?'), 'AB设计师');
  assert.ok(documentName('# ' + '长'.repeat(200)).length <= 70);
});

test('empty Markdown stays empty and rows with too many separators remain plain text', () => {
  assert.equal(parse('').body.textContent, '');
  const doc = parse('### 公司 || 职责 || 日期 || 地点');
  assert.equal(doc.querySelectorAll('.resume-row').length, 0);
  assert.equal(doc.querySelector('h3').textContent, '公司 || 职责 || 日期 || 地点');
});


// PDF paging must cover all content without cutting through protected text lines.
import { meaningfulContentHeight, paginate } from './lib/pagination.ts';

test('PDF paging drops trailing whitespace that would create an empty last page', () => {
  const bands = [{ top: 180, bottom: 198, kind: 'line' }];
  const totalHeight = meaningfulContentHeight(205, bands);
  assert.equal(totalHeight, 198);
  assert.deepEqual(paginate(totalHeight, 100, bands), [{ top: 0, height: 100 }, { top: 100, height: 98 }]);
});

test('PDF paging keeps a last page when even one text line reaches it', () => {
  const bands = [{ top: 199, bottom: 203, kind: 'line' }];
  const totalHeight = meaningfulContentHeight(205, bands);
  assert.equal(totalHeight, 203);
  assert.equal(paginate(totalHeight, 100, bands).length, 3);
});

test('PDF paging moves a boundary above a text line and keeps every pixel covered', () => {
  const pages = paginate(250, 100, [{ top: 90, bottom: 112 }]);
  assert.deepEqual(pages, [{ top: 0, height: 90 }, { top: 90, height: 100 }, { top: 190, height: 60 }]);
  assert.equal(pages.reduce((sum, page) => sum + page.height, 0), 250);
});

test('PDF paging keeps headings with the following first line', () => {
  const pages = paginate(180, 100, [{ top: 75, bottom: 92 }, { top: 75, bottom: 119 }]);
  assert.equal(pages[0].height, 75);
  assert.equal(pages[1].top, 75);
});

test('list pagination fills the current page without cascading into earlier guards', () => {
  const pages = paginate(260, 100, [
    { top: 92, bottom: 106, kind: 'line' },
    { top: 68, bottom: 108, kind: 'item' },
    { top: 24, bottom: 72, kind: 'heading' },
  ]);
  assert.equal(pages[0].height, 68);
  assert.equal(pages[1].top, 68);
});

test('oversize PDF blocks cannot trap pagination in a loop', () => {
  assert.deepEqual(paginate(250, 100, [{ top: 0, bottom: 250 }]), [{ top: 0, height: 100 }, { top: 100, height: 100 }, { top: 200, height: 50 }]);
  assert.deepEqual(paginate(0, 100, []), []);
  assert.throws(() => paginate(100, 0, []));
});

import { LIBRARY_KEY, STORAGE_KEY, readResumeLibrary, saveResumeVersion, updateResumeVersion, deleteResumeVersion } from './lib/resume.ts';
const memoryStorage = () => {
  const records = new Map();
  return { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
};

test('manual versions survive storage reload with exact Markdown and all layout settings', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, 'working draft');
  const original = { template: 'serif', color: '#395a89', fontSize: 15.5, lineHeight: 1.9, margin: 23 };
  const expected = { ...original };
  const content = '# 同名简历\n\n**中文** & <text>\n';
  const first = saveResumeVersion(storage, content, original)[0];
  original.color = '#34746a';
  const next = saveResumeVersion(storage, '# 同名简历\n第二版', DEFAULTS);
  assert.notEqual(next[0].id, first.id);
  const reloaded = readResumeLibrary(storage);
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded[1].markdown, content);
  assert.deepEqual(reloaded[1].settings, expected);
  assert.equal(reloaded[0].markdown, '# 同名简历\n第二版');
  assert.equal(storage.getItem(STORAGE_KEY), 'working draft');
  const updated = updateResumeVersion(storage, reloaded[1].id, '# 更新后的简历\n内容', { ...expected, template: 'technical' });
  assert.equal(updated.length, 2);
  assert.equal(updated[1].id, reloaded[1].id);
  assert.equal(updated[1].name, '更新后的简历');
  assert.equal(updated[1].savedAt, reloaded[1].savedAt);
  assert.equal(updated[1].settings.template, 'technical');
  assert.throws(() => updateResumeVersion(storage, 'missing', '# 不存在', DEFAULTS));
  const remaining = deleteResumeVersion(storage, updated[0].id);
  assert.deepEqual(remaining, [updated[1]]);
  assert.deepEqual(readResumeLibrary(storage), remaining);
  assert.equal(storage.getItem(STORAGE_KEY), 'working draft');
});

test('storage corruption, quota failure and empty saves do not overwrite saved versions', () => {
  const storage = memoryStorage();
  saveResumeVersion(storage, '# 简历', DEFAULTS);
  const before = storage.getItem(LIBRARY_KEY);
  const fullStorage = { getItem: storage.getItem, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.throws(() => saveResumeVersion(fullStorage, '# 第二版', DEFAULTS));
  assert.throws(() => deleteResumeVersion(fullStorage, readResumeLibrary(storage)[0].id));
  assert.throws(() => saveResumeVersion(storage, '   ', DEFAULTS));
  assert.equal(storage.getItem(LIBRARY_KEY), before);
  for (const corrupt of ['broken JSON', '{"version":2,"resumes":[]}', '{"version":1,"resumes":[null]}']) {
    storage.setItem(LIBRARY_KEY, corrupt);
    assert.throws(() => saveResumeVersion(storage, '# 不应覆盖', DEFAULTS));
    assert.throws(() => deleteResumeVersion(storage, 'missing'));
    assert.equal(storage.getItem(LIBRARY_KEY), corrupt);
  }
});

import { boldSelection, recordEdit, undoEdit, sizeSelection } from './lib/editor-state.ts';
import { pdfFontStyleForCanvasFont } from './lib/pdf-font.ts';
const historyFor = markdown => ({ present: { markdown, settings: { ...DEFAULTS }, start: 0, end: 0 }, past: [], group: null, at: 0 });
test('undo retains exactly five operations and restores content with layout together', () => {
  let state = historyFor('original');
  for (let i = 1; i <= 7; i++) state = recordEdit(state, { markdown: `version${i}`, settings: { ...DEFAULTS, margin: 10+i }, start: i, end: i }, { start: i-1, end: i-1 }, null, i);
  assert.equal(state.past.length, 5);
  for (let i = 6; i >= 2; i--) { state = undoEdit(state); assert.equal(state.present.markdown, `version${i}`); assert.equal(state.present.settings.margin, 10+i); }
  assert.equal(undoEdit(state), state);
  assert.equal(state.past.length, 0);
});
test('continuous typing merges but formatting and typing after undo create separate steps', () => {
  let state = historyFor('');
  state = recordEdit(state, { ...state.present, markdown: 'a', start: 1, end: 1 }, { start: 0, end: 0 }, 'typing-insertText', 1000);
  state = recordEdit(state, { ...state.present, markdown: 'ab', start: 2, end: 2 }, { start: 1, end: 1 }, 'typing-insertText', 1200);
  assert.equal(state.past.length, 1);
  const styled = sizeSelection('ab', 0, 2, 24);
  state = recordEdit(state, { ...state.present, ...styled }, { start: 0, end: 2 }, null, 1300);
  assert.equal(state.past.length, 2);
  state = undoEdit(state);
  assert.equal(state.present.markdown, 'ab');
  assert.deepEqual([state.present.start, state.present.end], [0,2]);
  state = undoEdit(state);
  assert.equal(state.present.markdown, '');
});
test('local font size preserves Markdown headings, emphasis, lists and portable classes', () => {
  const input = '# 标题\n\n- **重点内容**\n- 普通内容';
  const output = sizeSelection(input, 0, input.length, 38);
  const doc = parse(output.markdown);
  assert.equal(doc.querySelector('h1 .resume-size-38').textContent, '标题');
  assert.equal(doc.querySelector('li strong').textContent, '重点内容');
  assert.equal(doc.querySelectorAll('li').length, 2);
  assert.equal(doc.querySelectorAll('[style]').length, 0);
  assert.equal(documentName(output.markdown), '标题');
  const second = sizeSelection(output.markdown, output.start, output.end, 11);
  assert.equal(parse(second.markdown).querySelectorAll('.resume-size-38').length, 0);
  assert.equal(parse(second.markdown).querySelectorAll('.resume-size-11').length, 3);
  for (const value of [10,25,27,31,37,39,13.5,NaN]) assert.equal(sizeSelection('test',0,4,value),null);
  assert.equal(sizeSelection('test',1,1,16),null);
});

test('bold formatting wraps the selection and toggles the generated markers', () => {
  const applied = boldSelection('高级工程师', 0, 4);
  assert.deepEqual(applied, { markdown: '**高级工程**师', start: 0, end: 8 });
  assert.deepEqual(boldSelection(applied.markdown, applied.start, applied.end), { markdown: '高级工程师', start: 0, end: 4 });
  assert.equal(boldSelection('文本', 1, 1), null);
});

test('PDF export keeps the embedded Chinese font selected for canvas text runs', () => {
  const family = 'Noto Sans SC Variable';
  assert.equal(pdfFontStyleForCanvasFont(`normal normal 400 15px ${family}, sans-serif`, family), 'normal');
  assert.equal(pdfFontStyleForCanvasFont(`normal normal 650 18px ${family}, sans-serif`, family), 'bold');
  assert.equal(pdfFontStyleForCanvasFont(`normal normal bold 30px ${family}, sans-serif`, family), 'bold');
  assert.equal(pdfFontStyleForCanvasFont('normal normal 400 12px monospace', family), null);
});
