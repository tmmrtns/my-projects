/* Book Layout Kit – browser engine, part 3: print PDF (pdfmake, two layout passes like bookmaker.py). */
(function (global) {
'use strict';
const BK = global.BK, ZW = BK.ZW;
const mm = v => v * BK.MM;
const ABORT = { abort: true };
const tick = () => new Promise(r => setTimeout(r, 15));

// ---------------------------------------------------------------- inline runs -> pdfmake inlines
function hyphenator(R) {
  const lang = R.cfg.lang || 'en';
  const fn = R.cfg.hyphenate && global.Hyph && (global.Hyph[lang] || null);
  const cache = new Map();
  const word = w => {
    if (/^\p{Lu}+$/u.test(w)) return w;
    let h = cache.get(w);
    if (h == null) {
      try { h = fn(w, { hyphenChar: ZW, minWordLength: 6 }); } catch (e) { h = w; }
      const p = h.split(ZW);
      while (p.length > 1 && p[0].length < 2) p.splice(0, 2, p[0] + p[1]);
      while (p.length > 1 && p[p.length - 1].length < 3) p.splice(p.length - 2, 2, p[p.length - 2] + p[p.length - 1]);
      h = p.join(ZW);
      cache.set(w, h);
    }
    return h;
  };
  return fn ? s => s.replace(/\p{L}{6,}/gu, word) : s => s;
}

function toInl(runs, R, o) {
  o = o || {};
  const out = [];
  for (const r of runs || []) {
    if (r.br) { out.push({ text: '\n' }); continue; }
    if (!r.t) continue;
    let text = r.t;
    if (o.upper) text = text.toUpperCase();
    if (o.hy && !r.code && !r.link && !r.sup) text = R.hy(text);
    const it = { text, italics: !!r.i !== !!o.italic };
    if (r.b) it.bold = true;
    if (r.sup) it.sup = true;
    if (r.link && /^(https?:|mailto:)/i.test(r.link)) it.link = r.link;
    if (r.ixo && R.pass === 1) it.ixid = r.ixo;
    if (o.extra) Object.assign(it, o.extra);
    out.push(it);
  }
  if (!out.length) out.push({ text: ZW });
  return out;
}

function leadSplit(runs) {
  if (!runs.length) return [[], runs];
  if (runs[0].b && !runs[0].sup) {
    let k = 0;
    while (k < runs.length && runs[k].b && !runs[k].sup) k++;
    return [runs.slice(0, k), runs.slice(k)];
  }
  const r0 = runs[0];
  const m = /^\s*\S+(?:\s+\S+){0,2}/.exec(r0.t || '');
  if (!m) return [[], runs];
  return [[Object.assign({}, r0, { t: m[0] })], [Object.assign({}, r0, { t: r0.t.slice(m[0].length) })].concat(runs.slice(1))];
}

const rule = (width, len, lw, color, mt, mb, extra) => Object.assign({
  canvas: [{ type: 'line', x1: (width - len) / 2, y1: 0, x2: (width + len) / 2, y2: 0, lineWidth: lw, lineColor: color }],
  margin: [0, mt || 0, 0, mb || 0]
}, extra || {});
const marker = (extra) => Object.assign({ text: ZW, fontSize: 1, lineHeight: 1 }, extra || {});

// ---------------------------------------------------------------- figures
function imgRef(R, src) {
  const a = BK.findAsset(R.assets, src);
  if (!a) { R.missing.add(src); return null; }
  if (!R.imgKeys.has(a.dataURL)) { const k = 'im' + R.imgKeys.size; R.imgKeys.set(a.dataURL, k); R.images[k] = a.dataURL; }
  return { key: R.imgKeys.get(a.dataURL), w: a.w, h: a.h };
}
const FRAME = { hLineWidth: () => .3, vLineWidth: () => .3, hLineColor: () => '#bbbbbb', vLineColor: () => '#bbbbbb',
  paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };
function centred(node, w) { return { columns: [{ width: '*', text: '' }, Object.assign({ width: w }, node), { width: '*', text: '' }], columnGap: 0 }; }
function framedImg(im, w, h, border) {
  const img = { image: im.key, width: w, height: h };
  if (!border) return Object.assign(img, { alignment: 'center' });
  return centred({ table: { widths: [w], body: [[img]] }, layout: FRAME }, w + .6);
}
function captionNode(runs, R, align, size) {
  return { text: toInl(runs, R, { italic: true }), italics: true, fontSize: size || 8.5, lineHeight: R.lh(1.3), alignment: align || 'center', margin: [0, mm(2), 0, 0] };
}
function missingNode(src) { return { text: `[missing image: ${src}]`, italics: true, color: '#a33', fontSize: 8, alignment: 'center', margin: [0, mm(2), 0, mm(2)] }; }

function photoNode(f, R, ctx) {
  const im = imgRef(R, f.src);
  if (!im) return missingNode(f.src);
  const P = R.cfg.photos || {};
  const maxH = mm(R.G.TH) * .8;
  let w, border = true, align = 'center';
  if (f.kind === 'wide') { w = ctx.width; border = false; }
  else if (f.kind === 'diagram') { w = ctx.width; border = false; align = 'left'; }
  else if (f.kind === 'small') { w = mm(P.small_mm || 62); border = false; }
  else w = im.h > im.w ? mm(P.portrait_mm || 58) : (P.landscape_mm ? mm(P.landscape_mm) : ctx.width);
  w = Math.min(w, ctx.width - (border ? .6 : 0));
  let h = w * im.h / im.w;
  if (h > maxH) { h = maxH; w = h * im.w / im.h; }
  const st = [framedImg(im, w, h, border)];
  if (f.cap) st.push(captionNode(f.cap, R, align));
  return { stack: st, unbreakable: true, margin: [0, mm(3), 0, mm(5)] };
}

function pairNode(figs, R, ctx) {
  const P = R.cfg.photos || {};
  const ims = figs.map(f => imgRef(R, f.src));
  if (ims.some(x => !x)) return { stack: figs.map(f => photoNode(f, R, ctx)) };
  let h = mm(P.pair_height_mm || 66), gap = mm(6);
  let ws = ims.map(im => h * im.w / im.h);
  const tot = ws[0] + ws[1] + gap * 3 + 2;
  if (tot > ctx.width) { const s = (ctx.width - gap * 3 - 2) / (ws[0] + ws[1]); ws = ws.map(w => w * s); h *= s; }
  const cols = [{ width: '*', text: '' }];
  figs.forEach((f, i) => cols.push({ width: ws[i] + .6, stack: [framedImg(ims[i], ws[i], h, true)].concat(f.cap ? [captionNode(f.cap, R)] : []) }));
  cols.push({ width: '*', text: '' });
  return { stack: [{ columns: cols, columnGap: gap }], unbreakable: true, margin: [0, mm(3), 0, mm(5)] };
}

function widePairNode(figs, R, ctx) {
  const P = R.cfg.photos || {};
  const st = figs.map(f => {
    const im = imgRef(R, f.src);
    if (!im) return missingNode(f.src);
    let h = mm(P.wide_pair_height_mm || 66), w = h * im.w / im.h;
    if (w > ctx.width) { w = ctx.width; h = w * im.h / im.w; }
    return { stack: [{ image: im.key, width: w, height: h, alignment: 'center' }].concat(f.cap ? [captionNode(f.cap, R)] : []), margin: [0, 0, 0, mm(4)] };
  });
  return { stack: st, unbreakable: true, margin: [0, mm(2), 0, mm(4)] };
}

function groupFigs(blocks, R) {
  const out = [];
  const orient = f => { const a = BK.findAsset(R.assets, f.src); return a ? (a.h > a.w ? 'port' : 'land') : 'land'; };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], n = blocks[i + 1];
    if (b.type === 'fig' && b.kind === 'photo' && n && n.type === 'fig' && n.kind === 'photo' && orient(b) === 'port' && orient(n) === 'port') {
      out.push({ type: 'pair', figs: [b, n] }); i++; continue;
    }
    if (b.type === 'fig' && b.kind === 'wide' && n && n.type === 'fig' && n.kind === 'wide') {
      out.push({ type: 'widepair', figs: [b, n] }); i++; continue;
    }
    out.push(b);
  }
  return out;
}

