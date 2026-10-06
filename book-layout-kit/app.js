/* Book Layout Kit – app: import, settings, structure, preview, build and downloads. */
(function () {
'use strict';
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
const STORE = 'blk-state-v1';
const S = { cfg: null, md: '', isSample: false, assets: new Map(), model: null, pdf: null, epub: null, pdfDoc: null, page: 1, view: 'cover', busy: false, stale: true, guides: true };

pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
// as a local file, browsers refuse web workers: run pdf.js on the main thread instead
let pdfReady = null;
const pdfjs = () => pdfReady || (pdfReady = location.protocol === 'file:' ? BK.loadScript('lib/pdf.worker.min.js') : Promise.resolve());

// ---------------------------------------------------------------- state
function merge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], v);
    else base[k] = v;
  }
  return base;
}
function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
  if (saved && saved.md != null) {
    S.cfg = merge(BK.defaults(), saved.cfg || {});
    S.md = saved.md; S.isSample = !!saved.isSample;
  } else {
    S.cfg = merge(BK.defaults(), BK_SAMPLE.cfg);
    S.md = BK_SAMPLE.md; S.isSample = true;
  }
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify({ cfg: S.cfg, md: S.md, isSample: S.isSample })); } catch (e) { /* storage full or blocked */ } }, 400);
}

// ---------------------------------------------------------------- ui helpers
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3600); }
function status(msg) { $('#status').textContent = msg; }
const fmtBytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' kB';
const outName = () => (S.cfg.output || (S.cfg.title || 'book').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'book');
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------------------------------------------------------------- downloads
let dl = null;
const dlReady = (async () => { try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; } return dl; })();
async function saveFile(filename, data) {
  await dlReady;
  if (!dl) {
    if (window.claude) { toast('Saving files is not available in this view. Open the page on claude.ai to download.'); return; }
    // outside Claude: an ordinary browser download
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Saved ' + filename);
    return;
  }
  try { await dl.save({ filename, data }); toast('Saved ' + filename); }
  catch (e) {
    const c = e && e.code;
    if (c === 'declined') toast('Download cancelled.');
    else if (c === 'rate_limited') toast('A save prompt is already open. Try again in a moment.');
    else if (c === 'too_large') toast('That file is too large to save here.');
    else toast('Could not save ' + filename + (e && e.message ? ': ' + e.message : '.'));
  }
}

