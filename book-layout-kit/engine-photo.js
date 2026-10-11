/* Photobook: pictures in a chosen order, one or several per page, drawn page by page, written as a PDF (and a fixed-layout EPUB).
   cfg.doc_type === 'photobook' switches the kit to this; cfg.photobook holds the settings:
   { items: [file names in book order], layout: 'auto' | layout id, pageLayouts: { pageIndex: layout id }, margin, gap, bg, fit: 'fill'|'fit',
     captions, caption_size, numbers, focus: { name: { x, y } } } */
(function (global) {
'use strict';
const BK = global.BK;

// id, label, number of pictures
BK.PB_LAYOUTS = [
  ['auto', 'Automatic (by the shape of the pictures)', 0],
  ['full', '1 picture, edge to edge', 1],
  ['one', '1 picture with a margin', 1],
  ['stack2', '2 pictures, one above the other', 2],
  ['side2', '2 pictures, side by side', 2],
  ['big3', '3 pictures: one large on top, two below', 3],
  ['left3', '3 pictures: one large on the left, two on the right', 3],
  ['strip3', '3 pictures below each other', 3],
  ['grid4', '4 pictures in a grid', 4],
  ['grid6', '6 pictures in a grid (2 × 3)', 6],
  ['grid9', '9 pictures in a grid (3 × 3)', 9]
];
const CAP = Object.fromEntries(BK.PB_LAYOUTS.map(l => [l[0], l[2]]));
BK.PB_NAME = n => String(n).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

BK.pbDefaults = () => ({ items: [], layout: 'auto', pageLayouts: {}, margin: 10, gap: 4, bg: '#ffffff', fit: 'fill', captions: false, caption_size: 8, numbers: false, focus: {}, rot: {} });
BK.pbCfg = cfg => Object.assign(BK.pbDefaults(), cfg.photobook || {});

// natural order of file names: IMG_2 before IMG_10
BK.pbCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

// the boxes (x, y, w, h in mm) a layout puts its pictures in
BK.pbBoxes = function (layout, W, H, margin, gap, capH) {
  if (layout === 'full') return [[0, 0, W, H]];
  const m = Math.max(0, margin), g = Math.max(0, gap), x0 = m, y0 = m, iw = W - 2 * m, ih = H - 2 * m - (capH && layout !== 'full' ? capH : 0);
  const cols = (n, r0, rh) => Array.from({ length: n }, (_, i) => [x0 + i * (iw + g) / n, r0, (iw - g * (n - 1)) / n, rh]);
  const rows = (n, c0, cw, top = y0, total = ih) => Array.from({ length: n }, (_, i) => [c0, top + i * (total + g) / n, cw, (total - g * (n - 1)) / n]);
  const grid = (c, r) => { const w = (iw - g * (c - 1)) / c, h = (ih - g * (r - 1)) / r, out = []; for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) out.push([x0 + i * (w + g), y0 + j * (h + g), w, h]); return out; };
  switch (layout) {
    case 'stack2': return rows(2, x0, iw);
    case 'side2': return cols(2, y0, ih);
    case 'strip3': return rows(3, x0, iw);
    case 'big3': { const th = (ih - g) * .58, bh = ih - g - th; return [[x0, y0, iw, th], ...cols(2, y0 + th + g, bh)]; }
    case 'left3': { const lw = (iw - g) * .58, rw = iw - g - lw; return [[x0, y0, lw, ih], ...rows(2, x0 + lw + g, rw)]; }
    case 'grid4': return grid(2, 2);
    case 'grid6': return grid(2, 3);
    case 'grid9': return grid(3, 3);
    default: return [[x0, y0, iw, ih]];
  }
};

// the pages: photos in order, each page takes as many as its layout holds
BK.pbPages = function (cfg, assets) {
  const pb = BK.pbCfg(cfg), G = BK.geom(cfg), pageAsp = G.W / G.H;
  const items = pb.items.filter(n => BK.findAsset(assets, n));
  const asp = n => { const a = BK.findAsset(assets, n); if (!a) return 1; const q = ((pb.rot || {})[n] || 0) % 180; return q ? a.h / a.w : a.w / a.h; };
  const shape = n => { const r = asp(n); return r >= 1.1 ? 'L' : r <= 1 / 1.1 ? 'P' : 'S'; };
  const pages = []; let i = 0;
  while (i < items.length) {
    const pi = pages.length;
    let layout = pb.pageLayouts && pb.pageLayouts[pi] && CAP[pb.pageLayouts[pi]] != null ? pb.pageLayouts[pi] : pb.layout;
    if (!layout || CAP[layout] == null) layout = 'auto';
    if (layout === 'auto') {
      const a = items[i], b = items[i + 1];
      if (b && shape(a) === 'P' && shape(b) === 'P') layout = 'side2';
      else if (b && shape(a) === 'L' && shape(b) === 'L') layout = 'stack2';
      else layout = Math.abs(asp(a) / pageAsp - 1) < .18 ? 'full' : 'one';
    }
    let n = CAP[layout];
    if (items.length - i < n) {            // fewer pictures left than the layout holds: fall back to one that fits them
      const left = items.length - i;
      layout = left === 1 ? 'one' : left === 2 ? (shape(items[i]) === 'L' && shape(items[i + 1]) === 'L' ? 'stack2' : 'side2') : left === 3 ? 'big3' : left === 4 ? 'grid4' : left <= 6 ? 'grid6' : 'grid9';
      n = Math.min(CAP[layout], left);
    }
    pages.push({ index: pi, layout, photos: items.slice(i, i + n) });
    i += n;
  }
  return pages;
};

// one page as a picture
BK.drawPhotoPage = async function (page, cfg, assets, ppm, opt) {
  opt = opt || {};
  const pb = BK.pbCfg(cfg), G = BK.geom(cfg), W = G.W, H = G.H, X = v => v * ppm;
  const canvas = BK.canvasOf(Math.max(2, Math.round(X(W))), Math.max(2, Math.round(X(H)))), c = canvas.getContext('2d');
  c.fillStyle = pb.bg || '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
  const fam = BK.fam(cfg.font), capPt = Math.max(5, +pb.caption_size || 8), pxpt = 25.4 / 72 * ppm;
  const capH = pb.captions ? capPt * 25.4 / 72 * 1.9 : 0, full = page.layout === 'full';
  const boxes = BK.pbBoxes(page.layout, W, H, +pb.margin, +pb.gap, capH);
  const inkOn = bg => { const r = BK.hexRgb(bg) || [255, 255, 255]; return (r[0] * .299 + r[1] * .587 + r[2] * .114) > 140 ? '#222' : '#eee'; };
  for (let k = 0; k < page.photos.length && k < boxes.length; k++) {
    const name = page.photos[k], a = BK.findAsset(assets, name); if (!a) continue;
    let im = await BK.loadImg(opt.thumb && a.thumb ? a.thumb : a.dataURL);
    const rot = (((pb.rot || {})[name] || 0) % 360 + 360) % 360;
    if (rot) {
      const w0 = im.naturalWidth, h0 = im.naturalHeight, odd = rot % 180, rc = BK.canvasOf(odd ? h0 : w0, odd ? w0 : h0), rx = rc.getContext('2d');
      rx.translate(rc.width / 2, rc.height / 2); rx.rotate(rot * Math.PI / 180); rx.drawImage(im, -w0 / 2, -h0 / 2); im = rc;
    }
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, [bx, by, bw, bh] = boxes[k], f = (pb.focus || {})[name] || {};
    const fx = f.x ?? 50, fy = f.y ?? 50;
    if (pb.fit === 'fit' && !full) {
      const s = Math.min(X(bw) / iw, X(bh) / ih), dw = iw * s, dh = ih * s;
      c.imageSmoothingQuality = 'high'; c.drawImage(im, X(bx) + (X(bw) - dw) / 2, X(by) + (X(bh) - dh) / 2, dw, dh);
    } else { c.imageSmoothingQuality = 'high'; BK.drawCoverFit(c, im, X(bx), X(by), X(bw), X(bh), fx, fy, 100); }
    if (pb.captions) {
      const txt = BK.PB_NAME(name);
      c.save();
      if (full) {
        const h = X(capH + 3); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, canvas.height - h, canvas.width, h);
        c.fillStyle = '#fff';
      } else c.fillStyle = inkOn(pb.bg);
      c.font = `${capPt * pxpt}px ${fam}, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      let t = txt; while (t.length > 3 && c.measureText(t).width > X(bw)) t = t.slice(0, -2);
      if (t !== txt) t += '…';
      c.fillText(t, X(bx + bw / 2), full ? canvas.height - X((capH + 3) / 2) : X(by + bh + capH / 2));
      c.restore();
    }
  }
  if (pb.numbers && !full) {
    c.fillStyle = inkOn(pb.bg); c.globalAlpha = .7; c.font = `${7.5 * pxpt}px ${fam}, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(page.index + 1), X(W / 2), X(H - Math.max(3, +pb.margin / 2)));
  }
  return canvas;
};

