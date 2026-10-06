/* Book Layout Kit – browser engine, part 2: geometry, fonts, images, cover and full-page plates (canvas). */
(function (global) {
'use strict';
const BK = global.BK;

BK.geom = function (cfg) {
  let pg = cfg.page || 'A5';
  if (typeof pg === 'string') pg = { size: pg };
  let [w, h] = BK.PAGE_SIZES[pg.size] || [148, 210];
  w = +pg.width || w; h = +pg.height || h;
  const r1 = v => Math.round(v * 10) / 10;
  const G = { W: w, H: h, top: r1(h * .081), outer: r1(w * .101), bottom: r1(h * .095), inner: r1(w * .122) };
  for (const k of ['top', 'outer', 'bottom', 'inner']) if (pg[k] != null) G[k] = +pg[k];
  G.VS = h / 210;
  G.FS = +cfg.font_size || (w < 165 ? 10.5 : 11.5);
  G.TW = w - G.outer - G.inner;
  G.TH = h - G.top - G.bottom;
  return G;
};

// ---------------------------------------------------------------- fonts
const fontBufs = {}, faces = {};
BK.FONT_STYLES = [['normal', 400, 'normal'], ['bold', 600, 'normal'], ['italics', 400, 'italic'], ['bolditalics', 600, 'italic']];
BK.fontFile = (key, w, st) => `${key}-${w}-${st}.ttf`;
// Fonts come from fonts/*.ttf over http(s); opened as a local file (file://) they come from fonts/<family>.js instead.
BK.loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); });
async function fetchFont(key, f) {
  if (location.protocol !== 'file:') {
    try { const r = await fetch('fonts/' + f); if (r.ok) return await r.arrayBuffer(); } catch (e) { /* fall through to the script copy */ }
  }
  global.BK_FONTDATA = global.BK_FONTDATA || {};
  if (!global.BK_FONTDATA[key]) await BK.loadScript('fonts/' + key + '.js');
  const b64 = (global.BK_FONTDATA[key] || {})[f];
  if (!b64) throw new Error('Could not load the font file ' + f);
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
BK.loadFont = async function (key) {
  if (!BK.FONTS[key]) key = 'ebgaramond';
  const out = {};
  await Promise.all(BK.FONT_STYLES.map(async ([slot, w, st]) => {
    const f = BK.fontFile(key, w, st);
    if (!fontBufs[f]) {
      fontBufs[f] = await fetchFont(key, f);
    }
    out[slot] = { file: f, buf: fontBufs[f] };
    const fk = key + w + st;
    if (!faces[fk] && typeof FontFace !== 'undefined') {
      const ff = new FontFace('BK ' + key, fontBufs[f].slice(0), { weight: String(w), style: st });
      faces[fk] = ff.load().then(x => { document.fonts.add(x); return x; });
    }
    if (faces[fk]) await faces[fk];
  }));
  return out;
};
BK.fam = key => `"BK ${key}", Georgia, serif`;

const mctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
BK.measure = function (text, size, st, key) {
  mctx.font = `${st && st.i ? 'italic ' : ''}${st && st.b ? 600 : 400} 100px ${BK.fam(key)}`;
  return mctx.measureText(text).width * size / 100;
};

BK.b64 = function (buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// ---------------------------------------------------------------- images
const imgCache = new Map();
BK.loadImg = function (src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Image could not be read'));
    im.src = src;
  }));
  return imgCache.get(src);
};

BK.findAsset = function (assets, src) {
  if (!src || !assets) return null;
  if (assets.has(src)) return assets.get(src);
  const base = src.split(/[\\/]/).pop().toLowerCase();
  for (const [k, v] of assets) if (k.toLowerCase() === base || k.split(/[\\/]/).pop().toLowerCase() === base) return v;
  return null;
};

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
BK.canvasOf = canvasOf;

// cover-fit an image into a box with a focal position (0..100 %)
function drawCoverFit(c, im, x, y, w, h, px, py) {
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.drawImage(im, x + (w - dw) * px / 100, y + (h - dh) * py / 100, dw, dh);
  c.restore();
}

