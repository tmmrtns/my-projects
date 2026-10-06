/* Book Layout Kit – Extract: turn recognised page lines into a kit manuscript (pure functions, no page access). */
(function (global) {
'use strict';
const KIT_LANG = { eng: 'en', nld: 'nl', fra: 'fr', deu: 'de', spa: 'es', ita: 'it' };
// ---------------------------------------------------------------- small helpers
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const letters = t => (t.match(/\p{L}/gu) || []);
const isUpper = t => { const l = letters(t); return l.length >= 2 && l.filter(c => c === c.toUpperCase() && c !== c.toLowerCase()).length / l.length > .85; };
const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'de', 'het', 'een', 'van', 'der', 'den', 'en', 'op', 'in', 'la', 'le', 'les', 'du', 'des', 'et', 'und', 'die', 'das', 'von', 'zu', 'y', 'el', 'il', 'di']);
const titleCase = t => isUpper(t) ? t.toLowerCase().replace(/[\p{L}'’]+/gu, (w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : w[0].toUpperCase() + w.slice(1)) : t;
const unspace = t => t.replace(/(?:\b\p{L} ){2,}\p{L}\b/gu, m => m.replace(/ /g, ''));
const LABEL_RE = /^(chapter|hoofdstuk|chapitre|kapitel|cap[ií]tulo|capitolo|part|deel|partie|teil|book|boek|livre|parte|interlude|intermezzo|zwischenspiel|interludio|appendix|bijlage|annexe|anhang)\b|^([0-9]{1,3}|[ivxlcdm]{1,7})\.?$/i;
const PART_RE = /^(part|deel|partie|teil|book|boek|livre|parte)\b/i;
const INTERLUDE_RE = /^(interlude|intermezzo|zwischenspiel|interludio)\b/i;
const TOC_TITLE = /^(contents|table of contents|inhoud|inhoudsopgave|table des mati[eè]res|sommaire|inhalt|inhaltsverzeichnis|[ií]ndice|sommario)$/i;
const INDEX_TITLE = /^(index|index of names|register|personenregister|naamregister|namenregister|index des noms|personenverzeichnis|[ií]ndice onom[aá]stico|indice dei nomi)$/i;
const INTRO_TITLE = /^(introduction|inleiding|einleitung|introducci[oó]n|introduzione)$/i;
const MINI_TOC = /^(in this part|in dit deel|dans cette partie|in diesem teil|en esta parte|in questa parte)$/i;
const ORNAMENT = /^[\s*•·⁂❦❧~#◆◇†‡§°oO0-]+$/;
const ENDS_SENTENCE = /[.!?:;"”’»)\]]$/;

// ---------------------------------------------------------------- layout -> kit markdown
function hyphenJoin(a, b, hyf) {
  const m1 = /([\p{L}]+)-$/u.exec(a), m2 = /^([\p{L}]+)/u.exec(b);
  if (!m1 || !m2 || !/^\p{Ll}/u.test(m2[1])) return a + b;
  if (hyf) {
    try {
      const h = hyf(m1[1] + m2[1], { hyphenChar: '|' });
      let n = 0; const pos = new Set();
      for (const ch of h) { if (ch === '|') pos.add(n); else n++; }
      if (pos.has(m1[1].length)) return a.slice(0, -1) + b;
    } catch (e) { /* keep the guess below */ }
  }
  return /^(self|well|ex|non|anti|co|post|pre|half|all|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|zelf|oud|niet|semi|quasi|mid|cross|long|short|high|low)$/i.test(m1[1]) ? a + b : a.slice(0, -1) + b;
}

// rows and columns for lines the user marked as a table
function forcedGrid(block, body) {
  const starts = [];
  block.forEach(ln => ln.words.forEach((w, k) => { if (k === 0 || w.x0 - ln.words[k - 1].x1 > body * .45) starts.push(w.x0); }));
  starts.sort((x, y) => x - y);
  const cols = [];
  for (const x of starts) { const c = cols.find(c => Math.abs(c.x - x) < body * .8); if (c) { c.n++; c.x = (c.x * (c.n - 1) + x) / c.n; } else cols.push({ x, n: 1 }); }
  const need = Math.max(2, Math.ceil(block.length * .35));
  const strong = cols.filter(c => c.n >= need).map(c => c.x).sort((x, y) => x - y);
  let grid;
  if (strong.length >= 2 && strong.length <= 10) {
    grid = block.map(ln => { const r = strong.map(() => ''); ln.words.forEach(w => { let k = 0; strong.forEach((x, q) => { if (w.x0 >= x - body * .8) k = q; }); r[k] = r[k] ? r[k] + ' ' + w.t : w.t; }); return r; });
  } else {
    // no steady columns: cut each line where there is a wide gap
    grid = block.map(ln => { const cells = ['']; ln.words.forEach((w, k) => { if (k && w.x0 - ln.words[k - 1].x1 > body * .9) cells.push(''); const q = cells.length - 1; cells[q] = cells[q] ? cells[q] + ' ' + w.t : w.t; }); return cells; });
    const n = Math.max(2, ...grid.map(r => r.length));
    grid = grid.map(r => { while (r.length < n) r.push(''); return r; });
  }
  if (grid[0].every(x => !x || isUpper(x))) grid[0] = grid[0].map(x => titleCase(x));
  return grid;
}

function analyze(pages, opt) {
  const hyf = window.Hyph && window.Hyph[KIT_LANG[opt.langs[0]] || 'en'];
  const stats = { pages: pages.length, chapters: 0, parts: 0, figures: 0, notes: 0, removed: 0, uncertain: 0, tables: 0 };
  const all = [];
  // pages that are one big picture: a cover (first or last page) is left out, a plate keeps only its picture
  pages.forEach((pg, pi) => {
    const area = (pg.figs || []).reduce((a, f) => a + (f.x1 - f.x0) * (f.y1 - f.y0), 0);
    const big = (pg.figs || []).slice().sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];
    if (!big || area < pg.W * pg.H * .5 || pg.userFigs) return;
    if (pi === 0 || pi === pages.length - 1) { pg.cover = true; pg.figs = []; pg.lines.forEach(l => { l.dropped = true; }); stats.removed += pg.lines.length; }
    else pg.lines.forEach(l => { if (l.y0 >= big.y0 && l.y1 <= big.y1 && l.x0 >= big.x0 && l.x1 <= big.x1) l.dropped = true; });
    pg.lines = pg.lines.filter(l => !l.dropped);
  });
  // marks inside pictures and turned text read as letters: drop lines that are mostly noise
  pages.forEach(pg => {
    const bigFig = (pg.figs || []).some(f => (f.x1 - f.x0) * (f.y1 - f.y0) > pg.W * pg.H * .4);
    pg.lines = pg.lines.filter(l => {
      if (l.force) return true;
      const t = l.words.map(w => w.t).join(' ');
      const letters = (t.match(/\p{L}/gu) || []).length;
      const conf = l.conf == null ? 100 : l.conf;
      if (letters < t.replace(/\s/g, '').length * .55 && !/^[\d\s.,–-]+$/.test(t) && !/^[*•·⁂❦~#\s]+$/.test(t)) { stats.removed++; return false; }
      if (conf < 45 && t.length < 30) { stats.removed++; return false; }
      if (bigFig && ((conf < 70 && t.length < 40) || letters < 3)) { stats.removed++; return false; }
      return true;
    });
  });
  // letter-spaced capitals ("C H A P T E R  O N E") back into words
  pages.forEach(pg => pg.lines.forEach(l => {
    const ws = l.words;
    if (ws.length < 4 || ws.filter(w => w.t.replace(/[^\p{L}\p{N}]/gu, '').length === 1).length < ws.length * .6) return;
    const gaps = [];
    for (let i = 1; i < ws.length; i++) gaps.push(ws[i].x0 - ws[i - 1].x1);
    const pos = gaps.filter(x => x >= 0), g = median(pos) || 0, gmax = Math.max(0, ...pos);
    const cut = gmax > g * 1.2 + .5 ? (g + gmax) / 2 : Infinity;
    const out = [Object.assign({}, ws[0])];
    for (let i = 1; i < ws.length; i++) {
      const gap = ws[i].x0 - ws[i - 1].x1;
      if (gap < cut) { const o = out[out.length - 1]; o.t += ws[i].t; o.x1 = ws[i].x1; o.sup = (o.sup || '') + (ws[i].sup || ''); }
      else out.push(Object.assign({}, ws[i]));
    }
    l.rawWords = ws; l.words = out;
  }));
  pages.forEach((pg, pi) => pg.lines.forEach(l => {
    l.p = pi;
    l.text = l.words.map(w => w.t).join(' ');
    l.role = l.force === 'rh' || l.force === 'pic' ? l.force : 'text';
    if (l.force === 'rh') stats.removed++;
    all.push(l);
    if (l.role === 'text') for (const w of l.words) if (w.conf < 60) stats.uncertain++;
  }));
  const hist = {};
  for (const l of all) if (l.text.length >= 25) { const k = Math.round(l.size * 2) / 2; hist[k] = (hist[k] || 0) + l.text.length; }
  const body = +((Object.entries(hist).sort((a, b) => b[1] - a[1])[0] || [12])[0]);
  const isBody = l => Math.abs(l.size - body) <= body * .2 && l.text.length >= 25;
  const big = l => l.size >= body * 1.3;
  // text block edges per page (odd and even pages differ)
  const Ls = [[], []], Rs = [[], []];
  const fullW = median(all.filter(isBody).map(l => l.x1 - l.x0)) || 700;
  for (const pg of pages) {
    const full = pg.lines.filter(l => isBody(l) && (l.x1 - l.x0) > fullW * .9);
    if (full.length >= 4) { pg.L = pct(full.map(l => l.x0), .3); pg.R = pct(full.map(l => l.x1), .7); Ls[pg.idx % 2].push(pg.L); Rs[pg.idx % 2].push(pg.R); }
  }
  const gL = median(Ls[0].concat(Ls[1])) || 100, gR = median(Rs[0].concat(Rs[1])) || 900;
  for (const pg of pages) if (pg.L == null) { pg.L = median(Ls[pg.idx % 2]) || gL; pg.R = median(Rs[pg.idx % 2]) || gR; }
  const gaps = [];
  pages.forEach(pg => { for (let i = 1; i < pg.lines.length; i++) { const a = pg.lines[i - 1], b = pg.lines[i]; if (isBody(a) && isBody(b)) { const g = b.y0 - a.y0; if (g > 0 && g < body * 3) gaps.push(g); } } });
  const G = median(gaps) || body * 1.4;
  const cen = (l, pg) => { const mid = (pg.L + pg.R) / 2, w = pg.R - pg.L; return Math.abs((l.x0 + l.x1) / 2 - mid) < w * .05 && (l.x1 - l.x0) < w * .88 && l.x0 > pg.L + body * .8; };

  // running heads and page numbers
  const norm = t => t.toLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}#]+/gu, ' ').trim();
  const edgeCount = {};
  const tops = [], bots = [];
  pages.forEach(pg => {
    const ls = pg.lines; if (!ls.length) return;
    const t = ls[0], b = ls[ls.length - 1];
    if (t.y1 < pg.H * .1 || (ls[1] && ls[1].y0 - t.y1 > G * 1.1 && t.text.length < 70 && !big(t) && t.y1 < pg.H * .16)) { tops.push(t); edgeCount[norm(t.text)] = (edgeCount[norm(t.text)] || 0) + 1; }
    if (b !== t && (b.y0 > pg.H * .9 || /^[\divxlc\s–—-]+$/i.test(b.text))) { bots.push(b); edgeCount[norm(b.text)] = (edgeCount[norm(b.text)] || 0) + 1; }
  });
  for (const l of tops.concat(bots)) {
    if (l.force) continue;
    const folio = /^[\s–—-]*([\d]{1,4}|[ivxlcdm]{1,7})[\s–—-]*$/i.test(l.text);
    if (folio || edgeCount[norm(l.text)] >= 3 || (tops.includes(l) && isUpper(l.text) && l.text.length < 60 && !big(l))) { l.role = 'rh'; stats.removed++; }
  }
  // footnotes at the foot of the page
  pages.forEach((pg, pi) => {
    const forced = pg.lines.filter(l => l.force === 'fn');
    const ls = pg.lines.filter(l => l.role === 'text' && !l.force);
    const notes = [];
    let k = ls.length - 1, cand;
    if (forced.length) cand = forced;
    else {
      while (k >= 0 && ls[k].size <= body * .9 && ls[k].text.length > 2) k--;
      cand = ls.slice(k + 1);
      if (!cand.length || !/^\d{1,3}[.)]?(\s|(?=\p{Lu}))/u.test(cand[0].text)) return;
      if (k >= 0 && cand[0].y0 - ls[k].y1 < G * .25) return;
    }
    let cur = null;
    for (const l of cand) {
      const m = /^(\d{1,3})[.)]?\s*(\p{Lu}.*|\s.*)$/u.exec(l.text);
      if (m) { cur = { n: m[1], text: m[2] }; notes.push(cur); }
      else if (!cur) { cur = { n: '*', text: l.text }; notes.push(cur); }
      else if (cur) cur.text = cur.text.endsWith('-') ? hyphenJoin(cur.text, l.text, hyf) : cur.text + ' ' + l.text;
      l.role = 'fn';
    }
    pg.notes = notes; stats.notes += notes.length;
  });
  // pictures and their captions
  pages.forEach((pg, pi) => {
    // captions the user marked go with the nearest picture on the page
    const own = new Map();
    if ((pg.figs || []).length) for (const l of pg.lines.filter(l => l.force === 'cap')) {
      const d = f => Math.max(0, f.y0 - l.y1, l.y0 - f.y1) + Math.max(0, f.x0 - l.x1, l.x0 - f.x1);
      const f = pg.figs.slice().sort((a, b) => d(a) - d(b))[0];
      if (!own.has(f)) own.set(f, []);
      own.get(f).push(l); l.role = 'cap';
    }
    (pg.figs || []).forEach(f => {
      if (own.has(f)) { f.caption = own.get(f).map(l => l.text).join(' ').replace(/\s+([,.;:])/g, '$1').trim(); stats.figures++; return; }
      const capLines = [];
      for (const l of pg.lines) {
        if (l.force) continue;
        if (l.role !== 'text' && l.role !== 'cap') continue;
        if (l.y0 < f.y1 - 2 || l.y0 - f.y1 > G * 2.2 + (capLines.length ? capLines.length * G : 0)) continue;
        if (l.x1 < f.x0 - body || l.x0 > f.x1 + body) continue;
        if (l.size > body * 1.05) continue;
        if (capLines.length && (l.size > body * .95 || l.y0 - capLines[capLines.length - 1].y1 > G)) break;
        if (!capLines.length && l.size > body * .95 && Math.abs((l.x0 + l.x1) / 2 - (f.x0 + f.x1) / 2) > body * 2) break;
        capLines.push(l);
        if (capLines.length >= 3) break;
      }
      const words = [];
      capLines.forEach(l => {
        const others = (pg.figs || []).filter(g => g !== f && Math.abs(g.y1 - f.y1) < G * 2);
        l.words.forEach(w => {
          const cx = (w.x0 + w.x1) / 2;
          const near = [f].concat(others).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - cx) - Math.abs((b.x0 + b.x1) / 2 - cx))[0];
          if (near === f) words.push(w.t);
        });
        l.role = 'cap';
      });
      f.caption = words.join(' ').replace(/\s+([,.;:])/g, '$1').trim();
      stats.figures++;
    });
  });

  // ---- stream of items in reading order
  const stream = [];
  pages.forEach((pg, pi) => {
    const items = pg.lines.filter(l => l.role === 'text').map(l => ({ kind: 'line', l, y: l.y0 }));
    (pg.figs || []).forEach(f => items.push({ kind: 'fig', f, y: f.y0 }));
    items.sort((a, b) => a.y - b.y);
    items.forEach((it, i) => { it.pi = pi; it.pg = pg; it.first = i === 0; it.prev = items[i - 1] || null; });
    stream.push(...items);
  });

  // ---- headings: a group of centred or large lines
  const groups = [];
  for (let i = 0; i < stream.length; i++) {
    const it = stream[i];
    if (it.kind !== 'line' || it.l.role !== 'text') continue;
    const l = it.l, pg = it.pg;
    if (l.force === 'head') {
      // a heading the user marked: the lines in the box, split into label, title and subtitle
      const grp = [it];
      for (let j = i + 1; j < stream.length && stream[j].kind === 'line' && stream[j].pi === it.pi && stream[j].l.force === 'head'; j++) grp.push(stream[j]);
      const lines = grp.map(g => g.l), tx = lines.map(x => x.text.trim());
      let label = '', title = '', sub = '';
      const ti = lines.findIndex(big);
      if (LABEL_RE.test(tx[0]) && (lines.length === 1 || ti !== 0)) { label = tx[0]; title = tx[1] || ''; sub = tx.slice(2).join(' '); }
      else { title = tx[0]; sub = tx.slice(1).join(' '); }
      groups.push({ start: i, end: i + grp.length, label, title, sub, page: it.pi, it, lines, forced: true });
      i += grp.length - 1;
      continue;
    }
    if (l.force) continue;
    const startsLow = it.first && l.y0 > pg.H * .14;
    if (!(big(l) || (cen(l, pg) && (startsLow || LABEL_RE.test(l.text.trim()))))) continue;
    const grp = [it];
    for (let j = i + 1; j < stream.length && grp.length < 7; j++) {
      const nx = stream[j];
      if (nx.kind !== 'line' || nx.pi !== it.pi || nx.l.force) break;
      const prevL = grp[grp.length - 1].l;
      if (nx.l.y0 - prevL.y1 > G * 3.2) break;
      if (!(big(nx.l) || cen(nx.l, pg))) break;
      if (isBody(nx.l) && !cen(nx.l, pg)) break;
      grp.push(nx);
    }
    const lines = grp.map(g => g.l);
    const ti = lines.findIndex(big);
    const label = (ti > 0 ? lines.slice(0, ti) : (ti < 0 && LABEL_RE.test(lines[0].text.trim()) ? [lines[0]] : [])).map(x => x.text.trim()).join(' ');
    let titleLines = ti >= 0 ? [] : [];
    if (ti >= 0) { let k = ti; while (k < lines.length && big(lines[k])) titleLines.push(lines[k++]); }
    else if (lines.length > 1) titleLines = [lines[1]];
    else titleLines = [lines[0]];
    const after = lines.slice(lines.indexOf(titleLines[titleLines.length - 1]) + 1);
    const bodyAfter = stream.slice(i + grp.length, i + grp.length + 40).filter(s => s.kind === 'line' && isBody(s.l) && s.pi <= it.pi + 2).length;
    const accept = LABEL_RE.test(label || '') || (titleLines.some(big) && (bodyAfter >= 4 || it.first));
    if (!accept) continue;
    groups.push({ start: i, end: i + grp.length, label, title: titleLines.map(x => x.text).join(' '), sub: after.map(x => x.text).join(' '), page: it.pi, it, lines });
    i += grp.length - 1;
  }
  // the first real section: a heading followed by text within two pages, or a chapter/part label
  const realStart = groups.findIndex(g => g.forced || LABEL_RE.test(g.label) || stream.slice(g.end, g.end + 60).filter(s => s.kind === 'line' && isBody(s.l) && s.pi <= g.page + 1).length >= 4);
  let firstIdx = realStart >= 0 ? groups[realStart].start : stream.length;
  // index entries and tables the user marked are never front matter: start the walk at the first of them
  const forcedAt = stream.findIndex(x => x.kind === 'line' && (x.l.force === 'index' || x.l.force === 'table'));
  if (forcedAt >= 0 && forcedAt < firstIdx) firstIdx = forcedAt;
  const sectGroups = realStart >= 0 ? groups.slice(realStart) : [];

  // ---- front matter -> settings
  const meta = { colophon: [], dedication: [] };
  const fm = stream.slice(0, firstIdx).filter(s => s.kind === 'line');
  const fmPages = [...new Set(fm.map(s => s.pi))];
  let titlePage = null, titleSize = 0;
  for (const s of fm) if (s.l.size > titleSize && s.l.size >= body * 1.4) { titleSize = s.l.size; titlePage = s.pi; }
  const leftover = [];
  for (const pi of fmPages) {
    const ls = fm.filter(s => s.pi === pi && !s.l.force).map(s => s.l);
    leftover.push(...fm.filter(s => s.pi === pi && s.l.force).map(s => s.l));
    if (!ls.length) continue;
    const txt = ls.map(l => l.text).join(' ');
    const tocLike = ls.filter(l => /\d{1,4}\s*$/.test(l.text)).length >= Math.max(3, ls.length * .4) || ls.some(l => TOC_TITLE.test(l.text.trim()));
    if (tocLike) { ls.forEach(l => { l.role = 'toc'; }); continue; }
    if (/©|isbn|copyright|all rights|printed in|gedrukt|uitgeverij|alle rechten|verlag|imprimé|tous droits/i.test(txt)) { meta.colophon.push(...ls.map(l => unspace(l.text))); ls.forEach(l => { l.role = 'meta'; }); continue; }
    if (pi === titlePage) {
      const tl = ls.filter(l => l.size >= titleSize * .92);
      meta.title = titleCase(unspace(tl.map(l => l.text).join(' ')));
      const rest = ls.filter(l => !tl.includes(l));
      const below = rest.filter(l => l.y0 > tl[tl.length - 1].y1);
      const author = below.slice().reverse().find(l => isUpper(l.text) || l.y0 > (pages[pi].H * .5));
      const subs = below.filter(l => l !== author);
      if (subs[0]) meta.subtitle = unspace(subs[0].text);
      if (subs[1]) meta.subtitle2 = unspace(subs[1].text);
      if (author) meta.author = titleCase(unspace(author.text));
      ls.forEach(l => { l.role = 'meta'; });
      continue;
    }
    if (meta.title && ls.length <= 2 && norm(txt) === norm(meta.title)) { ls.forEach(l => { l.role = 'meta'; }); continue; }
    if (ls.length <= 5 && (ls.every(l => cen(l, pages[pi])) || (ls.every(l => l.text.length < 60) && !ls.some(isBody)))) {
      if (!meta.title && ls.some(big)) { meta.title = titleCase(unspace(ls.filter(big).map(l => l.text).join(' '))); ls.forEach(l => { l.role = 'meta'; }); continue; }
      meta.dedication.push(...ls.map(l => l.text)); ls.forEach(l => { l.role = 'meta'; }); continue;
    }
    leftover.push(...ls);
  }

  // ---- body: walk the stream from the first section
  const out = [];
  const capCount = {}, lowCount = {};
  for (const s of stream) if (s.kind === 'line' && isBody(s.l)) s.l.words.forEach((w, k, ws) => {
    const key = w.t.replace(/[^\p{L}]/gu, '').toLowerCase(); if (!key) return;
    const prev = k > 0 ? ws[k - 1].t : '';
    if (k === 0 || /[.!?:"“”]$/.test(prev)) return;
    if (/^\p{Lu}\p{Ll}/u.test(w.t)) capCount[key] = (capCount[key] || 0) + 1; else if (/^\p{Ll}/u.test(w.t)) lowCount[key] = (lowCount[key] || 0) + 1;
  });
  const capWords = { has: k => (capCount[k] || 0) > (lowCount[k] || 0) };
  const noteId = (pi, n) => `p${pi + 1}n${String(n).replace(/\W/g, 'x')}`;
  const noteHome = (pi, n) => { for (let q = pi; q < Math.min(pages.length, pi + 4); q++) if (pages[q].notes && pages[q].notes.some(x => x.n === n)) return q; return -1; };
  const lineText = (l, pi) => {
    const pg = pages[pi];
    return l.words.map(w => {
      let t = w.t, sup = w.sup;
      if (!sup && pages.slice(pi, pi + 3).some(q => q.notes && q.notes.length)) {
        const m = /^(.*[\p{L}.,;:!?”"’)])(\d{1,2})$/u.exec(t);
        if (m && noteHome(pi, m[2]) >= 0 && !/^\d+$/.test(m[1])) { t = m[1]; sup = m[2]; }
      }
      if (sup) {
        const parts = sup.split(/,/);
        const refs = parts.map(n => { const q = noteHome(pi, n); if (q < 0 || (pages[q].usedNotes && pages[q].usedNotes.has(n))) return n.replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]); pages[q].usedNotes = (pages[q].usedNotes || new Set()).add(n); return `[^${noteId(q, n)}]`; });
        t += refs.join(refs.every(r => r.startsWith('[^')) ? '' : ',');
      }
      return t;
    }).join(' ');
  };
  let para = null;   // { kind:'p'|'quote'|'poem'|'center'|'list', lines:[], last }
  let afterHeading = null, pending = [];
  const flush = () => {
    if (!para) return;
    let txt;
    if (para.kind === 'qp') {
      const textW = para.textW || 700;
      // indented on both sides: a poem when the lines are many and ragged, otherwise a quotation
      const ls = para.lines, maxX = Math.max(...ls.map(x => x.x1));
      const ragged = ls.filter(x => maxX - x.x1 > body * 1.5).length / ls.length;
      const avgW = ls.reduce((a, x) => a + (x.x1 - x.x0), 0) / ls.length / textW;
      const poem = !ls.some(x => x.attr) && ls.length >= 4 && ragged >= .5 && avgW < .55;
      if (poem) {
        const stanzas = []; let st = [];
        ls.forEach((x, k) => { if (k && x.gap > 1.5) { stanzas.push(st); st = []; } st.push(x.t); });
        stanzas.push(st);
        out.push('::: poem\n' + stanzas.map(s => s.join('\n')).join('\n\n') + '\n:::');
      } else {
        const paras = []; let cur = '';
        ls.forEach((x, k) => {
          const brk = k && (x.attr || x.gap > 1.45 || x.indent || (ls[k - 1].x1 < maxX - body * 2 && (ENDS_SENTENCE.test(ls[k - 1].t) || /,$/.test(ls[k - 1].t) && (ls[k - 1].x1 - ls[k - 1].x0) < (maxX - Math.min(...ls.map(y => y.x0))) * .5)));
          if (brk && cur) { paras.push(cur); cur = ''; }
          cur = cur ? (cur.endsWith('-') ? hyphenJoin(cur, x.t, hyf) : cur + ' ' + x.t) : x.t;
        });
        if (cur) paras.push(cur);
        out.push(paras.map(x => '> ' + x.replace(/\s+/g, ' ').trim()).join('\n>\n'));
      }
    } else if (para.kind === 'table') {
      out.push(para.rows.map((r, k) => '| ' + r.map(c => c.replace(/\|/g, '/')).join(' | ') + ' |' + (k === 0 ? '\n|' + r.map(() => '---|').join('') : '')).join('\n'));
    } else if (para.kind === 'center') {
      out.push('::: center\n' + para.lines.map(x => x.t).join('\n\n') + '\n:::');
    } else {
      txt = (para.text || '').split(/\n\n/).map(x => x.replace(/\s+/g, ' ').trim()).join('\n\n').trim();
      if (para.kind === 'quote') out.push(txt.split('\n').map(x => ('> ' + x).trimEnd()).join('\n'));
      else if (para.kind === 'list') out.push(para.items.map(x => (para.ordered ? '1. ' : '- ') + x.replace(/\s+/g, ' ').trim()).join('\n'));
      else out.push(fixOpening(txt, para.opening));
    }
    para = null;
  };
  const fixOpening = (t, opening) => {
    if (!opening) return t;
    // drop cap read as a separate letter: "T he archive" -> "The archive"
    t = t.replace(/^(["“‘'(]?)(\p{Lu})\s+(\p{Ll})/u, '$1$2$3');
    // small capitals at the start: "THE HOUSE ON the street" -> "The house on the street"
    const m = /^((?:["“‘(]?[\p{Lu}'’-]{1,}[,.;:]?\s+){1,6})(?=[\p{Ll}\d])/u.exec(t);
    if (m) {
      let k = 0;
      const fixed = m[1].replace(/[\p{L}'’-]+/gu, w => {
        const lw = w.toLowerCase();
        const keep = k === 0 || capWords.has(lw.replace(/[^\p{L}]/gu, ''));
        k++;
        return keep ? lw[0].toUpperCase() + lw.slice(1) : lw;
      });
      t = fixed + t.slice(m[1].length);
    }
    return t;
  };
  const push = (kind, s) => { flush(); out.push(s); };
  let gi = 0, inIndex = null, indexLines = [], dropUntilHeading = false, partJustOpened = false;
  const terms = [];
  const L0 = leftover.length ? leftover : [];
  if (L0.length) out.push(L0.map(l => l.text).join(' '));
  for (let i = firstIdx; i < stream.length; i++) {
    const it = stream[i];
    const pg = it.pg;
    const g = sectGroups[gi] && sectGroups[gi].start === i ? sectGroups[gi] : null;
    if (g) {
      flush(); gi++;
      if (inIndex) { inIndex = null; }
      const title = titleCase(unspace(g.title.trim()));
      const label = g.label.trim();
      if (TOC_TITLE.test(title)) { dropUntilHeading = true; g.lines.forEach(l => { l.role = 'toc'; }); i = g.end - 1; continue; }
      dropUntilHeading = false;
      if (INDEX_TITLE.test(title)) { inIndex = { title }; g.lines.forEach(l => { l.role = 'index'; }); i = g.end - 1; continue; }
      const pageLines = pg.lines.filter(l => l.role === 'text');
      const onlyHeadingOnPage = pageLines.every(l => g.lines.includes(l) || cen(l, pg));
      g.lines.forEach(l => { l.role = 'head'; });
      if (PART_RE.test(label) || (onlyHeadingOnPage && !label && pageLines.length <= g.lines.length + 2 && !isBody(g.lines[0]) && !INTRO_TITLE.test(title) && g.lines.some(big) && !/^(preface|foreword|voorwoord|sources|bronnen|notes|noten|acknowledg)/i.test(title))) {
        const sub = pageLines.filter(l => !g.lines.includes(l)).map(l => l.text).join(' ');
        pageLines.forEach(l => { l.role = 'head'; });
        out.push(`# ${label ? titleCase(label) + ' – ' : ''}${title}` + ((g.sub || sub) ? '\n\n' + (g.sub ? titleCase(g.sub) + (sub ? ' ' + sub : '') : sub) : ''));
        stats.parts++;
        while (i + 1 < stream.length && stream[i + 1].pi === it.pi) i++;
        partJustOpened = true; afterHeading = 'h2';
        continue;
      }
      if (partJustOpened && INTRO_TITLE.test(title)) { partJustOpened = false; afterHeading = 'h2'; i = g.end - 1; continue; }
      partJustOpened = false;
      const star = INTERLUDE_RE.test(label) ? '* ' : '';
      const sub = g.sub ? ' | ' + titleCase(unspace(g.sub)) : '';
      out.push(`## ${star}${title || titleCase(label) || 'Untitled'}${sub}`);
      stats.chapters++;
      afterHeading = 'h2';
      i = g.end - 1;
      continue;
    }
    if (dropUntilHeading && !(it.kind === 'line' && (it.l.force === 'index' || it.l.force === 'table'))) { if (it.kind === 'line') it.l.role = 'toc'; continue; }
    if (it.kind === 'fig') {
      flush();
      out.push(`![](${it.f.name})` + (it.f.caption ? `\n\n*${it.f.caption}*` : ''));
      continue;
    }
    const l = it.l;
    if (l.role !== 'text') continue;
    if (inIndex || l.force === 'index') { indexLines.push(l); l.role = 'index'; continue; }
    const t0 = lineText(l, it.pi).trim().replace(/(\p{L})\s+-$/u, '$1-');
    if (l.force === 'table') {
      // a table the user marked: the lines in the box become its rows, columns found from where the words start
      const block = [];
      for (let j = i; j < stream.length && stream[j].kind === 'line' && stream[j].pi === it.pi && stream[j].l.force === 'table' && stream[j].l.role === 'text'; j++) block.push(stream[j].l);
      flush();
      para = { kind: 'table', rows: forcedGrid(block, body) };
      flush();
      block.forEach(x => { x.role = 'table'; });
      stats.tables++;
      afterHeading = null;
      i += block.length - 1;
      continue;
    }
    if (l.force === 'sub' || l.force === 'cap') {
      // a subheading or a loose caption the user marked: the lines in the box together
      const kind = l.force, parts = [t0];
      l.role = kind;
      let j = i + 1;
      while (j < stream.length && stream[j].kind === 'line' && stream[j].pi === it.pi && stream[j].l.force === kind) { stream[j].l.role = kind; parts.push(lineText(stream[j].l, it.pi).trim()); j++; }
      i = j - 1;
      flush();
      const txt = parts.join(' ').replace(/\s+/g, ' ').trim();
      out.push(kind === 'sub' ? '### ' + txt : '*' + txt + '*');
      afterHeading = kind === 'sub' ? 'h3' : null;
      continue;
    }
    if (!l.force && (MINI_TOC.test(t0) || /^(inthispart|inditdeel|danscettepartie|indiesemteil|enestaparte|inquestaparte)$/.test(t0.replace(/\s+/g, '').toLowerCase()))) { dropUntilHeading = false; l.role = 'toc'; let j = i + 1; while (j < stream.length && stream[j].pi === it.pi && stream[j].kind === 'line') { stream[j].l.role = 'toc'; j++; } i = j - 1; continue; }
    const prevL = it.prev && it.prev.kind === 'line' ? it.prev.l : null;
    const gapAbove = it.first || !prevL ? null : (l.y0 - prevL.y1) / G + .6;
    const width = pg.R - pg.L;
    // scene breaks
    if (ORNAMENT.test(t0) && t0.length <= 12) { flush(); out.push('***'); l.role = 'scene'; continue; }
    // tables: three or more lines whose words start at the same places, in at least two columns
    if (l.force !== 'text') {
      const block = [];
      for (let j = i; j < stream.length && block.length < 60; j++) {
        const sj = stream[j];
        if (sj.kind !== 'line' || sj.pi !== it.pi || sj.l.role !== 'text' || sj.l.size > body * 1.05 || (sj.l.force || '') !== (l.force || '')) break;
        block.push(sj.l);
      }
      if (block.length >= 3) {
        const starts = [];
        block.forEach(ln => ln.words.forEach((w, k) => { if (k === 0 || w.x0 - ln.words[k - 1].x1 > body * .45) starts.push(w.x0); }));
        starts.sort((x, y) => x - y);
        const cols = [];
        for (const x of starts) { const c = cols.find(c => Math.abs(c.x - x) < body * .8); if (c) { c.n++; c.x = (c.x * (c.n - 1) + x) / c.n; } else cols.push({ x, n: 1 }); }
        let rows = 0;
        const strong = cols.filter(c => c.n >= 3).map(c => c.x).sort((x, y) => x - y);
        const rowCols = ln => { const r = strong.map(() => ''); ln.words.forEach(w => { let k = 0; strong.forEach((x, q) => { if (w.x0 >= x - body * .8) k = q; }); r[k] = r[k] ? r[k] + ' ' + w.t : w.t; }); return r; };
        let take = 0;
        const gapOk = ln => { let prevEnd = null, prevCol = -1, ok = true, cells = 0; ln.words.forEach(w => { let k = 0; strong.forEach((x, q) => { if (w.x0 >= x - body * .8) k = q; }); if (k !== prevCol) { cells++; if (prevEnd != null && w.x0 - prevEnd < body * .9) ok = false; prevCol = k; } prevEnd = w.x1; }); return ok && cells >= 2; };
        for (const ln of block) { if (strong.length >= 2 && gapOk(ln)) { rows++; take++; } else break; }
        const justified = block.slice(0, take).filter(ln => Math.abs(ln.x1 - pg.R) < body * .6).length > take * .6;
        if (take >= 3 && strong.length >= 2 && strong.length <= 8 && !justified) {
          flush();
          const grid = block.slice(0, take).map(rowCols);
          if (grid[0].every(x => !x || isUpper(x))) grid[0] = grid[0].map(x => titleCase(x));
          para = { kind: 'table', rows: grid };
          flush();
          for (let q = 0; q < take; q++) stream[i + q].l.role = 'table';
          stats.tables++;
          afterHeading = null;
          i += take - 1;
          continue;
        }
      }
    }
    // headings inside a chapter
    const short = (l.x1 - l.x0) < width * .72;
    const nextIt = stream[i + 1];
    if (!l.force && short && gapAbove != null && gapAbove >= 1.5 && !ENDS_SENTENCE.test(t0) && t0.length < 80 && (l.size >= body * 1.06 || isUpper(t0)) && nextIt && nextIt.kind === 'line' && nextIt.pi === it.pi) {
      flush();
      out.push(cen(l, pg) && isUpper(t0) ? `### § ${titleCase(t0)}` : `### ${t0}`);
      l.role = 'sub'; afterHeading = 'h3';
      continue;
    }
    if (gapAbove != null && gapAbove > 2.8 && para && afterHeading == null && prevL && prevL.role !== 'head' && prevL.role !== 'sub' && (l.x1 - l.x0) > (pg.R - pg.L) * .8) { flush(); out.push('***'); }
    // block quotations, poems, centred lines, lists
    const leftIn = l.x0 - pg.L, rightIn = pg.R - l.x1;
    const attribution = /^[—–-]\s?\S/.test(t0) && rightIn < body * 1.2 && leftIn > width * .3;
    const isCentred = l.force !== 'text' && cen(l, pg) && l.text.length < 70;
    const isQuoteLine = l.force === 'quote' || (l.force !== 'text' && ((leftIn >= body * 1.3 && rightIn >= body * 1.3) || attribution || (leftIn >= body * 3 && (afterHeading === 'h2' || (para && para.kind === 'qp')))));
    const listM = /^([•·▪◦–*«»-]|[oe](?=\s+\p{Lu})|\d{1,2}[.)])\s+(.*)$/u.exec(t0);
    if ((isQuoteLine && (!isCentred || l.force === 'quote')) || (attribution && para && para.kind === 'qp')) {
      if (!para || para.kind !== 'qp') { flush(); para = { kind: 'qp', lines: [], epigraph: afterHeading === 'h2', textW: pg.R - pg.L }; }
      para.lines.push({ t: t0, x0: l.x0, x1: l.x1, gap: gapAbove || 0, attr: attribution, indent: para.lines.length && l.x0 - para.lines[para.lines.length - 1].x0 > body * .7 });
      l.role = 'quote';
      continue;
    }
    if (isCentred && afterHeading == null && !isBody(l) && (!para || para.kind === 'center' || (prevL && ENDS_SENTENCE.test(prevL.text)))) {
      if (!para || para.kind !== 'center') { flush(); para = { kind: 'center', lines: [] }; }
      para.lines.push({ t: t0 }); l.role = 'center';
      continue;
    }
    if (listM && leftIn < body * 3) {
      if (!para || para.kind !== 'list') { flush(); para = { kind: 'list', items: [], ordered: /\d/.test(listM[1]) }; }
      para.items.push(listM[2]); para.last = l;
      continue;
    }
    if (para && para.kind === 'list' && leftIn > body * .6 && leftIn < body * 4) { const k = para.items.length - 1; para.items[k] = para.items[k].endsWith('-') ? hyphenJoin(para.items[k], t0, hyf) : para.items[k] + ' ' + t0; continue; }
    // ordinary paragraphs
    const indent = leftIn > body * .7 && leftIn < body * 4.5;
    const prevShortEnded = para && para.kind === 'p' && para.last && (pages[para.last.p].R - para.last.x1) > body * 2.2 && ENDS_SENTENCE.test(para.last.text);
    const prevT = para && para.kind === 'p' && para.last ? para.last.text : '';
    const prevShort = para && para.kind === 'p' && para.last && (pages[para.last.p].R - para.last.x1) > body * 2.2;
    // an indent only starts a paragraph after a finished sentence (the second line beside a drop cap is indented too)
    const newPara = !para || para.kind !== 'p' || (indent && (ENDS_SENTENCE.test(prevT) || prevShort)) || prevShortEnded || (gapAbove != null && gapAbove > 1.45);
    if (newPara) {
      flush();
      para = { kind: 'p', text: t0, opening: afterHeading != null, last: l };
      afterHeading = null;
    } else {
      para.text = para.text.endsWith('-') ? hyphenJoin(para.text, t0, hyf) : para.text + ' ' + t0;
      para.last = l;
    }
  }
  flush();
  // footnote definitions go at the end of the chapter they belong to
  const defs = [];
  pages.forEach((pg, pi) => (pg.notes || []).forEach(n => {
    const id = noteId(pi, n.n);
    if (pg.usedNotes && pg.usedNotes.has(n.n)) defs.push({ pi, line: `[^${id}]: ${n.text}` });
    else defs.push({ pi, line: `${n.n.replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])} ${n.text}`, loose: true });
  }));
  // index pages -> index terms
  if (indexLines.length) {
    let inverted = 0;
    for (const l of indexLines) {
      const m = /^(.+?)[\s,]+((?:\d{1,4}(?:[–-]\d{1,4})?(?:,\s*)?)+)\s*$/.exec(l.text.trim());
      if (!m) continue;
      let name = m[1].replace(/[,.\s]+$/, '').trim();
      if (name.length < 3 || /^\p{L}$/u.test(name)) continue;
      const parts = name.split(/,\s*/);
      if (parts.length === 2) { inverted++; name = parts[1] + ' ' + parts[0]; }
      terms.push(name);
    }
    if (terms.length) { meta.index = [...new Set(terms)]; if (inverted > terms.length / 2) meta.index_sort = 'surname'; }
  }
  // assemble: put footnote definitions after the chapter that holds their page
  let md = out.join('\n\n');
  if (defs.length) {
    const blocks = md.split(/\n(?=## |# )/);
    const used = defs.filter(d => !d.loose);
    if (used.length) {
      // append each definition to the section where its reference appears
      for (const d of used) {
        const ref = d.line.slice(0, d.line.indexOf(']:') + 1);
        const k = blocks.findIndex(b => b.includes(ref));
        if (k >= 0) blocks[k] = blocks[k].replace(/\s*$/, '') + '\n\n' + d.line;
      }
    }
    md = blocks.join('\n\n');
    const loose = defs.filter(d => d.loose);
    if (loose.length) md += '\n\n## Notes\n\n' + loose.map(d => d.line).join('\n\n');
  }
  md = md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  meta.lang = KIT_LANG[opt.langs[0]] || 'en';
  if (!meta.colophon.length) delete meta.colophon;
  if (!meta.dedication.length) delete meta.dedication;
  return { md, meta, stats, body, G };
}

global.BKOCR = { analyze, hyphenJoin, titleCase, isUpper, median, pct };
})(typeof window !== 'undefined' ? window : globalThis);
