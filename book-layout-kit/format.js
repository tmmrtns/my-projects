/* Book Layout Kit – auto-format: turn a plain-text manuscript into kit markdown.
   Finds parts, chapters, sublines, section headings, scene breaks, epigraphs, quotations, poems,
   lists, footnotes and picture references, joins hard-wrapped lines and undoes line-end hyphens. */
(function (global) {
'use strict';
const BK = global.BK;

const CH_WORDS = 'chapter|hoofdstuk|chapitre|kapitel|cap[ií]tulo|capitolo';
const PT_WORDS = 'part|deel|partie|teil|book|boek|livre|parte';
const NUM = '[0-9]{1,3}|[ivxlcdm]{1,7}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|un|deux|trois|quatre|cinq|eins|zwei|drei|vier|f[uü]nf|first|second|third|fourth|fifth|eerste|tweede|derde|vierde|vijfde';
const CH_RE = new RegExp(`^(?:${CH_WORDS})\\s+(${NUM})\\b\\.?\\s*(?:[:.–—-]\\s*)?(.*)$`, 'i');
const PT_RE = new RegExp(`^(${PT_WORDS})\\s+(${NUM})\\b\\.?\\s*(?:[:.–—-]\\s*)?(.*)$`, 'i');
const NUM_ONLY = /^(?:[0-9]{1,3}|[IVXLCDM]{1,7})\.?$/;
const NUM_TITLE = /^(?:[0-9]{1,3}|[IVXLCDM]{1,7})[.)]\s+(\S.{0,70})$/;
const NAMED = /^(prologue|epilogue|proloog|epiloog|preface|foreword|voorwoord|woord vooraf|introduction|inleiding|afterword|nawoord|acknowledg(e)?ments?|dankwoord|notes|noten|endnotes|sources|bronnen|bibliography|bibliografie|literatuur|about the author|over de auteur|glossary|woordenlijst|appendix(\s+\w+)?|bijlage(\s+\w+)?|pr[ée]face|avant-propos|remerciements|vorwort|nachwort|einleitung|danksagung|quellen)$/i;
const NOTES_HEAD = /^(notes|noten|endnotes|footnotes|voetnoten|anmerkungen|notes de fin)$/i;
const SCENE = /^\s*(?:(?:\*\s*){1,5}|#|~{1,5}|⁂|❦|❧|§|(?:-\s*){3,}|(?:_\s*){3,}|(?:•\s*){1,3}|o\s+o\s+o)\s*$/;
const LIST = /^\s*([-*•–]|\d{1,2}[.)]|[a-z][.)])\s+(\S.*)$/;
const IMG_REF = /^\s*(?:\[(?:image|img|picture|photo|figure|foto|afbeelding|figuur|illustratie|illustration|bild|abbildung)\s*:?\s*([^\]|]+?)(?:\s*\|\s*([^\]]+))?\]|\{\{\s*([^}|]+?)(?:\s*\|\s*([^}]+))?\s*\}\}|<img[^>]*src=["']([^"']+)["'][^>]*>|([\w\-. ]+\.(?:jpe?g|png|webp|gif)))\s*$/i;
const ENDS = /[.!?:;,"”’»)\]]$/;
const isUpper = t => { const l = t.match(/\p{L}/gu) || []; return l.length >= 3 && l.every(c => c === c.toUpperCase()); };
const SMALL = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'de', 'het', 'een', 'van', 'der', 'den', 'en', 'op', 'la', 'le', 'les', 'du', 'des', 'et', 'und', 'die', 'das', 'von', 'zu']);
const titleCase = t => isUpper(t) ? t.toLowerCase().replace(/[\p{L}'’]+/gu, (w, i) => (i > 0 && SMALL.has(w)) ? w : w[0].toUpperCase() + w.slice(1)) : t;
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

const KEEP_HY = /^(self|well|ex|non|anti|co|post|pre|half|all|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|zelf|oud|ex|niet|half|semi|quasi|mid|cross|long|short|high|low|so|x)$/i;
function dehyphen(a, b, hyf) {
  const m1 = /(\p{L}+)-$/u.exec(a), m2 = /^(\p{L}+)/u.exec(b);
  if (!m1 || !m2 || !/^\p{Ll}/u.test(m2[1])) return a + b;
  if (hyf) {
    try {
      const h = hyf(m1[1] + m2[1], { hyphenChar: '|' });
      let n = 0; const pos = new Set();
      for (const ch of h) { if (ch === '|') pos.add(n); else n++; }
      if (pos.has(m1[1].length)) return a.slice(0, -1) + b;
    } catch (e) { /* fall through */ }
  }
  // compounds keep their hyphen (self-made, thirty-one); everything else was split at the line end
  return KEEP_HY.test(m1[1]) ? a + b : a.slice(0, -1) + b;
}

BK.autoFormat = function (input, opts) {
  opts = opts || {};
  const hyf = global.Hyph && (global.Hyph[opts.lang || 'en'] || global.Hyph.en);
  const stats = { parts: 0, chapters: 0, sections: 0, scenes: 0, quotes: 0, poems: 0, lists: 0, notes: 0, pictures: 0, joined: 0 };
  const meta = {};
  let text = String(input || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[​﻿]/g, '').replace(/\t/g, '    ').replace(/[ \t]+$/gm, '');
  const raw = text.split('\n');

  // ---- 1. blocks: paragraphs separated by blank lines, or by indents when the text has no blank lines
  const nonBlank = raw.filter(l => l.trim()).length;
  const blankCount = raw.length - nonBlank;
  const lens = raw.filter(l => l.trim()).map(l => l.trim().length);
  const wrapW = Math.max(40, Math.round(median(lens.filter(n => n > 30)) * 1.12) || 70);
  const hardWrapped = lens.filter(n => n > wrapW * .75 && n <= wrapW * 1.15).length > nonBlank * .45;
  const blocks = [];
  let cur = [];
  const push = () => { if (cur.length) blocks.push(cur); cur = []; };
  const fewBlanks = blankCount <= Math.max(2, nonBlank * .08);
  for (const l of raw) {
    if (!l.trim()) { push(); continue; }
    const indented = /^ {2,}\S/.test(l) && !/^ {4,}/.test(l);
    if (fewBlanks && cur.length && (indented || !hardWrapped)) push();
    cur.push(l);
  }
  push();

  // a heading written on several lines without blank lines ("CHAPTER 1 / The Bakery / (Lier, 1923)") is split up
  const headLike = t => t.length <= 60 && (CH_RE.test(t) || PT_RE.test(t) || NUM_ONLY.test(t) || NAMED.test(t) || (isUpper(t) && !ENDS.test(t)));
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.length > 1 && b.length <= 4 && headLike(b[0].trim()) && b.every(l => l.trim().length <= 70)) blocks.splice(i, 1, ...b.map(l => [l]));
  }
  // title and author at the very top
  if (blocks[0] && blocks[0].length <= 3 && blocks[0].every(l => l.trim().length <= 70) && !/^#/.test(blocks[0][0]) && !headLike(blocks[0][0].trim()) || (blocks[0] && isUpper(blocks[0][0].trim()) && !CH_RE.test(blocks[0][0].trim()) && !PT_RE.test(blocks[0][0].trim()) && !NAMED.test(blocks[0][0].trim()) && blocks[0].length <= 3)) {
    const b0 = blocks[0].map(l => l.trim());
    const by = b0.findIndex(l => /^(by|door|par|von|de|written by)\s+\S/i.test(l));
    if (by > 0 || (blocks[1] && blocks[1].length === 1 && /^(by|door|par|von)\s+\S/i.test(blocks[1][0].trim()))) {
      meta.title = titleCase(b0[0]);
      const al = by > 0 ? b0[by] : blocks[1][0].trim();
      meta.author = al.replace(/^(written by|by|door|par|von|de)\s+/i, '');
      if (by > 1) meta.subtitle = b0.slice(1, by).join(' ');
      blocks.splice(0, by > 0 ? 1 : 2);
    }
  }

  // ---- 2. classify blocks
  const out = [];
  let inChapter = false, lastHead = null, notesMode = null;
  const chapterNotes = [];   // per chapter: { refs:Set, defs:{} }
  let chap = { refs: new Set(), defs: {} };
  chapterNotes.push(chap);
  const joinLines = ls => {
    let t = '';
    for (const l0 of ls) {
      const l = l0.trim();
      if (!t) { t = l; continue; }
      if (/\p{L}-$/u.test(t) && /^\p{Ll}/u.test(l)) { t = dehyphen(t, l, hyf); stats.joined++; }
      else { t += ' ' + l; stats.joined++; }
    }
    return t;
  };
  const isHeadingLine = t => t.length <= 70 && !ENDS.test(t) && !/^[-*•>]/.test(t) && !/^\[\^/.test(t);
  const startChapter = () => { inChapter = true; chap = { refs: new Set(), defs: {} }; chapterNotes.push(chap); notesMode = null; };
  const already = blocks.some(b => /^#{1,3} /.test(b[0]));

  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    const one = b.length === 1 ? b[0].trim() : null;
    const next = blocks[bi + 1];
    const nextText = next ? next.map(x => x.trim()).join(' ') : '';
    // markdown that is already there stays as it is
    if (/^(#{1,6} |:::|```|!\[|\||> )/.test(b[0].trim())) {
      out.push(b.join('\n'));
      if (/^## /.test(b[0])) startChapter();
      if (/^# /.test(b[0])) inChapter = false;
      lastHead = /^#{1,2} /.test(b[0]) ? 'h' : null;
      continue;
    }
    // scene breaks
    if (one && SCENE.test(one)) { out.push('***'); stats.scenes++; lastHead = null; continue; }
    // pictures
    if (one) {
      const im = IMG_REF.exec(one);
      if (im) {
        const file = (im[1] || im[3] || im[5] || im[6] || '').trim(), cap = (im[2] || im[4] || '').trim();
        if (file) {
          let caption = cap;
          if (!caption && next && next.length <= 2 && /^(fig(\.|uur|ure)?|afb\.?|caption|bijschrift)?\s*[:.]?\s*\S/.test(next[0]) && next.join(' ').length < 160 && /^(fig|afb|caption|bijschrift|\(|\*|_)/i.test(next[0].trim())) {
            caption = next.join(' ').replace(/^(fig(\.|uur|ure)?\s*\d*|afb\.?\s*\d*|caption|bijschrift)\s*[:.]?\s*/i, '').replace(/^[(*_]+|[)*_]+$/g, '').trim(); bi++;
          }
          out.push(`![${caption ? '' : ''}](${file})` + (caption ? `\n\n*${caption}*` : ''));
          stats.pictures++; lastHead = null; continue;
        }
      }
    }
    // parts
    if (one && isHeadingLine(one) && PT_RE.test(one)) {
      const m = PT_RE.exec(one);
      let title = m[3].trim();
      if (!title && next && next.length === 1 && isHeadingLine(next[0].trim()) && !CH_RE.test(next[0].trim())) { title = next[0].trim(); bi++; }
      out.push(`# ${titleCase(m[1])} ${titleCase(m[2])}${title ? ' – ' + titleCase(title) : ''}`);
      stats.parts++; inChapter = false; lastHead = 'part'; continue;
    }
    // chapters: "Chapter 3", "Chapter 3: Title", "III", "3. Title", a named section, or a line in capitals
    let chTitle = null, chSub = '';
    if (one && isHeadingLine(one)) {
      const m = CH_RE.exec(one);
      if (m) chTitle = m[2].trim() || null;
      if (m && !chTitle) {
        if (next && next.length === 1 && isHeadingLine(next[0].trim()) && !CH_RE.test(next[0].trim()) && !PT_RE.test(next[0].trim())) { chTitle = next[0].trim(); bi++; }
        else chTitle = one;
      }
      if (!chTitle && NUM_ONLY.test(one) && next && next.length === 1 && isHeadingLine(next[0].trim())) { chTitle = next[0].trim(); bi++; }
      else if (!chTitle && NUM_ONLY.test(one) && next && next.join(' ').length > 120) chTitle = `${one.replace(/\.$/, '')}`;
      if (!chTitle && NUM_TITLE.test(one) && !/[.!?]$/.test(one) && (!inChapter || lastHead === null) && next && next.join(' ').length > 150 && !LIST.test(nextText)) chTitle = NUM_TITLE.exec(one)[1];
      if (!chTitle && NAMED.test(one)) chTitle = one;
      if (!chTitle && isUpper(one) && one.length >= 3 && one.length <= 60 && (!inChapter || (next && next.join(' ').length > 80))) chTitle = one;
    }
    if (chTitle) {
      const t = titleCase(chTitle.replace(/^\*+|\*+$/g, '').trim());
      if (NOTES_HEAD.test(t) && inChapter) { notesMode = chap; lastHead = null; continue; }
      // a short line with a year or a place-and-date right under the title becomes the subline
      const nx = blocks[bi + 1];
      if (nx && nx.length === 1) {
        const s = nx[0].trim();
        if (s.length <= 50 && !ENDS.test(s.replace(/\d{4}\)?$/, '')) && (/\b(1[0-9]{3}|20[0-9]{2})\b/.test(s) || /^\(.*\)$/.test(s) || /^[*_].*[*_]$/.test(s))) { chSub = s.replace(/^[(*_]+|[)*_]+$/g, '').trim(); bi++; }
      }
      out.push(`## ${t}${chSub ? ' | ' + chSub : ''}`);
      stats.chapters++; startChapter(); lastHead = 'h'; continue;
    }
    // footnote definitions: "1. text" or "[1] text" lines in a notes block, or "[1] text" anywhere
    if (notesMode || b.every(l => /^\s*\[\d{1,3}\]\s+\S/.test(l) || /^\s{2,}\S/.test(l))) {
      const target = notesMode || chap;
      let curN = null;
      for (const l of b) {
        const m = /^\s*(?:\[(\d{1,3})\]|(\d{1,3})[.)])\s+(.*)$/.exec(l);
        if (m) { curN = m[1] || m[2]; target.defs[curN] = m[3].trim(); }
        else if (curN) target.defs[curN] += ' ' + l.trim();
      }
      if (curN) { stats.notes += b.filter(l => /^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s/.test(l)).length; continue; }
    }
    // lists
    if (b.length >= 2 && b.filter(l => LIST.test(l)).length >= Math.max(2, b.length * .6)) {
      const items = [];
      for (const l of b) { const m = LIST.exec(l); if (m) items.push({ ord: /\d/.test(m[1]), t: m[2].trim() }); else if (items.length) items[items.length - 1].t += ' ' + l.trim(); }
      out.push(items.map(x => (x.ord ? '1. ' : '- ') + x.t).join('\n'));
      stats.lists++; lastHead = null; continue;
    }
    // quotations: indented blocks, or a short block and an attribution right after a heading (epigraph)
    const allIndented = b.every(l => /^ {4,}\S/.test(l));
    const ATTR = /^\s*([—–]|--\s)/;
    const inner = b.length > 1 && ATTR.test(b[b.length - 1]) && b[b.length - 1].trim().length < 80;
    const attrib = !inner && next && next.length === 1 && ATTR.test(next[0]) && next[0].trim().length < 80;
    if ((lastHead === 'h' && b.join(' ').length < 300 && (attrib || inner || /^["“]/.test(b[0].trim()))) || (allIndented && !hardWrapped && b.every(l => l.trim().length > 50)) || (allIndented && hardWrapped)) {
      const body = inner ? b.slice(0, -1) : b;
      let q = '> ' + joinLines(body).replace(/^["“](.*)["”]$/, '$1');
      const at = inner ? b[b.length - 1] : (attrib ? next[0] : null);
      if (at) { q += '\n>\n> ' + at.trim().replace(/^--\s*/, '— '); if (attrib) bi++; }
      out.push(q); stats.quotes++; continue;
    }
    // poems: several short lines that are not wrapped prose
    const short = b.filter(l => l.trim().length < wrapW * .7).length;
    if (b.length >= 3 && short === b.length && (hardWrapped || b.every(l => l.trim().length < 60)) && b.some(l => !ENDS.test(l.trim())) && !(fewBlanks && !hardWrapped)) {
      const stanzas = [b.map(l => l.trim())];
      while (blocks[bi + 1] && blocks[bi + 1].length >= 2 && blocks[bi + 1].every(l => l.trim().length < wrapW * .7)) { bi++; stanzas.push(blocks[bi].map(l => l.trim())); }
      out.push('::: poem\n' + stanzas.map(s => s.join('\n')).join('\n\n') + '\n:::');
      stats.poems++; lastHead = null; continue;
    }
    // section headings inside a chapter: a short line on its own, followed by text
    if (one && inChapter && isHeadingLine(one) && one.length <= 60 && next && next.join(' ').length > 100 && /^\p{Lu}/u.test(one) && !/^["“‘]/.test(one) && one.split(/\s+/).length <= 9) {
      out.push('### ' + titleCase(one)); stats.sections++; lastHead = 'h3'; continue;
    }
    // ordinary paragraph
    let p = joinLines(b);
    // footnote references [1] -> [^c1-1]
    p = p.replace(/(\S)\[(\d{1,3})\](?!\()/g, (m, a, n) => { chap.refs.add(n); return `${a}[^c${chapterNotes.length}-${n}]`; });
    out.push(p);
    lastHead = null;
    if (!inChapter && out.length === 1 && b.length === 1 && isHeadingLine(p) && p.length < 70 && !meta.title) { meta.title = titleCase(p); out.pop(); continue; }
    if (!inChapter && !meta.author && /^(by|door|par|von|de)\s+(.{3,60})$/i.test(p)) { meta.author = p.replace(/^(by|door|par|von|de)\s+/i, ''); out.pop(); }
  }
  // footnote definitions go at the end of their chapter
  let md = out.join('\n\n');
  chapterNotes.forEach((c, k) => {
    const ids = Object.keys(c.defs);
    if (!ids.length) return;
    const tag = `c${k + 1}`;
    const defs = ids.map(n => `[^${tag}-${n}]: ${c.defs[n]}`).join('\n\n');
    // insert before the next chapter heading after this chapter's last reference
    const lastRef = md.lastIndexOf(`[^${tag}-`);
    const at = lastRef >= 0 ? md.indexOf('\n## ', lastRef) : -1;
    if (lastRef < 0) md += '\n\n## Notes\n\n' + ids.map(n => `${n}. ${c.defs[n]}`).join('\n');
    else md = at < 0 ? md + '\n\n' + defs : md.slice(0, at) + '\n\n' + defs + '\n' + md.slice(at);
  });
  md = md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { md, meta, stats, already };
};
})(typeof window !== 'undefined' ? window : globalThis);