// ---------------------------------------------------------------- canvas text
function textBlock(c, s, o) {
  const size = o.size * o.pxpt;
  c.font = `${o.italic ? 'italic ' : ''}${o.weight || 400} ${size}px ${o.fam}`;
  c.fillStyle = o.color;
  c.textBaseline = 'alphabetic';
  const sp = (o.spacing || 0) * size;
  const width = (s0) => c.measureText(s0).width + sp * [...s0].length;
  const lines = [];
  const paras = Array.isArray(s) ? s : String(s).split('\n');
  for (let p of paras) {
    if (o.upper) p = p.toUpperCase();
    const words = p.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && o.width && width(t) > o.width) { lines.push({ t: cur, last: false }); cur = w; } else cur = t;
    }
    lines.push({ t: cur, last: true, para: true });
  }
  const m = c.measureText('Hg');
  const asc = m.fontBoundingBoxAscent || size * .8, desc = m.fontBoundingBoxDescent || size * .22;
  const lh = size * (o.lh || 1.2);
  let y = o.top + (lh - asc - desc) / 2 + asc;
  const left = o.align === 'center' ? o.x - (o.width || 0) / 2 : o.x;
  for (const ln of lines) {
    const w = width(ln.t);
    let x = o.align === 'center' ? o.x - w / 2 : (o.align === 'right' ? o.x - w : o.x);
    if (o.align === 'justify' && !ln.last) {
      const ws = ln.t.split(' ');
      const gap = (o.width - (width(ln.t) - (ws.length - 1) * c.measureText(' ').width)) / Math.max(1, ws.length - 1);
      let xx = left;
      for (const w0 of ws) { drawSpaced(c, w0, xx, y, sp); xx += width(w0) + gap; }
    } else drawSpaced(c, ln.t, o.align === 'justify' ? left : x, y, sp);
    y += lh;
    if (ln.para && o.paraGap) y += o.paraGap;
  }
  return lines.length * lh + (o.paraGap || 0) * paras.length;
}
function drawSpaced(c, s, x, y, sp) {
  if (!sp) { c.fillText(s, x, y); return; }
  for (const ch of s) { c.fillText(ch, x, y); x += c.measureText(ch).width + sp; }
}

// ---------------------------------------------------------------- QR
BK.qrDataURL = function (text) {
  const q = qrcode(0, 'M');
  q.addData(text); q.make();
  const n = q.getModuleCount(), box = 20, border = 2;
  const cv = canvasOf((n + border * 2) * box, (n + border * 2) * box), c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + border) * box, (r + border) * box, box, box);
  return cv.toDataURL('image/png');
};

// ---------------------------------------------------------------- cover
const hexRgb = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = [...h].map(x => x + x).join(''); const n = parseInt(h, 16) || 0; return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
BK.coverStyle = cfg => {
  const cv = cfg.cover || {};
  const st = (cv.style && cv.style !== 'auto') ? cv.style : (cv.image ? 'photo' : 'classic');
  return st;
};

