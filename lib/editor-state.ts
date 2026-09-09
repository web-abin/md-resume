import type { Settings } from './resume';

export type EditorSnapshot = { markdown: string; settings: Settings; start: number; end: number };
export type EditorHistory = { present: EditorSnapshot; past: EditorSnapshot[]; group: string | null; at: number };
export function recordEdit(state: EditorHistory, next: EditorSnapshot, before: { start: number; end: number }, group: string | null, at: number): EditorHistory {
  if (state.present.markdown === next.markdown && JSON.stringify(state.present.settings) === JSON.stringify(next.settings)) return state;
  const sameSelection = before.start === state.present.start && before.end === state.present.end;
  const continuous = group !== null && state.group === group
    && (group.startsWith('composition-') || at - state.at < 800)
    && (group.startsWith('setting-') || sameSelection);
  return {
    present: next,
    past: continuous ? state.past : [...state.past, { ...state.present, ...before }].slice(-5),
    group, at,
  };
}
export function undoEdit(state: EditorHistory): EditorHistory {
  if (!state.past.length) return state;
  return { present: state.past[state.past.length - 1], past: state.past.slice(0, -1), group: null, at: 0 };
}

export function boldSelection(markdown: string, start: number, end: number) {
  if (start < 0 || end > markdown.length || start >= end) return null;
  const selected = markdown.slice(start, end);
  if (selected.startsWith('**') && selected.endsWith('**') && selected.length > 4) {
    const replacement = selected.slice(2, -2);
    return { markdown: markdown.slice(0, start) + replacement + markdown.slice(end), start, end: start + replacement.length };
  }
  if (start >= 2 && markdown.slice(start - 2, start) === '**' && markdown.slice(end, end + 2) === '**') {
    return { markdown: markdown.slice(0, start - 2) + selected + markdown.slice(end + 2), start: start - 2, end: end - 2 };
  }
  const replacement = `**${selected}**`;
  return { markdown: markdown.slice(0, start) + replacement + markdown.slice(end), start, end: start + replacement.length };
}

// Fixed CSS classes are portable in saved Markdown and cannot introduce arbitrary CSS.
export function sizeSelection(markdown: string, start: number, end: number, size: number) {
  if (!Number.isInteger(size) || size < 11 || size > 24 || start < 0 || end > markdown.length || start >= end) return null;
  const selected = markdown.slice(start, end);
  // Reusing the selection created by this tool updates the size instead of nesting it.
  const clean = selected.replace(/<span class="resume-size-(?:1[1-9]|2[0-4])">([^<>]*)<\/span>/g, '$1');
  const replacement = clean.split('\n').map((line, index) => {
    if (!line.trim()) return line;
    const beginsLine = index > 0 || start === 0 || markdown[start - 1] === '\n';
    const prefix = beginsLine ? line.match(/^(\s*(?:(?:#{1,6}|[-+*]|\d+\.)\s+|>\s*)?)/)?.[0] || '' : '';
    const content = line.slice(prefix.length);
    return content ? `${prefix}<span class="resume-size-${size}">${content}</span>` : line;
  }).join('\n');
  return { markdown: markdown.slice(0, start) + replacement + markdown.slice(end), start, end: start + replacement.length };
}