// ---------------------------------------------------------------- blocks -> nodes
const TBL = {
  hLineWidth: i => i === 0 ? 0 : (i === 1 ? .6 : .25), vLineWidth: () => 0,
  hLineColor: i => i === 1 ? '#000000' : '#bbbbbb',
  paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1
};

function para(runs, R, ctx, opt) {
  let inls;
  if (opt.lead) {
    const [a, b] = leadSplit(runs);
    const sz = .82 * ctx.size;
    inls = toInl(a, R, { italic: ctx.italic, upper: true, extra: { fontSize: sz, characterSpacing: .07 * sz } }).concat(toInl(b, R, { italic: ctx.italic, hy: ctx.hy }));
  } else inls = toInl(runs, R, { italic: ctx.italic, hy: ctx.hy });
  const n = { text: inls, alignment: ctx.align || 'justify' };
  if (opt.indent) n.leadingIndent = 1.1 * ctx.size;
  if (ctx.size !== R.FS) n.fontSize = ctx.size;
  if (ctx.italic) n.italics = true;
  if (ctx.color) n.color = ctx.color;
  if (ctx.lh) n.lineHeight = R.lh(ctx.lh);
  if (ctx.pGap) n.margin = [0, 0, 0, ctx.pGap];
  return n;
}

function dropcapNodes(runs, R, ctx) {
  const idx = runs.findIndex(r => r.t && !r.sup && !r.br);
  if (idx < 0) return null;
  const r0 = runs[idx];
  const m = /^(["“‘'(«„]?[\p{L}\p{N}])/u.exec(r0.t);
  if (!m) return null;
  const cap = m[1], FS = ctx.size, key = R.cfg.font;
  const rest = runs.slice(0, idx).concat([Object.assign({}, r0, { t: r0.t.slice(cap.length) })], runs.slice(idx + 1));
  const S = (1.38 * FS + R.F.cap * FS) / R.F.cap;
  const capW = BK.measure(cap, S, {}, key) + .07 * S;
  const avail = (ctx.width - capW) * .99;
  const pieces = [];
  for (const r of rest) {
    if (r.br) { pieces.push({ r, t: '\n' }); continue; }
    for (const t of (r.t || '').split(/(?<=\s)/)) if (t) pieces.push({ r, t });
  }
  let line = 0, w = 0, k = 0;
  const sw = BK.measure(' ', FS, {}, key);
  for (; k < pieces.length; k++) {
    const p = pieces[k];
    if (p.t === '\n') break;
    const core = p.t.replace(/\s+$/, '');
    const pw = core ? BK.measure(core, p.r.sup ? FS * .58 : FS, { b: p.r.b, i: !!p.r.i !== !!ctx.italic }, key) : 0;
    if (w > 0 && w + pw > avail && core) { line++; w = 0; if (line === 2) break; }
    w += pw + (core.length < p.t.length ? sw : 0);
  }
  const toRuns = ps => ps.map(p => Object.assign({}, p.r, { t: p.t }));
  let restPieces = pieces.slice(k);
  while (restPieces.length && !restPieces[0].t.trim() && restPieces[0].t !== '\n') restPieces.shift();
  if (restPieces.length && restPieces[0].t === '\n') restPieces.shift();
  const more = restPieces.length > 0;
  const colInl = toInl(toRuns(pieces.slice(0, k)), R, { italic: ctx.italic, extra: { dc: true, dcj: more } });
  Object.assign(colInl[0], { dcCap: cap, dcS: S, dcW: capW });
  const nodes = [{ columns: [{ width: capW, text: ZW, fontSize: 1, lineHeight: 1 }, { width: '*', text: colInl, alignment: 'justify' }], columnGap: 0 }];
  if (more) nodes.push({ text: toInl(toRuns(restPieces), R, { italic: ctx.italic, hy: ctx.hy }), alignment: 'justify' });
  return nodes;
}

function renderBlocks(blocks, R, ctx) {
  const out = [];
  const bl = groupFigs(blocks, R);
  let prev = null, after = ctx.opener || null;
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i];
    const hasMore = i < bl.length - 1 || ctx.hasMore;
    if (after === 'h2' && i === 0 && b.type === 'quote') { out.push(epigraph(b, R, ctx)); prev = b; continue; }
    switch (b.type) {
      case 'p': {
        const opener = after;
        after = null;
        if (opener === 'h2' && R.cfg.opener === 'dropcap') {
          const dn = dropcapNodes(b.runs, R, ctx);
          if (dn) { out.push(...dn); break; }
        }
        const lead = opener && R.cfg.opener === 'smallcaps' && !b.allItalic;
        const indent = !ctx.noIndent && prev && prev.type === 'p' && !lead;
        out.push(para(b.runs, R, ctx, { lead, indent }));
        break;
      }
      case 'h3':
        if (b.divider) {
          out.push({ stack: [{ text: toInl(b.runs, R, { upper: true }), fontSize: 9.5, characterSpacing: .18 * 9.5, alignment: 'center', italics: false },
            rule(ctx.width, mm(14), .5, '#555555', mm(3), 0, { headlineLevel: 1 })], margin: [0, mm(10), 0, mm(5)] });
        } else {
          out.push({ text: toInl(b.runs, R, { italic: true }), italics: true, fontSize: 1.1 * ctx.size, lineHeight: R.lh(1.25), alignment: 'left', margin: [0, mm(6), 0, mm(2)], headlineLevel: 1 });
        }
        after = 'h3';
        break;
      case 'h4':
        out.push({ text: toInl(b.runs, R, {}), bold: true, fontSize: ctx.size, alignment: 'left', margin: [0, mm(4), 0, mm(1)], headlineLevel: 1 });
        after = 'h3';
        break;
      case 'quote':
        out.push({ stack: renderBlocks(b.blocks, R, Object.assign({}, ctx, { size: .88 * ctx.size, color: '#333333', lh: 1.35, noIndent: true, opener: null, width: ctx.width - mm(10), hasMore: false })), margin: [mm(5), mm(3), mm(5), mm(3)] });
        after = null;
        break;
      case 'list': {
        const items = b.items.map(it => {
          const nodes = renderBlocks(it, R, Object.assign({}, ctx, { align: 'left', noIndent: true, opener: null, width: ctx.width - mm(6), hy: false, hasMore: false }));
          const n = nodes.length === 1 ? nodes[0] : { stack: nodes };
          if (ctx.back) n.margin = [0, 0, 0, mm(1.2)];
          return n;
        });
        const n = b.ordered ? { ol: items, start: b.start } : { ul: items };
        n.margin = [0, mm(1), 0, mm(2)];
        if (ctx.back) { n.fontSize = 8.5; n.lineHeight = R.lh(1.35); }
        out.push(n);
        after = null;
        break;
      }
      case 'table': out.push(tableNode(b, R, ctx)); after = null; break;
      case 'hr':
        out.push({ text: R.cfg.scene_break || '*   *   *', alignment: 'center', fontSize: 9, characterSpacing: 1.8, preserveLeadingSpaces: true, margin: [0, mm(4), 0, mm(4)] });
        after = null;
        break;
      case 'pre':
        out.push({ text: b.text, fontSize: .85 * ctx.size, alignment: 'left', preserveLeadingSpaces: true, margin: [mm(5), mm(2), 0, mm(2)] });
        after = null;
        break;
      case 'fig':
        if (b.kind === 'map' || b.kind === 'art') out.push(...plateNodes(b, R, hasMore));
        else if (b.kind === 'spread') out.push(...spreadNodes(b, R, ctx, hasMore));
        else if (b.kind === 'qr') {
          const k = 'qr' + BK.slug(b.src).slice(0, 40);
          if (!R.images[k]) {
            const src = /^https?:\/\//i.test(b.src) ? BK.qrDataURL(b.src) : (BK.findAsset(R.assets, b.src) || {}).dataURL;
            if (src) R.images[k] = src;
          }
          if (R.images[k]) out.push({ stack: [{ image: k, width: mm(R.cfg.photos.qr_mm || 30), alignment: 'center' }, captionNode([{ t: b.alt }], R, 'center', 8)], unbreakable: true, margin: [0, mm(4), 0, mm(5)] });
          else out.push(missingNode(b.src));
        } else out.push(photoNode(b, R, ctx));
        break;
      case 'pair': out.push(pairNode(b.figs, R, ctx)); break;
      case 'widepair': out.push(widePairNode(b.figs, R, ctx)); break;
      case 'poem':
        out.push({ stack: b.stanzas.map(st => ({ text: st.flatMap((ln, k) => (k ? [{ text: '\n' }] : []).concat(toInl(ln, R, { italic: ctx.italic }))), alignment: 'left', margin: [0, 0, 0, mm(3)] })),
          margin: [mm(10), mm(4), 0, mm(1)] });
        after = null;
        break;
      case 'div': out.push(divNode(b, R, ctx)); after = null; break;
    }
    prev = b;
  }
  return out;
}