// opt.bleed = { l, r, t, b } in mm: the artwork runs on past the trimmed page on those sides (for print covers)
BK.drawCover = async function (side, cfg, assets, ppm, opt) {
  const G = BK.geom(cfg), W = G.W, H = G.H, cv = Object.assign(BK.defaults().cover, cfg.cover || {});
  const bd = Object.assign({ l: 0, r: 0, t: 0, b: 0 }, (opt && opt.bleed) || {});
  await BK.loadFont(cfg.font);
  const canvas = canvasOf((W + bd.l + bd.r) * ppm, (H + bd.t + bd.b) * ppm), c = canvas.getContext('2d');
  const X = v => v * ppm, pxpt = 25.4 / 72 * ppm, fam = BK.fam(cfg.font);
  c.translate(X(bd.l), X(bd.t));       // from here on, 0,0 is the top left corner of the trimmed page
  const T = (s, o) => textBlock(c, s, Object.assign({ pxpt, fam, align: 'center', x: X(W / 2), width: X(W - 16) }, o));
  const fullW = X(W + bd.l + bd.r), left = -X(bd.l);
  const band = (y, h, col) => {
    const y0 = y <= 0 ? -bd.t : y, y1 = y + h >= H - 1 ? H + bd.b : y + h;
    c.fillStyle = col; c.fillRect(left, X(y0), fullW, X(y1 - y0) + 1);
  };
  const hide = cv.hide || {}, on = k => !hide[k];
  // text that has to stay inside its band: measure it, and make the type smaller until it fits (and no word is wider than the line)
  const sc0 = canvasOf(8, 8).getContext('2d');
  const measureTxt = (txt, o) => {
    const oo = Object.assign({ pxpt, fam, align: 'center', x: 0, width: X(W - 16), top: 0, color: '#000' }, o);
    const h = textBlock(sc0, txt, oo), sp = (oo.spacing || 0) * oo.size * pxpt;
    let wide = 0;
    for (const p of (Array.isArray(txt) ? txt : String(txt).split('\n'))) for (const w of (oo.upper ? p.toUpperCase() : p).split(/\s+/).filter(Boolean)) wide = Math.max(wide, sc0.measureText(w).width + sp * [...w].length);
    return { h, ok: wide <= oo.width + 1 };
  };
  const fitText = (txt, o, maxH, min) => {
    let sz = o.size;
    for (;;) {
      const oo = Object.assign({}, o, { size: sz }), m = measureTxt(txt, oo);
      if ((m.h <= maxH && m.ok) || sz <= min) return oo;
      sz = Math.max(min, sz - .5);
    }
  };
  // subtitles and author below each other: they push each other down and, when there is no room left in the band, shrink together
  const flowBelow = (items, top0, limit, authorTop, color, gapA) => {
    for (let k = 1; ; k -= .05) {
      let y = top0, ok = true; const out = [];
      items.forEach((it, i) => {
        const o = Object.assign({}, it.o, { size: Math.max(5, it.o.size * k) }), m = measureTxt(it.t, o);
        if (it.author) y = Math.max(y, authorTop, y + gapA);
        out.push({ t: it.t, o: Object.assign({ top: y, color }, o) }); y += m.h + (it.author ? 0 : X(1)); if (!m.ok) ok = false;
      });
      if ((ok && y - X(1) <= limit) || k <= .5) { out.forEach(r => T(r.t, r.o)); return; }
    }
  };
  // which subtitle lines of the book go on the cover
  const src = cv.subtitle_source || 'auto', s1 = cfg.subtitle || '', s2 = cfg.subtitle2 || '';
  const subs = (src === 'both' ? [s1, s2] : src === 'first' ? [s1] : src === 'second' ? [s2] : src === 'none' ? [] : [s2 || s1]).filter(Boolean);
  const subt = on('subtitle') ? subs[0] || '' : '', subt2 = on('subtitle') ? subs[1] || '' : '';
  const titleLines = (cv.title_lines && cv.title_lines.length) ? cv.title_lines : [cfg.title || 'Untitled'];
  let style = BK.coverStyle(cfg);
  const asset = cv.image ? BK.findAsset(assets, cv.image) : null;
  if (style === 'photo' && !asset) style = 'classic';
  if (side === 'front') {
    if (style === 'photo') {
      // the bands above and below the photo can be made thinner (band_size 100 = full, 0 = none: the photo fills the cover)
      const bs = Math.max(0, Math.min(100, cv.band_size ?? 100)) / 100, bh = H * .27 * bs;
      if (bh > 0) { band(0, bh, cv.band); band(H - bh, bh, cv.band); }
      const im = await BK.loadImg(asset.dataURL);
      const y0 = bh > 0 ? X(bh) : -X(bd.t), y1 = bh > 0 ? X(H - bh) : X(H + bd.b);
      drawCoverFit(c, im, left, y0, fullW, y1 - y0, cv.image_x ?? 50, cv.image_y ?? 50);
      if (bh > 0) {
        c.fillStyle = cv.band_ink;
        c.fillRect(left, X(bh - .6), fullW, Math.max(1, .8 * pxpt));
        c.fillRect(left, X(H - bh + .3), fullW, Math.max(1, .8 * pxpt));
      }
      // where the text now sits on the photo, a soft shade of the band colour keeps it readable
      if (bs < 1 && cv.band_shade !== false) {
        const rgb = hexRgb(cv.band), a = .8 * (1 - bs * .6), zone = H * .27;
        const gt = c.createLinearGradient(0, -X(bd.t), 0, X(zone)), gb = c.createLinearGradient(0, X(H - zone), 0, X(H + bd.b));
        gt.addColorStop(0, `rgba(${rgb},${a})`); gt.addColorStop(.55, `rgba(${rgb},${a * .55})`); gt.addColorStop(1, `rgba(${rgb},0)`);
        gb.addColorStop(0, `rgba(${rgb},0)`); gb.addColorStop(.45, `rgba(${rgb},${a * .55})`); gb.addColorStop(1, `rgba(${rgb},${a})`);
        c.fillStyle = gt; c.fillRect(left, -X(bd.t), fullW, X(zone + bd.t));
        c.fillStyle = gb; c.fillRect(left, X(H - zone), fullW, X(zone + bd.b));
      }
      if (cv.label && on('label')) T(cv.label, { top: X(H * .045), size: 8, spacing: .45, upper: true, color: cv.band_ink });
      // title vertically centred in the box top .095H, height .15H
      const lh = 1.15;
      if (on('title')) {
        const to = fitText(titleLines, { size: 21, lh, spacing: .08, upper: true }, X(H * .15), 11), th = measureTxt(titleLines, to).h;
        T(titleLines, Object.assign({ top: X(H * .095) + (X(H * .15) - th) / 2, color: cv.band_ink }, to));
      }
      const footTop = cv.footer && on('footer') ? X(H - H * .045) - 8 * 1.2 * pxpt : X(H - 6);
      flowBelow([subt && { t: subt, o: { size: 11, italic: true } }, subt2 && { t: subt2, o: { size: 9.5 } },
        cfg.author && on('author') && { t: cfg.author, author: true, o: { size: 11, spacing: .3, upper: true } }].filter(Boolean),
        X(H * (subt2 ? .742 : .755)), footTop - X(2), X(H * (subt2 ? .83 : .815)), cv.band_ink, X(3));
      if (cv.footer && on('footer')) T(cv.footer, { top: X(H - H * .045) - 8 * 1.2 * pxpt, size: 8, spacing: .35, upper: true, color: cv.band_ink });
    } else {
      band(0, H * .295, cv.band); band(H * .295, H * .41, cv.mid); band(H * .705, H * .295 + 1, cv.band);
      if (cv.label && on('label')) T(cv.label, { top: X(H * .115), size: 9, spacing: .45, upper: true, color: cv.band_ink });
      if (on('title')) T(titleLines, Object.assign({ top: X(H * .37), color: cv.ink }, fitText(titleLines, { size: 23, lh: 1.2, spacing: .08, upper: true }, X(H * .135), 12)));
      if (on('title')) { c.fillStyle = cv.ink; c.fillRect(X(W / 2 - 12), X(H * .525), X(24), Math.max(1, .7 * pxpt)); }
      flowBelow([subt && { t: subt, o: { size: 11.5, italic: true } }, subt2 && { t: subt2, o: { size: 9.5 } },
        cfg.author && on('author') && { t: cfg.author, author: true, o: { size: 11, spacing: .3, upper: true } }].filter(Boolean),
        X(H * (subt2 ? .543 : .553)), X(H * .705) - X(6), X(H * (subt2 ? .65 : .63)), cv.ink, X(4));
      if (cv.footer && on('footer')) T(cv.footer, { top: X(H - H * .105) - 8.5 * 1.2 * pxpt, size: 8.5, spacing: .35, upper: true, color: cv.band_ink });
    }
  } else {
    // back: bands above and below (thinner or none), the middle in colour or a picture, text that can be moved
    const bbs = Math.max(0, Math.min(100, cv.back_band_size ?? 100)) / 100, bbh = H * .295 * bbs;
    const bimg = cv.back_image ? BK.findAsset(assets, cv.back_image) : null;
    if (bimg) {
      const im = await BK.loadImg(bimg.dataURL);
      const y0 = bbh > 0 ? X(bbh) : -X(bd.t), y1 = bbh > 0 ? X(H - bbh) : X(H + bd.b);
      drawCoverFit(c, im, left, y0, fullW, y1 - y0, cv.back_image_x ?? 50, cv.back_image_y ?? 50);
    } else band(bbh, H - 2 * bbh + 1, cv.mid);
    if (bbh > 0) { band(0, bbh, cv.band); band(H - bbh, bbh + 1, cv.band); }
    const scratch = canvasOf(8, 8).getContext('2d'), panelOn = cv.back_shade !== false;
    // a panel behind text that does not sit wholly on a plain area of the right colour
    const panel = (x, y, w, h, col, alpha) => {
      const pd = X(4), r = X(2); c.save(); c.globalAlpha = alpha; c.fillStyle = col; c.beginPath();
      if (c.roundRect) c.roundRect(x - pd, y - pd, w + 2 * pd, h + 2 * pd, r); else c.rect(x - pd, y - pd, w + 2 * pd, h + 2 * pd);
      c.fill(); c.restore();
    };
    const blockH = (txt, o) => { const sc = scratch; return textBlock(sc, txt, Object.assign({ pxpt, fam, align: 'center', x: 0, width: X(W - 16), top: 0, color: '#000' }, o)); };
    const quote = cv.quote && on('quote') ? cv.quote : '';
    if (quote) {
      const top = X(H * (cv.back_quote_y ?? 10.5) / 100), below = Math.min(cv.back_subtitle_source && cv.back_subtitle_source !== 'none' ? X(H * (cv.back_subtitle_y ?? 22) / 100) : 1e9, X(H * (cv.back_blurb_y ?? 33) / 100));
      const o = fitText(quote, { size: 13, lh: 1.3, italic: true, width: X(W - 32), x: 0 }, Math.max(X(10), below - top - X(6)), 8.5), h = blockH(quote, o);
      const inBand = top + h <= X(bbh);
      if (!inBand && panelOn) panel(X(16), top, X(W - 32), h, cv.band, .86);
      T(quote, Object.assign({ top, color: cv.band_ink }, o, { x: X(W / 2) }));
    }
    // subtitles of the book, if the author wants them on the back as well
    const bsrc = cv.back_subtitle_source || 'none';
    const bsubs = (bsrc === 'both' ? [s1, s2] : bsrc === 'first' ? [s1] : bsrc === 'second' ? [s2] : bsrc === 'auto' ? [s2 || s1] : []).filter(Boolean);
    if (bsubs.length && on('subtitle')) {
      const top0 = X(H * (cv.back_subtitle_y ?? 22) / 100);
      let top = top0;
      bsubs.forEach((t, i) => {
        const o = { size: i ? 9.5 : 11.5, lh: 1.3, italic: !i, width: X(W - 32) }, h = blockH(t, o);
        const inBand = top + h <= X(bbh), inBandB = top >= X(H - bbh), plain = !bimg && top >= X(bbh) && top + h <= X(H - bbh);
        if (!inBand && !inBandB && !plain && panelOn) panel(X(16), top, X(W - 32), h, cv.mid, .88);
        T(t, Object.assign({ top, color: inBand || inBandB ? cv.band_ink : cv.ink }, o, { x: X(W / 2) }));
        top += h + X(1.5);
      });
    }
    const blurb = (cv.blurb || []).filter(Boolean);
    if (blurb.length && on('blurb')) {
      const top = X(H * (cv.back_blurb_y ?? 33) / 100);
      // the text stops above the QR code and the barcode box, and above the bottom margin
      let lim = X(H - 10);
      if (cv.qr && on('qr')) lim = Math.min(lim, X(H) - X(12) - X(34) - X(4));
      if (opt && opt.barcode) lim = Math.min(lim, X(H - ((opt.barcodePos || {}).bottom ?? BK.KDP.barcodeMargin) - BK.KDP.barcode[1] - 3));
      const o = Object.assign(fitText(blurb, { x: 0, width: X(W - 32), align: 'justify', size: 10.2, lh: 1.42, paraGap: X(2.2) }, Math.max(X(15), lim - top - X(5)), 7.5), { x: X(16) }), h = blockH(blurb, Object.assign({}, o, { x: 0 }));
      const plain = !bimg && top >= X(bbh) && top + h <= X(H - bbh);
      if (!plain && panelOn) panel(X(16), top, X(W - 32), h, cv.mid, .88);
      T(blurb, Object.assign({ top, color: cv.ink }, o));
    }
    if (cv.qr && on('qr')) {
      const qsrc = /^https?:\/\//i.test(cv.qr) ? BK.qrDataURL(cv.qr) : (BK.findAsset(assets, cv.qr) || {}).dataURL;
      if (qsrc) {
        const im = await BK.loadImg(qsrc);
        const qx = X(16), qs = X(30), qy = X(H) - X(12) - qs - X(4);
        c.fillStyle = '#fff'; c.fillRect(qx, qy, qs + X(4), qs + X(4));
        c.imageSmoothingEnabled = false; c.drawImage(im, qx + X(2), qy + X(2), qs, qs); c.imageSmoothingEnabled = true;
        if (cv.qr_text) {
          const tw = X(W - 32) - qs - X(9) - (opt && opt.barcode ? X(BK.KDP.barcode[0] - 8) : 0), o = { x: qx + qs + X(4) + X(5), width: tw, align: 'left', size: 7.5, lh: 1.35 }, ty = qy + X(9);
          const inBand = qy >= X(H - bbh) && !bimg;
          if (!inBand && panelOn) { const h = blockH(cv.qr_text, Object.assign({}, o, { x: 0 })); panel(o.x, ty, tw, h, '#ffffff', .88); }
          T(cv.qr_text, Object.assign({ top: ty, color: inBand || !panelOn ? cv.band_ink : cv.ink }, o));
        }
      }
    }
    // room for the ISBN barcode, lower right of the back cover (KDP puts a white box of 2 x 1.2 in there)
    if (opt && opt.barcode) {
      const [bw, bh] = BK.KDP.barcode, bp = opt.barcodePos || {}, bx = W - (bp.right ?? BK.KDP.barcodeMargin) - bw, by = H - (bp.bottom ?? BK.KDP.barcodeMargin) - bh;
      c.fillStyle = '#fff'; c.fillRect(X(bx), X(by), X(bw), X(bh));
      const bimg = opt.barcodeImage ? BK.findAsset(assets, opt.barcodeImage) : null;
      if (bimg) {
        const im = await BK.loadImg(bimg.dataURL), s = Math.min(X(bw - 4) / im.naturalWidth, X(bh - 4) / im.naturalHeight);
        c.drawImage(im, X(bx + bw / 2) - im.naturalWidth * s / 2, X(by + bh / 2) - im.naturalHeight * s / 2, im.naturalWidth * s, im.naturalHeight * s);
      }
    }
  }
  return canvas;
};

