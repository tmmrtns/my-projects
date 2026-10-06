/* Book Layout Kit – Extract tab: read a scanned (or digital) book and rebuild it as a kit manuscript.
   Text recognition: Tesseract.js, loaded from jsDelivr on first use. Everything runs in this browser. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const ZW = '​';
if (window.claude) return;           // the Claude page cannot load the recognition engine; the downloaded app can
document.getElementById('tab-extract').hidden = false;

const TESS = window.BK_TESS_BASE || 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/';
const OCR_LANGS = { eng: 'English', nld: 'Nederlands', fra: 'Français', deu: 'Deutsch', spa: 'Español', ita: 'Italiano' };
const KIT_LANG = { eng: 'en', nld: 'nl', fra: 'fr', deu: 'de', spa: 'es', ita: 'it' };
const X = { files: [], running: false, stop: false, result: null, pages: [], view: 0, scheduler: null };

const { analyze, median, pct, isUpper } = window.BKOCR;

// ---------------------------------------------------------------- engine loading
let tessLoading = null;
const loadTess = () => tessLoading || (tessLoading = BK.loadScript(TESS + 'tesseract.min.js'));
async function makeScheduler(langs, n, onProgress) {
  await loadTess();
  const sch = Tesseract.createScheduler();
  const opts = { logger: m => onProgress && onProgress(m) };
  if (window.BK_TESS_PATHS) Object.assign(opts, window.BK_TESS_PATHS);
  for (let i = 0; i < n; i++) {
    const w = await Tesseract.createWorker(langs.join('+'), 1, opts);
    sch.addWorker(w);
  }
  return sch;
}

// ---------------------------------------------------------------- page sources
async function makeSources(files) {
  const out = [];
  // a .zip of page scans is opened like a folder of images
  const flat = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const z = await JSZip.loadAsync(await f.arrayBuffer());
      const ents = [];
      z.forEach((path, e) => { if (!e.dir && /\.(png|jpe?g|webp|bmp|gif|pdf)$/i.test(path) && !/(^|\/)(__MACOSX|\.)/.test(path)) ents.push([path, e]); });
      for (const [path, e] of ents) flat.push(new File([await e.async('blob')], path, { type: /pdf$/i.test(path) ? 'application/pdf' : (/png$/i.test(path) ? 'image/png' : 'image/jpeg') }));
    } else flat.push(f);
  }
  files = flat;
  const nat = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  for (const f of files.slice().sort(nat)) {
    if (/\.pdf$/i.test(f.name)) {
      await BKAPP.pdfjs();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      let kit = false;
      try { const md = await doc.getMetadata(); kit = /Book Layout Kit/.test((md.info && (md.info.Producer + ' ' + md.info.Creator)) || ''); } catch (e) { /* no metadata */ }
      for (let i = 1; i <= doc.numPages; i++) out.push({ label: `${f.name} · p. ${i}`, pdf: doc, n: i, kit });
    } else if (/\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(f.name)) out.push({ label: f.name, file: f });
  }
  return out;
}

async function renderSource(src, targetW) {
  if (src.pdf) {
    const page = await src.pdf.getPage(src.n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, targetW / vp1.width);
    const vp = page.getViewport({ scale });
    const cv = BK.canvasOf(vp.width, vp.height), c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: c, viewport: vp }).promise;
    return { canvas: cv, page, vp };
  }
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(src.file); });
  const im = await BK.loadImg(url);
  let w = im.naturalWidth, h = im.naturalHeight;
  const s = w < 1200 ? 1600 / w : Math.min(1, targetW * 1.4 / w);
  const cv = BK.canvasOf(w * s, h * s), c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  c.drawImage(im, 0, 0, cv.width, cv.height);
  return { canvas: cv };
}

// text layer of a digital PDF -> lines (pdf.js already puts spaces where words end)
async function textLayerLines(page, vp, kit) {
  const tc = await page.getTextContent();
  const items = [];
  for (const it of tc.items) {
    if (it.str == null || it.str === '') continue;
    const m = pdfjsLib.Util.transform(vp.transform, it.transform);
    const h = Math.hypot(m[2], m[3]);
    if (h < 2) continue;
    const str = /^(\S )+\S$/.test(it.str.trim()) ? it.str.replace(/(\S) (?=\S)/g, '$1') : it.str;   // letter-spaced capitals
    items.push({ s: str.replace(/[\u200B\u00AD]/g, ''), x0: m[4], x1: m[4] + it.width * vp.scale, base: m[5], h, ws: !it.str.trim() });
  }
  const solid = items.filter(i => !i.ws && i.s);
  solid.sort((a, b) => a.base - b.base);
  const lines = [];
  for (const it of solid) {
    const L = lines.find(l => Math.abs(l.base - it.base) < Math.max(l.h, it.h) * .5);
    if (L) { L.items.push(it); if (it.h > L.h) { L.h = it.h; L.base = it.base; } } else lines.push({ base: it.base, h: it.h, items: [it] });
  }
  // whitespace items belong to the line they sit on
  for (const it of items.filter(i => i.ws)) { const L = lines.find(l => Math.abs(l.base - it.base) < l.h * .5); if (L) L.items.push(it); }
  return lines.map(l => {
    l.items.sort((a, b) => a.x0 - b.x0);
    const bodyH = median(l.items.filter(i => !i.ws).map(i => i.h)) || l.h;
    // spaces come from the geometry: pdf.js sometimes adds a space inside a word that was set in pieces
    const chars = [];
    let prevEnd = null;
    for (const it of l.items) {
      if (it.ws) continue;
      const sup = it.h < bodyH * .8 && it.base < l.base - bodyH * .12 && /^[\d*†,]+$/.test(it.s.trim());
      const n = it.s.length, cw = (it.x1 - it.x0) / Math.max(1, n);
      let a = 0, b = n;
      while (a < b && /\s/.test(it.s[a])) a++;
      while (b > a && /\s/.test(it.s[b - 1])) b--;
      if (a === b) continue;
      // PDFs made by this kit split words at hyphenation points; pdf.js shows those joins as a space of no width
      const zeroLead = kit && a > 0 && prevEnd != null && Math.abs(it.x0 - prevEnd) < bodyH * .05 && /\p{Ll}/u.test(it.s[a]) && chars.length && /\p{L}/u.test(chars[chars.length - 1].c);
      const sx = zeroLead ? it.x0 : it.x0 + a * cw;
      if (prevEnd != null && chars.length && sx - prevEnd > bodyH * .12 && !sup) chars.push({ c: ' ', x0: prevEnd, x1: sx });
      const cw2 = zeroLead ? (it.x1 - it.x0) / Math.max(1, b - a) : cw, base0 = zeroLead ? it.x0 - a * cw2 : it.x0;
      for (let k = a; k < b; k++) chars.push({ c: it.s[k], x0: base0 + k * cw2, x1: base0 + (k + 1) * cw2, sup });
      prevEnd = zeroLead ? it.x1 : it.x0 + b * cw;
    }
    const words = [];
    let w = null;
    for (const ch of chars) {
      if (/\s/.test(ch.c)) { w = null; continue; }
      if (!w) { w = { t: '', sup: '', x0: ch.x0, x1: ch.x1, conf: 100 }; words.push(w); }
      if (ch.sup && w.t) w.sup += ch.c.replace(/,/g, ',');
      else w.t += ch.c;
      w.x1 = ch.x1;
    }
    const x0 = Math.min(...l.items.filter(i => !i.ws).map(i => i.x0)), x1 = Math.max(...l.items.filter(i => !i.ws).map(i => i.x1));
    return { x0, x1, y0: l.base - bodyH * .78, y1: l.base + bodyH * .22, size: bodyH, words: words.filter(x => x.t), conf: 100 };
  }).filter(l => l.words.length);
}

