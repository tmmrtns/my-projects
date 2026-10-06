/* Book Layout Kit – browser engine, part 4: EPUB 3 (one file per chapter, embedded fonts, chapter-linked index). */
(function (global) {
'use strict';
const BK = global.BK, esc = BK.esc;

function runsHtml(runs, ctx) {
  let h = '';
  for (const r of runs || []) {
    if (r.br) { h += '<br/>'; continue; }
    if (!r.t) continue;
    let s = esc(r.t);
    if (r.code) s = `<code>${s}</code>`;
    if (r.i) s = `<em>${s}</em>`;
    if (r.b) s = `<strong>${s}</strong>`;
    if (r.fn) s = `<a class="fnref" id="fnref-${ctx.sid}-${r.t}" href="#fn-${ctx.sid}-${r.t}">${s}</a>`;
    if (r.sup) s = `<sup>${s}</sup>`;
    if (r.link && /^(https?:|mailto:)/i.test(r.link)) s = `<a class="lnk" href="${esc(r.link)}">${s}</a>`;
    if (r.ixo) s = `<span id="${r.ixo}"></span>${s}`;
    h += s;
  }
  return h;
}

function leadSplit(runs) {
  if (!runs.length) return [[], runs];
  if (runs[0].b && !runs[0].sup) { let k = 0; while (k < runs.length && runs[k].b && !runs[k].sup) k++; return [runs.slice(0, k), runs.slice(k)]; }
  const r0 = runs[0], m = /^\s*\S+(?:\s+\S+){0,2}/.exec(r0.t || '');
  if (!m) return [[], runs];
  return [[Object.assign({}, r0, { t: m[0] })], [Object.assign({}, r0, { t: r0.t.slice(m[0].length) })].concat(runs.slice(1))];
}

function figHtml(f, E) {
  const a = BK.findAsset(E.assets, f.src);
  if (f.kind === 'qr') {
    const src = E.addQr(f.src);
    return src ? `<figure class="qr"><img src="${src}" alt="QR"/><figcaption>${esc(f.alt)}</figcaption></figure>` : '';
  }
  if (!a) return `<p class="missing">[missing image: ${esc(f.src)}]</p>`;
  const src = E.addImg(a, f.kind === 'map' && E.cfg.bw_maps);
  const cap = f.cap ? `<figcaption>${runsHtml(f.cap, E.ctx)}</figcaption>` : '';
  if (f.kind === 'map' || f.kind === 'art' || f.kind === 'spread') return `<h3>${esc(f.alt)}</h3><figure class="wide"><img src="${src}" alt="${esc(f.alt)}"/>${cap}</figure>`;
  const cls = f.kind === 'photo' ? (a.h > a.w ? 'port' : 'land') : f.kind;
  return `<figure class="${cls}"><img src="${src}" alt="${esc(f.alt)}"/>${cap}</figure>`;
}

function blocksHtml(blocks, E, opener) {
  let h = '', after = opener || null, prevHr = false;
  blocks.forEach((b, i) => {
    if (after === 'h2' && i === 0 && b.type === 'quote') {
      h += `<blockquote class="epigraph">${blocksHtml(b.blocks, E)}</blockquote>`;
      return;
    }
    const wasHr = prevHr; prevHr = false;
    switch (b.type) {
      case 'p': {
        const op = after; after = null;
        if (op === 'h2' && E.cfg.opener === 'dropcap') {
          const idx = b.runs.findIndex(r => r.t && !r.sup && !r.br);
          const m = idx >= 0 && /^(["“‘'(«„]?[\p{L}\p{N}])/u.exec(b.runs[idx].t);
          if (m) {
            const rest = b.runs.slice(0, idx).concat([Object.assign({}, b.runs[idx], { t: b.runs[idx].t.slice(m[1].length) })], b.runs.slice(idx + 1));
            h += `<p class="first drop"><span class="dropcap">${esc(m[1])}</span>${runsHtml(rest, E.ctx)}</p>`;
            break;
          }
        }
        if (op && E.cfg.opener === 'smallcaps' && !b.allItalic) {
          const [a, r] = leadSplit(b.runs);
          h += `<p class="first"><span class="lead">${runsHtml(a, E.ctx)}</span>${runsHtml(r, E.ctx)}</p>`;
        } else h += `<p${wasHr || op ? ' class="first"' : ''}>${runsHtml(b.runs, E.ctx)}</p>`;
        break;
      }
      case 'h3': h += b.divider ? `<h3 class="divider">${runsHtml(b.runs, E.ctx)}</h3>` : `<h3>${runsHtml(b.runs, E.ctx)}</h3>`; after = 'h3'; break;
      case 'h4': h += `<h4>${runsHtml(b.runs, E.ctx)}</h4>`; after = 'h3'; break;
      case 'quote': h += `<blockquote>${blocksHtml(b.blocks, E)}</blockquote>`; after = null; break;
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        h += `<${tag}${b.ordered && b.start !== 1 ? ` start="${b.start}"` : ''}>` + b.items.map(it => {
          const inner = it.length === 1 && it[0].type === 'p' ? runsHtml(it[0].runs, E.ctx) : blocksHtml(it, E);
          return `<li>${inner}</li>`;
        }).join('') + `</${tag}>`;
        after = null; break;
      }
      case 'table':
        h += '<table class="tbl"><thead><tr>' + b.header.map((c, j) => `<th${b.align[j] ? ` style="text-align:${b.align[j]}"` : ''}>${runsHtml(c, E.ctx)}</th>`).join('') + '</tr></thead><tbody>' +
          b.rows.map(r => '<tr>' + b.header.map((_, j) => `<td${b.align[j] ? ` style="text-align:${b.align[j]}"` : ''}>${runsHtml(r[j] || [], E.ctx)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
        after = null; break;
      case 'hr': h += '<hr class="scene"/>'; prevHr = true; after = null; break;
      case 'pre': h += `<pre>${esc(b.text)}</pre>`; after = null; break;
      case 'fig': h += figHtml(b, E); break;
      case 'poem': h += '<div class="poem">' + b.stanzas.map(st => '<p>' + st.map(l => runsHtml(l, E.ctx)).join('<br/>') + '</p>').join('') + '</div>'; after = null; break;
      case 'div': h += `<div class="${esc(b.kind)}">${blocksHtml(b.blocks, E)}</div>`; after = null; break;
    }
  });
  return h;
}

function notesHtml(notes, E) {
  if (!notes || !notes.length) return '';
  return '<div class="footnote"><ol>' + notes.map(n => `<li id="fn-${E.ctx.sid}-${n.n}">${runsHtml(n.runs, E.ctx)} <a class="back" href="#fnref-${E.ctx.sid}-${n.n}">↩</a></li>`).join('') + '</ol></div>';
}

const CSS = `
body { font-family: BookSerif, Georgia, serif; line-height: 1.45; margin: 0 4%; }
p { margin: 0; text-align: justify; hyphens: auto; -epub-hyphens: auto; -webkit-hyphens: auto; }
p + p { text-indent: 1.2em; } p.first { text-indent: 0; }
sup { font-size: .65em; line-height: 0; } a { color: inherit; text-decoration: none; } a.lnk { color: #b5561b; }
a.fnref { color: #b5561b; } a.back { color: #b5561b; }
h1, h2, h3 { font-weight: normal; page-break-after: avoid; } h3 { font-style: italic; font-size: 1.15em; margin: 1.5em 0 .5em; }
h4 { font-weight: 600; font-size: 1em; margin: 1.2em 0 .3em; }
.lead { text-transform: uppercase; letter-spacing: .06em; font-size: .85em; }
.chnum { margin-top: 3em; text-align: center; font-size: .8em; letter-spacing: .3em; text-transform: uppercase; }
h2.chtitle, h2.stitle { font-style: italic; text-align: center; font-size: 1.6em; margin: .4em 0 .3em; } h2.stitle { margin: 2em 0 1em; }
.chsub { text-align: center; font-size: .8em; letter-spacing: .2em; text-transform: uppercase; color: #666; margin-bottom: 2em; }
.chrule { width: 3em; margin: 0 auto 2em; border: 0; border-top: 1px solid #888; }
.partpage { text-align: center; padding-top: 30%; } .partlabel { letter-spacing: .35em; text-transform: uppercase; }
h1.parttitle { font-size: 2em; margin: .5em 0; } .partsub { font-style: italic; }
.tp { text-align: center; padding-top: 20%; } .tp1 { font-size: 2em; letter-spacing: .06em; text-transform: uppercase; line-height: 1.2; }
.tp2 { font-style: italic; margin-top: 1.5em; font-size: 1.2em; } .tp3 { margin-top: .5em; } .tp4 { margin-top: 3em; letter-spacing: .25em; text-transform: uppercase; }
.colophon { margin-top: 4em; font-size: .85em; } .colophon p, .dedication p { text-indent: 0; margin-bottom: .6em; text-align: left; }
.dedication p { text-align: center; font-style: italic; }
.cover { text-align: center; margin: 0; padding: 0; } .cover img { max-width: 100%; max-height: 100%; }
figure { text-align: center; margin: 1em 0 1.5em; } figure img { width: 55%; } figure.land img, figure.wide img, figure.diagram img { width: 100%; }
figure.small img { width: 50%; } figure.qr img { width: 40%; max-width: 12em; } figure.diagram figcaption { text-align: left; }
h3.divider { font-style: normal; text-align: center; font-size: .95em; letter-spacing: .18em; text-transform: uppercase; margin: 2.5em 0 1.2em; }
.mtlab { margin: 2em 0 .8em; text-align: center; font-size: .8em; letter-spacing: .25em; text-transform: uppercase; }
ul.minitoc { padding: 0; } ul.minitoc li { list-style: none; margin: 0 0 1em; } ul.minitoc a { color: #b5561b; }
ul.minitoc .mtn { font-weight: 600; } ul.minitoc .mtd { font-size: .88em; font-style: italic; padding-left: 1.2em; }
hr.scene { border: 0; text-align: center; margin: 1.2em 0; } hr.scene:after { content: "SCENE"; letter-spacing: .2em; }
hr.scene + p { text-indent: 0; }
blockquote.epigraph { margin: 0 0 2em 30%; font-style: italic; font-size: .9em; } blockquote.epigraph p + p { text-align: right; font-style: normal; text-indent: 0; }
span.dropcap { float: left; font-size: 3em; line-height: .85; margin: .05em .08em 0 0; }
.footnote { font-size: .8em; margin-top: 2em; border-top: 1px solid #999; } .footnote p { text-indent: 0; }
.poem { margin: 1em 0 1em 2em; } .poem p { text-align: left; text-indent: 0; margin-bottom: .8em; }
.center p { text-align: center; text-indent: 0; } .right p { text-align: right; text-indent: 0; }
.letter { margin: 1em 1.5em; font-style: italic; } .letter p { text-indent: 0; margin-bottom: .4em; }
.box { border: 1px solid #999; padding: .6em .9em; margin: 1em 0; } .box p { text-indent: 0; margin-bottom: .3em; }
figcaption { font-size: .85em; font-style: italic; } figcaption em { font-style: normal; }
blockquote { margin: 1em 1.5em; font-size: .9em; color: #333; } blockquote p { text-indent: 0; }
table.tbl { width: 100%; border-collapse: collapse; font-size: .72em; line-height: 1.25; margin-bottom: 1em; }
table.tbl th { text-align: left; border-bottom: 1px solid #000; padding: 2px; } table.tbl td { border-bottom: 1px solid #ccc; padding: 2px; vertical-align: top; }
.backsec li { margin-bottom: .35em; text-align: left; font-size: .9em; }
.ixintro { font-size: .85em; font-style: italic; margin-bottom: 1.5em; text-indent: 0; } .ixl { font-weight: 600; font-size: 1.2em; margin: 1.2em 0 .3em; }
.ix { font-size: .85em; padding-left: 1.2em; text-indent: -1.2em; text-align: left; } .ixp { font-weight: 600; }
nav ol { list-style: none; padding-left: 0; } nav ol ol { padding-left: 1.2em; } nav li { margin: .3em 0; }
p.missing { color: #a33; font-style: italic; text-indent: 0; }
`;

function uuidFrom(s) {
  let h1 = 0x811c9dc5, h2 = 0x12345678;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822507); }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  const x = hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(Math.imul(h2, 31) ^ h1);
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-5${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}

BK.buildEpub = async function (model, cfg, assets, progress) {
  progress = progress || (() => {});
  const L = BK.labels(cfg), lang = cfg.lang || 'en';
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const manifest = [], spine = [], files = {};
  const add = (path, data, mt, id, props) => { zip.file('OEBPS/' + path, data); manifest.push({ id, path, mt, props }); };
  progress('Embedding fonts…');
  const fonts = await BK.loadFont(cfg.font);
  let faces = '';
  for (const [slot, f] of Object.entries(fonts)) {
    add('fonts/' + f.file, f.buf, 'font/ttf', 'font-' + slot);
    faces += `@font-face { font-family: BookSerif; src: url(../fonts/${f.file}); font-weight: ${/bold/.test(slot) ? 600 : 400}; font-style: ${/italics/.test(slot) ? 'italic' : 'normal'}; }\n`;
  }
  const scene = String(cfg.scene_break || '*   *   *').replace(/["\\]/g, '');
  add('style/book.css', faces + CSS.replace('SCENE', scene) + (cfg.extra_epub_css || ''), 'text/css', 'css');
  // images
  const imgNames = new Map();
  let imgN = 0;
  const E = {
    cfg, assets, ctx: { sid: '' },
    addImg(a, bw) {
      const k = a.dataURL + (bw ? '#bw' : '');
      if (!imgNames.has(k)) {
        const png = a.mime === 'image/png' && !bw;
        const name = `images/img${++imgN}.${png ? 'png' : 'jpg'}`;
        imgNames.set(k, name);
        files[name] = { a, bw, png };
      }
      return imgNames.get(k);
    },
    addQr(src) {
      const k = 'qr:' + src;
      if (!imgNames.has(k)) {
        const data = /^https?:\/\//i.test(src) ? BK.qrDataURL(src) : (BK.findAsset(assets, src) || {}).dataURL;
        if (!data) return null;
        const name = `images/qr${++imgN}.png`;
        imgNames.set(k, name);
        files[name] = { dataURL: data, png: true };
      }
      return imgNames.get(k);
    }
  };
  const page = (fname, title, body, id, props) => {
    const html = `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style/book.css"/></head><body>${body}</body></html>`;
    add(fname, html, 'application/xhtml+xml', id, props);
    spine.push(id);
  };
  const nav = [];   // {title, href, children}
  progress('Writing chapters…');
  // cover image
  const G = BK.geom(cfg);
  const cv = BK.kdpCfg(cfg).on ? await BK.drawEbookCover(cfg, assets) : await BK.drawCover('front', cfg, assets, 1600 / G.W);
  const coverBlob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .9));
  add('images/cover.jpg', coverBlob, 'image/jpeg', 'cover-image', 'cover-image');
  page('cover.xhtml', L.cover, `<div class="cover"><img src="images/cover.jpg" alt="${esc(cfg.title || L.cover)}"/></div>`, 'cover');
  const sub = cfg.subtitle ? `<div class="tp2">${esc(cfg.subtitle)}</div>` : '';
  const sub2 = cfg.subtitle2 ? `<div class="tp3">${esc(cfg.subtitle2)}</div>` : '';
  page('title.xhtml', L.title_page, `<div class="tp"><div class="tp1">${esc(cfg.title || 'Untitled')}</div>${sub}${sub2}<div class="tp4">${esc(cfg.author || '')}</div></div>`, 'titlepage');
  const md = s => runsHtml(BK.inlineMd(s), E.ctx);
  const colo = (cfg.colophon || []).filter(Boolean);
  const ded = (cfg.dedication || []).filter(Boolean).map(x => `<p>${md(x)}</p>`).join('') + (cfg.epigraph ? `<p>${md(cfg.epigraph)}</p>` : '');
  page('colophon.xhtml', L.colophon, `<div class="colophon">${(colo.length ? colo : ['© ' + (cfg.author || '')]).map(x => `<p>${md(x)}</p>`).join('')}</div>${ded ? `<div class="dedication" style="margin-top:4em">${ded}</div>` : ''}`, 'colophon');
  spine.push('nav');
  nav.push({ title: L.cover, href: 'cover.xhtml' }, { title: L.title_page, href: 'title.xhtml' });
  const secPage = (sec, kind, extraHtml) => {
    E.ctx = { sid: sec.id };
    let head;
    if (kind === 'chapter') {
      const no = sec.num == null ? null : BK.chapNo(sec.num, cfg);
      const lab = sec.num == null ? (sec.plain ? '' : L.interlude) : (no ? (cfg.chapter_word === 'hide' ? no : `${L.chapter} ${no}`) : '');
      head = (lab ? `<div class="chnum">${esc(lab)}</div>` : '') + `<h2 class="chtitle">${esc(sec.title)}</h2>` + (sec.sub ? `<div class="chsub">${esc(sec.sub)}</div>` : '<hr class="chrule"/>');
    } else head = `<h2 class="stitle">${esc(sec.title)}</h2>`;
    const cls = sec.role === 'back' ? ' class="backsec"' : '';
    const etype = kind === 'chapter' ? 'chapter' : (sec.role === 'back' ? 'backmatter' : 'frontmatter');
    const body = `<section epub:type="${etype}" id="${sec.id}"${cls}>${head}${blocksHtml(sec.blocks, E, 'h2')}${notesHtml(sec.notes, E)}${extraHtml || ''}</section>`;
    const title = kind === 'chapter' && sec.num != null ? `${sec.num}. ${sec.title}` : (sec.num == null && kind === 'chapter' ? (sec.plain ? sec.title : `${L.interlude}: ${sec.title}`) : sec.title);
    page(sec.id + '.xhtml', title, body, sec.id);
    return { title, href: sec.id + '.xhtml' };
  };
  model.front.forEach(s => nav.push(secPage(s, 'stitle')));
  for (const p of model.parts) {
    let holder = nav;
    if (p.pid) {
      const t = (p.label ? p.label + ' – ' : '') + p.title;
      E.ctx = { sid: p.pid };
      page(p.pid + '.xhtml', t, `<section class="partpage" id="${p.pid}">${p.label ? `<div class="partlabel">${esc(p.label)}</div>` : ''}<h1 class="parttitle">${esc(p.title)}</h1><div class="partsub">${runsHtml(p.subRuns, E.ctx)}</div></section>`, p.pid);
      const entry = { title: t, href: p.pid + '.xhtml', children: [] };
      nav.push(entry); holder = entry.children;
      if (p.introParsed) {
        let mini = '';
        if (cfg.part_minitoc !== false) {
          mini = `<div class="mtlab">${esc(L.in_this_part)}</div><ul class="minitoc">` + p.chapters.map(c => {
            const no = c.num != null ? BK.chapNo(c.num, cfg) : '';
            const lab = c.num == null ? (c.plain ? '' : L.interlude + ':') : (no ? no + '.' : '');
            return `<li><a href="${c.id}.xhtml"><span class="mtn">${esc(lab)}</span> ${esc(c.title)}</a>${c.sub ? `<div class="mtd">${esc(c.sub)}</div>` : ''}</li>`;
          }).join('') + '</ul>';
        }
        holder.push(secPage({ id: p.pid + '-intro', title: L.part_intro, role: 'front', blocks: p.introParsed.blocks, notes: p.introParsed.notes }, 'stitle', mini));
      }
    }
    p.chapters.forEach(c => holder.push(secPage(c, 'chapter')));
  }
  model.back.forEach(s => nav.push(secPage(s, 'stitle')));
  // index: chapter links
  if (model.terms.length) {
    const ents = model.terms.map((t, i) => model.occ[i] ? Object.assign(BK.indexKey(t, cfg), { i }) : null).filter(Boolean)
      .sort((a, b) => a.k.localeCompare(b.k, lang));
    let cur = null, items = '';
    for (const e of ents) {
      const letter = /\p{L}/u.test(e.k[0]) ? e.k[0].toUpperCase() : '#';
      if (letter !== cur) { cur = letter; items += `<div class="ixl">${esc(letter)}</div>`; }
      const seen = new Map();
      for (const o of model.occ[e.i]) if (!seen.has(o.sec)) seen.set(o.sec, o.oid);
      const refs = [...seen].map(([sec, oid]) => `<a class="lnk" href="${sec.id}.xhtml#${oid}">${sec.num != null ? sec.num : esc(sec.plain ? sec.title.slice(0, 14) : L.interlude[0])}</a>`).join(', ');
      items += `<div class="ix"><span class="ixn">${esc(e.disp)}</span> <span class="ixp">${esc(L.chapter_abbr)} ${refs}</span></div>`;
    }
    E.ctx = { sid: 'register' };
    page('register.xhtml', L.index, `<section epub:type="index" id="register" class="backsec"><h2 class="stitle">${esc(L.index)}</h2><p class="ixintro">${esc(L.index_intro_epub)}</p>${items}</section>`, 'register');
    nav.push({ title: L.index, href: 'register.xhtml' });
  }
  progress('Adding images…');
  for (const [name, f] of Object.entries(files)) {
    let data;
    if (f.dataURL) data = f.dataURL.split(',')[1];
    else if (f.bw) { const im = await BK.loadImg(f.a.dataURL); data = BK.bwMap(im).toDataURL('image/jpeg', .9).split(',')[1]; }
    else data = f.a.dataURL.split(',')[1];
    zip.file('OEBPS/' + name, data, { base64: true });
    manifest.push({ id: 'img-' + BK.slug(name), path: name, mt: f.png ? 'image/png' : 'image/jpeg' });
  }
  // navigation
  const navOl = list => '<ol>' + list.map(n => `<li><a href="${n.href}">${esc(n.title)}</a>${n.children && n.children.length ? navOl(n.children) : ''}</li>`).join('') + '</ol>';
  const navBody = `<nav epub:type="toc" id="toc"><h2 class="stitle">${esc(L.contents)}</h2>${navOl(nav)}</nav><nav epub:type="landmarks" hidden="hidden"><ol><li><a epub:type="cover" href="cover.xhtml">${esc(L.cover)}</a></li><li><a epub:type="toc" href="nav.xhtml">${esc(L.contents)}</a></li><li><a epub:type="bodymatter" href="${(BK.chaptersOf(model)[0] || {}).id ? BK.chaptersOf(model)[0].id + '.xhtml' : 'title.xhtml'}">${esc(L.chapter)}</a></li></ol></nav>`;
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>${esc(L.contents)}</title><link rel="stylesheet" type="text/css" href="style/book.css"/></head><body>${navBody}</body></html>`);
  manifest.push({ id: 'nav', path: 'nav.xhtml', mt: 'application/xhtml+xml', props: 'nav' });
  let po = 0;
  const ncxPoints = list => list.map(n => `<navPoint id="np${++po}" playOrder="${po}"><navLabel><text>${esc(n.title)}</text></navLabel><content src="${n.href}"/>${n.children && n.children.length ? ncxPoints(n.children) : ''}</navPoint>`).join('');
  const uid = 'urn:uuid:' + uuidFrom((cfg.title || '') + '|' + (cfg.author || ''));
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/><meta name="dtb:depth" content="2"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>${esc(cfg.title || 'Untitled')}</text></docTitle><navMap>${ncxPoints(nav)}</navMap></ncx>`);
  manifest.push({ id: 'ncx', path: 'toc.ncx', mt: 'application/x-dtbncx+xml' });
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${uid}</dc:identifier>
<dc:title>${esc(cfg.title || 'Untitled')}</dc:title>
<dc:language>${esc(lang)}</dc:language>
${cfg.author ? `<dc:creator id="creator">${esc(cfg.author)}</dc:creator>` : ''}
${cfg.description ? `<dc:description>${esc(cfg.description)}</dc:description>` : ''}
<meta property="dcterms:modified">${modified}</meta>
<meta name="cover" content="cover-image"/>
</metadata>
<manifest>
${manifest.map(m => `<item id="${m.id}" href="${m.path}" media-type="${m.mt}"${m.props ? ` properties="${m.props}"` : ''}/>`).join('\n')}
</manifest>
<spine toc="ncx">
${spine.map(id => `<itemref idref="${id}"${id === 'cover' ? ' linear="yes"' : ''}/>`).join('\n')}
</spine>
</package>`;
  zip.file('OEBPS/content.opf', opf);
  progress('Packing the EPUB…');
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, pages: spine.length, images: Object.keys(files).length };
};
})(typeof window !== 'undefined' ? window : globalThis);