// ---------------------------------------------------------------- print cover for Amazon KDP: back, spine and front in one sheet with bleed
BK.drawWrap = async function (cfg, assets, ppm, opt) {
  opt = opt || {};
  const K = BK.KDP, k = BK.kdpCfg(cfg), g = BK.kdpGeom(cfg, opt.pages), cv = Object.assign(BK.defaults().cover, cfg.cover || {});
  const m = g.m, pad = n => Math.round(n * ppm), hard = g.format === 'hardcover';
  const bopt = { barcode: k.barcode !== false, barcodeImage: k.barcode_image };
  // hardcover: the barcode sits 16 mm in from the hinge side and 19 mm up from the bottom of the file
  const bpos = hard ? { right: K.hard.hinge + K.hard.barcodeSide, bottom: K.hard.barcodeBottom - m } : undefined;
  const [back, front] = await Promise.all([
    BK.drawCover('back', cfg, assets, ppm, { bleed: { l: m, r: 0, t: m, b: m }, barcode: bopt.barcode, barcodeImage: bopt.barcodeImage, barcodePos: bpos }),
    BK.drawCover('front', cfg, assets, ppm, { bleed: { l: 0, r: m, t: m, b: m } })]);
  const canvas = canvasOf(pad(g.w), pad(g.h)), c = canvas.getContext('2d');
  c.fillStyle = cv.band; c.fillRect(0, 0, canvas.width, canvas.height);   // the spine is the band colour
  c.drawImage(back, 0, 0);
  const xf = pad(m + g.W + g.sz);
  c.drawImage(front, xf, 0);
  if (g.spineText) await drawSpine(c, cfg, g, ppm);
  if (opt.guides) BK.drawWrapGuides(c, g, ppm, bopt.barcode);
  return canvas;
};
// title and author along the spine, reading top to bottom
async function drawSpine(c, cfg, g, ppm) {
  const cv = Object.assign(BK.defaults().cover, cfg.cover || {});
  await BK.loadFont(cfg.font);
  const K = BK.KDP, fam = BK.fam(cfg.font), len = (g.H - 2 * 12) * ppm, thick = g.spine * ppm;   // the type sits across the printed spine, in the middle of the spine panel
  const tmp = canvasOf(Math.max(1, Math.round(len)), Math.max(1, Math.round(thick))), t = tmp.getContext('2d');
  const pxpt = 25.4 / 72 * ppm;
  const title = (cfg.title || '').toUpperCase(), author = (cfg.author || '').toUpperCase();
  const measure = (s, size, sp) => { t.font = `400 ${size * pxpt}px ${fam}`; return t.measureText(s).width + sp * size * pxpt * [...s].length; };
  const gap = 10 * ppm;
  let size = g.spineSize, aSize = Math.min(size * .75, size);
  let aw = author ? measure(author, aSize, .25) : 0;
  let tw = title ? measure(title, size, .12) : 0;
  while (tw + (aw ? aw + gap : 0) > len && size > 5.5) { size -= .5; aSize = Math.min(aSize, size * .75); tw = measure(title, size, .12); aw = author ? measure(author, aSize, .25) : 0; }
  const showAuthor = author && tw + aw + gap <= len;
  const mid = sz => (thick - sz * pxpt * 1.2) / 2;                   // the line box centred across the spine
  if (title && tw <= len) textBlock(t, title, { pxpt, fam, color: cv.band_ink, size, spacing: .12, align: 'left', x: 0, top: mid(size), lh: 1.2 });
  if (showAuthor) textBlock(t, author, { pxpt, fam, color: cv.band_ink, size: aSize, spacing: .25, align: 'right', x: len, top: mid(aSize), lh: 1.2 });
  c.save();
  c.translate(Math.round((g.m + g.W + (g.sz - g.spine) / 2) * ppm + thick), Math.round((g.m + 12) * ppm));
  c.rotate(Math.PI / 2);
  c.drawImage(tmp, 0, 0);
  c.restore();
}
// trim, bleed, safe zone, spine folds and barcode box, for the preview only
BK.drawWrapGuides = function (c, g, ppm, barcode) {
  const K = BK.KDP, X = v => v * ppm, m = g.m, hard = g.format === 'hardcover', HC = K.hard;
  const line = (x0, y0, x1, y1, col, dash) => { c.strokeStyle = col; c.lineWidth = Math.max(1.2, ppm * .25); c.setLineDash(dash || []); c.beginPath(); c.moveTo(X(x0), X(y0)); c.lineTo(X(x1), X(y1)); c.stroke(); };
  const rect = (x, y, w, h, col, dash) => { c.strokeStyle = col; c.lineWidth = Math.max(1.2, ppm * .25); c.setLineDash(dash || []); c.strokeRect(X(x), X(y), X(w), X(h)); };
  const xs = m + g.W, xf = xs + g.sz;
  c.save();
  // the bleed (paperback) or the wrap (hardcover) is dimmed: paperback is cut off, hardcover folds round the board
  const edge = hard ? HC.wrap : m;
  c.fillStyle = hard ? 'rgba(40,90,180,.2)' : 'rgba(180,30,30,.22)';
  c.fillRect(0, 0, X(g.w), X(edge)); c.fillRect(0, X(g.h - edge), X(g.w), X(edge)); c.fillRect(0, X(edge), X(edge), X(g.h - 2 * edge)); c.fillRect(X(g.w - edge), X(edge), X(edge), X(g.h - 2 * edge));
  if (hard) {
    rect(edge, edge, g.w - 2 * edge, g.h - 2 * edge, '#b32020');                       // the boards
    const sx = xs, ex = xf; rect(sx, edge, ex - sx, g.h - 2 * edge, '#b32020');       // the spine panel
    const S = HC.safe, hg = HC.hinge;
    rect(S, S, xs - hg - S, g.h - 2 * S, '#1f8a4c', [X(2), X(1.5)]);                // safe area, back (hinge 10 mm)
    rect(xf + hg, S, g.w - S - xf - hg, g.h - 2 * S, '#1f8a4c', [X(2), X(1.5)]);       // safe area, front
    line(xs, 0, xs, g.h, '#c24bb4', [X(3), X(2)]); line(xf, 0, xf, g.h, '#c24bb4', [X(3), X(2)]);
    if (g.spine > 2 * K.spineMargin + 1) rect(xs + (g.sz - g.spine) / 2 + K.spineMargin, m + 6, g.spine - 2 * K.spineMargin, g.H - 12, '#c24bb4', [X(1), X(1)]);
    if (barcode) {
      const [bw, bh] = K.barcode, bx = xs - hg - HC.barcodeSide - bw, by = g.h - HC.barcodeBottom - bh;
      c.setLineDash([]); c.strokeStyle = '#1f5fb4'; c.lineWidth = Math.max(1.2, ppm * .25); c.strokeRect(X(bx), X(by), X(bw), X(bh));
      c.fillStyle = '#1f5fb4'; c.font = `${Math.max(9, X(2.6))}px sans-serif`; c.textAlign = 'center'; c.fillText('barcode', X(bx + bw / 2), X(by + bh / 2) + X(1));
    }
    c.restore(); return;
  }
  const bl = m;
  rect(bl, bl, 2 * g.W + g.spine, g.H, '#b32020');                                   // trim
  const s = K.safe;
  rect(bl + s, bl + s, g.W - 2 * s, g.H - 2 * s, '#1f8a4c', [X(2), X(1.5)]);          // safe zone, back
  rect(xf + s, bl + s, g.W - 2 * s, g.H - 2 * s, '#1f8a4c', [X(2), X(1.5)]);          // safe zone, front
  line(xs, 0, xs, g.h, '#c24bb4', [X(3), X(2)]); line(xf, 0, xf, g.h, '#c24bb4', [X(3), X(2)]);   // spine folds
  if (g.spine > 2 * K.spineMargin + 1) { rect(xs + K.spineMargin, bl + 6, g.spine - 2 * K.spineMargin, g.H - 12, '#c24bb4', [X(1), X(1)]); }
  if (barcode) {
    const [bw, bh] = K.barcode, bx = bl + g.W - K.barcodeMargin - bw, by = bl + g.H - K.barcodeMargin - bh;
    c.setLineDash([]); c.strokeStyle = '#1f5fb4'; c.lineWidth = Math.max(1.2, ppm * .25); c.strokeRect(X(bx), X(by), X(bw), X(bh));
    c.fillStyle = '#1f5fb4'; c.font = `${Math.max(9, X(2.6))}px sans-serif`; c.textAlign = 'center'; c.fillText('barcode', X(bx + bw / 2), X(by + bh / 2) + X(1));
  }
  c.restore();
};