// Tesseract blocks -> lines
function tessLines(blocks) {
  const out = [];
  for (const b of blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const words = [];
    for (const w0 of l.words || []) {
      // a letter-spaced word read as one ("ANNAVERHULST") is split where the gap between letters is widest
      const syms = w0.symbols || [];
      const pieces = [];
      if (syms.length >= 6) {
        const gaps = syms.slice(1).map((sy, k) => sy.bbox.x0 - syms[k].bbox.x1);
        const sorted = gaps.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1], h = w0.bbox.y1 - w0.bbox.y0;
        let start = 0;
        gaps.forEach((g, k) => { if (med > h * .12 && g > med * 1.8 && g > h * .3) { pieces.push(syms.slice(start, k + 1)); start = k + 1; } });
        pieces.push(syms.slice(start));
      } else pieces.push(syms);
      for (const part of pieces.length ? pieces : [[]]) {
        const w = part.length && pieces.length > 1 ? { symbols: part, bbox: { x0: part[0].bbox.x0, x1: part[part.length - 1].bbox.x1, y0: w0.bbox.y0, y1: w0.bbox.y1 }, confidence: w0.confidence } : w0;
        let t = '', sup = '';
        for (const s of w.symbols || []) { if (s.is_superscript && /[\d*†]/.test(s.text) && t) sup += s.text; else t += s.text; }
        if (!t && sup) { t = sup; sup = ''; }
        if (t) words.push({ t, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1, sup, conf: w.confidence, drop: (w.symbols || []).some(s => s.is_dropcap) });
      }
    }
    if (!words.length) continue;
    const size = l.rowAttributes && l.rowAttributes.rowHeight ? l.rowAttributes.rowHeight : (l.bbox.y1 - l.bbox.y0);
    out.push({ x0: l.bbox.x0, x1: l.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1, size, words, conf: l.confidence });
  }
  return out;
}

