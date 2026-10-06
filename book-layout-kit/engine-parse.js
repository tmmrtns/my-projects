/* Book Layout Kit – browser engine, part 1: settings, labels, manuscript parsing.
   Mirrors bookmaker.py (v3): same markdown conventions, same book.json keys. */
(function (global) {
'use strict';
const BK = global.BK = global.BK || {};
const ZW = '​';
BK.ZW = ZW;
BK.MM = 72 / 25.4;

BK.PAGE_SIZES = {
  A5: [148, 210], B5: [176, 250], A4: [210, 297], royal: [156, 234], demy: [138, 216],
  pocket: [110, 178], '5x8': [127, 203.2], '5.5x8.5': [139.7, 215.9], '6x9': [152.4, 228.6], '7x10': [177.8, 254],
  // the other trim sizes Amazon KDP prints (inches converted to mm)
  '5.06x7.81': [128.5, 198.4], '5.25x8': [133.4, 203.2], '6.14x9.21': [156, 233.9], '6.69x9.61': [169.9, 244.1],
  '7.44x9.69': [189, 246.1], '7.5x9.25': [190.5, 234.9], '8x10': [203.2, 254], '8.25x6': [209.6, 152.4],
  '8.25x8.25': [209.6, 209.6], '8.5x8.5': [215.9, 215.9], '8.5x11': [215.9, 279.4], '8.25x11': [209.6, 279.4]
};

// ---------------------------------------------------------------- Amazon KDP (paperback)
BK.KDP = {
  bleed: 3.175,                 // 0.125 in on the outer edges of the cover
  safe: 3.175,                  // keep text 0.125 in inside the trim edge
  spineMargin: 1.5875,          // 0.0625 in either side of the spine text
  spineTextMinPages: 79,
  barcode: [50.8, 30.48],       // 2 x 1.2 in, lower right of the back cover
  barcodeMargin: 6.35,
  ebook: { w: 1600, h: 2560 },  // ideal Kindle cover, 1.6 : 1
  paper: {
    white:   { name: 'Black ink, white paper', t: .002252, min: 24 },
    cream:   { name: 'Black ink, cream paper', t: .0025, min: 24 },
    std:     { name: 'Standard colour, white paper', t: .002252, min: 72 },
    premium: { name: 'Premium colour, white paper', t: .002347, min: 24 }
  },
  // trim size -> most pages for white / cream / premium colour paper
  trims: {
    '5x8': [828, 776, 828], '5.06x7.81': [828, 776, 828], '5.25x8': [828, 776, 828], '5.5x8.5': [828, 776, 828], '6x9': [828, 776, 828],
    '6.14x9.21': [828, 776, 828], '6.69x9.61': [828, 776, 828], '7x10': [828, 776, 828], '7.44x9.69': [828, 776, 828], '7.5x9.25': [828, 776, 828],
    '8x10': [828, 776, 828], '8.25x6': [800, 750, 800], '8.25x8.25': [800, 750, 800], 'A4': [780, 730, 590], '8.5x8.5': [590, 550, 590], '8.5x11': [590, 550, 590]
  },
  // inside (gutter) margin the printer needs, by page count: [up to pages, mm]
  // hardcover (case laminate): 75 to 550 pages, five trim sizes, no standard colour
  hard: {
    wrap: 15, overage: 3, hinge: 10, spineExtra: 4.8, safe: 16, barcodeBottom: 19, barcodeSide: 6, min: 75, max: 550,
    paper: ['white', 'cream', 'premium'], trims: ['5.5x8.5', '6x9', '6.14x9.21', '7x10', '8.25x11']
  },
  // printing cost, EUR, Amazon.de / es / fr / it / nl / ie / com.be (KDP help pages, October 2026)
  cost: {
    market: 'Amazon.com.be', cur: '€', vat: .06, largeW: 155.5, largeH: 228.6,
    paperback: {
      white:   { from: 24, to: 828, flat: [[110, 2.05, 2.48]], fix: .75, per: [.012, .016] },
      cream:   { from: 24, to: 828, flat: [[110, 2.05, 2.48]], fix: .75, per: [.012, .016] },
      std:     { from: 72, to: 600, flat: [], fix: .75, per: [.024, .035] },
      premium: { from: 24, to: 828, flat: [[40, 2.85, 3.61]], fix: .75, per: [.0525, .0715] }
    },
    hardcover: {
      white:   { from: 75, to: 550, flat: [[108, 5.95, 6.35]], fix: 4.65, per: [.012, .016] },
      cream:   { from: 75, to: 550, flat: [[108, 5.95, 6.35]], fix: 4.65, per: [.012, .016] },
      premium: { from: 75, to: 550, flat: [], fix: 4.65, per: [.057, .072] }
    }
  },
  gutter: [[150, 9.5], [300, 12.7], [500, 15.9], [700, 19.1], [828, 22.2]]
};
BK.kdpCfg = cfg => Object.assign({ on: false, format: 'paperback', copies: 1, price: 0, paper: 'white', pages: 0, spine_text: true, barcode: true, barcode_image: '' }, cfg.kdp || {});
// the KDP trim size a page size matches, or null
BK.kdpTrimKeys = fmt => fmt === 'hardcover' ? BK.KDP.hard.trims : Object.keys(BK.KDP.trims);
BK.kdpTrim = (G, fmt) => {
  for (const k of BK.kdpTrimKeys(fmt)) { const [w, h] = BK.PAGE_SIZES[k] || []; if (w && Math.abs(w - G.W) < .6 && Math.abs(h - G.H) < .6) return k; }
  return null;
};
BK.kdpGutter = pages => { for (const [n, mm] of BK.KDP.gutter) if (pages <= n) return mm; return BK.KDP.gutter[BK.KDP.gutter.length - 1][1]; };
// cover geometry in mm for a page count and paper
BK.kdpGeom = (cfg, pages) => {
  const K = BK.KDP, k = BK.kdpCfg(cfg), G = BK.geom(cfg), hard = k.format === 'hardcover';
  let pk = k.paper; if (hard && pk === 'std') pk = 'white';
  const paper = K.paper[pk] || K.paper.white;
  const known = Math.round(+pages || +k.pages || 0);
  pages = Math.max(hard ? K.hard.min : paper.min, known || 200);          // 200 pages until the book is built
  const spine = Math.round(pages * paper.t * 25.4 * 100) / 100;
  const fit = 5.5;                                   // smallest spine type, pt
  const sizePt = Math.min(20, (spine - 2 * K.spineMargin) / (25.4 / 72) / 1.25);
  const spineText = k.spine_text !== false && pages >= K.spineTextMinPages && sizePt >= fit;
  // m = margin round the trimmed page (bleed, or wrap + board overage); sz = width of the spine panel
  const H4 = K.hard, m = hard ? H4.wrap + H4.overage : K.bleed, sz = hard ? Math.round((spine + H4.spineExtra) * 100) / 100 : spine;
  const w = Math.round((2 * G.W + sz + 2 * m) * 100) / 100, h = Math.round((G.H + 2 * m) * 100) / 100;
  return { format: hard ? 'hardcover' : 'paperback', pages, estimated: !known, paper: pk, paperName: paper.name, W: G.W, H: G.H, spine, sz, m, bleed: m, w, h, spineText, spineSize: Math.max(fit, Math.min(14, sizePt)),
    px: [Math.round(w / 25.4 * 300), Math.round(h / 25.4 * 300)], inch: [Math.round(w / 25.4 * 1000) / 1000, Math.round(h / 25.4 * 1000) / 1000], trim: BK.kdpTrim(G, k.format) };
};
// printing cost per copy, in euro, for the primary marketplace (Amazon.com.be)
BK.kdpCost = (cfg, pages) => {
  const C = BK.KDP.cost, k = BK.kdpCfg(cfg), G = BK.geom(cfg), hard = k.format === 'hardcover';
  const pk = hard && k.paper === 'std' ? 'white' : k.paper, T = (hard ? C.hardcover : C.paperback)[pk];
  const large = G.W > C.largeW + .01 || G.H > C.largeH + .01, i = large ? 1 : 0;
  const n = Math.round(+pages || +k.pages || 0);
  if (!T || !n) return { ok: false, why: 'Build the PDF (or type a page count) to see the cost.' };
  if (n < T.from || n > T.to) return { ok: false, why: `KDP prints ${T.from} to ${T.to} pages on this paper; this book has ${n}.` };
  let unit, how;
  const flat = T.flat.find(f => n <= f[0]);
  if (flat) { unit = flat[1 + i]; how = `${C.cur}${unit.toFixed(2)} flat for ${T.from} to ${flat[0]} pages`; }
  else { unit = T.fix + T.per[i] * n; how = `${C.cur}${T.fix.toFixed(2)} + ${n} × ${C.cur}${T.per[i]}`; }
  unit = Math.round(unit * 100) / 100;
  const copies = Math.max(1, Math.round(+k.copies || 1)), price = +k.price || 0;
  const net = price / (1 + C.vat), royalty = price ? Math.round((net * .6 - unit) * 100) / 100 : null;
  const minPrice = Math.ceil(((unit / .6) * (1 + C.vat)) * 100) / 100;
  return { ok: true, unit, how, large, pages: n, copies, total: Math.round(unit * copies * 100) / 100, royalty, minPrice, market: C.market, cur: C.cur, format: hard ? 'hardcover' : 'paperback' };
};
// what to tell the author about the interior
BK.kdpChecks = (cfg, pages) => {
  const K = BK.KDP, k = BK.kdpCfg(cfg), G = BK.geom(cfg), out = [];
  const trim = BK.kdpTrim(G, k.format), pi = { white: 0, cream: 1, std: 0, premium: 2 }[k.paper] ?? 0;
  if (k.format === 'hardcover') {
    const H4 = K.hard, ok = !!trim;
    out.push(ok ? { ok: true, t: `Trim size ${G.W} × ${G.H} mm is a KDP hardcover size.` }
      : { ok: false, t: `${G.W} × ${G.H} mm is not a hardcover size. KDP prints hardcovers in 5.5x8.5, 6x9, 6.14x9.21, 7x10 and 8.25x11 inches.` });
    if (k.paper === 'std') out.push({ ok: false, t: 'Hardcovers cannot use standard colour. Pick black ink (white or cream) or premium colour.' });
    if (pages) {
      out.push(pages >= H4.min && pages <= H4.max ? { ok: true, t: `${pages} pages is within what KDP prints in hardcover (${H4.min} to ${H4.max}).` }
        : { ok: false, t: pages < H4.min ? `${pages} pages is too few: hardcover needs at least ${H4.min}.` : `${pages} pages is too many: hardcover takes at most ${H4.max}.` });
      const need = BK.kdpGutter(pages);
      out.push(G.inner >= need ? { ok: true, t: `Inside margin ${G.inner} mm is enough for ${pages} pages (KDP asks ${need} mm).` }
        : { ok: false, t: `Inside margin ${G.inner} mm is too narrow for ${pages} pages: KDP asks at least ${need} mm.`, fix: need });
      if (pages % 2) out.push({ ok: null, t: 'The page count is odd. KDP adds a blank page at the end.' });
    } else out.push({ ok: null, t: 'Build the PDF to check the page count against KDP limits.' });
    if (G.outer < 6.4) out.push({ ok: false, t: `Outside margin ${G.outer} mm is under KDP's 6.4 mm minimum.` });
    return out;
  }
  out.push(trim ? { ok: true, t: `Trim size ${G.W} × ${G.H} mm is a KDP size.` }
    : { ok: false, t: `${G.W} × ${G.H} mm is not a KDP trim size. Pick one in Page size, for example 6x9, 5x8 or 5.5x8.5.` });
  if (pages) {
    const max = trim ? Math.min(K.trims[trim][pi], k.paper === 'std' ? 600 : 9999) : 828, min = (K.paper[k.paper] || K.paper.white).min;
    out.push(pages >= min && pages <= max ? { ok: true, t: `${pages} pages is within what KDP prints for this paper (${min} to ${max}).` }
      : { ok: false, t: pages < min ? `${pages} pages is too few: ${K.paper[k.paper].name} needs at least ${min}.` : `${pages} pages is too many: at most ${max} on this paper and trim size.` });
    const need = BK.kdpGutter(pages);
    out.push(G.inner >= need ? { ok: true, t: `Inside margin ${G.inner} mm is enough for ${pages} pages (KDP asks ${need} mm).` }
      : { ok: false, t: `Inside margin ${G.inner} mm is too narrow for ${pages} pages: KDP asks at least ${need} mm.`, fix: need });
    if (pages % 2) out.push({ ok: null, t: 'The page count is odd. KDP adds a blank page at the end.' });
  } else out.push({ ok: null, t: 'Build the PDF to check the page count against KDP limits.' });
  if (G.outer < 6.4) out.push({ ok: false, t: `Outside margin ${G.outer} mm is under KDP's 6.4 mm minimum.` });
  return out;
};

BK.FONTS = {
  ebgaramond: { name: 'EB Garamond', ratio: 1.305, asc: 1.007, cap: 0.65, prefix: 'eb-garamond' },
  crimsonpro: { name: 'Crimson Pro', ratio: 1.111, asc: 0.896, cap: 0.573, prefix: 'crimson-pro' },
  cormorant: { name: 'Cormorant Garamond', ratio: 1.211, asc: 0.924, cap: 0.625, prefix: 'cormorant-garamond' },
  baskerville: { name: 'Libre Baskerville', ratio: 1.24, asc: 0.97, cap: 0.77, prefix: 'libre-baskerville' },
  lora: { name: 'Lora', ratio: 1.28, asc: 1.006, cap: 0.7, prefix: 'lora' },
  sourceserif: { name: 'Source Serif 4', ratio: 1.371, asc: 1.036, cap: 0.67, prefix: 'source-serif-4' }
};

const LABELS = {
  en: { contents: 'Contents', chapter: 'Chapter', chapter_abbr: 'ch.', index: 'Index',
    index_intro: 'The numbers are the pages on which the name or term appears.',
    index_intro_epub: 'The numbers are the chapters in which the name or term appears; tap one to jump there.',
    cover: 'Cover', back_cover: 'Back cover', title_page: 'Title page', colophon: 'Colophon',
    interlude: 'Interlude', appendix: 'Appendix', part_intro: 'Introduction', in_this_part: 'In this part' },
  nl: { contents: 'Inhoud', chapter: 'Hoofdstuk', chapter_abbr: 'hfst.', index: 'Register',
    index_intro: 'De cijfers zijn de bladzijden waarop de naam of term voorkomt.',
    index_intro_epub: 'De cijfers zijn de hoofdstukken waarin de naam of term voorkomt; tik erop om erheen te gaan.',
    cover: 'Omslag', back_cover: 'Achterkant', title_page: 'Titelpagina', colophon: 'Colofon',
    interlude: 'Intermezzo', appendix: 'Bijlage', part_intro: 'Inleiding', in_this_part: 'In dit deel' },
  fr: { contents: 'Table des matières', chapter: 'Chapitre', chapter_abbr: 'chap.', index: 'Index',
    index_intro: 'Les numéros renvoient aux pages où figure le nom ou le terme.',
    index_intro_epub: 'Les numéros renvoient aux chapitres où figure le nom ou le terme ; touchez-en un pour y aller.',
    cover: 'Couverture', back_cover: 'Quatrième de couverture', title_page: 'Page de titre', colophon: 'Colophon',
    interlude: 'Interlude', appendix: 'Annexe', part_intro: 'Introduction', in_this_part: 'Dans cette partie' },
  de: { contents: 'Inhalt', chapter: 'Kapitel', chapter_abbr: 'Kap.', index: 'Register',
    index_intro: 'Die Zahlen sind die Seiten, auf denen der Name oder Begriff vorkommt.',
    index_intro_epub: 'Die Zahlen sind die Kapitel, in denen der Name oder Begriff vorkommt; tippen Sie darauf, um dorthin zu springen.',
    cover: 'Umschlag', back_cover: 'Rückseite', title_page: 'Titelseite', colophon: 'Impressum',
    interlude: 'Zwischenspiel', appendix: 'Anhang', part_intro: 'Einleitung', in_this_part: 'In diesem Teil' },
  es: { contents: 'Índice', chapter: 'Capítulo', chapter_abbr: 'cap.', index: 'Índice analítico',
    index_intro: 'Los números son las páginas en las que aparece el nombre o término.',
    index_intro_epub: 'Los números son los capítulos en los que aparece el nombre o término; toque uno para ir allí.',
    cover: 'Cubierta', back_cover: 'Contracubierta', title_page: 'Portada', colophon: 'Colofón',
    interlude: 'Interludio', appendix: 'Apéndice', part_intro: 'Introducción', in_this_part: 'En esta parte' },
  it: { contents: 'Indice', chapter: 'Capitolo', chapter_abbr: 'cap.', index: 'Indice dei nomi',
    index_intro: 'I numeri sono le pagine in cui compare il nome o il termine.',
    index_intro_epub: 'I numeri sono i capitoli in cui compare il nome o il termine; toccane uno per andarci.',
    cover: 'Copertina', back_cover: 'Quarta di copertina', title_page: 'Frontespizio', colophon: 'Colophon',
    interlude: 'Interludio', appendix: 'Appendice', part_intro: 'Introduzione', in_this_part: 'In questa parte' }
};
BK.LANGS = { en: 'English', nl: 'Nederlands', fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano' };
BK.labels = cfg => Object.assign({}, LABELS.en, LABELS[cfg.lang] || {}, cfg.labels || {});

BK.defaults = () => ({
  title: '', subtitle: '', subtitle2: '', author: '', lang: 'en', output: '',
  page: 'A5', font_size: null, font: 'ebgaramond', opener: 'smallcaps', chapter_number_style: 'arabic', chapter_word: 'show',
  chapter_break: 'page', running_heads: { left: 'title', right: 'chapter' }, scene_break: '*   *   *',
  toc: true, part_minitoc: true, parts_in_book: true, dedication: [], epigraph: '', colophon: [], labels: {},
  index: false, index_sort: '', index_exclude: [],
  photos: { portrait_mm: 58, pair_height_mm: 66, wide_pair_height_mm: 66, small_mm: 62, qr_mm: 30 },
  bw_maps: false, hyphenate: true, include_covers: true, description: '',
  kdp: { on: false, paper: 'white', pages: 0, spine_text: true, barcode: true, barcode_image: '' },
  cover: { style: 'auto', band: '#2f4858', mid: '#f4efe6', ink: '#1a1a1a', band_ink: '#ffffff', label: '', footer: '',
    title_lines: [], image: '', image_x: 50, image_y: 50, band_size: 100, band_shade: true, subtitle_source: 'auto', back_subtitle_source: 'none', back_subtitle_y: 22, back_image: '', back_image_x: 50, back_image_y: 50, back_band_size: 100, back_quote_y: 10.5, back_blurb_y: 33, back_shade: true, hide: {}, quote: '', blurb: [], qr: '', qr_text: '' },
  roles: {},
  part_intro_off: {},
  excluded: {}
});

const LAYOUT_KEYS = ['page', 'font_size', 'opener', 'chapter_number_style', 'chapter_word', 'chapter_break', 'running_heads', 'scene_break',
  'toc', 'index', 'index_sort', 'photos', 'bw_maps'];
BK.RECIPES = {
  novel: { label: 'Novel', set: { page: '5x8', opener: 'dropcap', chapter_number_style: 'arabic', running_heads: { left: 'author', right: 'title' }, index: false, toc: true, chapter_break: 'right', scene_break: '*' } },
  nonfiction: { label: 'Non-fiction', set: { page: '6x9', opener: 'smallcaps', index: true, index_sort: 'surname', running_heads: { left: 'title', right: 'chapter' } } },
  memoir: { label: 'Memoir', set: { page: 'A5', opener: 'smallcaps', index: true, index_sort: 'surname', bw_maps: true } },
  photo: { label: 'Photo book', set: { page: 'B5', opener: 'none', photos: { portrait_mm: 90, wide_pair_height_mm: 80 } }, cover: { style: 'photo' } },
  poetry: { label: 'Poetry', set: { page: 'pocket', opener: 'none', chapter_number_style: 'none', running_heads: { left: 'author', right: 'chapter' } } },
  report: { label: 'Report', set: { page: 'A4', font_size: 11, opener: 'none', chapter_number_style: 'arabic', chapter_break: 'page' } }
};
BK.applyRecipe = function (cfg, key) {
  const d = BK.defaults(), r = BK.RECIPES[key];
  for (const k of LAYOUT_KEYS) cfg[k] = JSON.parse(JSON.stringify(d[k]));
  for (const [k, v] of Object.entries(r.set)) {
    cfg[k] = (k === 'photos') ? Object.assign({}, d.photos, v) : JSON.parse(JSON.stringify(v));
  }
  if (r.cover) Object.assign(cfg.cover, r.cover);
  return cfg;
};

// ---------------------------------------------------------------- helpers
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ', '#91': '[', '#93': ']' };
BK.unesc = s => String(s).replace(/&(amp|lt|gt|quot|#39|#x27|nbsp|#91|#93);/g, (m, e) => ENT[e]);
BK.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
BK.slug = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'x';
BK.roman = n => { let o = ''; for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { o += r; n -= v; } return o; };
BK.chapNo = (n, cfg) => cfg.chapter_number_style === 'none' ? '' : (cfg.chapter_number_style === 'roman' ? BK.roman(n) : String(n));
BK.plainRuns = runs => (runs || []).map(r => r.t).join('');
const unescapeExport = t => t.replace(/\\_/g, '_').replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\\*/g, '*').replace(/\]\(<(.*?)>\)/g, ']($1)');
BK.unescapeExport = unescapeExport;

const SUPM = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '–' };
const FN_OPEN = '', FN_CLOSE = '';
const INLINE_SPLIT = new RegExp(FN_OPEN + '([^' + FN_CLOSE + ']+)' + FN_CLOSE + '|([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+(?:,[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)*)', 'g');

function pushText(out, s, st, keepNewlines) {
  if (!keepNewlines) s = s.replace(/[ \t]*\n[ \t]*/g, ' ');
  let last = 0, m;
  INLINE_SPLIT.lastIndex = 0;
  while ((m = INLINE_SPLIT.exec(s))) {
    if (m.index > last) out.push(Object.assign({}, st, { t: s.slice(last, m.index) }));
    if (m[1]) out.push(Object.assign({}, st, { t: '', fn: m[1], sup: true }));
    else out.push(Object.assign({}, st, { t: m[2].replace(/[⁰-⁹⁻¹²³]/g, c => SUPM[c] || c).replace(/,/g, ', '), sup: true }));
    last = INLINE_SPLIT.lastIndex;
  }
  if (last < s.length) out.push(Object.assign({}, st, { t: s.slice(last) }));
}

function inl(tokens, st) {
  st = st || {};
  const out = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case 'text':
        if (t.tokens && t.tokens.length) out.push(...inl(t.tokens, st));
        else pushText(out, BK.unesc(t.text), st);
        break;
      case 'escape': pushText(out, BK.unesc(t.text), st); break;
      case 'strong': out.push(...inl(t.tokens, Object.assign({}, st, { b: true }))); break;
      case 'em': out.push(...inl(t.tokens, Object.assign({}, st, { i: true }))); break;
      case 'del': out.push(...inl(t.tokens, st)); break;
      case 'codespan': pushText(out, BK.unesc(t.text), Object.assign({}, st, { code: true })); break;
      case 'br': out.push(Object.assign({}, st, { t: '\n', br: true })); break;
      case 'link': out.push(...inl(t.tokens, Object.assign({}, st, { link: t.href }))); break;
      case 'image': if (t.text) pushText(out, BK.unesc(t.text), st); break;
      case 'html': {
        const s = t.text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
        if (s) pushText(out, BK.unesc(s), st, true);
        break;
      }
      default: if (t.text) pushText(out, BK.unesc(t.text), st);
    }
  }
  return out;
}
const LEXOPT = Object.assign({}, marked.defaults, { mangle: false, headerIds: false, gfm: true });
BK.inlineMd = (s, st) => inl(marked.Lexer.lexInline(s.replace(/\[\^([^\]\s]+)\]/g, FN_OPEN + '$1' + FN_CLOSE), LEXOPT), st);