// ---------------------------------------------------------------- Kindle cover: the front at 1.6 : 1, 1600 x 2560 px
BK.drawEbookCover = async function (cfg, assets) {
  const c2 = JSON.parse(JSON.stringify(cfg));
  c2.page = { width: 148, height: 236.8 };
  return BK.drawCover('front', c2, assets, BK.KDP.ebook.w / 148);
};

// ---------------------------------------------------------------- one-page PDF holding a JPEG, sized in mm
BK.jpegPdf = async function (canvas, wmm, hmm, title) {
  const jpg = new Uint8Array(await new Promise(r => canvas.toBlob(b => b.arrayBuffer().then(r), 'image/jpeg', .95)));
  const wp = (wmm * 72 / 25.4).toFixed(2), hp = (hmm * 72 / 25.4).toFixed(2);
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const put = d => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; put(`${n} 0 obj\n`); if (typeof body === 'string') put(body); else body(); put('\nendobj\n'); };
  const content = `q ${wp} 0 0 ${hp} 0 0 cm /Im0 Do Q`;
  put('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wp} ${hp}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`);
  obj(4, () => { put(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); put(jpg); put('\nendstream'); });
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${String(title || 'Cover').replace(/[()\\]/g, '')}) /Producer (Book Layout Kit) >>`);
  const xref = len;
  let x = 'xref\n0 7\n0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  put(x + `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
};
function wrapCount(c, s, size, pxpt, fam, width, spacing) {
  c.font = `400 ${size * pxpt}px ${fam}`;
  const sp = spacing * size * pxpt, out = [];
  let cur = '';
  for (const w of s.toUpperCase().split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && c.measureText(t).width + sp * t.length > width) { out.push(cur); cur = w; } else cur = t;
  }
  out.push(cur);
  return out;
}