function epigraph(b, R, ctx) {
  const ps = b.blocks.filter(x => x.type === 'p');
  return {
    stack: ps.map((x, k) => k === 0
      ? { text: toInl(x.runs, R, { italic: true }), italics: true, fontSize: .9 * ctx.size, alignment: 'left', lineHeight: R.lh(1.35) }
      : { text: toInl(x.runs, R, {}), fontSize: .81 * ctx.size, alignment: 'right', margin: [0, mm(1), 0, 0] }),
    margin: [mm(22), 0, 0, mm(8)], color: '#222222'
  };
}

function tableNode(b, R, ctx) {
  const n = b.header.length;
  const len = new Array(n).fill(4);
  [b.header].concat(b.rows).forEach(row => row.forEach((c, j) => { if (j < n) len[j] = Math.max(len[j], Math.min(60, BK.plainRuns(c).length)); }));
  const tot = len.reduce((a, x) => a + x, 0);
  const widths = len.map(x => Math.max(.08, x / tot) * (ctx.width - n * 4));
  const scale = (ctx.width - n * 4) / widths.reduce((a, x) => a + x, 0);
  const body = [b.header.map((c, j) => ({ text: toInl(c, R, { upper: true }), bold: true, fontSize: 7, characterSpacing: .35, alignment: b.align[j] || 'left' }))]
    .concat(b.rows.map(r => b.header.map((_, j) => ({ text: toInl(r[j] || [], R, {}), alignment: b.align[j] || 'left' }))));
  return { table: { headerRows: 1, dontBreakRows: true, widths: widths.map(w => w * scale), body }, layout: TBL, fontSize: 7.5, lineHeight: R.lh(1.25), alignment: 'left', margin: [0, mm(2), 0, mm(4)] };
}

function divNode(b, R, ctx) {
  const sub = o => renderBlocks(b.blocks, R, Object.assign({}, ctx, { opener: null, hasMore: false }, o));
  switch (b.kind) {
    case 'center': return { stack: sub({ align: 'center', noIndent: true, hy: false }), margin: [0, mm(3), 0, mm(3)] };
    case 'right': return { stack: sub({ align: 'right', noIndent: true, hy: false }), margin: [0, 0, 0, 0] };
    case 'letter': return { stack: sub({ italic: !ctx.italic, noIndent: true, pGap: mm(1.5), width: ctx.width - mm(12) }), margin: [mm(6), mm(3), mm(6), mm(3)] };
    case 'box': return {
      table: { widths: ['*'], dontBreakRows: true, body: [[{ stack: sub({ size: .92 * ctx.size, noIndent: true, pGap: mm(1.2), width: ctx.width - mm(8) - 1 }) }]] },
      layout: { hLineWidth: () => .5, vLineWidth: () => .5, hLineColor: () => '#999999', vLineColor: () => '#999999',
        paddingLeft: () => mm(4), paddingRight: () => mm(4), paddingTop: () => mm(3), paddingBottom: () => mm(1.8) },
      margin: [0, mm(4), 0, mm(4)]
    };
    default: return { stack: sub({}) };
  }
}