// ---------------------------------------------------------------- blocks
const PREFIX = /^(MAP|KAART|ART|SPREAD|QR|WIDE|DIAGRAM|SMALL):\s*/;
function imgBlock(tok) {
  let alt = BK.unesc(tok.text || ''), kind = 'photo';
  const m = PREFIX.exec(alt);
  if (m) { kind = m[1] === 'KAART' ? 'map' : m[1].toLowerCase(); alt = alt.slice(m[0].length); }
  return { type: 'fig', kind, alt, src: BK.unesc(tok.href || ''), cap: null };
}

function blocksFrom(tokens, ctx) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'space': case 'def': break;
      case 'heading': {
        const runs = inl(t.tokens);
        const txt = BK.plainRuns(runs);
        if (/^\s*§/.test(txt)) {
          if (runs.length) runs[0] = Object.assign({}, runs[0], { t: runs[0].t.replace(/^\s*§\s*/, '') });
          out.push({ type: 'h3', divider: true, runs });
        } else out.push({ type: t.depth <= 3 ? 'h3' : 'h4', runs });
        break;
      }
      case 'paragraph': {
        const toks = t.tokens.filter(x => !((x.type === 'text' || x.type === 'br') && !String(x.text || '').trim()));
        if (toks.length === 1 && toks[0].type === 'image') { out.push(imgBlock(toks[0])); break; }
        if (toks.length === 2 && toks[0].type === 'image' && toks[1].type === 'em') {
          const f = imgBlock(toks[0]); out.push(f); out.push({ type: 'p', runs: inl([toks[1]]), allItalic: true, emRuns: inl(toks[1].tokens) });
          break;
        }
        const allItalic = toks.length === 1 && toks[0].type === 'em';
        out.push({ type: 'p', runs: inl(t.tokens), allItalic, emRuns: allItalic ? inl(toks[0].tokens) : null });
        break;
      }
      case 'text': out.push({ type: 'p', runs: inl(t.tokens || [{ type: 'text', text: t.text }]) }); break;
      case 'blockquote': out.push({ type: 'quote', blocks: blocksFrom(t.tokens, ctx) }); break;
      case 'list': out.push({ type: 'list', ordered: !!t.ordered, start: t.start || 1, items: t.items.map(it => blocksFrom(it.tokens, ctx)) }); break;
      case 'table': out.push({ type: 'table', align: t.align, header: t.header.map(c => inl(c.tokens)), rows: t.rows.map(r => r.map(c => inl(c.tokens))) }); break;
      case 'hr': out.push({ type: 'hr' }); break;
      case 'code': out.push({ type: 'pre', text: t.text }); break;
      case 'html': {
        const s = t.text.replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').trim();
        if (s) out.push({ type: 'p', runs: [{ t: BK.unesc(s) }] });
        break;
      }
    }
  }
  return captionPass(out);
}