// ---------------------------------------------------------------- tabs and views
function showTab(name) {
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('.panel').forEach(p => { p.hidden = p.id !== 'panel-' + name; });
  try { sessionStorage.setItem('blk-tab', name); } catch (e) { /* ignore */ }
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

function setView(v) {
  S.view = v;
  $$('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  $('#pager').hidden = v !== 'pages' || !S.pdfDoc;
  $('#guidesLbl').hidden = v !== 'wrap';
  if (v === 'cover') drawCovers(); else if (v === 'wrap') drawWrapView(); else if (v === 'scan') { if (window.BKO) window.BKO.render(); } else renderSpread();
}
$$('#viewSeg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));

// ---------------------------------------------------------------- parse + structure
const reparse = debounce(() => { parse(); }, 350);
function parse() {
  try { S.model = BK.parse(S.md, S.cfg); }
  catch (e) { console.error(e); S.model = null; status('The text could not be read: ' + e.message); return; }
  renderStructure(); renderAssets(); renderWordInfo();
}
function renderWordInfo() {
  const m = S.model;
  if (!m) return;
  const secs = m.front.concat(m.back, BK.chaptersOf(m));
  const words = secs.reduce((a, s) => a + s.words, 0);
  const G = BK.geom(S.cfg);
  const perPage = Math.round((G.TW / 115) * (G.TH / 173) * 330 * Math.pow(10.5 / G.FS, 2));
  $('#wordInfo').textContent = `${words.toLocaleString('en')} words · ${BK.chaptersOf(m).length} chapters · roughly ${Math.max(1, Math.round(words / perPage))} pages of text`;
}
function renderStructure() {
  const m = S.model, out = $('#outline');
  out.innerHTML = '';
  if (!m) return;
  const L = BK.labels(S.cfg);
  const st = $('#structStats');
  const ch = BK.chaptersOf(m);
  st.innerHTML = `<span><b>${m.front.length}</b> front</span><span><b>${m.parts.filter(p => p.pid).length}</b> parts</span><span><b>${ch.length}</b> chapters</span><span><b>${m.back.length}</b> back</span><span><b>${m.terms.length}</b> index terms</span>`;
  const w = $('#structWarn'); w.innerHTML = '';
  m.warnings.forEach(x => { const d = document.createElement('div'); d.className = 'warn'; d.textContent = x; w.append(d); });
  for (const o of m.outline) {
    if (o.type === 'part') {
      const d = document.createElement('div'); d.className = 'ol-part';
      d.innerHTML = `<div class="pl"></div><div class="pt"></div>`;
      d.querySelector('.pl').textContent = o.label || 'Part';
      d.querySelector('.pt').textContent = o.title;
      d.classList.toggle('off', !!o.part.excludedPage);
      { const lb = document.createElement('label'); lb.className = 'pintro';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !o.part.excludedPage;
        lb.append(cb, document.createTextNode(' Part title page'));
        cb.addEventListener('change', () => {
          S.cfg.excluded = S.cfg.excluded || {};
          if (cb.checked) delete S.cfg.excluded[o.key]; else S.cfg.excluded[o.key] = true;
          changed(); parse();
        });
        d.append(lb); }
      if (o.part.hasIntro && !o.part.skip) {
        const lb = document.createElement('label'); lb.className = 'pintro';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !o.part.introOff;
        lb.append(cb, document.createTextNode(' Introduction page'));
        cb.addEventListener('change', () => {
          S.cfg.part_intro_off = S.cfg.part_intro_off || {};
          if (cb.checked) delete S.cfg.part_intro_off[o.key]; else S.cfg.part_intro_off[o.key] = true;
          changed(); parse();
        });
        d.append(lb);
      }
      out.append(d); continue;
    }
    const s = o.sec;
    const row = document.createElement('div');
    row.className = 'ol-sec' + (S.cfg.roles[s.key] && S.cfg.roles[s.key] !== s.guessed ? ' changed' : '');
    const no = s.excluded ? '–' : s.role === 'chapter' || s.role === 'appendix' ? BK.chapNo(s.num, S.cfg) || '·' : (s.role === 'interlude' ? '*' : s.role === 'plain' ? '–' : (s.role === 'front' ? 'F' : 'B'));
    row.classList.toggle('off', !!s.excluded);
    row.innerHTML = `<input type="checkbox" class="inc" title="Include in the book" aria-label="Include in the book"><span class="no"></span><div class="t"><div></div><div class="s"></div></div><select aria-label="Role"></select>`;
    { const inc = row.querySelector('.inc'); inc.checked = !s.excluded;
      inc.addEventListener('change', () => {
        S.cfg.excluded = S.cfg.excluded || {};
        if (inc.checked) delete S.cfg.excluded[s.key]; else S.cfg.excluded[s.key] = true;
        changed(); parse();
      }); }
    row.querySelector('.no').textContent = no;
    row.querySelector('.t div').textContent = s.title || '(untitled)';
    row.querySelector('.s').textContent = [s.sub, s.words.toLocaleString('en') + (s.words === 1 ? ' word' : ' words'), s.notes.length ? s.notes.length + ' notes' : ''].filter(Boolean).join(' · ');
    const sel = row.querySelector('select');
    for (const [v, lab] of Object.entries(BK.ROLES)) { const op = new Option(lab, v); sel.append(op); }
    sel.value = s.role;
    sel.addEventListener('change', () => {
      if (sel.value === s.guessed) delete S.cfg.roles[s.key]; else S.cfg.roles[s.key] = sel.value;
      changed(); parse();
    });
    out.append(row);
  }
  if (!m.outline.length) out.innerHTML = '<p class="hint">No headings yet. Add “## Title” lines, or use Auto-format on the Manuscript tab.</p>';
}

// ---------------------------------------------------------------- images
function renderAssets() {
  const box = $('#assets'); box.innerHTML = '';
  const refs = S.model ? BK.referencedImages(S.model, S.cfg) : new Map();
  const seen = new Set();
  for (const [name, a] of S.assets) {
    const d = document.createElement('div'); d.className = 'asset';
    const used = [...refs.keys()].some(r => BK.findAsset(new Map([[name, a]]), r));
    d.innerHTML = `<img alt=""><div></div><div class="px"></div>`;
    d.querySelector('img').src = a.dataURL;
    d.querySelector('div').textContent = name;
    d.querySelector('.px').textContent = `${a.w}×${a.h}${used ? '' : ' · unused'}`;
    d.title = name;
    box.append(d); seen.add(name);
  }
  for (const [src, kind] of refs) {
    if (BK.findAsset(S.assets, src)) continue;
    const d = document.createElement('div'); d.className = 'asset missing';
    d.innerHTML = `<div class="ph">missing</div><div></div>`;
    d.querySelectorAll('div')[1].textContent = src;
    d.title = src + ' is used in the text but has not been added';
    box.append(d);
  }
  const missing = [...refs.keys()].filter(r => !BK.findAsset(S.assets, r)).length;
  $('#assetHint').innerHTML = missing
    ? `<b>${missing} image${missing > 1 ? 's' : ''} missing.</b> Add files with the same names. Images stay in this browser tab only.`
    : 'Images you add stay in this browser tab only. Refer to them by file name in the text.';
  if (typeof renderKdp === 'function') renderKdp();
}
async function fileToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
async function addImage(name, blob) {
  let url = await fileToDataURL(blob);
  let im;
  try { im = await BK.loadImg(url); } catch (e) { toast(name + ' is not an image this browser can read.'); return null; }
  let w = im.naturalWidth, h = im.naturalHeight, mime = blob.type || (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg');
  const isPng = /png/.test(mime);
  if (!/^image\/(jpeg|png)$/.test(mime) || Math.max(w, h) > 3200) {
    const s = Math.min(1, 3200 / Math.max(w, h));
    const cv = BK.canvasOf(w * s, h * s), c = cv.getContext('2d');
    if (!isPng) { c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); }
    c.drawImage(im, 0, 0, cv.width, cv.height);
    url = cv.toDataURL(isPng ? 'image/png' : 'image/jpeg', .92);
    w = cv.width; h = cv.height; mime = isPng ? 'image/png' : 'image/jpeg';
  }
  const a = { name, dataURL: url, w, h, mime };
  S.assets.set(name, a);
  return a;
}

// ---------------------------------------------------------------- importers
const ext = n => (n.split('.').pop() || '').toLowerCase();
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];

function tidyHeads(md) {
  // "# Part One: Title" -> "# Part One – Title"; "## Chapter 3: Title" -> "## Title"
  md = md.replace(/^# +((?:part|deel|partie|teil|book|boek|livre|parte)\s+[^\s:.–—-]+)\s*[:.–—-]\s*(.+)$/gim, '# $1 – $2');
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^## +(?:chapter|hoofdstuk|chapitre|kapitel|cap[ií]tulo|capitolo)\s+([0-9]+|[ivxlcdm]+|[a-zà-ü]+)\.?\s*(?:[:.–—-]\s*)?(.*)$/i.exec(lines[i]);
    if (!m) continue;
    if (m[2].trim()) { lines[i] = '## ' + m[2].trim(); continue; }
    let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
    const nxt = (lines[j] || '').trim();
    if (nxt && nxt.length < 70 && !/[.,;!?]$/.test(nxt) && !/^[#!>|*-]/.test(nxt)) { lines[i] = '## ' + nxt.replace(/^\*+|\*+$/g, ''); lines[j] = ''; }
  }
  return lines.join('\n');
}
function normalizeHeadings(md) {
  const h1 = (md.match(/^# /gm) || []).length, h2 = (md.match(/^## /gm) || []).length;
  const shift = () => md.replace(/^(#{1,5}) /gm, '#$1 ');
  if (h1 && !h2) return shift();
  if (h1 && h2) {
    const partLike = (md.match(/^# .*/gm) || []).every(l => /^# +(part|deel|partie|teil|book|boek|livre|parte)\b/i.test(l));
    if (!partLike && h1 >= h2 / 2) return shift();
  }
  return md;
}
BK.txtToMd = function (t, keepMarkdown) {
  t = t.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const lines = t.split('\n');
  const blanks = lines.filter(l => !l.trim()).length;
  const onePerLine = !keepMarkdown && lines.length > 20 && blanks < lines.length * .06;
  const CH = /^(chapter|hoofdstuk|chapitre|kapitel|cap[ií]tulo|capitolo)\s+([0-9]+|[ivxlcdm]+|[a-zà-ü]+)\b\.?\s*(?:[:.–—-]\s*)?(.*)$/i;
  const PT = /^(part|deel|partie|teil|book|boek|livre|parte)\s+([0-9]+|[ivxlcdm]+|[a-zà-ü]+)\b\.?\s*(?:[:.–—-]\s*)?(.*)$/i;
  const NAMED = /^(prologue|epilogue|proloog|epiloog|preface|foreword|voorwoord|introduction|inleiding|afterword|nawoord|acknowledg(e)?ments?|dankwoord|notes|sources|bronnen|bibliography|about the author)$/i;
  const SCENE = /^\s*(\*\s*){3,}$|^\s*#\s*$|^\s*~{2,}\s*$|^\s*(-\s*){3,}$/;
  const out = [];
  const nextLine = i => { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; return j; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], s = l.trim();
    if (/^#{1,6} /.test(s) && keepMarkdown) { out.push(l); continue; }
    const prevBlank = i === 0 || !lines[i - 1].trim() || onePerLine;
    const short = s.length > 0 && s.length < 70;
    let m;
    if (SCENE.test(l) && !keepMarkdown) { out.push('', '***', ''); continue; }
    if (short && prevBlank && (m = PT.exec(s)) && !/[.!?]$/.test(m[3])) {
      let title = m[3].trim();
      if (!title) { const j = nextLine(i), n = (lines[j] || '').trim(); if (n && n.length < 70 && !/[.,;!?]$/.test(n) && !CH.test(n)) { title = n; i = j; } }
      out.push('', `# ${m[1]} ${m[2]}${title ? ' – ' + title : ''}`, ''); continue;
    }
    if (short && prevBlank && (m = CH.exec(s)) && !/[.!?,;]$/.test(m[3])) {
      let title = m[3].trim();
      if (!title) { const j = nextLine(i), n = (lines[j] || '').trim(); if (n && n.length < 70 && !/[.,;!?]$/.test(n) && !CH.test(n) && !PT.test(n)) { title = n; i = j; } }
      out.push('', '## ' + (title || `${m[1]} ${m[2]}`), ''); continue;
    }
    if (short && prevBlank && (i === lines.length - 1 || !lines[i + 1].trim()) && NAMED.test(s)) { out.push('', '## ' + s, ''); continue; }
    out.push(onePerLine ? l + '\n' : l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
};

function turndown() {
  const td = new TurndownService({ headingStyle: 'atx', emDelimiter: '*', strongDelimiter: '**', hr: '***', bulletListMarker: '-', codeBlockStyle: 'fenced' });
  td.remove(['script', 'style', 'noscript', 'iframe']);
  td.addRule('sup', { filter: 'sup', replacement: c => /^\d+$/.test(c) ? c.replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]) : c });
  return td;
}
async function docxToMd(buf) {
  let n = 0;
  const imgs = [], meta = {};
  const res = await mammoth.convertToHtml({ arrayBuffer: buf }, {
    styleMap: ["p[style-name='Title'] => h1.doctitle:fresh", "p[style-name='Subtitle'] => p.docsubtitle:fresh", "p[style-name='Quote'] => blockquote > p:fresh", "p[style-name='Intense Quote'] => blockquote > p:fresh"],
    convertImage: mammoth.images.imgElement(async img => {
      if (!/^image\/(png|jpe?g|gif|webp|bmp)$/.test(img.contentType)) return { src: '' };
      const b64 = await img.read('base64');
      const name = `docx-image-${++n}.${/png/.test(img.contentType) ? 'png' : 'jpg'}`;
      imgs.push({ name, blob: await (await fetch(`data:${img.contentType};base64,${b64}`)).blob() });
      return { src: name };
    })
  });
  const doc = new DOMParser().parseFromString('<body>' + res.value + '</body>', 'text/html');
  const t = doc.querySelector('h1.doctitle'); if (t) { meta.title = t.textContent.trim(); t.remove(); }
  const st = doc.querySelector('p.docsubtitle'); if (st) { meta.subtitle = st.textContent.trim(); st.remove(); }
  doc.querySelectorAll('img[src=""]').forEach(x => x.remove());
  // footnotes and endnotes -> [^n] with the definition after the paragraph that cites it
  const notes = {};
  doc.querySelectorAll('li[id^="footnote-"], li[id^="endnote-"]').forEach(li => {
    li.querySelectorAll('a[href^="#footnote-ref-"], a[href^="#endnote-ref-"]').forEach(a => a.remove());
    notes[li.id] = turndown().turndown(li.innerHTML).replace(/\n+/g, ' ').trim();
    const ol = li.parentElement; li.remove(); if (ol && !ol.children.length) ol.remove();
  });
  doc.querySelectorAll('a[href^="#footnote-"], a[href^="#endnote-"]').forEach(a => {
    const id = a.getAttribute('href').slice(1), num = id.replace(/\D+/g, '') + (id.startsWith('end') ? 'e' : '');
    const holder = a.closest('sup') || a;
    const block = holder.closest('p, li, blockquote, h1, h2, h3, h4, td') || holder.parentElement;
    holder.replaceWith(doc.createTextNode(`[^${num}]`));
    if (notes[id] != null && block) { const p = doc.createElement('p'); p.textContent = `[^${num}]: ${notes[id]}`; block.after(p); }
  });
  let md = turndown().turndown(doc.body.innerHTML);
  md = BK.unescapeExport(md).replace(/\\([#>+.-])/g, '$1');
  md = tidyHeads(normalizeHeadings(md));
  return { md, imgs, meta };
}
async function docxMeta(buf) {
  try {
    const z = await JSZip.loadAsync(buf);
    const f = z.file('docProps/core.xml'); if (!f) return {};
    const x = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
    const g = tag => { const el = x.getElementsByTagName(tag)[0]; return el ? el.textContent.trim() : ''; };
    return { title: g('dc:title'), author: g('dc:creator') };
  } catch (e) { return {}; }
}
function htmlToMd(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = { title: (doc.querySelector('title') || {}).textContent || '' };
  let md = turndown().turndown(doc.body ? doc.body.innerHTML : html);
  md = BK.unescapeExport(md).replace(/\\([#>+.-])/g, '$1');
  return { md: tidyHeads(normalizeHeadings(md)), meta };
}
async function pdfToMd(buf) {
  await pdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const lines = [];
  const meta = {};
  try { const md = await pdf.getMetadata(); meta.title = md.info && md.info.Title || ''; meta.author = md.info && md.info.Author || ''; } catch (e) { /* none */ }
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str !== undefined).map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.hypot(it.transform[2], it.transform[3]) || it.height, w: it.width, eol: it.hasEOL }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const it of items) {
      if (!it.s.trim() && !cur) continue;
      if (cur && Math.abs(cur.y - it.y) < Math.max(2, cur.h * .45)) {
        const gap = it.x - cur.xe;
        cur.t += (gap > cur.h * .2 && !/\s$/.test(cur.t) && !/^\s/.test(it.s) ? ' ' : '') + it.s;
        cur.xe = Math.max(cur.xe, it.x + it.w); cur.h = Math.max(cur.h, it.s.trim() ? it.h : 0);
      } else {
        if (cur) lines.push(cur);
        cur = { t: it.s, x: it.x, xe: it.x + it.w, y: it.y, h: it.s.trim() ? it.h : 0, page: p, ph: vp.height, pw: vp.width };
      }
    }
    if (cur) lines.push(cur);
    page.cleanup();
  }
  // drop running heads and page numbers
  const norm = s => s.replace(/\d+/g, '#').trim().toLowerCase();
  const freq = {};
  lines.forEach(l => { if (l.y > l.ph * .92 || l.y < l.ph * .08) freq[norm(l.t)] = (freq[norm(l.t)] || 0) + 1; });
  const body = lines.filter(l => {
    const edge = l.y > l.ph * .92 || l.y < l.ph * .08;
    if (!l.t.trim()) return false;
    if (edge && (/^\s*[\divxlc]+\s*$/i.test(l.t) || freq[norm(l.t)] >= 3)) return false;
    return true;
  });
  if (!body.length) return { md: '', meta, scanned: true };
  const sizes = {};
  body.forEach(l => { const k = Math.round(l.h * 2) / 2; sizes[k] = (sizes[k] || 0) + l.t.length; });
  const bodySize = +Object.entries(sizes).sort((a, b) => b[1] - a[1])[0][0];
  const minX = Math.min(...body.filter(l => Math.abs(l.h - bodySize) < 1).map(l => l.x));
  const maxW = Math.max(...body.filter(l => Math.abs(l.h - bodySize) < 1).map(l => l.xe - l.x));
  const gaps = [];
  for (let i = 1; i < body.length; i++) if (body[i].page === body[i - 1].page && Math.abs(body[i].h - bodySize) < 1) gaps.push(body[i - 1].y - body[i].y);
  gaps.sort((a, b) => a - b);
  const step = gaps[gaps.length >> 1] || bodySize * 1.3;
  const headSizes = [...new Set(body.filter(l => l.h >= bodySize * 1.2 && l.t.length < 90).map(l => Math.round(l.h)))].sort((a, b) => b - a);
  const tierCount = headSizes.map(s => body.filter(l => Math.round(l.h) === s).length);
  let lvl = {};
  if (headSizes.length >= 2 && tierCount[0] * 2 <= tierCount[1]) { lvl[headSizes[0]] = '#'; lvl[headSizes[1]] = '##'; headSizes.slice(2).forEach(s => { lvl[s] = '###'; }); }
  else { headSizes.forEach((s, i) => { lvl[s] = i === 0 ? '##' : '###'; }); }
  const out = [];
  let para = '', prev = null, head = null;
  const flushPara = () => { if (para.trim()) out.push(para.trim(), ''); para = ''; };
  const flushHead = () => { if (head) { out.push(head.lv + ' ' + head.t.trim(), ''); head = null; } };
  for (const l of body) {
    const lv = lvl[Math.round(l.h)];
    if (lv && l.h >= bodySize * 1.2) {
      flushPara();
      if (head && head.lv === lv && prev && prev.page === l.page && prev.y - l.y < l.h * 2) head.t += ' ' + l.t;
      else { flushHead(); head = { lv, t: l.t }; }
      prev = l; continue;
    }
    flushHead();
    let newPara = !prev;
    if (prev) {
      const sameP = prev.page === l.page;
      const gap = prev.y - l.y;
      const ended = /[.!?:"”’)]$/.test(prev.t.trim());
      const shortPrev = (prev.xe - prev.x) < maxW * .82;
      const indented = l.x > minX + bodySize * .9;
      if (sameP && gap > step * 1.55) newPara = true;
      else if (indented && ended) newPara = true;
      else if (shortPrev && ended) newPara = true;
      else if (!sameP && ended && indented) newPara = true;
    }
    if (newPara) flushPara();
    const t = l.t.trim();
    if (para && /[A-Za-zÀ-ÿ]-$/.test(para) && /^[a-zà-ÿ]/.test(t)) para = para.slice(0, -1) + t;
    else para += (para ? ' ' : '') + t;
    prev = l;
  }
  flushPara(); flushHead();
  let md = out.join('\n');
  md = md.replace(/^\s*(\*\s*){3,}\s*$/gm, '***');
  return { md: tidyHeads(md), meta };
}
async function odtToMd(buf) {
  const z = await JSZip.loadAsync(buf);
  const x = new DOMParser().parseFromString(await z.file('content.xml').async('string'), 'application/xml');
  const imgs = [];
  let notes = 0;
  const inline = el => {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { s += n.nodeValue; continue; }
      const ln = n.localName;
      if (ln === 's') s += ' '.repeat(+n.getAttribute('text:c') || 1);
      else if (ln === 'tab') s += ' ';
      else if (ln === 'line-break') s += '  \n';
      else if (ln === 'note') { const id = ++notes; const b = n.getElementsByTagNameNS('*', 'note-body')[0]; s += `[^${id}]`; pendingNotes.push(`[^${id}]: ${b ? b.textContent.trim() : ''}`); }
      else if (ln === 'frame') { const im = n.getElementsByTagNameNS('*', 'image')[0]; if (im) { const href = im.getAttribute('xlink:href'); if (href && z.file(href)) { const name = href.split('/').pop(); imgs.push({ name, file: z.file(href) }); s += `\n\n![](${name})\n\n`; } } }
      else s += inline(n);
    }
    return s;
  };
  let pendingNotes = [];
  const out = [];
  const walk = el => {
    for (const n of el.children) {
      const ln = n.localName;
      if (ln === 'h') { out.push('#'.repeat(Math.min(4, +n.getAttribute('text:outline-level') || 1)) + ' ' + inline(n).trim(), ''); }
      else if (ln === 'p') { const t = inline(n).trim(); if (t) out.push(t, ''); out.push(...pendingNotes.flatMap(p => [p, ''])); pendingNotes = []; }
      else if (ln === 'list') { for (const it of n.children) out.push('- ' + inline(it).trim()); out.push(''); }
      else if (ln === 'section' || ln === 'table' || ln === 'table-row' || ln === 'table-cell' || ln === 'text') walk(n);
    }
  };
  const body = x.getElementsByTagNameNS('*', 'text');
  const textEl = [...body].find(e => e.parentNode && e.parentNode.localName === 'body');
  if (textEl) walk(textEl);
  const md = tidyHeads(normalizeHeadings(out.join('\n')));
  const blobs = await Promise.all(imgs.map(async i => ({ name: i.name, blob: new Blob([await i.file.async('arraybuffer')], { type: /png$/i.test(i.name) ? 'image/png' : 'image/jpeg' }) })));
  return { md, imgs: blobs, meta: {} };
}

// ---- book.json <-> settings
const FONT_BY_PREFIX = Object.fromEntries(Object.entries(BK.FONTS).map(([k, v]) => [v.prefix, k]));
function parsePos(p) {
  const out = { x: 50, y: 50 };
  const words = String(p || 'center').trim().split(/\s+/);
  const kw = { left: ['x', 0], right: ['x', 100], top: ['y', 0], bottom: ['y', 100] };
  const nums = [];
  words.forEach(w => { if (kw[w]) out[kw[w][0]] = kw[w][1]; else if (/%$/.test(w)) nums.push(parseFloat(w)); });
  if (nums.length) { out.x = nums[0]; if (nums[1] != null) out.y = nums[1]; }
  return out;
}
function fromKitJson(j) {
  const c = BK.defaults();
  for (const k of ['title', 'subtitle', 'subtitle2', 'author', 'lang', 'output', 'page', 'font_size', 'opener', 'chapter_number_style', 'chapter_word', 'chapter_break', 'scene_break',
    'toc', 'part_minitoc', 'parts_in_book', 'excluded', 'dedication', 'epigraph', 'colophon', 'labels', 'index', 'index_sort', 'index_exclude', 'index_particles', 'bw_maps', 'description', 'extra_epub_css']) if (j[k] !== undefined) c[k] = j[k];
  if (j.chapter_numbers === false && !j.chapter_number_style) c.chapter_number_style = 'none';
  if (j.running_heads) c.running_heads = Object.assign(c.running_heads, j.running_heads);
  if (j.photos) c.photos = Object.assign(c.photos, j.photos);
  if (j.kdp && typeof j.kdp === 'object') c.kdp = Object.assign(c.kdp, j.kdp, { on: j.kdp.on !== false });
  if (j.font && j.font.prefix && FONT_BY_PREFIX[j.font.prefix]) c.font = FONT_BY_PREFIX[j.font.prefix];
  if (j.cover) {
    Object.assign(c.cover, j.cover);
    if (!j.cover.style) c.cover.style = 'auto';
    const p = parsePos(j.cover.image_position); c.cover.image_x = p.x; c.cover.image_y = p.y;
    delete c.cover.image_position;
  }
  return c;
}
function toKitJson(files, cfgIn) {
  const c = cfgIn || S.cfg, j = {};
  for (const k of ['title', 'subtitle', 'subtitle2', 'author', 'lang']) if (c[k]) j[k] = c[k];
  j.output = c.output || (c.title || 'book').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'book';
  Object.assign(j, files);
  j.page = c.page;
  if (c.font_size) j.font_size = c.font_size;
  if (c.font !== 'ebgaramond') j.font = { family: BK.FONTS[c.font].name, prefix: BK.FONTS[c.font].prefix };
  for (const k of ['opener', 'chapter_number_style', 'chapter_word', 'chapter_break', 'running_heads', 'scene_break', 'toc', 'part_minitoc', 'parts_in_book', 'index', 'bw_maps', 'photos']) j[k] = c[k];
  if (j.chapter_word !== 'hide') delete j.chapter_word;
  if (c.index_sort) j.index_sort = c.index_sort;
  if (c.index_exclude && c.index_exclude.length) j.index_exclude = c.index_exclude;
  for (const k of ['dedication', 'colophon']) if (c[k] && c[k].length) j[k] = c[k];
  if (c.epigraph) j.epigraph = c.epigraph;
  if (c.labels && Object.keys(c.labels).length) j.labels = c.labels;
  if (c.description) j.description = c.description;
  if (c.kdp && c.kdp.on) j.kdp = Object.assign({}, c.kdp);
  const cv = Object.assign({}, c.cover);
  cv.image_position = `${cv.image_x}% ${cv.image_y}%`;
  delete cv.image_x; delete cv.image_y;
  if (cv.subtitle_source === 'auto') delete cv.subtitle_source;
  if (cv.back_subtitle_source === 'none') delete cv.back_subtitle_source;
  const DEF = { band_size: 100, back_band_size: 100, back_quote_y: 10.5, back_blurb_y: 33, back_subtitle_y: 22, back_image_x: 50, back_image_y: 50 };
  for (const k of Object.keys(DEF)) if (cv[k] === DEF[k] || cv[k] == null) delete cv[k];
  if (cv.back_shade !== false) delete cv.back_shade;
  if (!cv.back_image) { delete cv.back_image_x; delete cv.back_image_y; }
  cv.hide = Object.assign({}, cv.hide); if (!Object.keys(cv.hide).length) delete cv.hide;
  if (cv.band_shade !== false) delete cv.band_shade;
  if (cv.style === 'auto') delete cv.style;
  for (const k of Object.keys(cv)) if (cv[k] === '' || (Array.isArray(cv[k]) && !cv[k].length)) delete cv[k];
  j.cover = cv;
  return j;
}
function sectionKeys(md) {
  const counts = {}, out = [];
  let fence = false;
  for (const ln of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence;
    const m = !fence && /^##[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(ln);
    if (!m) continue;
    let t = m[1].trim(); const bar = t.indexOf(' | '); if (bar >= 0) t = t.slice(0, bar).trim();
    if (t.startsWith('* ')) t = t.slice(2).trim();
    const base = BK.slug(t || 'untitled'); counts[base] = (counts[base] || 0) + 1;
    out.push(counts[base] > 1 ? base + '#' + counts[base] : base);
  }
  return out;
}
function assembleKit(j, texts) {
  const get = n => { const base = n.split('/').pop(); for (const [k, v] of texts) if (k === n || k.split('/').pop() === base) return BK.unescapeExport(v); return ''; };
  const chunks = [];
  const roleOf = [];   // per chunk role for its ## sections
  (j.front || []).forEach(f => { chunks.push(get(f).trim()); roleOf.push('front'); });
  const appx = new Set(j.appendix_parts || []);
  (j.parts || []).concat(j.chapters || []).forEach(f => { chunks.push(get(f).trim()); roleOf.push(appx.has(f) ? 'appendix' : null); });
  (j.back || []).forEach(f => { chunks.push(get(f).trim().replace(/^#\s+/, '## ')); roleOf.push('back'); });
  const md = chunks.join('\n\n') + '\n';
  const roles = {};
  let before = '';
  chunks.forEach((ch, i) => {
    const prevN = sectionKeys(before).length;
    before += ch + '\n\n';
    const keys = sectionKeys(before).slice(prevN);
    if (roleOf[i]) keys.forEach(k => { roles[k] = roleOf[i]; });
  });
  return { md, roles };
}

// ---- the import entry point
// the settings of a kit project are remembered, so its markdown files can also be added later, one by one
let kitJson = null;
try { kitJson = JSON.parse(localStorage.getItem('blk-kitjson') || 'null'); } catch (e) { kitJson = null; }
const kitNames = j => j ? [].concat(j.front || [], j.parts || [], j.chapters || [], j.back || []) : [];
async function importEntries(entries) {
  // expand zip archives
  const flat = [];
  for (const e of entries) {
    if (ext(e.name) === 'zip') {
      const z = await JSZip.loadAsync(await e.buf());
      z.forEach((path, f) => { if (!f.dir && !/(^|\/)(__MACOSX|\.)/.test(path)) flat.push({ name: path, buf: () => f.async('arraybuffer'), text: () => f.async('string'), blob: async () => new Blob([await f.async('arraybuffer')], { type: /\.png$/i.test(path) ? 'image/png' : (/\.jpe?g$/i.test(path) ? 'image/jpeg' : '') }) }); });
    } else flat.push(e);
  }
  const base = n => n.split('/').pop();
  const imgs = flat.filter(e => IMG_EXT.includes(ext(e.name)) && !/(^|\/)(qr_|.*_bw\.jpg$|.*_[LR]\.(jpe?g|png)$|cover_front|cover_back)/.test(e.name));
  const json = flat.find(e => base(e.name) === 'book.json') || flat.find(e => ext(e.name) === 'json');
  const docs = flat.filter(e => ['md', 'markdown', 'txt', 'docx', 'pdf', 'odt', 'html', 'htm'].includes(ext(e.name)));
  let added = 0;
  for (const im of imgs) { if (await addImage(base(im.name), await im.blob())) added++; }
  let meta = {}, md = null, cfg = null, roles = null, note = '';
  let j = null;
  if (json) {
    try { j = JSON.parse(await json.text()); cfg = fromKitJson(j); kitJson = j; try { localStorage.setItem('blk-kitjson', JSON.stringify(j)); } catch (e) { /* full */ } }
    catch (e) { toast(base(json.name) + ' could not be read: ' + e.message); }
  }
  const mdDocs = docs.filter(d => ['md', 'markdown', 'txt'].includes(ext(d.name)));
  const listed = kitJson ? new Set(kitNames(kitJson).map(base)) : new Set();
  if (kitJson && mdDocs.length && mdDocs.every(d => listed.has(base(d.name)))) {
    // files of a kit project (with its book.json now or earlier): assemble them in the order book.json gives
    const texts = new Map();
    for (const d of mdDocs) texts.set(d.name, await d.text());
    const k = assembleKit(kitJson, texts); md = k.md; roles = k.roles;
    const missing = kitNames(kitJson).filter(n => ![...texts.keys()].some(k2 => base(k2) === base(n)));
    if (missing.length) note = ` · still missing: ${missing.map(base).join(', ')}`;
  } else if (docs.length) {
    const parts = [];
    docs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const d of docs) {
      const x = ext(d.name);
      status('Reading ' + base(d.name) + '…');
      try {
        if (x === 'md' || x === 'markdown') {
          let t = await d.text();
          if (!/^#{1,2} /m.test(t)) { const r = BK.autoFormat(t, { lang: S.cfg.lang }); t = r.md; meta = Object.assign({}, r.meta, meta); note = ' · formatted automatically'; }
          parts.push(t);
        } else if (x === 'txt') {
          const r = BK.autoFormat(await d.text(), { lang: S.cfg.lang });
          parts.push(r.md); meta = Object.assign({}, r.meta, meta); note = ' · formatted automatically';
        }
        else if (x === 'html' || x === 'htm') { const r = htmlToMd(await d.text()); parts.push(r.md); meta = Object.assign({}, r.meta, meta); }
        else if (x === 'docx') {
          const buf = await d.buf(); const r = await docxToMd(buf); parts.push(r.md);
          for (const im of r.imgs) { if (await addImage(im.name, im.blob)) added++; }
          meta = Object.assign({}, await docxMeta(buf), r.meta, meta);
        } else if (x === 'odt') {
          const r = await odtToMd(await d.buf()); parts.push(r.md);
          for (const im of r.imgs) { if (await addImage(im.name, im.blob)) added++; }
        } else if (x === 'pdf') {
          const r = await pdfToMd(await d.buf());
          if (r.scanned) toast(base(d.name) + ' has no text layer (a scan?). ' + (window.BKO ? 'Use the Extract tab to read it.' : 'Run it through text recognition first.'));
          parts.push(r.md); meta = Object.assign({}, r.meta, meta);
        }
      } catch (e) { console.error(e); toast(base(d.name) + ' could not be read: ' + e.message); }
    }
    md = parts.filter(Boolean).join('\n\n');
  }
  if (cfg) { const keepRoles = S.cfg.roles; S.cfg = cfg; S.isSampleCfg = false; S.cfg.roles = roles || (md == null ? keepRoles : {}); }
  if (md != null) {
    S.md = md; S.isSample = false;
    if (roles) S.cfg.roles = roles;
    else if (!cfg) {
      S.cfg.roles = {}; S.cfg.part_intro_off = {}; S.cfg.excluded = {};
      if (S.isSampleCfg) { const d = BK.defaults(); S.cfg = merge(d, { lang: S.cfg.lang }); S.isSampleCfg = false; }
      if (meta.title && !S.cfg.title) S.cfg.title = meta.title;
      if (meta.subtitle && !S.cfg.subtitle) S.cfg.subtitle = meta.subtitle;
      if (meta.author && !S.cfg.author) S.cfg.author = meta.author;
    }
  }
  fillForm(); $('#editor').value = S.md; sampleTag();
  changed(); parse();
  const n = S.model ? BK.chaptersOf(S.model).length : 0;
  if (md != null) status(`Imported · ${n} chapters${added ? ` · ${added} images` : ''}${note}`);
  else if (cfg) {
    const want = kitNames(j).map(base);
    status('Settings loaded from ' + base(json.name) + (added ? ` · ${added} images` : ''));
    if (want.length) toast('Settings loaded. Now add the text files named in it: ' + want.join(', '));
  } else status(added ? `Added ${added} image${added > 1 ? 's' : ''}` : 'Nothing to import');
  if (md != null && S.model && !n) toast('No chapter headings found. Try Auto-format, or add “## Title” lines.');
}
const fileEntry = f => ({ name: f.name, buf: () => f.arrayBuffer(), text: () => f.text(), blob: async () => f });

// ---------------------------------------------------------------- form binding
function fillSelect(sel, opts) { sel.innerHTML = ''; for (const [v, t] of opts) sel.append(new Option(t, v)); }
function initForm() {
  fillSelect($('#f-lang'), Object.entries(BK.LANGS));
  fillSelect($('#f-page'), Object.keys(BK.PAGE_SIZES).map(k => [k, `${k} · ${BK.PAGE_SIZES[k][0]} × ${BK.PAGE_SIZES[k][1]} mm`]));
  fillSelect($('#f-font'), Object.entries(BK.FONTS).map(([k, v]) => [k, v.name]));
  const RH = [['title', 'Book title'], ['author', 'Author'], ['chapter', 'Chapter title'], ['none', 'Nothing']];
  fillSelect($('#f-rhl'), RH); fillSelect($('#f-rhr'), RH);
  const rec = $('#recipes');
  for (const [k, r] of Object.entries(BK.RECIPES)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
    const s = r.set;
    b.innerHTML = `${r.label}<small>${typeof s.page === 'string' ? s.page : ''}</small>`;
    b.addEventListener('click', () => { BK.applyRecipe(S.cfg, k); fillForm(); changed(); parse(); toast(r.label + ' recipe applied'); });
    rec.append(b);
  }
  const SW = ['#2f4858', '#e8762c', '#2e6b4f', '#7a2e2e', '#1d1d1d', '#1f4e8c', '#8a6d3b', '#5b4a7a'];
  const sw = $('#bandSwatches');
  SW.forEach(c => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = c; b.dataset.c = c; b.setAttribute('aria-label', 'Band colour ' + c);
    b.addEventListener('click', () => { S.cfg.cover.band = c; fillForm(); changed(); });
    sw.append(b);
  });

  $$('[data-k]').forEach(el => el.addEventListener('input', () => {
    if (el.dataset.k === 'page' && S.cfg.page && typeof S.cfg.page === 'object') { delete S.cfg.page.width; delete S.cfg.page.height; S.cfg.page.size = el.value; }
    else S.cfg[el.dataset.k] = el.value;
    changed(['lang', 'title'].includes(el.dataset.k)); renderKdp();
  }));
  $$('[data-kdp]').forEach(el => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
    const k = BK.kdpCfg(S.cfg), key = el.dataset.kdp;
    k[key] = el.type === 'checkbox' ? el.checked : (key === 'pages' ? (parseInt(el.value, 10) || 0) : el.value);
    if (key === 'format' && k.format === 'hardcover' && k.paper === 'std') k.paper = 'white';
    if (key === 'copies') k.copies = Math.max(1, parseInt(el.value, 10) || 1);
    if (key === 'price') k.price = parseFloat(String(el.value).replace(',', '.')) || 0;
    S.cfg.kdp = k;
    if (key === 'on' && !el.checked && S.view === 'wrap') setView('cover');
    changed(); renderKdp();
    if (key === 'on' && el.checked && !BK.kdpTrim(BK.geom(S.cfg), BK.kdpCfg(S.cfg).format)) toast('This page size is not one KDP prints. Pick a trim size in step 1.');
  }));
  ['#kdpChecks', '#results'].forEach(sel => $(sel).addEventListener('click', e => {
    const b = e.target.closest('button[data-fix]'); if (!b) return;
    const [what, val] = b.dataset.fix.split(':');
    if (what === 'trim') S.cfg.page = val;
    if (what === 'inner') { const pg = S.cfg.page; S.cfg.page = typeof pg === 'object' ? Object.assign({}, pg, { inner: +val }) : { size: pg || 'A5', inner: +val }; }
    fillForm(); changed(); parse();
    toast('Changed. Build again to see the new page count.');
  }));
  $('#kdp-trim').addEventListener('change', e => {
    if (!e.target.value) return;
    const pg = S.cfg.page;
    if (pg && typeof pg === 'object') { delete pg.width; delete pg.height; pg.size = e.target.value; } else S.cfg.page = e.target.value;
    fillForm(); changed(); parse();
  });
  $$('[data-goto]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.goto)));
  $('#kdpBuildInt').addEventListener('click', () => build('pdf'));
  $('#kdpBuildEpub').addEventListener('click', () => build('epub'));
  $('#kdpDlInt').addEventListener('click', () => { if (S.pdf) saveFile(kdpFiles().interior, S.pdf.blob); });
  $('#kdpDlEpub').addEventListener('click', () => { if (S.epub) saveFile(S.epub.name, S.epub.blob); });
  $('#kdpShowInt').addEventListener('click', () => { setView('pages'); if (window.innerWidth < 900) document.querySelector('.desk').scrollIntoView({ behavior: 'smooth' }); });
  $('#kdpShowCover').addEventListener('click', () => { setView('wrap'); if (window.innerWidth < 900) document.querySelector('.desk').scrollIntoView({ behavior: 'smooth' }); });
  $('#kdpGuides').addEventListener('change', e => { S.guides = e.target.checked; if (S.view === 'wrap') drawWrapView(); });
  $$('[data-rh]').forEach(el => el.addEventListener('change', () => { S.cfg.running_heads[el.dataset.rh] = el.value; changed(); }));
  $$('[data-b]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.b;
    if (k === 'index_sort') S.cfg.index_sort = el.checked ? 'surname' : '';
    else if (k === 'index') S.cfg.index = el.checked;
    else S.cfg[k] = el.checked;
    changed(k === 'index');
  }));
  $$('[data-lines]').forEach(el => el.addEventListener('input', () => { S.cfg[el.dataset.lines] = el.value.split('\n').map(s => s.trim()).filter(Boolean); changed(el.dataset.lines === 'index_exclude'); }));
  $$('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const path = seg.dataset.seg.split('.');
    if (path.length === 2) S.cfg[path[0]][path[1]] = b.dataset.v; else S.cfg[path[0]] = b.dataset.v;
    fillForm(); changed();
  })));
  $('#f-size').addEventListener('input', e => { S.cfg.font_size = +e.target.value; fillForm(); changed(); });
  $$('[data-photo]').forEach(el => el.addEventListener('input', () => { S.cfg.photos[el.dataset.photo] = +el.value; el.nextElementSibling.value = el.value + ' mm'; changed(); }));
  const hexOf = v => { v = String(v || '').trim().replace(/^#/, ''); if (/^[0-9a-f]{3}$/i.test(v)) v = [...v].map(x => x + x).join(''); return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : ''; };
  $$('[data-col]').forEach(el => el.addEventListener('input', () => { S.cfg.cover[el.dataset.col] = el.value; el.parentElement.querySelector('.hex').value = el.value; el.parentElement.querySelector('.hex').classList.remove('bad'); changed(); }));
  // a colour code can be typed or pasted: #2f4858, 2f4858 or #fa0
  $$('[data-hex]').forEach(el => {
    const picker = () => el.parentElement.querySelector('[data-col]');
    el.addEventListener('input', () => {
      const h = hexOf(el.value); el.classList.toggle('bad', !h && el.value.trim() !== '');
      if (h) { picker().value = h; S.cfg.cover[el.dataset.hex] = h; changed(); }
    });
    el.addEventListener('blur', () => { el.value = picker().value; el.classList.remove('bad'); });
    el.addEventListener('paste', () => setTimeout(() => el.dispatchEvent(new Event('input')), 0));
  });
  $$('[data-ck]').forEach(el => el.addEventListener('input', () => { S.cfg.cover[el.dataset.ck] = el.value; changed(); }));
  $$('[data-clines]').forEach(el => el.addEventListener('input', () => { S.cfg.cover[el.dataset.clines] = el.value.split('\n').map(s => s.trim()).filter(Boolean); changed(); }));
  $$('[data-cparas]').forEach(el => el.addEventListener('input', () => { S.cfg.cover[el.dataset.cparas] = el.value.split(/\n\s*\n/).map(s => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean); changed(); }));
  $$('[data-cs]').forEach(el => el.addEventListener('change', () => { S.cfg.cover[el.dataset.cs] = el.value; changed(); }));
  $$('[data-hide]').forEach(el => el.addEventListener('change', () => { const h = S.cfg.cover.hide = Object.assign({}, S.cfg.cover.hide); if (el.checked) delete h[el.dataset.hide]; else h[el.dataset.hide] = true; changed(); }));
  $$('[data-cb]').forEach(el => el.addEventListener('change', () => { S.cfg.cover[el.dataset.cb] = el.checked; changed(); }));
  $$('[data-pos]').forEach(el => el.addEventListener('input', () => { S.cfg.cover[el.dataset.pos] = +el.value; el.nextElementSibling.value = el.value + '%'; changed(); }));
}
function fillForm() {
  const c = S.cfg;
  $$('[data-k]').forEach(el => { if (document.activeElement !== el) el.value = c[el.dataset.k] == null ? '' : (typeof c[el.dataset.k] === 'object' ? (c[el.dataset.k].size || 'A5') : c[el.dataset.k]); });
  $$('[data-rh]').forEach(el => { el.value = (c.running_heads || {})[el.dataset.rh] || 'none'; });
  $$('[data-b]').forEach(el => { const k = el.dataset.b; el.checked = k === 'index_sort' ? c.index_sort === 'surname' : (k === 'index' ? !!c.index : c[k] !== false && !!(c[k] ?? true)); });
  $$('[data-lines]').forEach(el => { if (document.activeElement !== el) el.value = (c[el.dataset.lines] || []).join('\n'); });
  $$('[data-seg]').forEach(seg => {
    const path = seg.dataset.seg.split('.');
    const v = path.length === 2 ? c[path[0]][path[1]] : c[path[0]];
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === (v || (path[1] === 'style' ? 'auto' : '')))));
  });
  const G = BK.geom(c);
  $('#f-size').value = G.FS; $('#o-size').value = G.FS + ' pt' + (c.font_size ? '' : ' (auto)');
  $('#pageInfo').textContent = `${G.W} × ${G.H} mm · text block ${G.TW.toFixed(0)} × ${G.TH.toFixed(0)} mm · margins inner ${G.inner}, outer ${G.outer}, top ${G.top}, bottom ${G.bottom} mm`;
  $$('[data-photo]').forEach(el => { el.value = c.photos[el.dataset.photo] || el.min; el.nextElementSibling.value = el.value + ' mm'; });
  $$('[data-col]').forEach(el => { el.value = c.cover[el.dataset.col] || '#000000'; const hx = el.parentElement.querySelector('.hex'); if (document.activeElement !== hx) hx.value = el.value; });
  $$('[data-ck]').forEach(el => { if (document.activeElement !== el) el.value = c.cover[el.dataset.ck] || ''; });
  $$('[data-clines]').forEach(el => { if (document.activeElement !== el) el.value = (c.cover[el.dataset.clines] || []).join('\n'); });
  $$('[data-cparas]').forEach(el => { if (document.activeElement !== el) el.value = (c.cover[el.dataset.cparas] || []).join('\n\n'); });
  $$('[data-cs]').forEach(el => { el.value = c.cover[el.dataset.cs] || (el.dataset.cs === 'back_subtitle_source' ? 'none' : 'auto'); });
  $$('[data-hide]').forEach(el => { el.checked = !(c.cover.hide || {})[el.dataset.hide]; });
  $$('[data-cb]').forEach(el => { el.checked = c.cover[el.dataset.cb] !== false; });
  $$('[data-pos]').forEach(el => { el.value = c.cover[el.dataset.pos] ?? ({ band_size: 100, back_band_size: 100, back_quote_y: 10.5, back_blurb_y: 33, back_subtitle_y: 22 }[el.dataset.pos] ?? 50); el.nextElementSibling.value = el.value + '%'; });
  $$('#bandSwatches .sw').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === String(c.cover.band).toLowerCase())));
  const a = c.cover.image ? BK.findAsset(S.assets, c.cover.image) : null;
  $('#coverThumb').style.backgroundImage = a ? `url("${a.dataURL}")` : 'none';
  const ba = c.cover.back_image ? BK.findAsset(S.assets, c.cover.back_image) : null;
  $('#backThumb').style.backgroundImage = ba ? `url("${ba.dataURL}")` : 'none';
  const st = BK.coverStyle(c);
  $('#coverStyleHint').textContent = c.cover.style === 'photo' && !a ? 'Photo style needs a cover photo; until you add one the classic bands are used.'
    : (c.cover.style === 'auto' ? `Automatic picks ${a ? 'the photo style because a photo is set' : 'classic bands because no photo is set'}.` : '');
  $('#coverPhotoSect').style.opacity = st === 'photo' || c.cover.style !== 'classic' ? 1 : .6;
  renderKdp();
}
function sampleTag() { $('#sampleTag').hidden = !S.isSample; }

// ---------------------------------------------------------------- change tracking
function changed(needParse) {
  S.stale = true;
  save();
  coverSoon();
  renderWordInfo();
  renderKdp();
  if (needParse) reparse();
  if (S.pdf || S.epub) $('#deskInfo').innerHTML = '<span>Settings changed since the last build</span>';
}

// ---------------------------------------------------------------- cover preview
const coverSoon = debounce(() => { if (S.view === 'cover') drawCovers(); else if (S.view === 'wrap') drawWrapView(); }, 220);
let coverToken = 0;
async function drawCovers() {
  const tok = ++coverToken;
  const stage = $('#stage');
  const G = BK.geom(S.cfg);
  const availH = Math.max(260, Math.min(560, stage.clientHeight - 70));
  const ppm = availH / G.H * Math.min(2, window.devicePixelRatio || 1);
  try {
    const [f, b] = await Promise.all([BK.drawCover('front', S.cfg, S.assets, ppm), BK.drawCover('back', S.cfg, S.assets, ppm)]);
    if (tok !== coverToken || S.view !== 'cover') return;
    const wrap = document.createElement('div'); wrap.className = 'covers';
    for (const [cv, lab] of [[f, 'Front'], [b, 'Back']]) {
      cv.style.height = availH + 'px'; cv.style.width = 'auto';
      const fig = document.createElement('figure'); fig.append(cv);
      const cap = document.createElement('figcaption'); cap.textContent = lab; fig.append(cap);
      wrap.append(fig);
    }
    stage.replaceChildren(wrap);
    $('#deskInfo').innerHTML = `<span>${BK.coverStyle(S.cfg) === 'photo' && BK.findAsset(S.assets, S.cfg.cover.image) ? 'Photo cover' : 'Classic cover'} · <b>${G.W} × ${G.H}</b> mm</span>`;
  } catch (e) { console.error(e); stage.innerHTML = `<div class="empty"><strong>Cover preview failed</strong><span>${BK.esc(e.message)}</span></div>`; }
}

// ---------------------------------------------------------------- Amazon KDP: settings, checks, print cover
const kdpOn = c => !!(c.kdp && c.kdp.on);
// the settings a build uses: for KDP the interior has no covers (they go in a separate cover file)
function effCfg() { const c = JSON.parse(JSON.stringify(S.cfg)); if (kdpOn(c)) c.include_covers = false; return c; }
const kdpPages = () => +BK.kdpCfg(S.cfg).pages || (S.pdf ? S.pdf.pages - (S.pdf.covers ? 2 : 0) : 0) || 0;
const ICON = { true: '✓', false: '✗', null: '•' };
function kdpChecksHtml(list) {
  return list.map(c => `<li class="${c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'note'}"><span aria-hidden="true">${ICON[c.ok]}</span><span>${BK.esc(c.t)}${c.fix ? ` <button type="button" class="btn small" data-fix="inner:${c.fix}">Set inside margin to ${c.fix} mm</button>` : ''}${c.trim ? ` <button type="button" class="btn small" data-fix="trim:${c.trim}">Use ${c.trim}</button>` : ''}</span></li>`).join('');
}
function nearestTrim(G) {
  let best = null, bd = 1e9;
  for (const k of BK.kdpTrimKeys(BK.kdpCfg(S.cfg).format)) { const [w, h] = BK.PAGE_SIZES[k]; const d = Math.abs(w - G.W) + Math.abs(h - G.H); if (d < bd) { bd = d; best = k; } }
  return best;
}
const TRIM_LABEL = k => { const [w, h] = BK.PAGE_SIZES[k]; const inch = v => Math.round(v / 25.4 * 100) / 100; return `${inch(w)} × ${inch(h)} in${k === 'A4' ? ' (A4)' : ''} · ${w} × ${h} mm`; };
const pill = (id, cls, txt) => { const e = $(id); e.className = 'kpill' + (cls ? ' ' + cls : ''); e.textContent = txt; };
const kdpFiles = () => {
  const nm = outName(), pages = kdpPages();
  return { interior: `${nm}_interior.pdf`, cover: `${nm}_kdp_${BK.kdpCfg(S.cfg).format}_cover_${BK.kdpGeom(S.cfg, pages).pages}p.pdf`, epub: `${nm}.epub`, kindle: `${nm}_kindle_cover.jpg` };
};
function kdpDiagram(g) {
  const W = 420, padX = 14, top = 26, sc = (W - 2 * padX) / g.w, H = g.h * sc + top + 30, hard = g.format === 'hardcover';
  const x = mm => padX + mm * sc, y = mm => top + mm * sc, m = g.m, sz = g.sz;
  const t = (tx, ty, s, anchor, extra) => `<text x="${tx}" y="${ty}" text-anchor="${anchor || 'middle'}"${extra || ''}>${s}</text>`;
  const foot = hard ? `wrap ${BK.KDP.hard.wrap} mm round the boards` : `bleed ${m} mm all round`;
  return `<svg viewBox="0 0 ${W} ${Math.round(H)}" role="img" aria-label="${hard ? 'Hardcover' : 'Paperback'} cover layout: back ${g.W} mm, spine ${g.spine} mm, front ${g.W} mm, height ${g.h} mm">
    <rect x="${x(0)}" y="${y(0)}" width="${g.w * sc}" height="${g.h * sc}" fill="${hard ? '#d9e4f3' : '#f6dcd8'}" stroke="${hard ? '#285ab4' : '#b32020'}" stroke-width=".6" stroke-dasharray="3 2"/>
    <rect x="${x(m)}" y="${y(m)}" width="${g.W * sc}" height="${g.H * sc}" fill="#dfe7ea" stroke="#2f4858"/>
    <rect x="${x(m + g.W)}" y="${y(m)}" width="${sz * sc}" height="${g.H * sc}" fill="#2f4858"/>
    <rect x="${x(m + g.W + sz)}" y="${y(m)}" width="${g.W * sc}" height="${g.H * sc}" fill="#dfe7ea" stroke="#2f4858"/>
    ${t(x(m + g.W / 2), y(g.h / 2) - 4, 'BACK')}${t(x(m + g.W / 2), y(g.h / 2) + 9, g.W + ' mm')}
    ${t(x(m + g.W + sz + g.W / 2), y(g.h / 2) - 4, 'FRONT')}${t(x(m + g.W + sz + g.W / 2), y(g.h / 2) + 9, g.W + ' mm')}
    ${t(x(m + g.W + sz / 2), y(0) - 14, 'SPINE ' + g.spine + ' mm')}
    <path d="M${x(m + g.W + sz / 2)} ${y(0) - 10} V ${y(m)}" stroke="#2f4858" stroke-width=".8"/>
    ${t(x(0), y(g.h) + 14, foot, 'start', hard ? ' fill="#285ab4" style="fill:#285ab4"' : ' fill="#b32020" style="fill:#b32020"')}
    ${t(x(g.w), y(g.h) + 14, 'whole sheet ' + g.w + ' × ' + g.h + ' mm', 'end')}
  </svg>`;
}
const eur = v => '€' + v.toFixed(2).replace('.', ',');
function kdpCostHtml(cost) {
  if (!cost.ok) return `<span class="hint">${BK.esc(cost.why)}</span>`;
  const rows = [`<div><b>Printing cost per copy</b><span><big>${eur(cost.unit)}</big> <small>(${BK.esc(cost.how.replace(/\./g, ','))}${cost.large ? ', large trim' : ''})</small></span></div>`];
  if (cost.copies > 1) rows.push(`<div><b>${cost.copies} author copies</b><span>${eur(cost.total)} <small>plus shipping and VAT</small></span></div>`);
  rows.push(`<div><b>Lowest list price that covers printing</b><span>${eur(cost.minPrice)} <small>incl. 6% VAT, at KDP's 60% royalty rate</small></span></div>`);
  if (cost.royalty != null) rows.push(`<div><b>Royalty at your price</b><span class="${cost.royalty < 0 ? 'check-bad' : 'check-ok'}">${eur(cost.royalty)} per copy</span></div>`);
  return `<div class="kdpup">${rows.join('')}</div>`;
}
function renderKdp() {
  if (!S.cfg) return;
  const k = BK.kdpCfg(S.cfg), on = k.on;
  $('#kdpBody').hidden = !on;
  $('#viewSeg [data-v="wrap"]').hidden = !on;
  $('#coverKdpExports').hidden = !on;
  const ic = $('[data-b="include_covers"]'); if (ic) { ic.disabled = on; ic.parentElement.style.opacity = on ? .55 : 1; }
  $('#icNote').hidden = !on;
  const set = (el, v) => { if (document.activeElement !== el) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v; } };
  const hardc = k.format === 'hardcover', pkey = Object.keys(BK.KDP.paper).filter(id => !hardc || id !== 'std').join();
  if ($('#kdp-paper').dataset.f !== pkey) { fillSelect($('#kdp-paper'), Object.entries(BK.KDP.paper).filter(([id]) => !hardc || id !== 'std').map(([id, p]) => [id, `${p.name} · ${p.t} in per page`])); $('#kdp-paper').dataset.f = pkey; }
  $('#kdpFmtHint').textContent = hardc ? 'Case laminate hardcover: 75 to 550 pages, five trim sizes, no standard colour paper. The cover wraps 15 mm round the boards.' : 'Paperback: 24 to 828 pages depending on paper and trim size. The cover has a 3.2 mm bleed.';
  $$('[data-kdp]').forEach(el => { if (el.id !== 'kdp-bar') set(el, el.dataset.kdp === 'pages' ? (k.pages || '') : el.dataset.kdp === 'price' ? (k.price || '') : k[el.dataset.kdp]); });
  // barcode image: any image that was added
  const bar = $('#kdp-bar'), names = [...S.assets.keys()];
  if (bar.dataset.n !== names.join('|')) { fillSelect(bar, [['', 'None: KDP adds its own barcode here']].concat(names.map(n => [n, n]))); bar.dataset.n = names.join('|'); }
  bar.value = names.includes(k.barcode_image) ? k.barcode_image : '';
  if (!on) return;
  const G = BK.geom(S.cfg), cur = BK.kdpTrim(G, k.format);
  // trim sizes: the KDP ones, and the current size when it is not one of them
  const tr = $('#kdp-trim'), keys = BK.kdpTrimKeys(k.format).slice().sort((a, b) => BK.PAGE_SIZES[a][0] - BK.PAGE_SIZES[b][0] || BK.PAGE_SIZES[a][1] - BK.PAGE_SIZES[b][1]);
  const sig = (cur || 'x') + '|' + G.W + 'x' + G.H + '|' + k.format;
  if (tr.dataset.sig !== sig) {
    fillSelect(tr, (cur ? [] : [['', `Not a KDP ${k.format} size now (${G.W} × ${G.H} mm): pick one`]]).concat(keys.map(key => [key, TRIM_LABEL(key)])));
    tr.dataset.sig = sig;
  }
  if (document.activeElement !== tr) tr.value = cur || '';
  const built = !!S.pdf, pages = kdpPages(), g = BK.kdpGeom(S.cfg, pages);
  const typed = +k.pages || 0;
  $('#kdp-pages').placeholder = built ? `${S.pdf.pages - (S.pdf.covers ? 2 : 0)} from the build` : 'filled in by the build';
  $('#kdpPagesHint').textContent = typed ? 'Typed by you. Clear the field to use the count of the last build.' : (built ? `Using the ${pages} pages of the last build.` : 'Left empty: the count comes from the build in step 2. Type it to design the cover before the book is built.');
  const list = BK.kdpChecks(S.cfg, pages && (built || typed) ? pages : 0);
  if (list[0] && list[0].ok === false) list[0].trim = nearestTrim(G);
  $('#kdpChecks').innerHTML = kdpChecksHtml(list.filter(c => !/^Build the PDF/.test(c.t)));
  const bad1 = list.some(c => c.ok === false);
  pill('#kp1', bad1 ? 'bad' : 'ok', bad1 ? 'Needs attention' : 'Looks good');
  // step 2: interior
  const stale = S.stale && built, body = built ? S.pdf.pages - (S.pdf.covers ? 2 : 0) : 0, F = kdpFiles();
  $('#kdpIntStatus').innerHTML = built
    ? `<b>${body} pages</b> · ${fmtBytes(S.pdf.blob.size)} · page numbers stable: <span class="${S.pdf.stable ? 'check-ok' : 'check-bad'}">${S.pdf.stable ? 'yes' : 'no'}</span>${S.pdf.covers ? '<br><span class="check-bad">This build still has cover pages in it. Build again.</span>' : ''}${stale ? '<br><span class="check-bad">The book or its settings changed after this build. Build again.</span>' : ''}`
    : 'Not built yet. Press the button to lay out the book.';
  pill('#kp2', !built || S.pdf.covers ? '' : stale ? 'warn' : 'ok', !built ? 'Not built' : S.pdf.covers ? 'Build again' : stale ? 'Out of date' : 'Ready');
  $('#kdpBuildInt').textContent = built ? 'Build again' : 'Build inside pages';
  $('#kdpDlInt').disabled = !built || !!S.pdf.covers; $('#kdpShowInt').disabled = !built;
  // step 3: cover
  $('#kdpDiagram').innerHTML = kdpDiagram(g);
  $('#kdpCost').innerHTML = kdpCostHtml(BK.kdpCost(S.cfg, pages && (built || typed) ? pages : 0));
  $('#kdpCoverHint').textContent = hardc ? 'One sheet: back board, spine, front board, with a 15 mm wrap round the edges that folds over the boards. Keep text 16 mm in from the edge and 10 mm from the spine. It uses the design from the Cover tab.' : 'One sheet: back cover, spine, front cover, with a 3.2 mm bleed all round. It uses the design from the Cover tab.';
  const why = g.spineText ? '' : '<br>' + (k.spine_text === false ? 'Spine text is off.' : g.pages < BK.KDP.spineTextMinPages ? `No spine text: KDP allows it from ${BK.KDP.spineTextMinPages} pages.` : 'The spine is too thin for readable text.');
  $('#kdpInfo').innerHTML = `<b>${g.w} × ${g.h} mm</b> (${g.inch[0]} × ${g.inch[1]} in) · ${g.px[0]} × ${g.px[1]} px at 300 dpi<br>Spine ${g.spine} mm${hardc ? ` (panel ${g.sz} mm with the hinge gaps)` : ''} = ${g.pages} pages × ${g.paperName.toLowerCase()}${g.estimated ? '<br><span class="check-bad">The page count is not known yet: the spine is drawn for 200 pages. Build the inside pages first, or type the number in step 1.</span>' : ''}${why}`;
  pill('#kp3', g.estimated ? 'warn' : 'ok', g.estimated ? 'Needs page count' : 'Ready');
  // step 4: kindle
  pill('#kp4', S.epub ? (S.stale ? 'warn' : 'ok') : '', S.epub ? (S.stale ? 'Out of date' : 'Ready') : 'Not built');
  $('#kdpBuildEpub').textContent = S.epub ? 'Build EPUB again' : 'Build EPUB'; $('#kdpDlEpub').disabled = !S.epub;
  // step 5: upload
  const row = (a, b) => `<div><b>${a}</b><span>${b}</span></div>`;
  $('#kdpUpload').innerHTML = `<p class="hint">On kdp.amazon.com, create the ${hardc ? 'hardcover' : 'paperback'} and upload:</p><div class="kdpup">
    ${row(hardc ? 'Hardcover content' : 'Paperback content', `<code>${BK.esc(F.interior)}</code>${built ? '' : ' (step 2)'}`)}
    ${row(hardc ? 'Hardcover cover' : 'Paperback cover', `<code>${BK.esc(F.cover)}</code> as “Upload a print-ready PDF cover”`)}
    ${row('Trim size', `${BK.esc(TRIM_LABEL(cur || nearestTrim(G)))}, ${BK.esc(g.paperName.toLowerCase())}, no bleed in the inside pages${hardc ? ', case laminate' : ''}`)}
    ${row('Kindle e-book', `<code>${BK.esc(F.epub)}</code> and <code>${BK.esc(F.kindle)}</code>`)}</div>`;
}
let wrapToken = 0;
async function drawWrapView() {
  const tok = ++wrapToken, stage = $('#stage');
  $('#pager').hidden = true;
  if (!kdpOn(S.cfg)) { stage.innerHTML = '<div class="empty"><strong>No print cover</strong><span>Turn on “Prepare this book for KDP” on the KDP tab.</span></div>'; return; }
  const pages = kdpPages(), g = BK.kdpGeom(S.cfg, pages);
  const availH = Math.max(240, stage.clientHeight - 100), availW = Math.max(240, stage.clientWidth - 32);
  const sc = Math.min(availH / g.h, availW / g.w);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  try {
    const cv = await BK.drawWrap(S.cfg, S.assets, sc * dpr, { pages, guides: S.guides });
    if (tok !== wrapToken || S.view !== 'wrap') return;
    cv.style.width = g.w * sc + 'px'; cv.style.height = g.h * sc + 'px';
    const box = document.createElement('div'); box.className = 'wrapview';
    const fig = document.createElement('figure'); fig.append(cv);
    const cap = document.createElement('figcaption'); cap.textContent = `${g.format === 'hardcover' ? 'Hardcover' : 'Paperback'}: back · spine ${g.spine} mm · front`; fig.append(cap);
    box.append(fig);
    stage.replaceChildren(box);
    $('#deskInfo').innerHTML = `<span>Print cover · <b>${g.w} × ${g.h}</b> mm · spine <b>${g.spine}</b> mm${g.estimated ? ' (estimate)' : ''}</span>`;
    $('#kdpGuides').checked = S.guides;
  } catch (e) { console.error(e); stage.innerHTML = `<div class="empty"><strong>Cover preview failed</strong><span>${BK.esc(e.message)}</span></div>`; }
}
// cover files: the front and back on their own, the print wrap, the Kindle cover
const toJpg = (cv, q) => new Promise(r => cv.toBlob(r, 'image/jpeg', q || .95));
async function exportCover(kind) {
  const ppm = 300 / 25.4, nm = outName();
  const btn = $('[data-cover="' + kind + '"]'); if (btn) btn.disabled = true;
  try {
    if (kind === 'front' || kind === 'back') await saveFile(`${nm}_cover_${kind}.jpg`, await toJpg(await BK.drawCover(kind, S.cfg, S.assets, ppm)));
    else if (kind === 'ebook') await saveFile(`${nm}_kindle_cover.jpg`, await toJpg(await BK.drawEbookCover(S.cfg, S.assets), .93));
    else {
      const pages = kdpPages(), g = BK.kdpGeom(S.cfg, pages);
      if (g.estimated && !confirm('The page count is not known yet, so the spine would be drawn for 200 pages. Build the PDF first, or type the page count, for a spine that fits.\n\nExport with the estimate anyway?')) return;
      const cv = await BK.drawWrap(S.cfg, S.assets, ppm, { pages });
      if (kind === 'wrap-pdf') await saveFile(kdpFiles().cover, await BK.jpegPdf(cv, g.w, g.h, (S.cfg.title || 'Cover') + ' (cover)'));
      else await saveFile(kdpFiles().cover.replace(/\.pdf$/, '.jpg'), await toJpg(cv));
    }
  } catch (e) { console.error(e); toast('The cover could not be made: ' + (e && e.message || e)); }
  finally { if (btn) btn.disabled = false; }
}
$$('[data-cover]').forEach(b => b.addEventListener('click', () => exportCover(b.dataset.cover)));

// ---------------------------------------------------------------- page viewer
let renderTok = 0;
function spreadOf(p) {
  const n = S.pdfDoc.numPages, co = S.pdf && S.pdf.covers ? 1 : 0;
  if (co && p === 1) return [null, 1];
  if (co && p === n) return [n, null];
  const folio = p - co;
  if (folio % 2 === 1) return [p - 1 >= 1 + co ? p - 1 : null, p];
  return [p, p + 1 <= n - co ? p + 1 : null];
}
async function renderSpread() {
  const stage = $('#stage');
  if (!S.pdfDoc) {
    stage.innerHTML = `<div class="empty"><strong>No pages yet</strong><span>Build the book to see every page here, spread by spread, with the covers first and last.</span><div><button class="btn primary" type="button" id="emptyBuild">Build PDF &amp; EPUB</button></div></div>`;
    $('#emptyBuild').addEventListener('click', () => build('both'));
    $('#pager').hidden = true;
    return;
  }
  $('#pager').hidden = false;
  const tok = ++renderTok;
  const [l, r] = spreadOf(S.page);
  const availH = Math.max(260, stage.clientHeight - 40), availW = Math.max(240, stage.clientWidth - 40);
  const first = await S.pdfDoc.getPage(l || r);
  const vp1 = first.getViewport({ scale: 1 });
  const scale = Math.min(availH / vp1.height, availW / (2 * vp1.width));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const spread = document.createElement('div'); spread.className = 'spread';
  const draw = async (pn) => {
    const cv = document.createElement('canvas');
    const vp = (await S.pdfDoc.getPage(pn || l || r)).getViewport({ scale: scale * dpr });
    cv.width = vp.width; cv.height = vp.height;
    cv.style.width = vp.width / dpr + 'px'; cv.style.maxWidth = '50%';
    if (!pn) { cv.className = 'ghost'; return cv; }
    cv.dataset.p = pn; cv.addEventListener('click', () => { S.sel = pn; markSel(); });
    const page = await S.pdfDoc.getPage(pn);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    return cv;
  };
  const [cl, cr] = await Promise.all([draw(l), draw(r)]);
  if (tok !== renderTok || S.view !== 'pages') return;
  const g = document.createElement('div'); g.className = 'gutter';
  spread.append(cl, g, cr);
  stage.replaceChildren(spread);
  if (S.sel !== l && S.sel !== r) S.sel = r || l;
  markSel();
  drawOverlays();
  const n = S.pdfDoc.numPages, co = S.pdf.covers ? 1 : 0;
  const lab = p => p == null ? '' : (co && p === 1 ? 'front cover' : (co && p === n ? 'back cover' : 'page ' + (p - co)));
  $('#pageLabel').textContent = [lab(l), lab(r)].filter(Boolean).join(' · ') + ` / ${n - 2 * co}`;
  $('#pageSlider').max = n; $('#pageSlider').value = r || l;
}

// ---------------------------------------------------------------- edit from the page viewer
// Pages are mapped back to the manuscript: a page belongs to the section (chapter, part ...) that started last, and the
// paragraphs "on" a page are the ones whose first words are found on that page.
const letters = s => String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function mdItemsOf(md) {
  const norm = BK.unescapeExport(md || '').replace(/\r\n?/g, '\n'), items = [];
  let off = 0, fence = false;
  for (const ln of norm.split('\n')) {
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence;
    const m = !fence && /^(#{1,2})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(ln);
    if (m) items.push({ level: m[1].length, start: off, bodyStart: Math.min(norm.length, off + ln.length + 1) });
    off += ln.length + 1;
  }
  items.forEach((it, i) => { it.end = i + 1 < items.length ? items[i + 1].start : norm.length; });
  const lead = items.length ? norm.slice(0, items[0].start) : norm;
  const wc = (lead.replace(/!\[[^\]]*\]\([^)]*\)/g, '').match(/[\p{L}\p{N}]+/gu) || []).length;
  if (lead.trim() && wc > 0) items.unshift({ level: 2, start: 0, bodyStart: 0, end: items.length ? items[0].start : norm.length, implicit: true });
  return { norm, items };
}
const pageTextCache = new Map();
async function pageLetters(p) {
  const key = (S.pdfDoc && S.pdfDoc.fingerprints ? S.pdfDoc.fingerprints[0] : '') + ':' + p;
  if (pageTextCache.has(key)) return pageTextCache.get(key);
  const tc = await (await S.pdfDoc.getPage(p)).getTextContent();
  const t = letters(tc.items.map(i => i.str).join(' '));
  pageTextCache.set(key, t); return t;
}
const plainMd = s => s.replace(/^:::.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[#>\-*+\s]+|^\d+[.)]\s+/gm, '').replace(/[*_~`]/g, '');
// where a page sits in the manuscript: { index, item, pages: [first, last], generated }
function locate(page) {
  if (!S.pdf || !S.pdf.ids || !S.model) return null;
  if (S.pdf.covers && page === S.pdfDoc.numPages) return { generated: true };
  const ids = S.pdf.ids, outline = S.model.outline, idOf = o => o.type === 'part' ? o.part.pid : o.sec.id;
  const starts = Object.entries(ids).map(([id, p]) => ({ id, p })).filter(x => x.id !== 'BACKCOVER').sort((a, b) => a.p - b.p || 0);
  let cur = null;
  for (const x of starts) if (x.p <= page) cur = x;
  if (!cur) return { generated: true };
  const base = cur.id.replace(/-intro$/, ''), index = outline.findIndex(o => idOf(o) === base);
  if (index < 0) return { generated: true };
  const next = starts.find(x => x.p > cur.p && (x.id.replace(/-intro$/, '') !== base)), last = next ? next.p - 1 : S.pdfDoc.numPages - (S.pdf.covers ? 1 : 0);
  const first = Math.min(...starts.filter(x => x.id.replace(/-intro$/, '') === base).map(x => x.p));
  return { index, o: outline[index], pages: [first, last] };
}
// the paragraphs of an item and the ones that start on `page`
// blocks of the manuscript text: blank-line paragraphs, with ::: containers and code fences kept whole
function splitBlocks(norm, a0, b0) {
  const body = norm.slice(a0, b0), blocks = [];
  let pos = 0, cur = null, depth = 0, fence = null;
  const flush = () => { if (cur) { blocks.push({ a: a0 + cur.a, b: a0 + cur.b, text: body.slice(cur.a, cur.b) }); cur = null; } };
  for (const ln of body.split('\n')) {
    const start = pos, end = pos + ln.length; pos = end + 1;
    if (fence) { cur.b = end; if (/^\s*(```|~~~)/.test(ln)) { fence = null; flush(); } continue; }
    if (depth > 0) { cur.b = end; if (/^:::\s*$/.test(ln)) { depth--; if (!depth) flush(); } else if (/^:::\s*\S/.test(ln)) depth++; continue; }
    if (!ln.trim()) { flush(); continue; }
    if (!cur) {
      cur = { a: start, b: end };
      if (/^:::\s*\S/.test(ln)) depth = 1; else if (/^\s*(```|~~~)/.test(ln)) fence = '```';
    } else cur.b = end;
  }
  flush();
  return blocks;
}
async function pageParas(item, norm, loc, page) {
  const paras = splitBlocks(norm, item.bodyStart, item.end);
  const texts = {};
  for (let p = loc.pages[0]; p <= loc.pages[1]; p++) texts[p] = await pageLetters(p);
  const hit = [];
  for (const par of paras) {
    const pl = letters(plainMd(par.text)), snip = pl.length > 30 ? pl.slice(4, 28) : pl.slice(0, 24);
    if (snip.length < 6) continue;
    let sp = null;
    for (let p = loc.pages[0]; p <= loc.pages[1]; p++) if (texts[p].includes(snip)) { sp = p; break; }
    if (sp === page) hit.push(par);
  }
  return { paras, hit };
}

// where things sit on a page: text spans (with their position in the page's letters) and pictures
const geoCache = new Map();
async function pageGeo(p) {
  const key = (S.pdfDoc && S.pdfDoc.fingerprints ? S.pdfDoc.fingerprints[0] : '') + ':' + p;
  if (geoCache.has(key)) return geoCache.get(key);
  const page = await S.pdfDoc.getPage(p), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  let str = ''; const spans = [];
  for (const it of tc.items) {
    const lt = letters(it.str || ''); if (!lt) continue;
    const t = mul(vp.transform, it.transform), h = Math.hypot(t[2], t[3]) || 8;
    spans.push({ s: str.length, e: str.length + lt.length, x: t[4], y: t[5] - h * .85, w: it.width, h: h * 1.15 });
    str += lt;
  }
  const imgs = [];
  try {
    const ops = await page.getOperatorList(), O = pdfjsLib.OPS; let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    ops.fnArray.forEach((fn, i) => {
      const a = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm.slice()); else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject) {
        const m = mul(vp.transform, ctm), xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]], ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
        const x = Math.min(...xs), y = Math.min(...ys); imgs.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
      }
    });
  } catch (e) { /* no picture positions: text blocks still work */ }
  const g = { w: vp.width, h: vp.height, str, spans, imgs: imgs.filter(r => r.w > 24 && r.h > 24).sort((a, b) => a.y - b.y || a.x - b.x) };
  geoCache.set(key, g); return g;
}
const unionRect = rs => { const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
// the selectable items of a page, each with its place in the manuscript and a rectangle on the page
async function pageBlocks(page) {
  const loc = locate(page); if (!loc || loc.generated) return [];
  const { norm, items } = mdItemsOf(S.md); if (items.length !== S.model.outline.length) return [];
  const item = items[loc.index], geo = await pageGeo(page), out = [];
  const spansIn = (s0, e0, clamp) => geo.spans.filter(sp => sp.e > s0 && sp.s < e0 && (!clamp || (sp.y > geo.h * .07 && sp.y < geo.h * .93)));
  // the heading: its title is found on the opening page of the section
  const headRaw = norm.slice(item.start, item.bodyStart).replace(/^#+\s*/, '').replace(/^\*\s+|^~\s+/, '');
  const title = letters(plainMd(headRaw.split(' | ')[0]));
  if (!item.implicit && title.length >= 3 && page === loc.pages[0]) {
    const hi = geo.str.indexOf(title);
    if (hi >= 0) { const sp = spansIn(hi, hi + title.length); if (sp.length) out.push({ kind: 'head', a: item.start, b: item.end, text: headRaw, rect: unionRect(sp), label: 'heading (removes the whole ' + (loc.o.type === 'part' ? 'part intro' : 'section') + ')' }); }
  }
  const blocks = splitBlocks(norm, item.bodyStart, item.end);
  let cursor = 0; const matched = [];
  blocks.forEach((b, bi) => {
    const pl = letters(plainMd(b.text)); if (pl.length < 6 || /^!\[/.test(b.text.trim())) return;
    const skip = pl.length > 26 ? 3 : 0, sn = pl.slice(skip, skip + 20), en = pl.slice(-20);
    let si = geo.str.indexOf(sn, cursor), start, end, cont = false, goes = false;
    if (si >= 0) { start = Math.max(cursor, si - skip); const ei = geo.str.indexOf(en, si); if (ei >= 0) end = ei + en.length; else { end = geo.str.length; goes = true; } }
    else { const ei = geo.str.indexOf(en, cursor); if (ei < 0) return; start = cursor; end = ei + en.length; cont = true; }
    const sp = spansIn(start, end, cont || goes); if (!sp.length) return;
    cursor = end; matched.push(bi);
    out.push({ kind: 'text', a: b.a, b: b.b, text: b.text, rect: unionRect(sp), label: cont ? 'continues from the page before' : goes ? 'continues on the next page' : '' });
  });
  // pictures: the figure paragraphs around the text on this page, matched with the pictures in order
  if (geo.imgs.length) {
    const lo = matched.length ? Math.max(0, matched[0] - 1) : 0, hi = matched.length ? Math.min(blocks.length - 1, matched[matched.length - 1] + 1) : blocks.length - 1;
    let k = 0;
    for (let bi = lo; bi <= hi && k < geo.imgs.length; bi++) {
      const n = (blocks[bi].text.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length; if (!n) continue;
      const take = geo.imgs.slice(k, k + n); k += take.length; if (!take.length) break;
      out.push({ kind: 'fig', a: blocks[bi].a, b: blocks[bi].b, text: blocks[bi].text, rect: unionRect(take), label: 'picture' });
    }
  }
  return out;
}
S.vSel = new Map();
let ovlTok = 0;
const blkKey = b => b.kind + ':' + b.a;
async function drawOverlays() {
  $$('#stage .ovl').forEach(e => e.remove());
  const tok = ++ovlTok;
  if (!S.selMode || !S.pdfDoc) return;
  const spread = $('#stage .spread'); if (!spread) return;
  spread.style.position = 'relative';
  for (const cv of $$('#stage canvas[data-p]')) {
    const pn = +cv.dataset.p, blocks = await pageBlocks(pn); if (tok !== ovlTok) return;
    const geo = await pageGeo(pn), f = cv.offsetWidth / geo.w;
    const ov = document.createElement('div'); ov.className = 'ovl';
    Object.assign(ov.style, { left: cv.offsetLeft + 'px', top: cv.offsetTop + 'px', width: cv.offsetWidth + 'px', height: cv.offsetHeight + 'px' });
    for (const b of blocks) {
      const d = document.createElement('div'), pad = 3;
      d.className = 'blk ' + b.kind + (S.vSel.has(blkKey(b)) ? ' on' : '');
      Object.assign(d.style, { left: (b.rect.x * f - pad) + 'px', top: (b.rect.y * f - pad) + 'px', width: (b.rect.w * f + 2 * pad) + 'px', height: (b.rect.h * f + 2 * pad) + 'px' });
      d.title = (b.label ? b.label + ': ' : '') + (b.kind === 'fig' ? (b.text.match(/!\[([^\]]*)\]\(([^)]*)\)/) || []).slice(1).join(' · ') : plainMd(b.text).replace(/\s+/g, ' ').trim().slice(0, 90));
      d.addEventListener('click', ev => {
        ev.stopPropagation(); S.sel = pn;
        const k = blkKey(b); if (S.vSel.has(k)) S.vSel.delete(k); else S.vSel.set(k, { kind: b.kind, a: b.a, b: b.b, text: b.text, page: pn });
        d.classList.toggle('on', S.vSel.has(k)); markSel();
      });
      ov.append(d);
    }
    spread.append(ov);
  }
}
// remove blocks (and their footnote texts) from the manuscript; headings take their section along
function vRemoveBlocks(selIn, label, extraNote) {
  const { norm, items } = mdItemsOf(S.md); if (items.length !== S.model.outline.length) { toast('The pages no longer match the text. Build again first.'); return; }
  let sel = selIn.slice();
  const dead = [];
  for (const b of sel.filter(x => x.kind === 'head')) {
    const i = items.findIndex(it => it.start === b.a); if (i < 0) continue;
    let end = items[i].end;
    if (S.model.outline[i].type === 'part') for (let j = i + 1; j < items.length && items[j].level !== 1; j++) end = items[j].end;
    dead.push([items[i].start, end]);
  }
  sel = sel.filter(x => x.kind !== 'head' && !dead.some(d => x.a >= d[0] && x.b <= d[1]));
  // footnote texts that belong to removed paragraphs go too
  const ids = new Set(); sel.forEach(x => { for (const m of x.text.matchAll(/\[\^([^\]]+)\](?!:)/g)) ids.add(m[1]); });
  if (ids.size) {
    const seen = new Set(sel.map(x => x.a));
    for (const it of items) for (const bl of splitBlocks(norm, it.bodyStart, it.end)) {
      const m = /^\[\^([^\]]+)\]:/.exec(bl.text.trim());
      if (m && ids.has(m[1]) && !seen.has(bl.a) && !dead.some(d => bl.a >= d[0] && bl.b <= d[1])) sel.push({ kind: 'text', a: bl.a, b: bl.b, text: bl.text });
    }
  }
  const ranges = dead.concat(sel.map(b => { let e = b.b; while (norm[e] === '\n' || norm[e] === ' ') e++; return [b.a, e]; })).sort((x, y) => y[0] - x[0]);
  let nm = norm; for (const [a, b] of ranges) nm = nm.slice(0, a) + nm.slice(b);
  S.vSel.clear();
  vApply(label, nm);
  drawOverlays();
  if (extraNote) setTimeout(() => toast(extraNote), 50);
}
function vSelRemove() {
  if (!S.vSel.size) return;
  const all = [...S.vSel.values()], n = all.length, first = plainMd(all[0].text).replace(/\s+/g, ' ').trim().slice(0, 40);
  vRemoveBlocks(all, n === 1 ? `Removed “${first}${first.length >= 40 ? '…' : ''}”` : `Removed ${n} items`);
}
async function vDeletePage() {
  const loc = locate(S.sel);
  if (!loc || loc.generated) { toast('This page is generated (title page, contents or index). Change it on the Book tab.'); return; }
  const blocks = await pageBlocks(S.sel), co = S.pdf.covers ? 1 : 0, no = S.sel - co;
  const heads = blocks.filter(b => b.kind === 'head'), rest = blocks.filter(b => b.kind !== 'head' && !/^\[\^[^\]]+\]:/.test(b.text.trim()));
  if (!rest.length) {
    toast(heads.length ? 'Only the chapter heading is on this page. Use “Remove chapter” to delete it with its text.' : 'Nothing to delete: this page is empty. Blank pages come from “Chapters start on right-hand page” on the Book tab.');
    return;
  }
  const over = rest.filter(b => b.label).length;
  vRemoveBlocks(rest, `Deleted page ${no}`, over ? `${over} paragraph${over > 1 ? 's' : ''} ran over to another page and ${over > 1 ? 'were' : 'was'} removed whole.` : (heads.length ? 'The chapter heading stays: use “Remove chapter” to delete it too.' : ''));
}
function vSelEdit() {
  if (S.vSel.size !== 1) return;
  const b = [...S.vSel.values()][0], { norm } = mdItemsOf(S.md);
  vState = { norm, scope: 'block', range: [b.a, b.kind === 'head' ? mdItemsOf(S.md).items.find(it => it.start === b.a).bodyStart - 1 : b.b], hit: [], item: {} };
  $('#vTitle').textContent = b.kind === 'head' ? 'Edit heading' : b.kind === 'fig' ? 'Edit picture line' : 'Edit text block';
  $('#vScope').hidden = true; vFill(); $('#vDlg').showModal();
}
function markSel() {
  $$('#stage canvas[data-p]').forEach(c => c.classList.toggle('sel', +c.dataset.p === S.sel));
  const co = S.pdf && S.pdf.covers ? 1 : 0, n = S.pdfDoc ? S.pdfDoc.numPages : 0;
  const lab = !S.sel ? '' : (co && S.sel === 1 ? 'front cover' : co && S.sel === n ? 'back cover' : 'page ' + (S.sel - co));
  $('#pSel').textContent = lab ? 'Selected: ' + lab + ' (click a page to select it)' : '';
  const loc = S.sel ? locate(S.sel) : null, gen = !loc || loc.generated;
  const real = !gen && loc.o;
  $('#pedit').hidden = !S.pdfDoc;
  $('#vDelPage').disabled = gen;
  $('#vEdit').disabled = gen; $('#vRemPage').disabled = gen || real.type === 'part'; $('#vRemSec').disabled = gen;
  $('#vRemSec').textContent = gen ? 'Remove chapter' : real.type === 'part' ? 'Remove part and its chapters' : real.sec.role === 'chapter' || real.sec.role === 'plain' || real.sec.role === 'appendix' ? 'Remove chapter' : 'Remove section';
  let part = -1;
  if (!gen && real.type !== 'part') for (let i = loc.index - 1; i >= 0; i--) if (S.model.outline[i] && S.model.outline[i].type === 'part') { part = i; break; }
  $('#vRemPart').hidden = part < 0; $('#vRemPart').dataset.part = part;
  $('#vUndo').hidden = !(S.vUndo && S.vUndo.length); $('#vUndo').textContent = `Undo (${(S.vUndo || []).length})`;
  $('#vRebuild').hidden = !(S.stale && S.pdfDoc);
  $('#vSelMode').setAttribute('aria-pressed', String(!!S.selMode));
  const ns = S.vSel ? S.vSel.size : 0;
  $('#vRemSel').hidden = !S.selMode || !ns; $('#vRemSel').textContent = `Remove selected (${ns})`;
  $('#vEditSel').hidden = !S.selMode || ns !== 1; $('#vClearSel').hidden = !S.selMode || !ns;
  if (S.selMode) $('#pSel').textContent = ns ? `${ns} item${ns > 1 ? 's' : ''} selected. Click an outlined item on the page to select or deselect it.` : 'Click outlined items on the page to select them (text blocks, headings, pictures).';
}
function vApply(label, newMd) {
  (S.vUndo = S.vUndo || []).push({ md: S.md, label }); if (S.vUndo.length > 30) S.vUndo.shift();
  S.vSel.clear(); S.md = newMd; $('#editor').value = S.md; S.isSample = false; sampleTag(); undoMd = null; $('#undoFmtBtn').hidden = true;
  changed(); parse(); markSel();
  toast(label + '. Rebuild the PDF to update the pages.');
}
function vContext() {
  const loc = locate(S.sel);
  if (!loc || loc.generated) { toast('This page is generated (title page, contents or index). Change it on the Book tab.'); return null; }
  const { norm, items } = mdItemsOf(S.md);
  if (items.length !== S.model.outline.length) { toast('The pages no longer match the text. Build again first.'); return null; }
  return { loc, norm, items, item: items[loc.index] };
}
let vState = null;
async function vOpenEdit() {
  const c = vContext(); if (!c) return;
  const { hit } = await pageParas(c.item, c.norm, c.loc, S.sel);
  vState = Object.assign(c, { hit, scope: hit.length ? 'page' : 'section' });
  const co = S.pdf.covers ? 1 : 0;
  $('#vTitle').textContent = `Edit text · page ${S.sel - co}`;
  $('#vScope').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.v === vState.scope)); });
  $('#vScope').querySelector('[data-v=page]').disabled = !hit.length;
  $('#vScope').hidden = false; vFill(); $('#vDlg').showModal();
}
function vRange() {
  const s = vState;
  if (s.scope === 'block') return s.range;
  if (s.scope === 'page' && s.hit.length) return [s.hit[0].a, s.hit[s.hit.length - 1].b];
  return [s.item.start, s.item.end];
}
function vFill() {
  const [a, b] = vRange();
  $('#vText').value = vState.norm.slice(a, b).replace(/\s+$/, '');
  $('#vHint').textContent = vState.scope === 'block' ? 'One block of the manuscript, in markdown. Picture lines look like ![caption](file.jpg).' : vState.scope === 'page'
    ? 'The paragraphs that start on this page. A paragraph that began on the page before is in the section view.'
    : 'The heading and all the text of this section, in the manuscript’s markdown.';
}
async function vSave(rebuild) {
  const [a, b] = vRange(), s = vState;
  const trailing = s.norm.slice(a, b).match(/\s*$/)[0];
  const nm = s.norm.slice(0, a) + $('#vText').value.replace(/\s+$/, '') + trailing + s.norm.slice(b);
  $('#vDlg').close();
  if (nm !== s.norm) vApply('Text changed', nm);
  if (rebuild) build('pdf');
}
$('#vEdit').addEventListener('click', vOpenEdit);
$('#vScope').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  if (b.disabled || !vState) return; vState.scope = b.dataset.v;
  $('#vScope').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); vFill();
}));
$('#vSave').addEventListener('click', () => vSave(false));
$('#vSaveBuild').addEventListener('click', () => vSave(true));
$('#vCancel').addEventListener('click', () => $('#vDlg').close());
$('#vRemPage').addEventListener('click', async () => {
  const c = vContext(); if (!c) return;
  const { hit } = await pageParas(c.item, c.norm, c.loc, S.sel);
  if (!hit.length) { toast('No paragraph starts on this page. Use “Remove chapter” or edit the section.'); return; }
  const a = hit[0].a; let b = hit[hit.length - 1].b;
  while (c.norm[b] === '\n' || c.norm[b] === ' ') b++;
  vApply(`Removed ${hit.length} paragraph${hit.length > 1 ? 's' : ''} from page ${S.sel - (S.pdf.covers ? 1 : 0)}`, c.norm.slice(0, a) + c.norm.slice(b));
});
$('#vRemSec').addEventListener('click', () => {
  const c = vContext(); if (!c) return;
  const it = c.item; let end = it.end;
  if (c.loc.o.type === 'part') for (let i = c.loc.index + 1; i < c.items.length && c.items[i].level !== 1; i++) end = c.items[i].end;
  const name = c.loc.o.type === 'part' ? c.loc.o.title : c.loc.o.sec.title;
  vApply(`Removed “${name}”`, c.norm.slice(0, it.start) + c.norm.slice(end));
});
$('#vRemPart').addEventListener('click', () => {
  const c = vContext(); if (!c) return;
  const pi = +$('#vRemPart').dataset.part, it = c.items[pi]; let end = it.end;
  for (let i = pi + 1; i < c.items.length && c.items[i].level !== 1; i++) end = c.items[i].end;
  vApply(`Removed part “${S.model.outline[pi].title}”`, c.norm.slice(0, it.start) + c.norm.slice(end));
});
$('#vUndo').addEventListener('click', () => {
  const u = (S.vUndo || []).pop(); if (!u) return;
  S.md = u.md; $('#editor').value = S.md; changed(); parse(); markSel(); toast('Undone: ' + u.label);
});
$('#vRebuild').addEventListener('click', () => build('pdf'));
$('#vSelMode').addEventListener('click', () => { S.selMode = !S.selMode; markSel(); drawOverlays(); });
$('#vRemSel').addEventListener('click', vSelRemove);
$('#vDelPage').addEventListener('click', vDeletePage);
$('#vEditSel').addEventListener('click', vSelEdit);
$('#vClearSel').addEventListener('click', () => { S.vSel.clear(); markSel(); drawOverlays(); });
document.addEventListener('keydown', e => {
  if (!S.selMode || S.view !== 'pages' || !S.vSel.size || $('#vDlg').open || /input|textarea|select/i.test((document.activeElement || {}).tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); vSelRemove(); }
  if (e.key === 'Escape') { S.vSel.clear(); markSel(); drawOverlays(); }
});
$('#prevBtn').addEventListener('click', () => { if (!S.pdfDoc) return; const [l, r] = spreadOf(S.page); S.page = Math.max(1, (l || r) - 1); renderSpread(); });
$('#nextBtn').addEventListener('click', () => { if (!S.pdfDoc) return; const [l, r] = spreadOf(S.page); S.page = Math.min(S.pdfDoc.numPages, (r || l) + 1); renderSpread(); });
$('#pageSlider').addEventListener('input', debounce(e => { S.page = +e.target.value; renderSpread(); }, 60));
document.addEventListener('keydown', e => {
  if (S.view !== 'pages' || /input|textarea|select/i.test((document.activeElement || {}).tagName)) return;
  if (e.key === 'ArrowRight') $('#nextBtn').click();
  if (e.key === 'ArrowLeft') $('#prevBtn').click();
});
window.addEventListener('resize', debounce(() => { if (S.view === 'pages') renderSpread(); else if (S.view === 'scan') { if (window.BKO) window.BKO.render(); } else if (S.view === 'wrap') drawWrapView(); else drawCovers(); }, 200));