function plateNodes(f, R, hasMore, id) {
  const p = R.plates.get(f);
  if (!p) return [missingNode(f.src)];
  const n = ++R.plateN;
  const out = [marker({ id: id || ('P~' + n), pageBreak: 'before' }),
    { image: p, width: mm(R.G.W - 16), height: mm(R.G.H - 18), absolutePosition: { x: mm(8), y: mm(9) } }];
  if (id) R.plateIds.add(id);
  if (hasMore) out.push(marker({ id: 'R~' + n, pageBreak: 'before' }));
  return out;
}

function spreadNodes(f, R, ctx, hasMore) {
  const h = R.spreads.get(f);
  if (!h) return [missingNode(f.src)];
  const n = ++R.plateN, lid = 'L~' + n;
  R.reqs.push({ id: lid, parity: 'left' });
  const out = [];
  if (R.blanks.has(lid)) out.push(marker({ pageBreak: 'before' }));
  const fit = [ctx.width, mm(R.G.TH - 40)];
  out.push(marker({ id: lid, pageBreak: 'before' }),
    { text: f.alt, italics: true, fontSize: 13, alignment: 'left' },
    { image: h[0], fit, alignment: 'center', margin: [0, mm(6), 0, 0] },
    marker({ pageBreak: 'before' }),
    { text: ZW, fontSize: 13 },
    { image: h[1], fit, alignment: 'center', margin: [0, mm(6), 0, 0] });
  if (f.cap) out.push(captionNode(f.cap, R, 'right'));
  if (hasMore) out.push(marker({ id: 'R~' + n, pageBreak: 'before' }));
  return out;
}

function notesNodes(notes, R, ctx) {
  if (!notes || !notes.length) return [];
  return [
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: .4, lineColor: '#999999' }], margin: [0, mm(6), 0, mm(2)] },
    { ol: notes.map(n => ({ text: toInl(n.runs, R, {}), alignment: 'left', margin: [0, 0, 0, mm(1)] })), fontSize: 8, lineHeight: R.lh(1.3) }
  ];
}

// ---------------------------------------------------------------- sections
function req(R, id, parity) {
  R.reqs.push({ id, parity });
  return R.blanks.has(id) ? [marker({ pageBreak: 'before' })] : [];
}

function sectionNodes(sec, R, kind, extra) {
  const G = R.G, out = [];
  const ctx = { size: R.FS, width: R.TWpt, hy: true, opener: 'h2', back: sec.role === 'back', hasMore: !!(sec.notes && sec.notes.length) || !!extra };
  R.secTitle[sec.id] = sec.headTitle || sec.title;
  // a front section that is only a map: a turned full page without a visible title (kit: mapsec)
  if (kind === 'stitle' && sec.blocks.length === 1 && sec.blocks[0].type === 'fig' && sec.blocks[0].kind === 'map') {
    return plateNodes(sec.blocks[0], R, false, sec.id);
  }
  if (kind === 'chapter') {
    if (R.cfg.chapter_break === 'right') out.push(...req(R, sec.id, 'right'));
    const no = sec.num == null ? null : BK.chapNo(sec.num, R.cfg);
    const lab = sec.num == null ? (sec.plain ? '' : R.L.interlude) : (no ? (R.cfg.chapter_word === 'hide' ? no : R.L.chapter + ' ' + no) : '');
    const head = { id: sec.id, pageBreak: 'before' };
    if (lab) out.push(Object.assign({ text: lab.toUpperCase(), fontSize: 8.5, characterSpacing: .3 * 8.5, alignment: 'center', margin: [0, mm(20 * G.VS), 0, 0] }, head));
    out.push(Object.assign({ text: sec.title, italics: true, fontSize: 17, lineHeight: R.lh(1.2), alignment: 'center', margin: [mm(6), mm(4), mm(6), mm(2)] }, lab ? {} : head));
    if (sec.sub) out.push({ text: sec.sub.toUpperCase(), fontSize: 8.5, characterSpacing: .2 * 8.5, color: '#555555', alignment: 'center' });
    out.push(rule(R.TWpt, mm(12), .5, '#555555', mm(4), mm(10)));
  } else {
    out.push(...req(R, sec.id, 'right'));
    out.push({ text: sec.title, italics: true, fontSize: 17, lineHeight: R.lh(1.2), alignment: 'center', margin: [0, mm(22 * G.VS), 0, mm(10)], id: sec.id, pageBreak: 'before' });
  }
  out.push(...renderBlocks(sec.blocks, R, ctx));
  out.push(...notesNodes(sec.notes, R, ctx));
  if (extra) out.push(...extra);
  return out;
}

function tocRow(title, id, lv, R, prefix) {
  const num = R.pass === 1 ? '000' : String(R.folio[id] != null ? R.folio[id] : '');
  const part = lv === 'p';
  const titleInl = (prefix ? [{ text: prefix + ' ', bold: true }] : []).concat([{ text: part ? title.toUpperCase() : title }])
    .map(x => Object.assign(x, { linkToDestination: id }));
  titleInl.push({ text: ZW, tocEnd: id });
  return {
    columns: [{ width: '*', text: titleInl }, { width: mm(9), text: [{ text: num, tocNum: id, linkToDestination: id }], alignment: 'right' }],
    columnGap: mm(2), alignment: 'left'
  };
}

function tocRows(model, R) {
  const L = R.L, rows = [];
  model.front.forEach(s => rows.push([s.title, s.id, 0]));
  model.parts.forEach(p => {
    if (p.pid) {
      rows.push([(p.label ? p.label + ' – ' : '') + p.title, p.pid, 'p']);
      if (p.introParsed) rows.push([L.part_intro, p.pid + '-intro', 1]);
    }
    p.chapters.forEach(c => {
      const no = c.num != null ? BK.chapNo(c.num, R.cfg) : '';
      rows.push([c.num == null ? (c.plain ? c.title : `${L.interlude}: ${c.title}`) : (no ? `${no}. ${c.title}` : c.title), c.id, 1]);
    });
  });
  model.back.forEach(s => rows.push([s.title, s.id, 0]));
  if (model.terms.length) rows.push([L.index, 'register', 0]);
  return rows;
}