function captionPass(bl) {
  const out = [];
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i];
    if (b.type === 'fig' && !b.cap) {
      const n = bl[i + 1];
      if (['map', 'art', 'spread'].includes(b.kind)) {
        if (n && n.type === 'p') { b.cap = n.runs; i++; }
      } else if (b.kind === 'qr') {
        b.cap = [{ t: b.alt }];
      } else if (n && n.type === 'p' && n.allItalic) { b.cap = n.emRuns; i++; }
    }
    out.push(b);
  }
  return out;
}

function divBlock(kind, inner, ctx) {
  if (kind === 'poem') {
    const stanzas = inner.trim().split(/\n\s*\n/).filter(x => x.trim());
    return { type: 'poem', stanzas: stanzas.map(st => st.split('\n').map(l => BK.inlineMd(l.trim()))) };
  }
  return { type: 'div', kind, blocks: parseBlocks(inner, ctx) };
}

const FN_DEF = /^\[\^([^\]\s]+)\]:[ \t]*(.*(?:\n(?:[ \t]{2,}|\t).*)*)/gm;
function parseBlocks(md, ctx) {
  md = md.replace(FN_DEF, (m, id, txt) => { ctx.defs[id] = txt.replace(/\n\s+/g, ' '); return ''; });
  md = md.replace(/\[\^([^\]\s]+)\]/g, FN_OPEN + '$1' + FN_CLOSE);
  const out = [];
  const re = /^:::[ \t]*([\w-]+)[ \t]*\n([\s\S]*?)\n:::[ \t]*$/gm;
  let last = 0, m;
  while ((m = re.exec(md))) {
    if (m.index > last) out.push(...blocksFrom(marked.lexer(md.slice(last, m.index), LEXOPT), ctx));
    out.push(divBlock(m[1], m[2], ctx));
    last = re.lastIndex;
  }
  out.push(...blocksFrom(marked.lexer(md.slice(last), LEXOPT), ctx));
  return out;
}