// ---------------------------------------------------------------- build
function setBusy(b) {
  S.busy = b;
  ['#buildBtn', '#buildBtn2', '#buildPdfBtn', '#buildEpubBtn', '#kdpBuildInt', '#kdpBuildEpub'].forEach(s => { $(s).disabled = b; });
  $('#prog').hidden = !b; $('#kdpProg').hidden = !b;
}
async function build(which) {
  if (S.busy) return;
  setBusy(true);
  parse();
  const model = S.model;
  if (!model) { setBusy(false); return; }
  const cfg = effCfg();
  const t0 = performance.now();
  try {
    if (which !== 'epub') {
      const r = await BK.buildPdf(model, cfg, S.assets, status);
      S.pdf = Object.assign(r, { covers: cfg.include_covers !== false, name: outName() + '.pdf' });
      if (S.pdfDoc) { try { S.pdfDoc.destroy(); } catch (e) { /* ignore */ } }
      await pdfjs();
      S.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(await r.blob.arrayBuffer()) }).promise;
      S.pdf.pages = S.pdfDoc.numPages;
      renderKdp();
      S.page = Math.min(Math.max(1, S.page), S.pdfDoc.numPages);
    }
    if (which !== 'pdf') {
      const r = await BK.buildEpub(BK.parse(S.md, cfg), cfg, S.assets, status);
      S.epub = Object.assign(r, { name: outName() + '.epub' });
    }
    S.stale = false;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status(`Built in ${secs} s`);
    renderResults();
    if (which !== 'epub') setView('pages');
    if (window.innerWidth < 900) document.querySelector('.desk').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    status('Build failed');
    toast('Build failed: ' + (e && e.message ? e.message : e));
  } finally { setBusy(false); }
}
function renderResults() {
  renderKdp();
  const box = $('#results'); box.innerHTML = '';
  const add = (extTxt, metaHtml, name, blob) => {
    const d = document.createElement('div'); d.className = 'result';
    d.innerHTML = `<span class="ext">${extTxt}</span><div class="meta">${metaHtml}</div><button class="btn small" type="button">Download</button>`;
    d.querySelector('button').addEventListener('click', () => saveFile(name, blob));
    box.append(d);
  };
  if (S.pdf) {
    const p = S.pdf;
    const body = p.pages - (p.covers ? 2 : 0);
    add('PDF', `<b>${BK.esc(p.name)}</b><br>${body} body pages${p.covers ? ', ' + p.pages + ' with covers' : ''} · ${fmtBytes(p.blob.size)} · ${p.indexTerms} index terms<br>Page numbers stable: <span class="${p.stable ? 'check-ok' : 'check-bad'}">${p.stable ? 'yes' : 'no'}</span>${p.missing.length ? `<br><span class="check-bad">Missing images:</span> ${p.missing.map(BK.esc).join(', ')}` : ''}`, p.name, p.blob);
    $('#deskInfo').innerHTML = `<span><b>${body}</b> pages</span><span><b>${p.indexTerms}</b> index terms</span><span>numbers stable <b class="${p.stable ? 'check-ok' : 'check-bad'}">${p.stable ? 'yes' : 'no'}</b></span>`;
  }
  if (S.pdf && kdpOn(S.cfg)) {
    const d = document.createElement('div'); d.className = 'kdpres';
    const body = S.pdf.pages - (S.pdf.covers ? 2 : 0), g = BK.kdpGeom(S.cfg, body);
    d.innerHTML = `<b>KDP check</b><ul class="kdpchecks">${kdpChecksHtml(BK.kdpChecks(S.cfg, body))}</ul><p class="hint">The interior PDF has no cover pages. The print cover for these ${body} pages is ${g.w} × ${g.h} mm with a ${g.spine} mm spine: see Cover files below.</p>`;
    box.append(d);
  }
  if (S.epub) add('EPUB', `<b>${BK.esc(S.epub.name)}</b><br>${S.epub.pages} files in reading order · ${S.epub.images} images · ${fmtBytes(S.epub.blob.size)}`, S.epub.name, S.epub.blob);
  if (!S.pdf && !S.epub) box.innerHTML = '<p class="hint">Nothing built yet.</p>';
}
$('#buildBtn').addEventListener('click', () => build('both'));
$('#buildBtn2').addEventListener('click', () => build('both'));
$('#buildPdfBtn').addEventListener('click', () => build('pdf'));
$('#buildEpubBtn').addEventListener('click', () => build('epub'));