function frontMatter(model, R) {
  const c = R.cfg, G = R.G, VS = G.VS, out = [];
  const T = c.title || 'Untitled';
  out.push(Object.assign({ text: T.toUpperCase(), fontSize: 13, characterSpacing: .22 * 13, alignment: 'center', margin: [0, mm(55 * VS), 0, 0], id: 'fm-half' }, R.coverOff ? { pageBreak: 'before' } : {}));
  out.push(marker({ pageBreak: 'before', id: 'fm-blank' }));
  out.push(...req(R, 'fm-title', 'right'));
  out.push({ text: T.toUpperCase(), fontSize: 24, lineHeight: R.lh(1.15), characterSpacing: .06 * 24, alignment: 'center', margin: [0, mm(40 * VS), 0, 0], id: 'fm-title', pageBreak: 'before' });
  if (c.subtitle) out.push({ text: c.subtitle, italics: true, fontSize: 13, alignment: 'center', margin: [0, mm(8), 0, 0] });
  if (c.subtitle2) out.push({ text: c.subtitle2, fontSize: 10.5, alignment: 'center', margin: [0, mm(3), 0, 0] });
  out.push({ text: (c.author || '').toUpperCase() || ZW, fontSize: 11, characterSpacing: .25 * 11, alignment: 'center', margin: [0, mm(45 * VS), 0, 0] });
  const colo = (c.colophon && c.colophon.filter(Boolean).length) ? c.colophon.filter(Boolean) : ['© ' + (c.author || '')];
  colo.forEach((x, i) => out.push(Object.assign({ text: toInl(BK.inlineMd(x), R, {}), fontSize: 8, lineHeight: R.lh(1.5), alignment: 'left', margin: [0, i ? 0 : mm(120 * VS), 0, mm(2)] },
    i ? {} : { id: 'fm-colo', pageBreak: 'before' })));
  const ded = (c.dedication || []).filter(Boolean);
  if (ded.length || c.epigraph) {
    out.push(...req(R, 'fm-ded', 'right'));
    const st = ded.map(x => ({ text: toInl(BK.inlineMd(x), R, { italic: true }), italics: true, fontSize: 12, alignment: 'center' }));
    if (c.epigraph) st.push({ text: toInl(BK.inlineMd(c.epigraph), R, {}), fontSize: 9.5, characterSpacing: .05 * 9.5, alignment: 'center', margin: [0, mm(6), 0, 0] });
    st[0] = Object.assign(st[0], { id: 'fm-ded', pageBreak: 'before' });
    st[0].margin = [0, mm(50 * VS), 0, (st[0].margin || [0, 0, 0, 0])[3]];
    out.push(...st, marker({ pageBreak: 'before' }));
  }
  if (c.toc !== false) {
    out.push(...req(R, 'toc', 'right'));
    out.push({ text: R.L.contents, italics: true, fontSize: 17, lineHeight: R.lh(1.2), alignment: 'center', margin: [0, mm(8), 0, mm(6)], id: 'toc', pageBreak: 'before' });
    for (const [t, id, lv] of tocRows(model, R)) {
      const n = tocRow(t, id, lv, R);
      if (lv === 'p') Object.assign(n, { bold: true, fontSize: 8.5, characterSpacing: .06 * 8.5, margin: [0, mm(2.5), 0, 0] });
      else Object.assign(n, { fontSize: 9, margin: [lv === 1 ? mm(4) : 0, lv === 0 ? mm(.8) : 0, 0, 0] });
      n.lineHeight = R.lh(1.32);
      out.push(n);
    }
  }
  return out;
}

function partNodes(p, R) {
  const G = R.G, out = [];
  out.push(...req(R, p.pid, 'right'));
  R.secTitle[p.pid] = null;
  const head = { id: p.pid, pageBreak: 'before' };
  if (p.label) out.push(Object.assign({ text: p.label.toUpperCase(), fontSize: 10, characterSpacing: .35 * 10, alignment: 'center', margin: [0, mm(55 * G.VS), 0, 0] }, head));
  out.push(Object.assign({ text: p.title, fontSize: 24, characterSpacing: .03 * 24, lineHeight: R.lh(1.15), alignment: 'center', margin: [0, p.label ? mm(8) : mm(55 * G.VS + 8), 0, mm(6)] }, p.label ? {} : head));
  if (p.subRuns && p.subRuns.length) out.push({ text: toInl(p.subRuns, R, { italic: true }), italics: true, fontSize: 11, alignment: 'center', margin: [mm(10), 0, mm(10), 0] });
  out.push(rule(R.TWpt, mm(18), .6, '#000000', mm(10), 0));
  if (p.introParsed) {
    const extra = [];
    if (R.cfg.part_minitoc !== false) {
      extra.push({ text: R.L.in_this_part.toUpperCase(), fontSize: 8.5, characterSpacing: .25 * 8.5, alignment: 'center', margin: [0, mm(8), 0, mm(3)] });
      p.chapters.forEach(c => {
        const no = c.num != null ? BK.chapNo(c.num, R.cfg) : '';
        const lab = c.num == null ? (c.plain ? '' : R.L.interlude + ':') : (no ? no + '.' : '');
        const row = tocRow(c.title, c.id, 1, R, lab);
        row.margin = [0, 0, 0, c.sub ? 0 : mm(3.5)];
        extra.push(row);
        if (c.sub) extra.push({ text: c.sub, italics: true, fontSize: 9, color: '#333333', alignment: 'left', margin: [mm(5), 0, 0, mm(3.5)] });
      });
    }
    const sec = { id: p.pid + '-intro', title: R.L.part_intro, headTitle: R.L.part_intro, role: 'front', blocks: p.introParsed.blocks, notes: p.introParsed.notes };
    out.push(...sectionNodes(sec, R, 'stitle', extra));
  }
  return out;
}