// walk every runs array; fn(runs, info) may return a replacement array
function walkRuns(blocks, fn, info) {
  info = info || {};
  for (const b of blocks) {
    switch (b.type) {
      case 'p': { const r = fn(b.runs, Object.assign({ p: b }, info)); if (r) b.runs = r; break; }
      case 'h3': case 'h4': { const r = fn(b.runs, Object.assign({ heading: true }, info)); if (r) b.runs = r; break; }
      case 'quote': case 'div': walkRuns(b.blocks, fn, info); break;
      case 'list': b.items.forEach(it => walkRuns(it, fn, info)); break;
      case 'fig': if (b.cap) { const r = fn(b.cap, Object.assign({ caption: true }, info)); if (r) b.cap = r; } break;
      case 'poem': b.stanzas.forEach(st => st.forEach((ln, i) => { const r = fn(ln, Object.assign({ poem: true }, info)); if (r) st[i] = r; })); break;
      case 'table': {
        const t = Object.assign({ table: true }, info);
        b.header = b.header.map(c => fn(c, t) || c);
        b.rows = b.rows.map(row => row.map(c => fn(c, t) || c));
        break;
      }
    }
  }
}
BK.walkRuns = walkRuns;

function parseSectionBody(body) {
  const ctx = { defs: {} };
  const blocks = parseBlocks(body, ctx);
  const num = {}; let k = 0;
  const notes = [];
  walkRuns(blocks, runs => { for (const r of runs) if (r.fn) { if (!num[r.fn]) num[r.fn] = ++k; r.t = String(num[r.fn]); } });
  Object.keys(num).sort((a, b) => num[a] - num[b]).forEach(id => {
    notes.push({ n: num[id], id, runs: ctx.defs[id] != null ? BK.inlineMd(ctx.defs[id]) : [{ t: '?' }] });
  });
  return { blocks, notes };
}