// ---------------------------------------------------------------- black-and-white cleanup for old maps
BK.bwMap = function (im) {
  let w = im.naturalWidth, h = im.naturalHeight;
  const sc = Math.min(1, 2400 / Math.max(w, h)); w = Math.round(w * sc); h = Math.round(h * sc);
  const cv = canvasOf(w, h), c = cv.getContext('2d');
  c.drawImage(im, 0, 0, w, h);
  const data = c.getImageData(0, 0, w, h), d = data.data, n = w * h;
  const g = new Float32Array(n), sat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    g[i] = .25 * r + .45 * gg + .30 * b;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    sat[i] = mx ? (mx - mn) / mx * 255 : 0;
  }
  // background (paper tone) estimate: max filter + blur, on a 4x smaller grid
  const f = 4, sw = Math.ceil(w / f), sh = Math.ceil(h / f);
  let sm = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = ((y / f) | 0) * sw + ((x / f) | 0); if (g[y * w + x] > sm[k]) sm[k] = g[y * w + x]; }
  sm = maxFilter(sm, sw, sh, 2); sm = boxBlur(sm, sw, sh, 3); sm = boxBlur(sm, sw, sh, 3); sm = boxBlur(sm, sw, sh, 3);
  const sorted = Float32Array.from(sat).sort(), med = sorted[n >> 1];
  let col = new Float32Array(n);
  for (let i = 0; i < n; i++) col[i] = Math.min(255, Math.max(0, (sat[i] - med - 25) * 4)) / 255;
  col = boxBlur(boxBlur(col, w, h, 3), w, h, 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const fx = Math.min(sw - 1.001, x / f), fy = Math.min(sh - 1.001, y / f), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
    const bg = sm[y0 * sw + x0] * (1 - ax) * (1 - ay) + sm[y0 * sw + x0 + 1] * ax * (1 - ay) + sm[(y0 + 1) * sw + x0] * (1 - ax) * ay + sm[(y0 + 1) * sw + x0 + 1] * ax * ay;
    let v = Math.min(255, Math.max(0, g[i] / Math.max(bg, 1) * 255));
    v = Math.pow(Math.min(1, Math.max(0, (v - 45) / 187)), 1.05) * 255;
    v *= (1 - .13 * col[i]);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  c.putImageData(data, 0, 0);
  return cv;
};
function maxFilter(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = -r; k <= r; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); m = Math.max(m, a[y * w + xx]); } t[y * w + x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = -r; k <= r; k++) { const yy = Math.min(h - 1, Math.max(0, y + k)); m = Math.max(m, t[yy * w + x]); } o[y * w + x] = m; }
  return o;
}
function boxBlur(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + Math.min(w - 1, Math.max(0, k))]; for (let x = 0; x < w; x++) { t[y * w + x] = s / n; s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, k)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return o;
}