function indexNodes(model, R) {
  const L = R.L, G = R.G, cfg = R.cfg, out = [];
  R.secTitle.register = L.index;
  out.push(...req(R, 'register', 'right'));
  out.push({ text: L.index, italics: true, fontSize: 17, lineHeight: R.lh(1.2), alignment: 'center', margin: [0, mm(22 * G.VS), 0, mm(10)], id: 'register', pageBreak: 'before' });
  out.push({ text: L.index_intro, italics: true, fontSize: 8.5, alignment: 'left', margin: [0, 0, 0, mm(5)] });
  if (R.pass === 1) return out;
  const ents = model.terms.map((t, i) => R.ixPages[i] ? Object.assign(BK.indexKey(t, cfg), { i }) : null).filter(Boolean)
    .sort((a, b) => a.k.localeCompare(b.k, cfg.lang || 'en'));
  const colW = (R.TWpt - mm(6)) / 2, size = 7.5, lh = size * 1.3, indent = mm(3);
  const key = cfg.font;
  const linesOf = (txt) => {
    let n = 1, w = 0;
    const max0 = colW, max = colW - indent;
    for (const word of txt.split(/(?<=\s)/)) {
      const ww = BK.measure(word, size, { b: false }, key) * 1.03;
      if (w + ww > (n === 1 ? max0 : max) && w > 0) { n++; w = ww; } else w += ww;
    }
    return n;
  };
  const items = [];
  let cur = null;
  for (const e of ents) {
    const letter = /\p{L}/u.test(e.k[0]) ? e.k[0].toUpperCase() : '#';
    if (letter !== cur) { cur = letter; items.push({ head: true, node: { text: letter, bold: true, fontSize: 10, margin: [0, mm(3), 0, mm(1)] }, h: 10 * 1.25 + mm(4) }); }
    const refs = R.ixPages[e.i].join(', ');
    items.push({ node: { text: [{ text: e.disp + ' ' }, { text: refs, bold: true }], fontSize: size, lineHeight: R.lh(1.3), alignment: 'left', margin: [indent, 0, 0, 0], leadingIndent: -indent }, h: linesOf(e.disp + ' ' + refs) * lh });
  }
  const introH = 17 * 1.2 + mm(22 * G.VS) + mm(10) + 8.5 * 1.38 * 2 + mm(5);
  const pages = [];
  let cap = (mm(G.TH) - introH) * .93, cols = [[], []], c = 0, used = 0;
  const flushPage = () => { pages.push(cols); cols = [[], []]; c = 0; used = 0; cap = mm(G.TH) * .93; };
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const need = it.h + (it.head && items[k + 1] ? items[k + 1].h : 0);
    if (used + need > cap && used > 0) { if (c === 0) { c = 1; used = 0; } else flushPage(); }
    cols[c].push(it.node); used += it.h;
  }
  if (cols[0].length) pages.push(cols);
  pages.forEach((cl, k) => out.push(Object.assign({ columns: [{ width: '*', stack: cl[0] }, { width: '*', stack: cl[1].length ? cl[1] : [{ text: '' }] }], columnGap: mm(6) }, k ? { pageBreak: 'before' } : {})));
  return out;
}

function docDef(model, R) {
  R.reqs = []; R.secTitle = {}; R.plateN = 0; R.plateIds = new Set();
  const G = R.G, c = [];
  c.push({ text: [{ text: ZW, fk: 'R' }, { text: ZW, fk: 'I', italics: true }, { text: ZW, fk: 'B', bold: true }], fontSize: 1, lineHeight: 1 });
  if (R.coverOff) c.push({ image: '__cf', width: mm(G.W), height: mm(G.H), absolutePosition: { x: 0, y: 0 } }, marker({ id: 'cover-front' }));
  c.push(...frontMatter(model, R));
  model.front.forEach(s => c.push(...sectionNodes(s, R, 'stitle')));
  model.parts.forEach(p => {
    if (p.pid) c.push(...partNodes(p, R));
    p.chapters.forEach(ch => c.push(...sectionNodes(ch, R, 'chapter')));
  });
  model.back.forEach(s => c.push(...sectionNodes(s, R, 'stitle')));
  if (model.terms.length) c.push(...indexNodes(model, R));
  if (R.pass === 2 && R.coverOff) c.push(marker({ pageBreak: 'before' }), marker({ id: 'BACKCOVER' }),
    { image: '__cb', width: mm(G.W), height: mm(G.H), absolutePosition: { x: 0, y: 0 } });
  return {
    pageSize: { width: mm(G.W), height: mm(G.H) },
    pageMargins: [mm(G.inner), mm(G.top), mm(G.outer), mm(G.bottom)],
    info: { title: R.cfg.title || 'Untitled', author: R.cfg.author || '', creator: 'Book Layout Kit', producer: 'Book Layout Kit' },
    defaultStyle: { font: 'Body', fontSize: R.FS, lineHeight: R.lh(1.38), alignment: 'justify', color: '#111111' },
    images: R.images,
    content: c,
    pageBreakBefore: (n, following) => {
      if (n.id === 'BACKCOVER') return (n.startPosition.pageNumber - R.coverOff) % 2 === 0;
      if (n.headlineLevel && following.length === 0) return true;
      return false;
    }
  };
}

// ---------------------------------------------------------------- page hooks
function scanPages(pages) {
  const ids = {}, ix = {};
  pages.forEach((pg, pi) => {
    for (const it of pg.items) {
      if (it.type !== 'line') continue;
      const L = it.item;
      if (L.id && ids[L.id] == null) ids[L.id] = pi + 1;
      for (const x of L.inlines) if (x.ixid && ix[x.ixid] == null) ix[x.ixid] = pi + 1;
    }
  });
  return { ids, ix, n: pages.length };
}

const hasText = L => L.inlines.some(x => x.text && x.text.replace(/​/g, '').trim());
const lineWidth = L => L.inlines.reduce((a, x) => a + x.width, 0) - (L.inlines.length ? (L.inlines[0].leadingCut || 0) + (L.inlines[L.inlines.length - 1].trailingCut || 0) : 0);

function rejustify(L, force) {
  const ins = L.inlines;
  if (ins.length < 2) return;
  const valid = ins.map((x, i) => i > 0 && /\s$/.test(ins[i - 1].text));
  const G = valid.filter(Boolean).length;
  if (force) {
    const extra = L.maxWidth - lineWidth(L);
    if (!G || extra <= 0 || extra > L.maxWidth * .25) return;
    let k = 0;
    ins.forEach((x, i) => { if (valid[i]) k++; x.x += k * extra / G; });
    return;
  }
  const s = ins[1].justifyShift;
  if (!s) return;
  if (G === ins.length - 1) return;
  const total = (ins.length - 1) * s;
  let k = 0;
  ins.forEach((x, i) => {
    if (i === 0) return;
    if (valid[i]) k++;
    x.x = x.x - i * s + (G ? k * total / G : 0);
  });
}