// ---------------------------------------------------------------- pictures: areas with ink that are not text
function findFigures(cv, lines) {
  const W = cv.width, H = cv.height, cell = Math.max(6, Math.round(W / 160));
  const gw = Math.ceil(W / cell), gh = Math.ceil(H / cell);
  const sm = BK.canvasOf(gw, gh), c = sm.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(cv, 0, 0, gw, gh);
  const d = c.getImageData(0, 0, gw, gh).data;
  const lum = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) lum[i] = .3 * d[i * 4] + .59 * d[i * 4 + 1] + .11 * d[i * 4 + 2];
  const bg = pct(Array.from(lum), .9);
  const m = new Uint8Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) m[i] = lum[i] < bg - 22 ? 1 : 0;
  const real = l => { const t = l.words.map(w => w.t).join(' '); const n = (t.match(/\p{L}/gu) || []).length; return n >= t.replace(/\s/g, '').length * .55 && !(l.conf < 45 && t.length < 30); };
  for (const l of lines.filter(real)) {
    const pad = (l.y1 - l.y0) * .45;
    for (let y = Math.max(0, Math.floor((l.y0 - pad) / cell)); y <= Math.min(gh - 1, Math.floor((l.y1 + pad) / cell)); y++)
      for (let x = Math.max(0, Math.floor((l.x0 - pad) / cell)); x <= Math.min(gw - 1, Math.floor((l.x1 + pad) / cell)); x++) m[y * gw + x] = 0;
  }
  // close small holes
  const dm = new Uint8Array(m);
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) if (!m[y * gw + x]) {
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += m[(y + dy) * gw + x + dx];
    if (n >= 4) dm[y * gw + x] = 1;
  }
  const seen = new Uint8Array(gw * gh), figs = [];
  for (let i = 0; i < gw * gh; i++) {
    if (!dm[i] || seen[i]) continue;
    const st = [i]; seen[i] = 1;
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0, n = 0;
    while (st.length) {
      const k = st.pop(), x = k % gw, y = (k / gw) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
        const kk = yy * gw + xx; if (dm[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fill = n / (bw * bh);
    if (bw < gw * .1 || bh < gh * .05) continue;
    if (bw * bh < gw * gh * .015) continue;
    if (bw / bh > 14 || bh / bw > 14) continue;
    if (fill < .3) continue;
    if ((x0 <= 0 || x1 >= gw - 1) && bw > gw * .9 && bh < gh * .12) continue;      // scan border or shadow
    figs.push({ x0: x0 * cell, y0: y0 * cell, x1: Math.min(W, (x1 + 1) * cell), y1: Math.min(H, (y1 + 1) * cell) });
  }
  return figs;
}

// ---------------------------------------------------------------- run
async function run() {
  if (X.running || !X.files.length) return;
  X.running = true; X.stop = false; X.stopped = false;
  ui.running(true);
  const langs = [...document.querySelectorAll('#ocrLangs input:checked')].map(i => i.value);
  if (!langs.length) langs.push('eng');
  const keepPics = $('#ocrPics').checked, useText = $('#ocrUseText').checked;
  let sources;
  try { sources = await makeSources(X.files); }
  catch (e) { ui.error('The file could not be opened: ' + e.message); X.running = false; ui.running(false); return; }
  const from = Math.max(1, parseInt($('#ocrFrom').value, 10) || 1), to = Math.min(sources.length, parseInt($('#ocrTo').value, 10) || sources.length);
  sources = sources.slice(from - 1, to);
  X.pages = [];
  const images = [];
  monk.start(sources.length);
  let sch = null;
  const t0 = performance.now();
  try {
    const inflight = new Set();
    let finished = 0, nW = 1;
    for (let i = 0; i < sources.length && !X.stop; i++) {
      const src = sources[i];
      const r = await renderSource(src, 1800);
      let lines = null, mode = 'ocr';
      if (useText && r.page) {
        const tl = await textLayerLines(r.page, r.vp, src.kit);
        if (tl.reduce((a, l) => a + l.words.length, 0) >= 8) { lines = tl; mode = 'text'; }
      }
      const pg = { idx: i + from, label: src.label, W: r.canvas.width, H: r.canvas.height, lines: lines || [], mode, canvas: r.canvas };
      X.pages.push(pg);
      if (lines) { finishPage(pg, keepPics, images); monk.done(++finished, sources.length); continue; }
      if (!sch) {
        monk.say('Brother Tesseract fetches his spectacles (the reader downloads once)…');
        nW = Math.min(2, Math.max(1, (navigator.hardwareConcurrency || 2) >> 1));
        sch = X.scheduler = await makeScheduler(langs, nW, m => {
          if (m.status === 'recognizing text') monk.inPage(m.progress);
          else if (/load|initiali/i.test(m.status)) monk.say('Opening the dictionary of ' + langs.map(l => OCR_LANGS[l]).join(' and ') + '…');
        });
      }
      const job = sch.addJob('recognize', pg.canvas, {}, { blocks: true, text: false }).then(res => {
        pg.lines = tessLines(res.data.blocks);
        finishPage(pg, keepPics, images);
        monk.done(++finished, sources.length);
        inflight.delete(job);
      });
      inflight.add(job);
      while (inflight.size >= nW + 1 && !X.stop) await Promise.race(inflight);
    }
    if (!X.stop) await Promise.all(inflight);
    if (X.stop) { ui.stopped(); return; }
    monk.say('Binding the quires…');
    // keep what was read untouched, so the layout can be worked out again after each edit in the review
    X.srcs = sources; X.images = images; X.langs = langs; X.hi = new Map(); X.pending = new Set(); X.figN = 0;
    X.secs = (performance.now() - t0) / 1000;
    X.modes = { text: X.pages.filter(p => p.mode === 'text').length, ocr: X.pages.filter(p => p.mode === 'ocr').length };
    X.raw = X.pages.map((pg, pi) => ({ idx: pg.idx, label: pg.label, W: pg.W, H: pg.H, mode: pg.mode, thumb: pg.thumb,
      figs: JSON.parse(JSON.stringify(pg.figs || [])),
      lines: pg.lines.map((l, k) => Object.assign({}, l, { id: pi + ':' + k, words: l.words.map((w, j) => Object.assign({}, w, { id: pi + ':' + k + '/' + j })) })) }));
    X.edits = { force: {}, figs: {}, fix: {} }; X.undo = []; X.sel = null; X.fixer = null; X.okOverwrite = false;
    reanalyze();
    monk.finish();
    X.running = false;
    ui.result(X.result);
  } catch (e) {
    console.error(e);
    if (X.stop) ui.stopped();
    else ui.error(String(e && e.message || e).includes('Failed to fetch') || String(e).includes('importScripts') ? 'The reader could not be downloaded. Check the internet connection and try again.' : 'Reading stopped: ' + (e && e.message || e));
  } finally {
    if (sch) { try { await sch.terminate(); } catch (e) { /* gone */ } }
    X.scheduler = null; X.running = false; ui.running(false);
  }
}

function finishPage(pg, keepPics, images) {
  const k = 1000 / pg.W;
  const figsPx = keepPics ? findFigures(pg.canvas, pg.lines) : [];
  // pictures are cut from the page at full resolution
  pg.figs = figsPx.map((f, j) => {
    const name = `scan-p${pg.idx}-${j + 1}.jpg`;
    const cv = BK.canvasOf(f.x1 - f.x0, f.y1 - f.y0);
    cv.getContext('2d').drawImage(pg.canvas, f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL('image/jpeg', .9);
    images.push({ name, url });
    return { name, x0: f.x0 * k, y0: f.y0 * k, x1: f.x1 * k, y1: f.y1 * k };
  });
  // normalise to a page 1000 units wide
  pg.lines.forEach(l => {
    l.x0 *= k; l.x1 *= k; l.y0 *= k; l.y1 *= k; l.size *= k;
    l.words.forEach(w => { w.x0 *= k; w.x1 *= k; if (w.y0 != null) { w.y0 *= k; w.y1 *= k; } });
  });
  pg.lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  pg.H *= k; pg.W = 1000;
  // small preview for the review, then let the big canvas go
  const th = BK.canvasOf(900, 900 * pg.canvas.height / pg.canvas.width);
  th.getContext('2d').drawImage(pg.canvas, 0, 0, th.width, th.height);
  pg.thumb = th.toDataURL('image/jpeg', .72);
  pg.canvas = null; pg.r = null;
  if (!pg.lines.length) pg.doneEmpty = true;
}

// ---------------------------------------------------------------- the monk
const monk = (() => {
  const MSG = ['Brother Tesseract sharpens his quill', 'Grinding a little more ink', 'Squinting at a smudged letter', 'Blotting the page with sand', 'Trimming the candle wick', 'Muttering the Latin for “comma”', 'Turning the leaf with great care', 'Shooing the abbey cat off the parchment', 'Checking the spelling against the great book', 'Ruling fresh lines on the vellum'];
  let total = 1, done = 0, inPage = 0, t0 = 0, msgT = 0, msgI = 0;
  const monkEl = document.getElementById('monk');
  const el = () => monkEl;
  const set = () => {
    const f = Math.min(1, (done + inPage) / total);
    const m = el(); if (!m) return;
    m.querySelector('.ribbon i').style.width = (f * 100).toFixed(1) + '%';
    m.querySelector('.folio').textContent = `Folio ${Math.min(total, Math.floor(done) + 1)} of ${total}`;
    m.querySelector('.pctv').textContent = Math.round(f * 100) + '%';
    const el2 = (performance.now() - t0) / 1000;
    if (f > .04 && el2 > 8) { const left = el2 / f - el2; m.querySelector('.eta').textContent = left > 90 ? `about ${Math.round(left / 60)} min left` : `about ${Math.max(5, Math.round(left / 5) * 5)} s left`; }
    // lines written on the right-hand page of the book
    const lines = m.querySelectorAll('.wr line');
    const cur = Math.min(lines.length, inPage * lines.length);
    lines.forEach((ln, i) => { ln.style.strokeDashoffset = i < Math.floor(cur) ? 0 : (i === Math.floor(cur) ? 52 * (1 - (cur - i)) : 52); });
    const li = Math.min(lines.length - 1, Math.floor(cur));
    const ln = lines[li];
    if (ln) {
      const x = +ln.getAttribute('x1') + 52 * Math.min(1, cur - li), y = +ln.getAttribute('y1');
      m.querySelector('.hand').setAttribute('transform', `translate(${x} ${y})`);
      m.querySelector('.arm').setAttribute('d', `M206 150 Q ${(206 + x + 288) / 2 - 10} ${(150 + y + 140) / 2 + 22} ${288 + x * Math.cos(-.19) - y * Math.sin(-.19) - 2} ${140 + x * Math.sin(-.19) + y * Math.cos(-.19) + 2}`);
    }
    const leftLines = m.querySelectorAll('.lp line');
    leftLines.forEach((l2, i) => { l2.style.opacity = i < Math.min(leftLines.length, done) ? 1 : 0; });
  };
  return {
    start(n) {
      total = n; done = 0; inPage = 0; t0 = performance.now();
      const m = el(); m.hidden = false; m.querySelector('.eta').textContent = '';
      clearInterval(msgT);
      this.say(MSG[0]);
      msgT = setInterval(() => { msgI = (msgI + 1) % MSG.length; this.say(MSG[msgI] + '…'); }, 4200);
      BKAPP.setView('scan');
      set();
    },
    page(i, n, what) { done = Math.max(done, i); inPage = 0; set(); },
    inPage(p) { inPage = p; set(); },
    done(k, n) { done = k; inPage = 0; set(); },
    say(t) { const m = el(); if (m) m.querySelector('.msg').textContent = t; },
    finish() { clearInterval(msgT); done = total; inPage = 0; set(); el().querySelector('.eta').textContent = ''; this.say('Amen. The manuscript is copied.'); },
    stop() { clearInterval(msgT); this.say('Brother Tesseract puts down his quill.'); }
  };
})();
const MONK_SVG = `
<svg viewBox="0 0 420 250" role="img" aria-label="A monk copying a book by candlelight">
  <defs>
    <linearGradient id="mk-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9dfc6"/><stop offset="1" stop-color="#d6c6a2"/></linearGradient>
    <radialGradient id="mk-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <linearGradient id="mk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fa3bf"/><stop offset="1" stop-color="#c8dbe6"/></linearGradient>
  </defs>
  <rect width="420" height="250" fill="url(#mk-wall)"/>
  <g stroke="#cbb88f" stroke-width="1" opacity=".7">
    <path d="M0 40h420M0 80h420M0 120h420M0 160h420M0 200h420" fill="none"/>
    <path d="M60 0v40M160 0v40M260 0v40M360 0v40M10 40v40M110 40v40M210 40v40M310 40v40M60 80v40M160 80v40M360 80v40M10 120v40M110 120v40M310 120v40M60 160v40M160 160v40M360 160v40" fill="none"/>
  </g>
  <path d="M40 140V70a32 32 0 0 1 64 0v70z" fill="url(#mk-sky)" stroke="#8c7a55" stroke-width="5"/>
  <path d="M72 38v102M40 92h64" stroke="#8c7a55" stroke-width="3"/>
  <path d="M104 80 L230 230 L120 230 L60 140z" fill="#fff6d8" opacity=".25"/>
  <rect y="222" width="420" height="28" fill="#a88c62"/>
  <path d="M0 222h420" stroke="#8b7149" stroke-width="2"/>
  <!-- cat -->
  <g transform="translate(62 214)">
    <ellipse cx="0" cy="0" rx="22" ry="9" fill="#4b4038"/>
    <circle cx="19" cy="-5" r="7.5" fill="#4b4038"/>
    <path d="M14 -10 l3 -6 l3 5 M20 -11 l4 -5 l1 6" fill="#4b4038"/>
    <path d="M17 -5 q2 1.5 4 0" stroke="#e7d9b9" stroke-width="1" fill="none"/>
    <path class="mk-tail" d="M-20 2 q-16 -2 -14 -14" stroke="#4b4038" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <text class="mk-z" x="30" y="-16" font-size="9" fill="#6d5a40" font-family="serif">z</text>
  </g>
  <!-- stool and monk -->
  <rect x="160" y="196" width="56" height="8" rx="2" fill="#6e4b2a"/>
  <path d="M166 204v18M210 204v18" stroke="#6e4b2a" stroke-width="5"/>
  <path d="M168 200 C160 170 168 140 190 132 L222 132 C236 140 240 170 236 200 Z" fill="#6b4a2f"/>
  <path d="M186 200 C184 182 190 160 204 150" stroke="#55391f" stroke-width="2" fill="none"/>
  <path d="M176 214 h56 l-6 -16 h-44 z" fill="#5d3f25"/>
  <path class="arm" d="M206 150 Q 250 186 296 150" stroke="#6b4a2f" stroke-width="11" fill="none" stroke-linecap="round"/>
  <path d="M194 136 q20 -10 40 0 q-4 9 -20 10 q-16 -1 -20 -10z" fill="#5d3f25"/>
  <g class="mk-head">
    <circle cx="216" cy="117" r="16" fill="#ecc9a3"/>
    <ellipse cx="229" cy="122" rx="5" ry="6.5" fill="#ecc9a3"/>
    <clipPath id="mk-hc"><circle cx="216" cy="117" r="16.6"/></clipPath>
    <g clip-path="url(#mk-hc)">
      <path d="M195 113 Q216 106.5 237 110 L237 114.5 Q226 114 216 115.5 L214 127 Q208 131 195 133z" fill="#8a7a6a"/>
      <path d="M195 113 Q216 106.5 237 110" stroke="#6f6052" stroke-width="1.2" fill="none"/>
      <path d="M220 110.5 v4 M225 110 v4 M230 110.4 v4 M204 112 v8 M209 111 v8" stroke="#6f6052" stroke-width=".8"/>
    </g>
    <ellipse cx="209" cy="120" rx="3" ry="4.2" fill="#dcae86"/>
    <ellipse cx="213" cy="104.5" rx="5" ry="2" fill="#fff" opacity=".5"/>
    <path d="M222 119 q2.5 -2.4 5 0" stroke="#5a3d26" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M221 116 q3 -2 6 -1" stroke="#7a6a5c" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="232" cy="119.5" r="2.6" fill="#e2a988"/>
    <path d="M222 125 q4.5 4 9 0" stroke="#8a4e36" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="219" cy="122" r="3.4" fill="#e79a86" opacity=".55"/>
  </g>
  <!-- lectern -->
  <path d="M292 222 l6 -70 h10 l6 70z" fill="#6e4b2a"/>
  <path d="M270 222h70" stroke="#5c3d20" stroke-width="5"/>
  <g transform="translate(288 140) rotate(-11)">
    <rect x="-6" y="-4" width="128" height="10" rx="2" fill="#7a5230"/>
    <path d="M0 -2 q28 -6 58 -2 v-52 q-30 -4 -58 2 z" fill="#f4ead0" stroke="#c8b588"/>
    <path d="M58 -4 q30 -4 58 2 v-52 q-28 -6 -58 -2 z" fill="#fbf3dc" stroke="#c8b588"/>
    <rect x="6" y="-50" width="9" height="10" fill="#9b2b23"/><rect x="8" y="-48" width="5" height="6" fill="#d9a441"/>
    <g class="lp" stroke="#6d5a40" stroke-width="1.1">
      <line x1="18" y1="-46" x2="52" y2="-47"/><line x1="18" y1="-41" x2="52" y2="-42"/><line x1="6" y1="-36" x2="52" y2="-37"/><line x1="6" y1="-31" x2="52" y2="-32"/>
      <line x1="6" y1="-26" x2="52" y2="-27"/><line x1="6" y1="-21" x2="52" y2="-22"/><line x1="6" y1="-16" x2="52" y2="-17"/><line x1="6" y1="-11" x2="40" y2="-12"/>
    </g>
    <g class="wr" stroke="#3d2f22" stroke-width="1.2" fill="none">
      <line x1="62" y1="-48" x2="114" y2="-47" stroke-dasharray="52" stroke-dashoffset="52"/><line x1="62" y1="-43" x2="114" y2="-42" stroke-dasharray="52" stroke-dashoffset="52"/>
      <line x1="62" y1="-38" x2="114" y2="-37" stroke-dasharray="52" stroke-dashoffset="52"/><line x1="62" y1="-33" x2="114" y2="-32" stroke-dasharray="52" stroke-dashoffset="52"/>
      <line x1="62" y1="-28" x2="114" y2="-27" stroke-dasharray="52" stroke-dashoffset="52"/><line x1="62" y1="-23" x2="114" y2="-22" stroke-dasharray="52" stroke-dashoffset="52"/>
      <line x1="62" y1="-18" x2="114" y2="-17" stroke-dasharray="52" stroke-dashoffset="52"/><line x1="62" y1="-13" x2="114" y2="-12" stroke-dasharray="52" stroke-dashoffset="52"/>
    </g>
    <g class="hand" transform="translate(62 -48)">
      <g class="mk-scribble">
        <circle cx="-2" cy="2" r="5" fill="#e8c7a2"/>
        <path d="M0 0 L22 -30 q4 -2 3 3 L2 1 z" fill="#f2f0ea" stroke="#9a8d76" stroke-width=".8"/>
        <path d="M0 0 l-2 3" stroke="#222" stroke-width="1.2"/>
      </g>
    </g>
  </g>
  <!-- ink and candle -->
  <rect x="352" y="196" width="40" height="6" fill="#7a5230"/><path d="M360 202v20M384 202v20" stroke="#6e4b2a" stroke-width="4"/>
  <path d="M356 196 q2 -10 8 -10 h4 q6 0 8 10z" fill="#2c2a35"/>
  <circle cx="378" cy="150" r="34" fill="url(#mk-glow)" class="mk-glow"/>
  <rect x="373" y="164" width="10" height="32" rx="2" fill="#f4ecd8"/>
  <path d="M378 164v-4" stroke="#333" stroke-width="1"/>
  <path class="mk-flame" d="M378 146 q-5 7 0 14 q5 -7 0 -14z" fill="#ffb53d"/>
  <path class="mk-flame" d="M378 151 q-2 4 0 8 q2 -4 0 -8z" fill="#fff1b8"/>
</svg>`;

// ---------------------------------------------------------------- review of the pages: boxes you can change, and uncertain words to check
const KINDS = [
  ['head', 'Chapter heading', '#2f6db3'],
  ['sub', 'Subheading', '#2a93a8'],
  ['fig', 'Picture', '#2f8a57'],
  ['cap', 'Caption', '#2f8a57'],
  ['quote', 'Quote, poem', '#7a4fb0'],
  ['table', 'Table', '#6b7f1d'],
  ['index', 'Index entries', '#b0397a'],
  ['fn', 'Footnote', '#c76a1a'],
  ['rh', 'Leave out', '#888888']
];
const KIND = Object.fromEntries(KINDS.map(([k, n, c]) => [k, { name: n, col: c }]));
const ROLE_KIND = { head: 'head', sub: 'sub', cap: 'cap', quote: 'quote', poem: 'quote', center: 'quote', scene: 'quote', table: 'table', index: 'index', fn: 'fn', rh: 'rh', toc: 'rh', meta: 'rh' };

// work the layout out again from what was read, with the edits on top
function reanalyze() {
  const E = X.edits;
  const pages = X.raw.map((r, pi) => {
    const pg = JSON.parse(JSON.stringify(Object.assign({}, r, { thumb: null })));
    pg.thumb = r.thumb; pg.pi = pi;
    if (E.figs[pi]) { pg.figs = JSON.parse(JSON.stringify(E.figs[pi])); pg.userFigs = true; }
    pg.lines.forEach(l => {
      if (E.force[l.id]) l.force = E.force[l.id];
      l.words.forEach(w => { const fx = E.fix[w.id]; if (fx != null) { w.t = fx; w.conf = 100; w.fixed = true; } else if (E.ok && E.ok[w.id]) { w.conf = 100; w.fixed = true; } });
      l.words = l.words.filter(w => w.t !== '');
    });
    pg.lines = pg.lines.filter(l => l.words.length);
    return pg;
  });
  const res = analyze(pages, { langs: X.langs });
  res.images = X.images; res.secs = X.secs; res.modes = X.modes;
  X.pages = pages; X.result = res;
  X.low = [];
  pages.forEach((pg, pi) => pg.lines.forEach(l => {
    if (!ROLE_KIND[l.role] && l.role !== 'text') return;
    if (l.role === 'rh' || l.role === 'toc') return;
    l.words.forEach(w => { if (w.conf < 60 && !w.fixed && w.y0 != null) X.low.push({ pi, w, l }); });
  }));
}

// one edit: remember the state before it, change, then rebuild the text
function edit(fn) {
  const before = JSON.stringify(X.edits);
  fn();
  if (JSON.stringify(X.edits) === before) { renderReview(); return; }
  const ta = $('#ocrText');
  if (ta.value !== X.mdGen && !X.okOverwrite) {
    if (!confirm('You changed the extracted text by hand. Rebuilding it from the page replaces those changes. Go on?')) { X.edits = JSON.parse(before); renderReview(); return; }
    X.okOverwrite = true;
  }
  X.undo.push(before);
  rebuild();
}
function rebuild() {
  reanalyze();
  const ta = $('#ocrText');
  ta.value = X.result.md; X.mdGen = ta.value;
  ui.stats(X.result);
  renderReview();
}

const linesIn = (pi, r) => X.raw[pi].lines.filter(l => { const cx = (l.x0 + l.x1) / 2, cy = (l.y0 + l.y1) / 2; return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1; });
const figsOf = pi => X.edits.figs[pi] || (X.edits.figs[pi] = JSON.parse(JSON.stringify(X.raw[pi].figs || [])));

// the page drawn large enough to cut pictures and show words close up
async function hiCanvas(pi) {
  if (X.hi.has(pi)) return X.hi.get(pi);
  const p = renderSource(X.srcs[pi], 1800).then(r => r.canvas);
  X.hi.set(pi, p);
  if (X.hi.size > 3) X.hi.delete(X.hi.keys().next().value);
  return p;
}
function cropFig(pi, f) {
  const job = hiCanvas(pi).then(cv => {
    const k = cv.width / 1000;
    const w = Math.max(1, Math.round((f.x1 - f.x0) * k)), h = Math.max(1, Math.round((f.y1 - f.y0) * k));
    const out = BK.canvasOf(w, h);
    out.getContext('2d').drawImage(cv, f.x0 * k, f.y0 * k, w, h, 0, 0, w, h);
    const url = out.toDataURL('image/jpeg', .9);
    const old = X.images.findIndex(im => im.name === f.name);
    if (old >= 0) X.images[old] = { name: f.name, url }; else X.images.push({ name: f.name, url });
  }).catch(e => BKAPP.toast('The picture could not be cut out: ' + e.message)).finally(() => X.pending.delete(job));
  X.pending.add(job);
}
function newFig(pi, r) {
  const f = { name: `scan-p${X.raw[pi].idx}-e${++X.figN}.jpg`, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
  cropFig(pi, f);
  return f;
}
const unpic = (pi, r) => linesIn(pi, r).forEach(l => { if (X.edits.force[l.id] === 'pic') delete X.edits.force[l.id]; });

// the operations behind the buttons and handles
const ops = {
  kind(pi, b, k) {
    edit(() => {
      if (b.kind === k) return;
      if (b.kind === 'fig') {
        X.edits.figs[pi] = figsOf(pi).filter(f => f.name !== b.fig);
        unpic(pi, b);
        linesIn(pi, b).forEach(l => { X.edits.force[l.id] = k; });
      } else if (k === 'fig') {
        b.ids.forEach(id => { X.edits.force[id] = 'pic'; });
        linesIn(pi, b).forEach(l => { X.edits.force[l.id] = 'pic'; });
        figsOf(pi).push(newFig(pi, b));
      } else b.ids.forEach(id => { X.edits.force[id] = k; });
    });
  },
  remove(pi, b) {
    edit(() => {
      if (b.kind === 'fig') { X.edits.figs[pi] = figsOf(pi).filter(f => f.name !== b.fig); unpic(pi, b); }
      else b.ids.forEach(id => { X.edits.force[id] = 'text'; });
    });
  },
  reshape(pi, b, r) {
    edit(() => {
      if (b.kind === 'fig') {
        unpic(pi, b);
        X.edits.figs[pi] = figsOf(pi).filter(f => f.name !== b.fig);
        X.edits.figs[pi].push(newFig(pi, r));
        linesIn(pi, r).forEach(l => { X.edits.force[l.id] = 'pic'; });
      } else {
        const inside = linesIn(pi, r);
        b.ids.forEach(id => { if (!inside.some(l => l.id === id)) X.edits.force[id] = 'text'; });
        inside.forEach(l => { X.edits.force[l.id] = b.kind; });
      }
    });
  },
  add(pi, r, k) {
    if (k === 'fig') { edit(() => { linesIn(pi, r).forEach(l => { X.edits.force[l.id] = 'pic'; }); figsOf(pi).push(newFig(pi, r)); }); return; }
    const inside = linesIn(pi, r);
    if (!inside.length) { BKAPP.toast('There is no text inside that box. Draw it over the lines it should hold.'); renderReview(); return; }
    edit(() => inside.forEach(l => { X.edits.force[l.id] = k; }));
  },
  undo() { if (!X.undo.length) return; X.edits = JSON.parse(X.undo.pop()); X.sel = null; rebuild(); },
  resetPage(pi) {
    edit(() => {
      const pre = pi + ':';
      for (const key of Object.keys(X.edits.force)) if (key.startsWith(pre)) delete X.edits.force[key];
      for (const key of Object.keys(X.edits.fix)) if (key.startsWith(pre)) delete X.edits.fix[key];
      for (const key of Object.keys(X.edits.ok || {})) if (key.startsWith(pre)) delete X.edits.ok[key];
      delete X.edits.figs[pi];
    });
  },
  fix(it, val) {
    edit(() => { X.edits.fix[it.w.id] = val; });
  },
  // keep words as they were read and stop marking them
  ignore(list) {
    edit(() => { X.edits.ok = X.edits.ok || {}; list.forEach(it => { X.edits.ok[it.w.id] = 1; }); });
  }
};

// the boxes shown on a page: lines of the same kind that sit together, and the pictures
function boxesOf(pg) {
  const ls = pg.lines.filter(l => ROLE_KIND[l.role]).slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const out = [];
  for (const l of ls) {
    const k = ROLE_KIND[l.role], h = l.y1 - l.y0;
    const cur = out.slice().reverse().find(b => b.kind === k && l.y0 - b.y1 < h * 1.4 && l.y0 >= b.y0 - h * .3 && l.x0 < b.x1 + 40 && l.x1 > b.x0 - 40);
    if (cur) { cur.x0 = Math.min(cur.x0, l.x0); cur.x1 = Math.max(cur.x1, l.x1); cur.y1 = Math.max(cur.y1, l.y1); cur.ids.push(l.id); }
    else out.push({ kind: k, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, ids: [l.id] });
  }
  const pad = 3;
  out.forEach(b => { b.x0 -= pad; b.y0 -= pad; b.x1 += pad; b.y1 += pad; });
  for (const f of pg.figs || []) out.push({ kind: 'fig', x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, ids: [], fig: f.name });
  // small boxes on top, so a caption inside a picture can still be picked
  return out.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
}

function renderReview() {
  const stage = document.getElementById('stage');
  if (X.running || !X.result) {
    const m = MONK_NODE;
    if (X.running || X.stopped) { if (m.parentElement !== stage) stage.replaceChildren(m); m.hidden = false; }
    else stage.innerHTML = '<div class="empty"><strong>No scan read yet</strong><span>Drop a scanned book on the Extract tab.</span></div>';
    document.getElementById('pager').hidden = true;
    return;
  }
  const scrollTop = stage.scrollTop;
  const pi = X.view, pg = X.pages[pi], H = pg.H;
  const boxes = boxesOf(pg);
  const wrap = document.createElement('div'); wrap.className = 'scanrev';
  const tools = document.createElement('div'); tools.className = 'scantools';
  const lowHere = X.low.filter(x => x.pi === pi).length;
  tools.innerHTML = `<span class="hint">Click a box to change, resize or remove it. Drag on the page to add one.</span>
    <span class="sp"></span>
    <button class="btn small" type="button" data-a="undo" ${X.undo.length ? '' : 'disabled'}>Undo</button>
    <button class="btn small" type="button" data-a="reset" title="Back to what was found on this page">Reset page</button>
    <button class="btn small ${X.low.length ? 'primary' : ''}" type="button" data-a="words" ${X.low.length ? '' : 'disabled'}>Check uncertain words (${X.low.length}${lowHere ? ', ' + lowHere + ' here' : ''})</button>
    <button class="btn small" type="button" data-a="ignpage" ${lowHere ? '' : 'disabled'} title="Keep the uncertain words on this page as they were read">Ignore on this page</button>
    <button class="btn small" type="button" data-a="ignall" ${X.low.length ? '' : 'disabled'} title="Keep all uncertain words as they were read">Ignore all</button>
    <label class="check small"><input type="checkbox" data-a="show" ${X.hideLow ? '' : 'checked'}> Show them</label>`;
  tools.addEventListener('click', e => {
    const a = e.target.closest('button') && e.target.closest('button').dataset.a;
    if (a === 'undo') ops.undo();
    if (a === 'reset') ops.resetPage(pi);
    if (a === 'words') openFixer(Math.max(0, X.low.findIndex(x => x.pi >= pi)));
    if (a === 'ignpage') { X.fixer = null; ops.ignore(X.low.filter(x => x.pi === pi)); }
    if (a === 'ignall') { X.fixer = null; ops.ignore(X.low.slice()); }
  });
  tools.addEventListener('change', e => { if (e.target.dataset.a === 'show') { X.hideLow = !e.target.checked; renderReview(); } });
  wrap.append(tools);
  if (X.fixer) wrap.append(fixerCard());

  // the page
  const availH = Math.max(320, stage.clientHeight - (X.fixer ? 330 : 120)), availW = Math.max(240, stage.clientWidth - 40);
  const w = Math.min(availW, availH * 1000 / H);
  const sheet = document.createElement('div'); sheet.className = 'sheet';
  sheet.style.width = w + 'px'; sheet.style.height = w * H / 1000 + 'px';
  const img = new Image(); img.src = pg.thumb; img.alt = ''; img.draggable = false;
  const layer = document.createElement('div'); layer.className = 'zlayer';
  sheet.append(img, layer);
  const place = (el, r) => { el.style.left = r.x0 / 10 + '%'; el.style.top = r.y0 / H * 100 + '%'; el.style.width = (r.x1 - r.x0) / 10 + '%'; el.style.height = (r.y1 - r.y0) / H * 100 + '%'; };
  boxes.forEach((b, i) => {
    const el = document.createElement('div');
    el.className = 'zb k-' + b.kind + (pg.lines.some(l => b.ids.includes(l.id) && /^(rh|toc|meta)$/.test(l.role)) ? ' out' : '');
    el.style.setProperty('--c', KIND[b.kind].col);
    el.dataset.i = i; el.title = KIND[b.kind].name;
    place(el, b);
    layer.append(el);
  });
  const cur = X.fixer && X.low[X.fixer.i];
  if (!X.hideLow || X.fixer) X.low.filter(x => x.pi === pi).forEach(x => {
    const el = document.createElement('div');
    el.className = 'zw' + (cur && cur.w === x.w ? ' cur' : '');
    el.title = `“${x.w.t}”: click to check`;
    place(el, x.w);
    el.addEventListener('pointerdown', e => { e.stopPropagation(); openFixer(X.low.indexOf(x)); });
    layer.append(el);
  });
  // the selected box: handles and a menu of kinds
  let sel = X.sel != null && X.sel.page === pi ? boxes.find(b => b.kind === X.sel.kind && (b.fig ? b.fig === X.sel.fig : b.ids[0] === X.sel.id)) : null;
  if (X.sel && X.sel.draft && X.sel.page === pi) sel = X.sel.draft;
  if (sel) {
    const el = sel.draftBox ? Object.assign(document.createElement('div'), { className: 'zb draft' }) : layer.querySelector(`.zb[data-i="${boxes.indexOf(sel)}"]`);
    if (sel.draftBox) { place(el, sel); layer.append(el); }
    el.classList.add('sel');
    if (!sel.draftBox) for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) { const d = document.createElement('i'); d.className = 'h h-' + h; d.dataset.h = h; el.append(d); }
    const menu = document.createElement('div'); menu.className = 'zmenu';
    menu.innerHTML = (sel.draftBox ? '<b>What is in this box?</b>' : '') + KINDS.map(([k, n, c]) => `<button type="button" data-k="${k}" style="--c:${c}" class="${!sel.draftBox && sel.kind === k ? 'on' : ''}">${n}</button>`).join('') +
      (sel.draftBox ? '<button type="button" data-k="x" class="rm">Cancel</button>' : '<button type="button" data-k="x" class="rm" title="Delete">Remove box</button>');
    const below = sel.y1 / H < .78;
    menu.style.left = Math.min(Math.max(0, sel.x0 / 10), 55) + '%';
    if (below) menu.style.top = `calc(${sel.y1 / H * 100}% + 8px)`; else menu.style.bottom = `calc(${(1 - sel.y0 / H) * 100}% + 8px)`;
    menu.addEventListener('pointerdown', e => e.stopPropagation());
    menu.addEventListener('click', e => {
      const k = e.target.closest('button') && e.target.closest('button').dataset.k;
      if (!k) return;
      const box = sel; X.sel = null;
      if (box.draftBox) { if (k === 'x') renderReview(); else ops.add(pi, box, k); }
      else if (k === 'x') ops.remove(pi, box); else ops.kind(pi, box, k);
    });
    sheet.append(menu);
  }

  // pointer: pick, move, resize, or draw a new box
  layer.addEventListener('pointerdown', e => {
    if (e.button) return;
    const R = layer.getBoundingClientRect();
    const at = ev => ({ x: Math.max(0, Math.min(1000, (ev.clientX - R.left) / R.width * 1000)), y: Math.max(0, Math.min(H, (ev.clientY - R.top) / R.height * H)) });
    const p0 = at(e);
    const hEl = e.target.closest('.h'), bEl = e.target.closest('.zb');
    let mode, target, live, moved = false;
    if (hEl && sel) { mode = 'resize'; target = sel; }
    else if (bEl && sel && !sel.draftBox && bEl.classList.contains('sel')) { mode = 'move'; target = sel; }
    else if (bEl && !bEl.classList.contains('draft')) {
      const b = boxes[+bEl.dataset.i];
      X.sel = { page: pi, kind: b.kind, fig: b.fig, id: b.ids[0] };
      renderReview(); return;
    } else mode = 'draw';
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    const ghost = mode === 'draw' ? Object.assign(document.createElement('div'), { className: 'zb draft' }) : (hEl ? hEl.parentElement : bEl);
    if (mode === 'draw') layer.append(ghost);
    const onMove = ev => {
      const p = at(ev), dx = p.x - p0.x, dy = p.y - p0.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (mode === 'draw') live = { x0: Math.min(p0.x, p.x), y0: Math.min(p0.y, p.y), x1: Math.max(p0.x, p.x), y1: Math.max(p0.y, p.y) };
      else if (mode === 'move') live = { x0: target.x0 + dx, y0: target.y0 + dy, x1: target.x1 + dx, y1: target.y1 + dy };
      else {
        const h = hEl.dataset.h; live = { x0: target.x0, y0: target.y0, x1: target.x1, y1: target.y1 };
        if (h.includes('w')) live.x0 = Math.min(p.x, live.x1 - 8); if (h.includes('e')) live.x1 = Math.max(p.x, live.x0 + 8);
        if (h.includes('n')) live.y0 = Math.min(p.y, live.y1 - 8); if (h.includes('s')) live.y1 = Math.max(p.y, live.y0 + 8);
      }
      place(ghost, live);
    };
    const onUp = () => {
      layer.removeEventListener('pointermove', onMove); layer.removeEventListener('pointerup', onUp); layer.removeEventListener('pointercancel', onUp);
      if (mode === 'draw') {
        if (!moved || !live || live.x1 - live.x0 < 8 || live.y1 - live.y0 < 6) { X.sel = null; renderReview(); return; }
        X.sel = { page: pi, draft: Object.assign({ draftBox: true }, live) };
        renderReview(); return;
      }
      if (!moved || !live) return;
      X.sel = null;
      ops.reshape(pi, target, live);
    };
    layer.addEventListener('pointermove', onMove); layer.addEventListener('pointerup', onUp); layer.addEventListener('pointercancel', onUp);
  });

  wrap.append(sheet);
  const legend = document.createElement('div'); legend.className = 'legend';
  legend.innerHTML = KINDS.map(([k, n, c]) => `<span class="k-${k}" style="--c:${c}">${n}</span>`).join('') + '<span class="k-low">uncertain word</span>';
  wrap.append(legend);
  stage.replaceChildren(wrap);
  stage.scrollTop = scrollTop;
  const pager = document.getElementById('pager');
  pager.hidden = false;
  const sl = document.getElementById('pageSlider');
  sl.max = X.pages.length; sl.value = X.view + 1;
  document.getElementById('pageLabel').textContent = `scan ${X.view + 1} / ${X.pages.length} · ${pg.mode === 'text' ? 'own text' : 'recognised'}`;
  if (X.fixer) { const inp = stage.querySelector('.wfix input'); if (inp) { inp.focus(); inp.select(); } drawZoom(); }
}

// ---------------------------------------------------------------- checking uncertain words, one at a time, close up
function openFixer(i) {
  if (!X.low.length) { X.fixer = null; BKAPP.toast('No uncertain words left.'); renderReview(); return; }
  i = Math.max(0, Math.min(X.low.length - 1, i));
  X.fixer = { i, zoom: X.fixer ? X.fixer.zoom : 2 };
  X.view = X.low[i].pi; X.sel = null;
  renderReview();
}
function fixerCard() {
  const it = X.low[X.fixer.i];
  const card = document.createElement('div'); card.className = 'wfix';
  card.innerHTML = `<div class="wf-top"><b>Uncertain word ${X.fixer.i + 1} of ${X.low.length}</b><span class="hint">scan ${it.pi + 1}</span><span class="sp"></span>
      <button class="btn small" type="button" data-z="-1" title="Zoom out" aria-label="Zoom out">−</button><button class="btn small" type="button" data-z="1" title="Zoom in" aria-label="Zoom in">+</button>
      <button class="btn small" type="button" data-a="ignall" title="Keep all remaining uncertain words as they were read">Ignore all</button>
      <button class="btn small" type="button" data-a="close" aria-label="Close">Close</button></div>
    <canvas class="wf-zoom"></canvas>
    <form class="wf-row"><input type="text" spellcheck="true" aria-label="Correct word" value="${it.w.t.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
      <button class="btn primary small" type="submit">Correct</button>
      <button class="btn small" type="button" data-a="ok" title="Keep the word as it was read and stop marking it">Ignore</button>
      <button class="btn small" type="button" data-a="del" title="Take the word out of the text">Remove word</button>
      <button class="btn small" type="button" data-a="prev">‹ Back</button>
      <button class="btn small" type="button" data-a="skip">Skip ›</button></form>
    <p class="hint">Type the word as printed and press Enter; the correction goes straight into the text. “Ignore” keeps the word as it was read, “Remove word” takes it out.</p>`;
  card.querySelector('form').addEventListener('submit', e => { e.preventDefault(); applyFix(card.querySelector('input').value.trim()); });
  card.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.z) { X.fixer.zoom = Math.max(1, Math.min(5, X.fixer.zoom + +b.dataset.z)); drawZoom(); return; }
    const a = b.dataset.a;
    if (a === 'close') { X.fixer = null; renderReview(); }
    if (a === 'ok') { const i = X.fixer.i; ops.ignore([it]); if (X.fixer) openFixer(Math.min(i, X.low.length - 1)); }
    if (a === 'del') applyFix('');
    if (a === 'ignall') { X.fixer = null; ops.ignore(X.low.slice()); BKAPP.toast('All uncertain words kept as they were read'); }
    if (a === 'skip') openFixer(X.fixer.i + 1 >= X.low.length ? 0 : X.fixer.i + 1);
    if (a === 'prev') openFixer(X.fixer.i - 1 < 0 ? X.low.length - 1 : X.fixer.i - 1);
  });
  card.addEventListener('keydown', e => { if (e.key === 'Escape') { X.fixer = null; renderReview(); } });
  return card;
}
function applyFix(val) {
  const i = X.fixer.i, it = X.low[i];
  ops.fix(it, val);
  // the corrected word drops out of the list: the next one moves into its place
  if (X.fixer) openFixer(Math.min(i, X.low.length - 1));
}
async function drawZoom() {
  const cv = document.querySelector('.wfix .wf-zoom'); if (!cv || !X.fixer) return;
  const it = X.low[X.fixer.i], w = it.w, l = it.l;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.min(640, (cv.parentElement.clientWidth || 600) - 24), ch = 150;
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.width = cw * dpr; cv.height = ch * dpr;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  // the stretch of page shown: narrower when zoomed in, always centred on the word
  const regW = Math.max((w.x1 - w.x0) * 1.6, 900 / (X.fixer.zoom * 1.6)), regH = regW * ch / cw;
  const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
  const r = { x0: cx - regW / 2, y0: cy - regH / 2, w: regW, h: regH };
  let src;
  try { src = await hiCanvas(it.pi); } catch (e) { src = null; }
  if (!document.body.contains(cv)) return;
  if (src) {
    const k = src.width / 1000;
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, r.x0 * k, r.y0 * k, r.w * k, r.h * k, 0, 0, cv.width, cv.height);
  } else {
    const im = await BK.loadImg(X.pages[it.pi].thumb), k = im.naturalWidth / 1000;
    c.drawImage(im, r.x0 * k, r.y0 * k, r.w * k, r.h * k, 0, 0, cv.width, cv.height);
  }
  const s = cv.width / r.w;
  c.strokeStyle = '#d0302f'; c.lineWidth = 2 * dpr;
  c.strokeRect((w.x0 - r.x0) * s - 3 * dpr, (w.y0 - r.y0) * s - 3 * dpr, (w.x1 - w.x0) * s + 6 * dpr, (w.y1 - w.y0) * s + 6 * dpr);
}