// ---------------------------------------------------------------- exports
function kitFiles(mdIn, cfgIn) {
  const md = mdIn == null ? S.md : mdIn, cfg = cfgIn || S.cfg;
  const m = BK.parse(md, Object.assign({}, cfg, { excluded: {} }));
  const files = new Map(), j = { front: [], parts: [], chapters: [], back: [], appendix_parts: [] };
  const head = s => `## ${s.role === 'interlude' ? '* ' : s.role === 'plain' ? '~ ' : ''}${s.rawTitle}${s.sub ? ' | ' + s.sub : ''}\n`;
  if (m.front.length) { files.set('front.md', m.front.map(s => head(s) + s.body.replace(/^\n+/, '\n')).join('\n').trim() + '\n'); j.front.push('front.md'); }
  let pk = 0;
  for (const p of m.parts) {
    const body = p.chapters.map(s => head(s) + s.body.replace(/^\n+/, '\n')).join('\n');
    if (p.pid) {
      const name = `part${++pk}.md`;
      files.set(name, `# ${p.label ? p.label + ' – ' : ''}${p.title}\n\n${p.rawSub || ''}\n\n${p.intro || ''}\n\n${body}`.replace(/\n{3,}/g, '\n\n'));
      j.parts.push(name);
      if (p.chapters.length && p.chapters.every(c => c.role === 'appendix')) j.appendix_parts.push(name);
    } else if (p.chapters.length) { files.set('chapters.md', body); j.chapters.push('chapters.md'); }
  }
  m.back.forEach((s, i) => { const name = `back${i + 1}.md`; files.set(name, `# ${s.rawTitle}\n${s.body}`); j.back.push(name); });
  for (const k of ['front', 'parts', 'chapters', 'back', 'appendix_parts']) if (!j[k].length) delete j[k];
  return { files, json: toKitJson(j, cfg), model: m };
}
async function projectZip(md, cfg, assets) {
  const k = kitFiles(md, cfg), z = new JSZip();
  z.file('book.json', JSON.stringify(k.json, null, 2));
  for (const [n, t] of k.files) z.file(n, t);
  const refs = BK.referencedImages(k.model, cfg);
  for (const src of refs.keys()) { const a = BK.findAsset(assets, src); if (a) z.file(src, a.dataURL.split(',')[1], { base64: true }); }
  return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
async function imagesZip(md, cfg, assets) {
  const m = BK.parse(md, Object.assign({}, cfg, { excluded: {} })), z = new JSZip();
  let n = 0;
  for (const src of BK.referencedImages(m, cfg).keys()) { const a = BK.findAsset(assets, src); if (a) { z.file(src, a.dataURL.split(',')[1], { base64: true }); n++; } }
  if (!n) for (const [name, a] of assets) { z.file(name, a.dataURL.split(',')[1], { base64: true }); n++; }
  return n ? z.generateAsync({ type: 'blob', compression: 'STORE' }) : null;
}
$('#jsonBtn').addEventListener('click', () => { const k = kitFiles(); saveFile('book.json', JSON.stringify(k.json, null, 2)); });
$('#mdBtn').addEventListener('click', () => saveFile(outName() + '.md', S.md));
$('#kitBtn').addEventListener('click', async () => saveFile(outName() + '_kit.zip', await projectZip(S.md, S.cfg, S.assets)));
$('#imgZipBtn').addEventListener('click', async () => { const b = await imagesZip(S.md, S.cfg, S.assets); if (b) saveFile(outName() + '_images.zip', b); else toast('There are no images to save yet.'); });

// ---------------------------------------------------------------- manuscript inputs
const ed = $('#editor');
ed.addEventListener('input', () => { S.md = ed.value; undoMd = null; $('#undoFmtBtn').hidden = true; if (S.isSample) { S.isSample = false; sampleTag(); } changed(); reparse(); });
let undoMd = null;
$('#detectBtn').addEventListener('click', () => {
  undoMd = S.md;
  const r = BK.autoFormat(S.md, { lang: S.cfg.lang });
  S.md = r.md; ed.value = S.md; S.isSample = false; sampleTag();
  if (r.meta.title && !S.cfg.title) S.cfg.title = r.meta.title;
  if (r.meta.author && !S.cfg.author) S.cfg.author = r.meta.author;
  if (r.meta.subtitle && !S.cfg.subtitle) S.cfg.subtitle = r.meta.subtitle;
  fillForm(); changed(); parse();
  const st = r.stats, bits = [];
  if (st.parts) bits.push(`${st.parts} part${st.parts > 1 ? 's' : ''}`);
  if (st.chapters) bits.push(`${st.chapters} chapter${st.chapters > 1 ? 's' : ''}`);
  if (st.sections) bits.push(`${st.sections} heading${st.sections > 1 ? 's' : ''}`);
  if (st.scenes) bits.push(`${st.scenes} scene break${st.scenes > 1 ? 's' : ''}`);
  if (st.quotes) bits.push(`${st.quotes} quote${st.quotes > 1 ? 's' : ''}`);
  if (st.poems) bits.push(`${st.poems} poem${st.poems > 1 ? 's' : ''}`);
  if (st.lists) bits.push(`${st.lists} list${st.lists > 1 ? 's' : ''}`);
  if (st.notes) bits.push(`${st.notes} footnote${st.notes > 1 ? 's' : ''}`);
  if (st.pictures) bits.push(`${st.pictures} picture${st.pictures > 1 ? 's' : ''}`);
  toast(bits.length ? 'Formatted: ' + bits.join(', ') : 'Nothing to change: the text already looks formatted.');
  $('#undoFmtBtn').hidden = !bits.length && !r.stats.joined;
});
$('#undoFmtBtn').addEventListener('click', () => {
  if (undoMd == null) return;
  S.md = undoMd; ed.value = S.md; undoMd = null; $('#undoFmtBtn').hidden = true;
  changed(); parse(); toast('Auto-format undone');
});
$('#clearBtn').addEventListener('click', () => {
  if ($('#clearBtn').dataset.armed) {
    delete $('#clearBtn').dataset.armed; $('#clearBtn').textContent = 'Clear';
    S.md = ''; ed.value = ''; S.isSample = false; S.cfg = merge(BK.defaults(), { lang: S.cfg.lang }); S.assets.clear();
    fillForm(); sampleTag(); changed(); parse(); return;
  }
  $('#clearBtn').dataset.armed = '1'; $('#clearBtn').textContent = 'Click again to clear text and settings';
  setTimeout(() => { if ($('#clearBtn').dataset.armed) { delete $('#clearBtn').dataset.armed; $('#clearBtn').textContent = 'Clear'; } }, 4000);
});
const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { const fs = [...(e.dataTransfer.files || [])]; if (fs.length) importEntries(fs.map(fileEntry)); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { if (!drop.contains(e.target)) { e.preventDefault(); const fs = [...(e.dataTransfer.files || [])]; if (fs.length) importEntries(fs.map(fileEntry)); } });
['#fileIn', '#dirIn', '#zipIn', '#jsonIn', '#textIn', '#imgIn2'].forEach(id => $(id).addEventListener('change', e => {
  const fs = [...e.target.files]; e.target.value = '';
  if (fs.length) importEntries(fs.map(f => Object.assign(fileEntry(f), { name: f.webkitRelativePath || f.name })));
}));
$('#imgIn').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) await addImage(f.name, f); renderAssets(); fillForm(); coverSoon(); toast(`Added ${fs.length} image${fs.length > 1 ? 's' : ''}`); });
$('#coverIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const a = await addImage(f.name, f);
  if (!a) return;
  S.cfg.cover.image = f.name;
  if (S.cfg.cover.style === 'classic') S.cfg.cover.style = 'photo';
  fillForm(); renderAssets(); changed(); setView('cover');
});
$('#backIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const a = await addImage(f.name, f);
  if (!a) return;
  S.cfg.cover.back_image = f.name;
  fillForm(); renderAssets(); changed(); setView('cover');
});
$('#backClear').addEventListener('click', () => { S.cfg.cover.back_image = ''; fillForm(); changed(); });
$('#coverClear').addEventListener('click', () => { S.cfg.cover.image = ''; fillForm(); changed(); });