// ---------------------------------------------------------------- roles
const FRONT_RE = /^(preface|foreword|prologue|introduction|a note on .*|note to the reader|author'?s note|about this book|voorwoord|woord vooraf|inleiding|proloog|ten geleide|verantwoording|préface|avant-propos|introduction|vorwort|einleitung|prolog|prefacio|prólogo|introducción|prefazione|introduzione|prologo)$/i;
const BACK_RE = /^(epilogue|afterword|acknowledg(e)?ments?|notes|endnotes|sources|bibliography|references|further reading|about the author|glossary|credits|permissions|nawoord|epiloog|dankwoord|noten|bronnen|bronvermelding|literatuur|literatuurlijst|bibliografie|over de auteur|over de schrijver|verklarende woordenlijst|woordenlijst|épilogue|postface|remerciements|bibliographie|à propos de l'auteur|nachwort|epilog|danksagung|anmerkungen|quellen|literaturverzeichnis|über den autor|epílogo|agradecimientos|bibliografía|epilogo|ringraziamenti)$/i;
const APPX_RE = /^(appendix|bijlage|annexe?|anhang|apéndice|appendice)(\s+[A-Z0-9IVX]+)?\s*[:.–—-]?\s*/i;
BK.ROLES = { chapter: 'Chapter', plain: 'Chapter without number', interlude: 'Interlude', appendix: 'Appendix', front: 'Front section', back: 'Back section' };

function guessRole(title, interlude, seenChapter, plain) {
  if (plain) return 'plain';
  if (interlude) return 'interlude';
  if (APPX_RE.test(title) && title.replace(APPX_RE, '').trim()) return 'appendix';
  if (!seenChapter && FRONT_RE.test(title)) return 'front';
  if (seenChapter && BACK_RE.test(title)) return 'back';
  return 'chapter';
}

// ---------------------------------------------------------------- manuscript -> model
function splitTop(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const items = [], lead = [];
  let cur = null, fence = false;
  for (const ln of lines) {
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence;
    const m = !fence && /^(#{1,2})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(ln);
    if (m) { cur = { level: m[1].length, head: m[2], body: [] }; items.push(cur); continue; }
    (cur ? cur.body : lead).push(ln);
  }
  return { lead: lead.join('\n'), items: items.map(x => Object.assign(x, { body: x.body.join('\n') })) };
}

const wordCount = s => (s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').match(/[\p{L}\p{N}]+/gu) || []).length;

BK.parse = function (mdIn, cfg) {
  const L = BK.labels(cfg);
  const md = unescapeExport(mdIn || '');
  const { lead, items } = splitTop(md);
  const model = { front: [], parts: [], back: [], warnings: [], outline: [], terms: [] };
  let part = { pid: null, chapters: [] };
  model.parts.push(part);
  const keyCount = {}, used = {};
  let seenChapter = false, num = 0, inum = 0, pnum2 = 0, anum = 0, pnum = 0;
  if (lead.trim() && wordCount(lead) > 0) items.unshift({ level: 2, head: '', body: lead, implicit: true });
  const uid = base => { let id = base, k = 2; while (used[id]) id = base + '-' + (k++); used[id] = 1; return id; };

  for (const it of items) {
    if (it.level === 1) {
      const head = it.head.trim();
      let label = '', name = head;
      const sep = /^(.*?)\s+[–—]\s+(.*)$/.exec(head) || /^(.*?)\s+-\s+(.*)$/.exec(head);
      if (sep) { label = sep[1]; name = sep[2]; }
      const paras = it.body.trim().split(/\n\s*\n/).filter(s => s.trim());
      const pkey = 'part:' + BK.slug(head);
      part = { pid: 'part' + (++pnum), key: pkey, label, title: name, rawSub: paras[0] || '', subRuns: paras[0] ? BK.inlineMd(paras[0]) : [],
        intro: paras.slice(1).join('\n\n'), chapters: [] };
      part.hasIntro = !!part.intro.trim();
      if (cfg.excluded && cfg.excluded[pkey]) part.skip = part.excludedPage = true;
      part.introOff = !!(cfg.part_intro_off && cfg.part_intro_off[pkey]);
      part.introParsed = part.hasIntro && !part.introOff && !part.skip ? parseSectionBody(part.intro) : null;
      model.parts.push(part);
      model.outline.push({ type: 'part', key: pkey, label, title: name, part });
      continue;
    }
    let head = it.head.trim();
    let t = head, sub = '';
    const bar = head.indexOf(' | ');
    if (bar >= 0) { t = head.slice(0, bar).trim(); sub = head.slice(bar + 3).trim(); }
    let interlude = false, plain = false;
    if (t.startsWith('* ')) { interlude = true; t = t.slice(2).trim(); }
    else if (t.startsWith('~ ')) { plain = true; t = t.slice(2).trim(); }
    const base = BK.slug(t || 'untitled');
    keyCount[base] = (keyCount[base] || 0) + 1;
    const key = keyCount[base] > 1 ? base + '#' + keyCount[base] : base;
    const guessed = guessRole(t, interlude, seenChapter, plain);
    let role = cfg.roles && cfg.roles[key] || guessed;
    if (interlude && role === 'chapter') role = 'interlude';
    if (plain && role === 'chapter') role = 'plain';
    const parsed = parseSectionBody(it.body);
    const sec = { key, role, guessed, rawTitle: t, title: t, sub, blocks: parsed.blocks, notes: parsed.notes,
      words: wordCount(it.body), implicit: !!it.implicit, body: it.body };
    if (cfg.excluded && cfg.excluded[key]) { sec.excluded = true; sec.partPid = part.pid; model.outline.push({ type: 'sec', sec }); continue; }
    if (role === 'front' || role === 'back') {
      sec.id = uid((role === 'front' ? 'f-' : 'b-') + base);
      sec.headTitle = t;
      (role === 'front' ? model.front : model.back).push(sec);
    } else {
      seenChapter = true;
      if (role === 'interlude') { sec.num = null; sec.id = 'int' + (++inum); }
      else if (role === 'plain') { sec.num = null; sec.plain = true; sec.id = 'pl' + (++pnum2); }
      else {
        sec.num = ++num; sec.id = 'ch' + num;
        if (role === 'appendix') {
          const stripped = t.replace(APPX_RE, '').trim() || t;
          sec.title = `${L.appendix} ${++anum} – ${stripped}`;
        }
      }
      sec.headTitle = sec.title;
      part.chapters.push(sec);
    }
    sec.partPid = part.pid;
    model.outline.push({ type: 'sec', sec });
  }
  if (cfg.parts_in_book === false) model.parts.forEach(p => { if (p.pid) { p.skip = true; p.introParsed = null; } });
  model.parts = model.parts.filter(p => p.pid || p.chapters.length);
  if (!items.length) model.warnings.push('The manuscript is empty.');
  else if (!model.parts.some(p => p.chapters.length)) model.warnings.push('No chapters found. Start each chapter with a line "## Title".');
  if (items.length && items[0].implicit && items.length > 1) model.warnings.push('Text before the first heading became an untitled chapter.');
  BK.buildIndex(model, cfg);
  return model;
};

BK.chaptersOf = model => model.parts.flatMap(p => p.chapters);

// ---------------------------------------------------------------- index terms + occurrences
BK.buildIndex = function (model, cfg) {
  let terms = [];
  if (Array.isArray(cfg.index)) terms = cfg.index.slice();
  else if (cfg.index) {
    const seen = new Set();
    const excl = new Set(cfg.index_exclude || []);
    for (const ch of BK.chaptersOf(model)) {
      walkRuns(ch.blocks, (runs, info) => {
        if (info.heading || info.table) return;
        let cur = '';
        const flush = () => {
          let t = cur.replace(/\s*\(\d+\)$/, '').trim(); cur = '';
          if (t.length >= 3 && !/^\d/.test(t) && !excl.has(t) && !seen.has(t)) { seen.add(t); terms.push(t); }
        };
        for (const r of runs) { if (r.b && !r.sup) cur += r.t; else if (cur) flush(); }
        if (cur) flush();
      });
    }
  }
  terms.sort((a, b) => b.length - a.length);
  model.terms = terms;
  model.occ = {};
  if (!terms.length) return;
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?<![\\p{L}\\p{N}_-])(' + terms.map(reEsc).join('|') + ')(?![\\p{L}\\p{N}_-])', 'gu');
  const idx = new Map(terms.map((t, i) => [t, i]));
  const counter = {};
  for (const ch of BK.chaptersOf(model)) {
    walkRuns(ch.blocks, (runs, info) => {
      if (info.heading || info.table) return;
      // match on the joined text of the paragraph so bold terms split over runs are found too
      const out = [];
      for (const r of runs) {
        if (!r.t || r.sup || r.code) { out.push(r); continue; }
        let last = 0, m; re.lastIndex = 0;
        while ((m = re.exec(r.t))) {
          if (m.index > last) out.push(Object.assign({}, r, { t: r.t.slice(last, m.index) }));
          const i = idx.get(m[1]);
          counter[i] = (counter[i] || 0) + 1;
          const oid = 'ix-' + i + '-' + counter[i];
          out.push(Object.assign({}, r, { t: m[1], ix: i, ixo: oid }));
          (model.occ[i] = model.occ[i] || []).push({ oid, sec: ch });
          last = re.lastIndex;
        }
        if (last === 0) out.push(r);
        else if (last < r.t.length) out.push(Object.assign({}, r, { t: r.t.slice(last) }));
      }
      return out;
    });
  }
};

const PARTICLES = ['van', 'de', 'der', 'den', 'het', 'ten', 'ter', 'le', 'la', 'du', 'des', 'von', 'zu', 'di', 'da', 'del', 'della', 'dos', 'mac', 'vande', 'vanden', "'t"];
BK.indexKey = function (term, cfg) {
  const toks = term.replace(/"/g, '').split(/\s+/);
  let disp = term;
  if (cfg.index_sort === 'surname' && toks.length > 1) {
    const parts = new Set(cfg.index_particles || PARTICLES);
    let i = toks.length - 1;
    for (let k = 1; k < toks.length; k++) if (parts.has(toks[k].toLowerCase())) { i = k; break; }
    disp = toks.slice(i).join(' ') + ', ' + toks.slice(0, i).join(' ');
  }
  const k = disp.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return { k, disp };
};

// ---------------------------------------------------------------- images referenced
BK.referencedImages = function (model, cfg) {
  const out = new Map();
  const add = (src, kind) => { if (src && !/^https?:/i.test(src)) out.set(src, kind); };
  const walk = bl => bl.forEach(b => {
    if (b.type === 'fig') add(b.src, b.kind);
    if (b.blocks) walk(b.blocks);
    if (b.items) b.items.forEach(walk);
  });
  for (const s of model.front.concat(model.back, BK.chaptersOf(model))) walk(s.blocks);
  model.parts.forEach(p => p.introParsed && walk(p.introParsed.blocks));
  if (cfg.cover && cfg.cover.image) add(cfg.cover.image, 'cover');
  if (cfg.cover && cfg.cover.back_image) add(cfg.cover.back_image, 'cover');
  return out;
};
})(typeof window !== 'undefined' ? window : globalThis);