// ---------------------------------------------------------------- full-page plates (MAP / ART), drawn turned 90 degrees
BK.drawPlate = async function (fig, cfg, assets, ppm) {
  const G = BK.geom(cfg), W = G.W, H = G.H;
  const a = BK.findAsset(assets, fig.src);
  if (!a) return null;
  let im = await BK.loadImg(a.dataURL);
  if (fig.kind === 'map' && cfg.bw_maps) im = BK.bwMap(im);
  const pw = W - 16, ph = H - 18;            // page box (portrait)
  const cv = canvasOf(pw * ppm, ph * ppm), c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  c.translate(0, cv.height); c.rotate(-Math.PI / 2);   // now drawing in a landscape box ph x pw
  const X = v => v * ppm, pxpt = 25.4 / 72 * ppm, fam = BK.fam(cfg.font);
  const LW = ph, LH = pw - 1;
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const capText = BK.plainRuns(fig.cap || []);
  if (fig.kind === 'map') {
    const th = textBlock(c, fig.alt, { pxpt, fam, x: 0, top: 0, size: 13, italic: true, color: '#111', align: 'left', width: X(LW) });
    let h = LH - 21, w = h * iw / ih;
    if (w > LW) { w = LW; h = w * ih / iw; }
    const x = (LW - w) / 2, y = th / ppm + 2;
    c.drawImage(im, X(x), X(y), X(w), X(h));
    c.strokeStyle = '#999'; c.lineWidth = .3 * pxpt; c.strokeRect(X(x), X(y), X(w), X(h));
    if (capText) textBlock(c, capText, { pxpt, fam, x: 0, top: X(y + h + 2), size: 7.6, italic: true, color: '#111', align: 'left', width: X(LW), lh: 1.3 });
  } else {
    textBlock(c, fig.alt, { pxpt, fam, x: X(LW / 2), top: 0, size: 12, italic: true, color: '#111', align: 'center', width: X(LW), lh: 7 / (12 * 25.4 / 72) });
    let w = LW, h = w * ih / iw;
    if (h > LH - 21) { h = LH - 21; w = h * iw / ih; }
    const x = (LW - w) / 2, y = 8;
    c.drawImage(im, X(x), X(y), X(w), X(h));
    if (capText) textBlock(c, capText, { pxpt, fam, x: X(LW / 2), top: X(y + h + 2), size: 8, italic: true, color: '#111', align: 'center', width: X(LW), lh: 1.3 });
  }
  return cv;
};

BK.halves = async function (a) {
  const im = await BK.loadImg(a.dataURL);
  const w = im.naturalWidth, h = im.naturalHeight, out = [];
  for (const [x0, x1] of [[0, w >> 1], [w >> 1, w]]) {
    const cv = canvasOf(x1 - x0, h);
    cv.getContext('2d').drawImage(im, x0, 0, x1 - x0, h, 0, 0, x1 - x0, h);
    out.push({ dataURL: cv.toDataURL(a.mime === 'image/png' ? 'image/png' : 'image/jpeg', .92), w: x1 - x0, h });
  }
  return out;
};
})(typeof window !== 'undefined' ? window : globalThis);
