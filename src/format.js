// --- Markdown wrapping/format engine (pure, testable) ---
//
// Every editor shortcut in source mode is a pure string operation over the
// document text plus a selection — exactly what CodeMirror hands us. Keeping
// these out of the editor module means the whole keyboard contract is unit
// tested without a DOM.
//
// Convention: positions are {line, ch} offsets into `text`; the selection is
// [anchor, head]. A formatter returns {text, anchor, head} for the new state.
// Toggle semantics: if the (single-line) selection is already wrapped in the
// marker, unwrap it; otherwise wrap it. Multi-line/paragraph-level markers
// (headings, quotes, list bullets) toggle per line prefix.

function rangeToOffsets(text, from, to) {
  const lines = text.split("\n");
  const lineStart = (n) =>
    lines.slice(0, n).reduce((acc, l) => acc + l.length + 1, 0);
  return [lineStart(from.line) + from.ch, lineStart(to.line) + to.ch];
}

function offsetsToPositions(text, a, b) {
  const lines = text.split("\n");
  const find = (offset) => {
    let acc = 0;
    for (let i = 0; i < lines.length; i++) {
      const next = acc + lines[i].length + 1;
      if (offset < next) return { line: i, ch: offset - acc };
      acc = next;
    }
    return { line: lines.length - 1, ch: lines[lines.length - 1].length };
  };
  return { anchor: find(a), head: find(b) };
}

/** Inline marker wrap/unwrap (bold **, italic *, code `). */
export function toggleInline(text, anchor, head, marker) {
  let [a, b] = rangeToOffsets(text, anchor, head);
  if (a > b) [a, b] = [b, a];

  // Already wrapped exactly?  "**sel**"  → unwrap.
  const before = text.slice(a - marker.length, a);
  const after = text.slice(b, b + marker.length);
  if (a >= marker.length && before === marker && after === marker) {
    const inner = text.slice(a, b);
    const next = text.slice(0, a - marker.length) + inner + text.slice(b + marker.length);
    return {
      text: next,
      ...offsetsToPositions(next, a - marker.length, a - marker.length + inner.length),
    };
  }

  const inner = text.slice(a, b);
  if (!inner) {
    // Empty cursor: insert a marker pair and park the cursor inside.
    const next = text.slice(0, a) + marker + marker + text.slice(b);
    return { text: next, ...offsetsToPositions(next, a + marker.length, a + marker.length) };
  }
  const next = text.slice(0, a) + marker + inner + marker + text.slice(b);
  return { text: next, ...offsetsToPositions(next, a + marker.length, b + marker.length) };
}

/** Line-prefix toggle ("> ", "- ", "1. ") applied to every touched line. */
export function toggleLinePrefix(text, anchor, head, prefix) {
  const lines = text.split("\n");
  const first = Math.min(anchor.line, head.line);
  const last = Math.max(anchor.line, head.line);
  const re = new RegExp(`^\\s*${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const allPrefixed = lines
    .slice(first, last + 1)
    .every((l) => re.test(l));
  for (let i = first; i <= last; i++) {
    if (allPrefixed) lines[i] = lines[i].replace(re, "");
    else lines[i] = prefix + lines[i];
  }
  const next = lines.join("\n");
  const shift = allPrefixed ? -prefix.length : prefix.length;
  const clamp = (n) => Math.max(0, n);
  return {
    text: next,
    anchor: clampPos(next, anchor.line, clamp(anchor.ch + shift)),
    head: clampPos(next, head.line, clamp(head.ch + shift)),
  };
}

function clampPos(text, line, ch) {
  const lines = text.split("\n");
  const l = Math.min(Math.max(line, 0), lines.length - 1);
  return { line: l, ch: Math.min(Math.max(ch, 0), lines[l].length) };
}

/** ATX heading toggle (#, ##, ###) — replaces any existing heading level. */
export function toggleHeading(text, anchor, head, level) {
  const lines = text.split("\n");
  const first = Math.min(anchor.line, head.line);
  const last = Math.max(anchor.line, head.line);
  const target = "#".repeat(level) + " ";
  const anyTarget = lines.slice(first, last + 1).every((l) => l.startsWith(target));
  for (let i = first; i <= last; i++) {
    const stripped = lines[i].replace(/^#{1,6}\s+/, "");
    lines[i] = anyTarget ? stripped : target + stripped;
  }
  const next = lines.join("\n");
  return { text: next, anchor: clampPos(next, anchor.line, anchor.ch), head: clampPos(next, head.line, head.ch) };
}

/**
 * Code fence toggle. Line-based for predictability: if the selection's line
 * region already IS a fenced block (opens with ```, closes with ```), strip
 * the fences; otherwise wrap the selected lines (or the cursor line) in a
 * new fence. `lang` only applies when creating.
 */
export function toggleCodeFence(text, anchor, head, lang = "") {
  const lines = text.split("\n");
  const first = Math.min(anchor.line, head.line);
  const last = Math.max(anchor.line, head.line);
  const isFence = (l) => /^\s*```/.test(l);

  if (last > first && isFence(lines[first]) && isFence(lines[last])) {
    // unwrap: drop the two fence lines, clamp selection into what remains
    lines.splice(last, 1);
    lines.splice(first, 1);
    const next = lines.join("\n");
    const shiftLine = (n) => Math.max(first - 1, n - 1);
    return {
      text: next,
      anchor: clampPos(next, shiftLine(anchor.line), shiftLine(head.line) === shiftLine(anchor.line) ? Math.max(0, anchor.ch - 0) : anchor.ch),
      head: clampPos(next, shiftLine(head.line), head.ch),
    };
  }

  // wrap: insert fence lines around the region
  const fenceOpen = "```" + (lang || "");
  lines.splice(last + 1, 0, "```");
  lines.splice(first, 0, fenceOpen);
  const next = lines.join("\n");
  return {
    text: next,
    anchor: clampPos(next, anchor.line + 1, anchor.ch),
    head: clampPos(next, head.line + 1, head.ch),
  };
}

function sortOffsets([a, b]) {
  return a <= b ? [a, b] : [b, a];
}

/** Link insertion: wrap selection as [sel](url) with cursor inside url parens. */
export function insertLink(text, anchor, head) {
  let [a, b] = sortOffsets(rangeToOffsets(text, anchor, head));
  const label = text.slice(a, b) || "文字";
  const next = text.slice(0, a) + `[${label}](url)` + text.slice(b);
  const urlA = a + label.length + 3;
  return { text: next, ...offsetsToPositions(next, urlA, urlA + 3) };
}