function cloneLine(proto, fields) { return Object.assign(Object.create(proto), { leadingCut: 0, trailingCut: 0, newLineForced: false, lastLineInParagraph: true }, fields); }
function mkInline(font, text, size, extra) {
  return Object.assign({ text, font, fontSize: size, width: font.widthOfString(text, size) + (extra && extra.characterSpacing || 0) * [...text].length,
    height: font.lineHeight(size), x: 0, color: '#111111', characterSpacing: 0, alignment: 'left', leadingCut: 0, trailingCut: 0, opacity: 1,
    decoration: null, decorationColor: null, decorationStyle: null, background: null, link: null, linkToPage: null, linkToDestination: null, fontFeatures: null, sup: false, sub: false }, extra || {});
}

function shiftItem(it, dx) {
  const v = it.item;
  switch (it.type) {
    case 'line': case 'image': case 'svg': case 'beginClip': v.x += dx; break;
    case 'vector':
      if (v.type === 'line') { v.x1 += dx; v.x2 += dx; }
      else if (v.points) v.points.forEach(p => { p.x += dx; });
      else if (v.x != null) v.x += dx;
      break;
  }
}

function decorate(pages, R) {
  const G = R.G, cfg = R.cfg;
  let FR = null, proto = null;
  for (const pg of pages) for (const it of pg.items) if (it.type === 'line') {
    proto = proto || Object.getPrototypeOf(it.item);
    for (const x of it.item.inlines) if (x.fk === 'R') FR = x.font;
  }
  const scan = scanPages(pages);
  R.finalIds = scan.ids;
  R.nPages = pages.length;
  // which page is what
  let owner = null;
  const info = pages.map(pg => {
    const inf = { ids: [] };
    let nonEmpty = false;
    for (const it of pg.items) {
      if (it.type === 'image' || it.type === 'vector') nonEmpty = true;
      if (it.type !== 'line') continue;
      if (it.item.id) inf.ids.push(it.item.id);
      if (hasText(it.item)) nonEmpty = true;
    }
    inf.blank = !nonEmpty;
    for (const id of inf.ids) {
      if (id === 'cover-front' || id === 'BACKCOVER') inf.cover = true;
      else if (/^fm-|^toc$|^part\d+$/.test(id)) { owner = { fm: true }; inf.open = true; }
      else if (/^P~/.test(id) || R.plateIds.has(id)) { inf.plate = true; if (R.plateIds.has(id)) owner = { title: R.secTitle[id] }; }
      else if (/^[RL]~/.test(id)) { /* resume after a plate or start of a spread: same owner */ }
      else if (id in R.secTitle && R.secTitle[id] != null) { owner = { title: R.secTitle[id] }; inf.open = true; }
    }
    inf.owner = owner;
    return inf;
  });
  // text fixes: justification across hyphenation points, hanging hyphens, drop caps, leaders
  pages.forEach((pg, pi) => {
    const nums = {};
    const dcLines = [];
    for (const it of pg.items) if (it.type === 'line') {
      const L = it.item;
      for (const x of L.inlines) if (x.tocNum) nums[x.tocNum] = L;
    }
    for (const it of pg.items) {
      if (it.type !== 'line') continue;
      const L = it.item, ins = L.inlines;
      if (!ins.length) continue;
      const dc = ins[0].dc;
      if (dc) dcLines.push(L);
      if (dc && ins[0].dcj && L.lastLineInParagraph) rejustify(L, true);
      else rejustify(L, false);
      const last = ins[ins.length - 1];
      if (!L.lastLineInParagraph && !L.newLineForced && /​$/.test(last.text) && /\p{L}​$/u.test(last.text)) last.text += '-';
      const te = ins.find(x => x.tocEnd);
      if (te) {
        const NL = nums[te.tocEnd];
        if (NL) {
          NL.y = L.y;
          const ni = NL.inlines.find(x => x.tocNum);
          const endX = NL.x + ni.x - 2;
          const dot = te.font.widthOfString('.', te.fontSize), sp = 2.4, dw = dot + sp;
          const origin = mm(G.inner);
          const startX = L.x + te.x + 2;
          const start = origin + Math.ceil((startX - origin) / dw) * dw;
          const count = Math.floor((endX - start) / dw);
          if (count > 0) ins.push(Object.assign({}, te, { text: '.'.repeat(count), x: start - L.x, width: count * dw, characterSpacing: sp, tocEnd: null }));
        }
      }
    }
    if (dcLines.length && FR) {
      const t = dcLines[0].inlines[0];
      if (t.dcCap) {
        const FS = t.fontSize, asc = FR.ascender / 1000;
        const base2 = dcLines[0].y + asc * FS + 1.38 * FS;
        const cap = mkInline(FR, t.dcCap, t.dcS, { color: t.color || '#111111' });
        pg.items.push({ type: 'line', item: cloneLine(proto, { maxWidth: cap.width, inlineWidths: cap.width, inlines: [cap], x: dcLines[0].x - t.dcW, y: base2 - asc * t.dcS }) });
      }
    }
  });
  // mirrored margins, running heads and page numbers
  const dx = mm(G.outer - G.inner);
  const RH = Object.assign({ left: 'title', right: 'chapter' }, cfg.running_heads || {});
  const TW = R.TWpt;
  pages.forEach((pg, pi) => {
    const inf = info[pi], folio = pi + 1 - R.coverOff;
    if (inf.cover || inf.plate) return;
    const left = folio % 2 === 0;
    if (left) pg.items.forEach(it => shiftItem(it, dx));
    const showFolio = !inf.blank && !(inf.owner && inf.owner.fm) && folio >= 1;
    if (!showFolio || !FR || !proto) return;
    const x0 = left ? mm(G.outer) : mm(G.inner);
    const fsz = 9, fi = mkInline(FR, String(folio), fsz, { color: '#222222' });
    pg.items.push({ type: 'line', item: cloneLine(proto, { maxWidth: fi.width, inlineWidths: fi.width, inlines: [fi], x: x0 + TW / 2 - fi.width / 2, y: mm(G.H) - mm(G.bottom) / 2 - fi.height / 2 }) });
    if (inf.open) return;
    const what = RH[left ? 'left' : 'right'];
    let txt = what === 'title' ? cfg.title : what === 'author' ? cfg.author : what === 'chapter' ? (inf.owner && inf.owner.title) : '';
    if (!txt) return;
    txt = txt.toUpperCase();
    const hs = 7.5, sp = .12 * hs;
    let hi = mkInline(FR, txt, hs, { color: '#333333', characterSpacing: sp });
    while (hi.width > TW * .92 && txt.length > 4) { txt = txt.replace(/\s*\S+\s*…?$/, '') + '…'; hi = mkInline(FR, txt, hs, { color: '#333333', characterSpacing: sp }); }
    pg.items.push({ type: 'line', item: cloneLine(proto, { maxWidth: hi.width, inlineWidths: hi.width, inlines: [hi], x: x0 + TW / 2 - hi.width / 2, y: mm(G.top) / 2 - hi.height / 2 }) });
  });
}