// ---------------------------------------------------------------- start
// hooks for the Extract tab (ocr.js)
window.BKAPP = {
  pdfjs, pageBlocks, pageGeo, setView, status, toast, showTab, saveFile, projectZip, imagesZip, kitFiles,
  get view() { return S.view; },
  async useExtract(r) {
    for (const im of r.images || []) await addImage(im.name, im.blob);
    if (S.isSampleCfg || S.isSample) { S.cfg = merge(BK.defaults(), { lang: S.cfg.lang }); S.isSampleCfg = false; }
    S.md = r.md; S.isSample = false; S.cfg.roles = {}; S.cfg.part_intro_off = {}; S.cfg.excluded = {};
    const m = r.meta || {};
    for (const k of ['title', 'subtitle', 'subtitle2', 'author', 'lang']) if (m[k]) S.cfg[k] = m[k];
    if (m.colophon && m.colophon.length) S.cfg.colophon = m.colophon;
    if (m.dedication && m.dedication.length) S.cfg.dedication = m.dedication;
    if (m.index && m.index.length) { S.cfg.index = m.index; if (m.index_sort) S.cfg.index_sort = m.index_sort; }
    fillForm(); ed.value = S.md; sampleTag(); changed(); parse(); renderAssets();
    showTab('manuscript');
    const n = S.model ? BK.chaptersOf(S.model).length : 0;
    status(`Manuscript from the scan · ${n} chapters`);
  }
};

load();
S.isSampleCfg = S.isSample;
initForm(); fillForm(); ed.value = S.md; sampleTag();
try { const t = sessionStorage.getItem('blk-tab'); if (t && $('#panel-' + t)) showTab(t); } catch (e) { /* ignore */ }
parse();
status(S.isSample ? 'Sample manuscript loaded · drop your own on the left' : 'Your manuscript is restored from this browser');
setView('cover');
})();