// keys: Delete removes the selected box, Escape lets go of it
document.addEventListener('keydown', e => {
  if (BKAPP.view !== 'scan' || !X.result || !X.sel || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
  if (e.key === 'Escape') { X.sel = null; renderReview(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !X.sel.draft) {
    e.preventDefault();
    const pg = X.pages[X.sel.page], b = boxesOf(pg).find(b => b.kind === X.sel.kind && (b.fig ? b.fig === X.sel.fig : b.ids[0] === X.sel.id));
    X.sel = null;
    if (b) ops.remove(pg.pi, b); else renderReview();
  }
});
const MONK_NODE = document.getElementById('monk');
window.BKO = { render: renderReview };
// the pager buttons are shared with the book preview: take them over while the scan view is shown
['prevBtn', 'nextBtn'].forEach(id => document.getElementById(id).addEventListener('click', e => {
  if (BKAPP.view !== 'scan' || !X.result) return;
  e.stopImmediatePropagation();
  X.view = Math.max(0, Math.min(X.pages.length - 1, X.view + (id === 'nextBtn' ? 1 : -1)));
  X.sel = null; renderReview();
}, true));
document.getElementById('pageSlider').addEventListener('input', e => {
  if (BKAPP.view !== 'scan' || !X.result) return;
  e.stopImmediatePropagation();
  X.view = +e.target.value - 1; X.sel = null; renderReview();
}, true);

// ---------------------------------------------------------------- panel ui
const ui = {
  running(b) {
    $('#ocrStart').hidden = b; $('#ocrStop').hidden = !b;
    $('#ocrStart').disabled = !X.files.length;
    document.querySelector('#viewSeg [data-v="scan"]').hidden = false;
  },
  error(msg) { X.stopped = true; monk.stop(); $('#ocrMsg').textContent = msg; $('#ocrMsg').hidden = false; BKAPP.toast(msg); },
  stopped() { X.stopped = true; monk.stop(); $('#ocrMsg').textContent = 'Stopped. Start again to read the pages from the beginning.'; $('#ocrMsg').hidden = false; },
  stats(r) {
    const s = r.stats;
    const mins = r.secs > 90 ? Math.round(r.secs / 60) + ' min' : Math.round(r.secs) + ' s';
    $('#ocrStats').innerHTML = `<span><b>${s.pages}</b> pages</span><span><b>${s.chapters}</b> chapters</span><span><b>${s.parts}</b> parts</span><span><b>${s.figures}</b> pictures</span><span><b>${s.notes}</b> footnotes</span>${s.tables ? `<span><b>${s.tables}</b> tables</span>` : ''}<span><b>${s.uncertain}</b> uncertain words</span><span><b>${s.removed}</b> heads and page numbers left out</span><span>${r.modes.text ? `<b>${r.modes.text}</b> pages from the PDF's own text, ` : ''}<b>${r.modes.ocr}</b> recognised · ${mins}</span>`;
    const found = [];
    if (r.meta.title) found.push(`title “${r.meta.title}”`);
    if (r.meta.author) found.push(`author ${r.meta.author}`);
    if (r.meta.colophon) found.push('colophon');
    if (r.meta.dedication) found.push('dedication');
    if (r.meta.index) found.push(`${r.meta.index.length} index names`);
    const noIdx = X.edits && Object.values(X.edits.force).includes('index') && !(r.meta.index && r.meta.index.length);
    $('#ocrFound').textContent = (found.length ? 'Also found: ' + found.join(', ') + '. These go into the Book settings.' : '') + (noIdx ? ' No index names found in the boxes marked as index: each line needs a name followed by page numbers, like “Verhulst, Frans 21”.' : '');
  },
  result(r) {
    $('#ocrMsg').hidden = true;
    $('#ocrResult').hidden = false;
    ui.stats(r);
    $('#ocrText').value = r.md; X.mdGen = r.md;
    X.view = 0;
    BKAPP.setView('scan');
  }
};

function setFiles(fs) {
  X.files = fs.filter(f => /\.(pdf|png|jpe?g|webp|bmp|gif|avif|zip)$/i.test(f.name));
  $('#ocrFiles').textContent = X.files.length ? X.files.length === 1 ? X.files[0].name : `${X.files.length} files: ${X.files.slice(0, 3).map(f => f.name).join(', ')}${X.files.length > 3 ? '…' : ''}` : 'No PDF or image files in that selection.';
  $('#ocrStart').disabled = !X.files.length;
}

// build the panel
const langBox = $('#ocrLangs');
Object.entries(OCR_LANGS).forEach(([k, v]) => {
  const lab = document.createElement('label'); lab.className = 'check';
  lab.innerHTML = `<input type="checkbox" value="${k}"> ${v}`;
  langBox.append(lab);
});
const kitLang = (JSON.parse((() => { try { return localStorage.getItem('blk-state-v1'); } catch (e) { return 'null'; } })() || 'null') || { cfg: {} }).cfg.lang || 'en';
const pre = Object.entries(KIT_LANG).find(([, v]) => v === kitLang);
(langBox.querySelector(`input[value="${pre ? pre[0] : 'eng'}"]`) || langBox.querySelector('input')).checked = true;
$('#monk').innerHTML = MONK_SVG + '<div class="ribbon"><i></i></div><div class="mrow"><span class="folio"></span><span class="pctv"></span><span class="eta"></span></div><div class="msg"></div>';
$('#ocrIn').addEventListener('change', e => { setFiles([...e.target.files]); e.target.value = ''; });
const od = $('#ocrDrop');
['dragenter', 'dragover'].forEach(t => od.addEventListener(t, e => { e.preventDefault(); e.stopPropagation(); od.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => od.addEventListener(t, e => { e.preventDefault(); e.stopPropagation(); od.classList.remove('over'); }));
od.addEventListener('drop', e => setFiles([...(e.dataTransfer.files || [])]));
$('#ocrStart').addEventListener('click', run);
$('#ocrStop').addEventListener('click', async () => { X.stop = true; if (X.scheduler) { try { await X.scheduler.terminate(); } catch (e) { /* gone */ } } });
$('#ocrUse').addEventListener('click', async () => {
  if (!X.result) return;
  await Promise.all(X.pending);
  const r = X.result;
  const images = await Promise.all(r.images.filter(im => r.md.includes(im.name)).map(async im => ({ name: im.name, blob: await (await fetch(im.url)).blob() })));
  await BKAPP.useExtract({ md: $('#ocrText').value, meta: r.meta, images });
  BKAPP.toast('The manuscript, pictures and settings from the scan are in place');
});
// the result as files: a whole kit project, or the text, settings and pictures separately
function resultParts() {
  const r = X.result, m = r.meta || {};
  const cfg = BK.defaults();
  for (const k of ['title', 'subtitle', 'subtitle2', 'author', 'lang']) if (m[k]) cfg[k] = m[k];
  if (m.colophon) cfg.colophon = m.colophon;
  if (m.dedication) cfg.dedication = m.dedication;
  if (m.index) { cfg.index = m.index; if (m.index_sort) cfg.index_sort = m.index_sort; }
  const assets = new Map(r.images.map(im => [im.name, { name: im.name, dataURL: im.url, mime: 'image/jpeg' }]));
  const md = $('#ocrText').value;
  const name = (cfg.title || 'extracted').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'extracted';
  return { md, cfg, assets, name };
}
$('#ocrSaveZip').addEventListener('click', async () => { if (!X.result) return; await Promise.all(X.pending); const p = resultParts(); BKAPP.saveFile(p.name + '_kit.zip', await BKAPP.projectZip(p.md, p.cfg, p.assets)); });
$('#ocrSaveMd').addEventListener('click', () => { if (!X.result) return; const p = resultParts(); BKAPP.saveFile(p.name + '.md', p.md); });
$('#ocrSaveJson').addEventListener('click', () => { if (!X.result) return; const p = resultParts(); BKAPP.saveFile('book.json', JSON.stringify(BKAPP.kitFiles(p.md, p.cfg).json, null, 2)); });
$('#ocrSaveImgs').addEventListener('click', async () => {
  if (!X.result) return;
  await Promise.all(X.pending);
  const p = resultParts();
  const b = await BKAPP.imagesZip(p.md, p.cfg, p.assets);
  if (b) BKAPP.saveFile(p.name + '_pictures.zip', b); else BKAPP.toast('No pictures were found in the scan.');
});
window.BKO.analyze = analyze;   // for testing
window.BKO._X = X;
window.BKO.rebuild = () => rebuild();
})();