const b64bytes = url => { const s = atob(url.split(',')[1]), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const ascii = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
const hex16 = s => 'FEFF' + [...String(s)].map(ch => ch.codePointAt(0).toString(16).padStart(4, '0').slice(-4).toUpperCase()).join('');
const tick = () => new Promise(r => setTimeout(r, 0));

// every page is one full-page JPEG; a small PDF writer puts them in a file
function writePdf(jpegs, W, H, meta) {
  const parts = [], offs = []; let pos = 0;
  const push = u => { parts.push(u); pos += u.length; };
  const obj = (n, body) => { offs[n] = pos; push(ascii(`${n} 0 obj\n`)); body.forEach(b => push(typeof b === 'string' ? ascii(b) : b)); push(ascii('\nendobj\n')); };
  const wpt = (W * 72 / 25.4).toFixed(2), hpt = (H * 72 / 25.4).toFixed(2), N = jpegs.length;
  push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${N} /Kids [${jpegs.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`]);
  jpegs.forEach((j, i) => {
    const p = 3 + 3 * i, content = `q ${wpt} 0 0 ${hpt} 0 0 cm /Im0 Do Q`;
    obj(p, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wpt} ${hpt}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`]);
    obj(p + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(p + 2, [`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`, j.bytes, '\nendstream']);
  });
  const info = 3 + 3 * N;
  obj(info, [`<< /Title <${hex16(meta.title || 'Photobook')}> /Author <${hex16(meta.author || '')}> /Producer (Book Layout Kit) >>`]);
  const xref = pos;
  push(ascii(`xref\n0 ${info + 1}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')));
  push(ascii(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(parts, { type: 'application/pdf' });
}

BK.buildPhotoPdf = async function (cfg, assets, progress) {
  progress = progress || (() => {});
  const G = BK.geom(cfg), pages = BK.pbPages(cfg, assets);
  if (!pages.length) throw new Error('There are no pictures in the photobook yet.');
  const ppm = Math.min(300 / 25.4, 3600 / Math.max(G.W, G.H)), jpegs = [], covers = cfg.include_covers !== false;
  const toJpeg = (cv, q) => ({ bytes: b64bytes(cv.toDataURL('image/jpeg', q)), w: cv.width, h: cv.height });
  if (covers) { progress('Drawing the cover…'); await tick(); jpegs.push(toJpeg(await BK.drawCover('front', cfg, assets, ppm), .92)); }
  for (const p of pages) {
    progress(`Page ${p.index + 1} of ${pages.length}…`); await tick();
    jpegs.push(toJpeg(await BK.drawPhotoPage(p, cfg, assets, ppm), .9));
  }
  if (covers) { progress('Drawing the back cover…'); await tick(); jpegs.push(toJpeg(await BK.drawCover('back', cfg, assets, ppm), .92)); }
  progress('Writing the PDF…'); await tick();
  const blob = writePdf(jpegs, G.W, G.H, { title: cfg.title, author: cfg.author });
  return { blob, stable: true, missing: [], indexTerms: 0, chapters: 0, pageCountHint: pages.length, ids: {}, coverOff: covers ? 1 : 0, photobook: true, photoPages: pages.length, photos: pages.reduce((n, p) => n + p.photos.length, 0) };
};

// fixed-layout EPUB: one picture of each page
BK.buildPhotoEpub = async function (cfg, assets, progress) {
  progress = progress || (() => {});
  const G = BK.geom(cfg), pages = BK.pbPages(cfg, assets);
  if (!pages.length) throw new Error('There are no pictures in the photobook yet.');
  const ppm = Math.min(170 / 25.4, 2000 / Math.max(G.W, G.H)), z = new JSZip(), covers = cfg.include_covers !== false;
  const items = [];
  const add = async (cv, name) => { z.file('OEBPS/images/' + name + '.jpg', b64bytes(cv.toDataURL('image/jpeg', .85))); items.push({ id: name, w: cv.width, h: cv.height }); };
  if (covers) await add(await BK.drawCover('front', cfg, assets, ppm), 'p000');
  for (const p of pages) { progress(`Page ${p.index + 1} of ${pages.length}…`); await tick(); await add(await BK.drawPhotoPage(p, cfg, assets, ppm), 'p' + String(p.index + 1).padStart(3, '0')); }
  if (covers) await add(await BK.drawCover('back', cfg, assets, ppm), 'p999');
  const esc = BK.esc, title = cfg.title || 'Photobook', lang = cfg.lang || 'en';
  z.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  z.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  items.forEach(it => z.file(`OEBPS/${it.id}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(title)}</title><meta name="viewport" content="width=${it.w},height=${it.h}"/><style>html,body{margin:0;padding:0}img{display:block;width:${it.w}px;height:${it.h}px}</style></head><body><img src="images/${it.id}.jpg" alt=""/></body></html>`));
  z.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="${items[0].id}.xhtml">${esc(title)}</a></li></ol></nav></body></html>`);
  const manifest = items.map(it => `<item id="${it.id}" href="${it.id}.xhtml" media-type="application/xhtml+xml" properties="svg"/><item id="img-${it.id}" href="images/${it.id}.jpg" media-type="image/jpeg"${it.id === items[0].id ? ' properties="cover-image"' : ''}/>`).join('').replace(/ properties="svg"/g, '');
  z.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${(crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:creator>${esc(cfg.author || '')}</dc:creator><dc:language>${esc(lang)}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta><meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">none</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest><spine>${items.map(it => `<itemref idref="${it.id}"/>`).join('')}</spine></package>`);
  progress('Packing the EPUB…'); await tick();
  const blob = await z.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
  return { blob, pages: items.length, images: items.length };
};
})(typeof window !== 'undefined' ? window : globalThis);