// ---------------------------------------------------------------- build
function runLayout(dd, R, hook) {
  global.__pmHook = hook;
  try {
    return pdfMake.createPdf(dd, null, R.fonts, R.vfs)._createDoc();
  } finally {
    global.__pmHook = null;
  }
}
function flush(doc) {
  return new Promise((res, rej) => {
    const chunks = [];
    doc.on('readable', () => { let c; while ((c = doc.read(9007199254740991)) !== null) chunks.push(c); });
    doc.on('end', () => res(new Blob(chunks, { type: 'application/pdf' })));
    doc.on('error', rej);
    doc.end();
  });
}

function collectFigs(model) {
  const out = [];
  const walk = bl => bl.forEach(b => { if (b.type === 'fig') out.push(b); if (b.blocks) walk(b.blocks); if (b.items) b.items.forEach(walk); });
  model.front.concat(model.back, BK.chaptersOf(model)).forEach(s => walk(s.blocks));
  model.parts.forEach(p => p.introParsed && walk(p.introParsed.blocks));
  return out;
}

BK.buildPdf = async function (model, cfg, assets, progress) {
  progress = progress || (() => {});
  const G = BK.geom(cfg), F = BK.FONTS[cfg.font] || BK.FONTS.ebgaramond;
  const R = { cfg, G, F, L: BK.labels(cfg), FS: G.FS, TWpt: mm(G.TW), assets, images: {}, imgKeys: new Map(), missing: new Set(),
    pass: 1, reqs: [], blanks: new Set(), folio: {}, ixPages: {}, coverOff: cfg.include_covers === false ? 0 : 1,
    plates: new Map(), spreads: new Map(), secTitle: {}, plateIds: new Set() };
  R.lh = css => css / F.ratio;
  R.hy = cfg.hyphenate === false ? (s => s) : hyphenator(R);
  progress('Loading fonts…');
  const fonts = await BK.loadFont(cfg.font);
  R.vfs = {}; R.fonts = { Body: {} };
  for (const [slot, f] of Object.entries(fonts)) { R.vfs[f.file] = BK.b64(f.buf); R.fonts.Body[slot] = f.file; }
  progress('Preparing images…');
  const ppm = 300 / 25.4;
  for (const f of collectFigs(model)) {
    if ((f.kind === 'map' || f.kind === 'art') && !R.plates.has(f)) {
      const cv = await BK.drawPlate(f, cfg, assets, ppm);
      if (cv) { const k = 'pl' + R.plates.size; R.images[k] = cv.toDataURL('image/jpeg', .9); R.plates.set(f, k); } else R.missing.add(f.src);
    }
    if (f.kind === 'spread' && !R.spreads.has(f)) {
      const a = BK.findAsset(assets, f.src);
      if (a) { const h = await BK.halves(a); const k = 'sp' + R.spreads.size; R.images[k + 'L'] = h[0].dataURL; R.images[k + 'R'] = h[1].dataURL; R.spreads.set(f, [k + 'L', k + 'R']); }
      else R.missing.add(f.src);
    }
  }
  if (R.coverOff) {
    progress('Drawing the cover…');
    R.images.__cf = (await BK.drawCover('front', cfg, assets, ppm)).toDataURL('image/jpeg', .92);
    R.images.__cb = (await BK.drawCover('back', cfg, assets, ppm)).toDataURL('image/jpeg', .92);
  }
  await tick();
  progress('Laying out pages (pass 1 of 2)…');
  await tick();
  let s1 = null;
  try { runLayout(docDef(model, R), R, pages => { s1 = scanPages(pages); throw ABORT; }); }
  catch (e) { if (e !== ABORT) throw e; }
  // blank pages so that sections start on the right-hand page (and spreads on the left)
  let off = 0;
  const shifts = [];
  R.blanks = new Set();
  for (const r of R.reqs) {
    const p = s1.ids[r.id];
    if (p == null) continue;
    const folio = p + off - R.coverOff;
    if (r.parity === 'right' ? folio % 2 === 0 : folio % 2 === 1) { R.blanks.add(r.id); off++; }
    shifts.push([p, off]);
    if (global.BK_DEBUG) console.log("req", r.id, r.parity, p, off);
  }
  const offAt = p => { let o = 0; for (const [sp, so] of shifts) { if (sp <= p) o = so; else break; } return o; };
  const expected = {};
  for (const [id, p] of Object.entries(s1.ids)) { expected[id] = p + offAt(p); R.folio[id] = p + offAt(p) - R.coverOff; }
  const byTerm = {};
  for (const [oid, p] of Object.entries(s1.ix)) {
    const i = +oid.split('-')[1];
    (byTerm[i] = byTerm[i] || new Set()).add(p + offAt(p) - R.coverOff);
  }
  for (const [i, set] of Object.entries(byTerm)) R.ixPages[i] = [...set].sort((a, b) => a - b);
  progress('Laying out pages (pass 2 of 2)…');
  await tick();
  R.pass = 2;
  const doc = runLayout(docDef(model, R), R, pages => decorate(pages, R));
  let stable = true;
  for (const [id, p] of Object.entries(expected)) if (R.finalIds[id] != null && R.finalIds[id] !== p) { stable = false; break; }
  // page labels, as bookmaker.py sets them: the viewer shows "Cover", 1, 2, 3 … and "Back cover"
  if (R.coverOff && doc._root && doc._root.data) {
    const nums = [0, { P: new String(R.L.cover) }, 1, { S: 'D', St: 1 }];
    if (R.nPages > 2) nums.push(R.nPages - 1, { P: new String(R.L.back_cover) });
    const ref = doc.ref({ Nums: nums });
    ref.end();
    doc._root.data.PageLabels = ref;
  }
  progress('Writing the PDF…');
  await tick();
  const blob = await flush(doc);
  const total = Object.values(R.finalIds).length ? Math.max(...Object.values(R.finalIds)) : 0;
  return { blob, stable, missing: [...R.missing], indexTerms: Object.keys(R.ixPages).length, chapters: BK.chaptersOf(model).length, pageCountHint: total, ids: Object.assign({}, R.finalIds), coverOff: R.coverOff || 0 };
};
})(typeof window !== 'undefined' ? window : globalThis);
