/* Book Layout Kit – the Guide tab: every option explained, with a small example page on hover (tap on a phone). */
(function () {
'use strict';
const T = 'The archive keeps its records in grey boxes along a cold corridor, and the clerk who fetches them has worked there for thirty-one years without once misplacing a parish register.';
const T2 = 'By the spring of 1852 the household owed more than it earned, and Pieter wrote to his brother in Antwerp to ask whether a weaver could make a living by the water.';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- tiny page building blocks (always paper white, like the real book)
const page = (inner, o) => `<div class="mp${o && o.cls ? ' ' + o.cls : ''}"${o && o.style ? ` style="${o.style}"` : ''}>${o && o.rh ? `<div class="rh">${o.rh}</div>` : ''}<div class="mpb">${inner}</div>${o && o.fo ? `<div class="fo">${o.fo}</div>` : ''}${o && o.tag ? `<div class="mtag">${o.tag}</div>` : ''}</div>`;
const p = (t, cls) => `<p${cls ? ` class="${cls}"` : ''}>${t}</p>`;
const lead = (t) => { const w = t.split(' '); return `<p class="first"><span class="sc">${w.slice(0, 3).join(' ')}</span> ${w.slice(3).join(' ')}</p>`; };
const opener = (lab, title, sub, body) => `${lab ? `<div class="cn">${lab}</div>` : ''}<div class="ct">${title}</div><div class="cs">${sub || ''}</div><div class="cr"></div>${body}`;
const stitle = (t, body) => `<div class="st">${t}</div>${body}`;
const photo = (w, h, cls) => `<div class="ph ${cls || ''}" style="width:${w}%;aspect-ratio:${h}"></div>`;
const cap = t => `<div class="fc">${t}</div>`;
const spread = (a, b) => `<div class="spr">${a}${b}</div>`;
const code = s => `<pre class="gcode">${esc(s)}</pre>`;
const cover = (o) => {
  const band = o.band || '#2f4858', mid = o.mid || '#f4efe6', ink = o.ink || '#1a1a1a', bi = o.bi || '#fff';
  if (o.photo) return `<div class="mc" style="background:${band};color:${bi}"><div class="mcl" style="top:6%">${o.label || 'A FAMILY HISTORY'}</div><div class="mct" style="top:12%;color:${bi}">${o.title || 'SALT AND LINEN'}</div><div class="mcp" style="top:27%;height:46%;background-position:${o.pos || '50% 50%'}"></div><div class="mcs" style="top:76%;color:${bi}">A family on the Scheldt</div><div class="mca" style="top:82%;color:${bi}">ANNA VERHULST</div><div class="mcf" style="bottom:4%">${o.footer || 'PART ONE · PART TWO'}</div></div>`;
  return `<div class="mc" style="background:${band};color:${bi}"><div class="mcm" style="background:${mid}"></div><div class="mcl" style="top:11%">${o.label || 'A FAMILY HISTORY'}</div><div class="mct" style="top:37%;color:${ink}">${o.title || 'SALT AND LINEN'}</div><div class="mcr" style="top:52.5%;background:${ink}"></div><div class="mcs" style="top:55%;color:${ink}">A family on the Scheldt</div><div class="mca" style="top:63%;color:${ink}">ANNA VERHULST</div><div class="mcf" style="bottom:9%">${o.footer || 'PART ONE · PART TWO'}</div></div>`;
};
const back = (o) => `<div class="mc" style="background:${o.band || '#2f4858'};color:#fff"><div class="mcm" style="background:${o.mid || '#f4efe6'}"></div><div class="mcq">${o.quote || '“We wove for the ships.”'}</div><div class="mcb">${o.blurb || T + ' ' + T2}</div>${o.qr ? '<div class="mcqr"></div><div class="mcqt">Photographs and letters online.</div>' : ''}</div>`;

const G = [
  { group: 'Opening your book', intro: 'Drop files on the Manuscript tab, or use the buttons under it. Everything can come in one go or piece by piece.', items: [
    { k: 'Whole project', d: 'A folder or a .zip with book.json, the markdown files and the images, as bookmaker.py uses them (or as the Kit bundle on the Export tab saves them). Text, settings and pictures are all loaded.' },
    { k: 'Settings only (book.json)', d: 'Loads page size, typeface, cover and all other settings, and keeps your text. The app then names the text files the settings expect.' },
    { k: 'Text files', d: 'One or more .md, .txt, .docx, .odt, .pdf or .html files. Files that book.json names (front.md, part1.md …) are placed in the order it gives, also when they arrive later; other files are joined in name order. Word and OpenDocument files bring their own pictures.' },
    { k: 'Images', d: 'Pictures the text refers to by file name. Images that are still missing are shown in red under Images.' },
    { k: 'Auto-format', d: 'Turns plain text into kit markdown: chapter lines (“Chapter 3”, “III”, a line in capitals, Preface, Epilogue …) become headings, “Part One” a part, a date or place under a title its subline, and it finds scene breaks, an epigraph after a heading, indented quotations, poems, lists, footnotes written as [1], pictures written as [image: photo.jpg | caption], and it joins lines that were broken at the end of the line, removing the hyphens. Plain .txt files are formatted this way when you open them. Undo puts the text back as it was.',
      code: 'CHAPTER 1\nThe Bakery\n(Lier, 1923)\n\nMy grandfather opened the bakery[1] …\n\n[1] The ovens are still there.',
      ex: () => `<div class="two">${code('## The Bakery | Lier, 1923\n\nMy grandfather opened the bakery[^c1-1] …\n\n[^c1-1]: The ovens are still there.')}</div>` }
  ] },
  { group: 'Writing the manuscript', intro: 'Type these marks in the manuscript text. They work the same in bookmaker.py.', items: [
    { k: 'Part', d: 'A part groups chapters and gets its own title page on a right-hand page. The first paragraph after the line is the subtitle; any further paragraphs make an Introduction page with a mini contents.',
      code: '# Part One – The River\n\nWeavers who followed the work.\n\nThe first part follows the family…',
      ex: () => spread(page(`<div class="pp"><div class="pl">PART ONE</div><div class="pt">The River</div><div class="ps">Weavers who followed the work.</div><div class="cr wide"></div></div>`, { tag: 'part page' }),
        page(stitle('Introduction', lead(T) + '<div class="mtl">IN THIS PART</div><div class="toc"><div><span>1. The Weaver’s House</span><i></i><b>14</b></div><div><span>2. Letters Home</span><i></i><b>16</b></div></div>'), { fo: 13, tag: 'introduction' })) },
    { k: 'Chapter', d: 'Every “## ” line starts a new chapter on a new page, numbered automatically. Text after a “ | ” becomes the small subline under the title (a date, a place).',
      code: '## The Weaver’s House | Turnhout, 1852',
      ex: () => page(opener('CHAPTER 1', 'The Weaver’s House', 'TURNHOUT, 1852', lead(T) + p(T2)), { fo: 14 }) },
    { k: 'Chapter without a number', d: 'A chapter that gets no number and no “Chapter” label, only its title, for example a prologue-like chapter inside the story. The numbering of the next chapter continues. Pick “Chapter without number” in the Structure tab, or write ## ~ Title in the manuscript.',
      ex: () => page(opener('', 'The Night Before', '', p(T, 'first')), { fo: 12 }) },
    { k: 'Interlude', d: 'A chapter without a number, labelled “Interlude”. The numbering of the next chapter simply continues.',
      code: '## * A Song from the Quay',
      ex: () => page(opener('INTERLUDE', 'A Song from the Quay', '', '<div class="poem">Bring in the canvas, the tide is turning,<br>the lamps are lit on the Kattendijk wall;<br>salt in the weave and tar on the hands,<br>and a ship for Rio before nightfall.</div>'), { fo: 20 }) },
    { k: 'Headings inside a chapter', d: '“###” is an italic section heading, “####” a small bold heading, and “### §” a centred divider in small capitals.',
      code: '### The move\n#### Prices in 1852\n### § Part A – Letters',
      ex: () => page(p(T) + '<div class="h3">The move</div>' + p(T2, 'first') + '<div class="h4">Prices in 1852</div>' + p(T, 'first') + '<div class="dv">PART A – LETTERS</div>', { rh: 'THE WEAVER’S HOUSE', fo: 15 }) },
    { k: 'Epigraph', d: 'A quotation straight after the chapter heading is set small and italic on the right. Put the source in its own paragraph after an empty “>” line.',
      code: '> Cloth remembers every hand that touched it.\n>\n> — Flemish saying',
      ex: () => page(opener('CHAPTER 1', 'The Weaver’s House', 'TURNHOUT, 1852', '<div class="epi"><i>Cloth remembers every hand that touched it.</i><div>— Flemish saying</div></div>' + lead(T)), { fo: 14 }) },
    { k: 'Scene break', d: 'Three asterisks on their own line give a centred ornament and a little space. The next paragraph starts without an indent.',
      code: '***',
      ex: () => page(p(T) + p(T2) + '<div class="sb">*&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;*</div>' + p(T, 'first') + p(T2), { rh: 'THE WEAVER’S HOUSE', fo: 15 }) },
    { k: 'Footnotes', d: 'Put [^1] in the text and the note anywhere in the same chapter. Notes are numbered per chapter and printed at the end of the chapter, below a short line.',
      code: 'kept the accounts in an exercise book.[^1]\n\n[^1]: The exercise book survives.',
      ex: () => page(p('Mathilde spun and kept the accounts in a school exercise book.<sup>1</sup> ' + T) + p(T2) + '<div class="fn"><div>1. The exercise book survives. Its first page lists the price of flax.</div></div>', { rh: 'THE WEAVER’S HOUSE', fo: 15 }) },
    { k: 'Note numbers', d: 'Superscript digits typed straight into the text (¹ ² ³) become proper small raised numbers, for a numbered source list at the back.',
      code: 'the census of 1846²,¹⁴',
      ex: () => page(p('According to the census of 1846<sup>2, 14</sup> the street had eleven looms. ' + T) + p(T2), { fo: 31 }) },
    { k: 'Index entry', d: 'With “Index of bold names” switched on, every **bold** name or term is listed in the index with the pages where it appears, also where it appears again later without bold.',
      code: '**Pieter Verhulst** worked there from first light.',
      ex: () => page(stitle('Index', '<div class="ixi">The numbers are the pages on which the name or term appears.</div><div class="ix"><div><b class="ixl">C</b><div>Claes, Mathilde <b>14, 16</b></div><b class="ixl">V</b><div>Verhulst, Frans <b>21</b></div><div>Verhulst, Pieter <b>9, 14, 16</b></div></div><div><b class="ixl">W</b><div>Wilde, Hendrik de <b>15</b></div></div></div>'), { fo: 27 }) },
    { k: 'Poem', d: 'Every line break is kept, stanzas are separated by an empty line, and the lines are not justified.',
      code: '::: poem\nBring in the canvas,\nthe tide is turning;\n\nFold it in eight…\n:::',
      ex: () => page(p(T) + '<div class="poem">Bring in the canvas, the tide is turning,<br>the lamps are lit on the Kattendijk wall;<br><br>Fold it in eight and tie it with twine,<br>the merchant will pay us by noon.</div>' + p(T2, 'first'), { fo: 20 }) },
    { k: 'Letter', d: 'An indented italic block for letters, diaries and documents quoted in full.',
      code: '::: letter\nDear aunt,\n\nFather has taken on two boys…\n:::',
      ex: () => page(p(T) + '<div class="let">Dear aunt,<br>Father has taken on two boys from the orphanage to work the second loom. Mother says we shall have a proper table by Easter.<br>Your loving niece, Rosalie</div>' + p(T2, 'first'), { fo: 16 }) },
    { k: 'Box', d: 'A framed box that is never split over two pages: for a timeline, a recipe, a family overview or a side note.',
      code: '::: box\n#### The family in 1871\nPieter, weaver, 52 · Mathilde, 49\n:::',
      ex: () => page(p(T) + '<div class="box"><div class="h4" style="margin-top:0">The family in 1871</div>Pieter Verhulst, weaver, 52 · Mathilde Claes, 49 · Rosalie, 22 · Frans, 19</div>' + p(T2, 'first'), { fo: 16 }) },
    { k: 'Centred or right-aligned text', d: 'For an inscription, a sign or a closing line.',
      code: '::: center\nIN MEMORY OF\nPieter Verhulst\n:::',
      ex: () => page(p(T) + '<div class="ctr">IN MEMORY OF<br><i>Pieter Verhulst, 1819–1888</i></div><div class="rgt">Antwerp, August 1914</div>', { fo: 22 }) },
    { k: 'Table', d: 'A normal markdown table becomes a small ruled table. If it runs over a page, the header row is repeated.',
      code: '| Year | Event | Place |\n|---|---|---|\n| 1852 | Move | Antwerp |',
      ex: () => page(p(T) + '<table class="tb"><tr><th>YEAR</th><th>EVENT</th><th>PLACE</th></tr><tr><td>1852</td><td>Move from Turnhout</td><td>Antwerp</td></tr><tr><td>1863</td><td>Second loom bought</td><td>Antwerp</td></tr><tr><td>1874</td><td>Frans apprenticed</td><td>Meir</td></tr></table>' + p(T2, 'first'), { fo: 16 }) }
  ] },
  { group: 'Pictures', intro: 'Refer to an image by its file name and add the file on the Manuscript tab (Word and OpenDocument files bring their own images). The word before the colon in the brackets picks the kind of figure.', items: [
    { k: 'Photo with caption', d: 'Centred with a thin frame. Upright photos are 58 mm wide, landscape photos fill the text width. The caption is the next paragraph, written wholly in italics.',
      code: '![Pieter at the loom](pieter.jpg)\n\n*Pieter Verhulst at his loom, about 1860.*',
      ex: () => page(p(T) + photo(52, '3/4') + cap('Pieter Verhulst at his loom, about 1860.') + p(T2, 'first'), { fo: 15 }) },
    { k: 'Two portraits side by side', d: 'Two upright photos in a row are placed next to each other at the same height, each with its caption.',
      code: '![](rosalie.jpg)\n\n*Rosalie, 1870.*\n\n![](frans.jpg)\n\n*Frans, 1872.*',
      ex: () => page(p(T) + '<div class="pair"><div>' + photo(100, '3/4') + cap('Rosalie, 1870.') + '</div><div>' + photo(100, '3/4') + cap('Frans, 1872.') + '</div></div>' + p(T2, 'first'), { fo: 16 }) },
    { k: 'WIDE: artwork', d: 'Full text width without a frame, for paintings and drawings in the flow of the text. Two in a row stay together on one page.',
      code: '![WIDE: The quay](quay.jpg)\n\n*The quay, oil on canvas, 1890.*',
      ex: () => page(p(T) + photo(100, '3/2', 'art') + cap('The quay, oil on canvas, 1890.') + p(T2, 'first'), { fo: 18 }) },
    { k: 'DIAGRAM: chart or plan', d: 'Full text width without a frame; the caption is left-aligned.',
      code: '![DIAGRAM: Family tree](tree.png)\n\n*Three generations of weavers.*',
      ex: () => page(p(T) + '<div class="dg"><span></span><span></span><span></span><span></span><span></span></div>' + cap('<span style="text-align:left;display:block">Three generations of weavers.</span>') + p(T2, 'first'), { fo: 18 }) },
    { k: 'SMALL: signature or stamp', d: 'A small image (62 mm) without a frame.',
      code: '![SMALL: Signature](signature.png)\n\n*Pieter’s signature, 1852.*',
      ex: () => page(p(T) + '<div class="sig">P. Verhulst</div>' + cap('Pieter’s signature, 1852.') + p(T2, 'first'), { fo: 18 }) },
    { k: 'ART: full-page plate', d: 'The image gets a page of its own, turned a quarter so it can be as large as possible. No running head or page number on that page.',
      code: '![ART: The Meir in 1900](meir.jpg)\n\nPostcard, about 1900.',
      ex: () => page('<div class="turn"><div class="turnt">The Meir in 1900</div>' + photo(100, '3/2', 'art') + '<div class="fc">Postcard, about 1900.</div></div>', { tag: 'turned page' }) },
    { k: 'MAP: full-page map', d: 'Like ART, on its own turned page with the title on top and the caption below. With “Clean up old maps” switched on, a yellowed scan becomes a clean black-and-white map.',
      code: '![MAP: Antwerp in 1860](map.jpg)\n\nThe docks and the Meir, 1860.',
      ex: () => page('<div class="turn"><div class="turnt" style="text-align:left">Antwerp in 1860</div><div class="ph mapimg" style="width:100%;aspect-ratio:3/2"></div><div class="fc" style="text-align:left">The docks and the Meir, 1860.</div></div>', { tag: 'turned page' }) },
    { k: 'SPREAD: across two pages', d: 'A wide image is cut in two: the left half on a left-hand page, the right half on the facing page, for panoramas and large plans.',
      code: '![SPREAD: The quay in 1905](panorama.jpg)\n\nThe quay seen from the river.',
      ex: () => spread(page('<div class="sph">The quay in 1905</div><div class="ph art" style="width:100%;aspect-ratio:1.2;border-radius:0;background-position:0 50%;background-size:200% 100%"></div>', { fo: 22 }), page('<div class="sph">&nbsp;</div><div class="ph art" style="width:100%;aspect-ratio:1.2;border-radius:0;background-position:100% 50%;background-size:200% 100%"></div><div class="fc" style="text-align:right">The quay seen from the river.</div>', { fo: 23 })) },
    { k: 'QR: link code', d: 'A web address becomes a printed QR code (30 mm) with your caption, for an online archive, photo album or family tree.',
      code: '![QR: Photographs online](https://example.org/album)',
      ex: () => page(stitle('Sources', '<ul class="src"><li>Letters of Rosalie Verhulst, 1871–1874.</li><li>Shop ledger, Meir 84, 1889–1914.</li></ul><div class="qr"></div><div class="fc">Photographs online</div>'), { fo: 25 }) }
  ] },
  { group: 'Structure tab', intro: 'Each “## ” heading is a chapter unless you give it another role. The tab guesses roles from the titles; your choice overrides the guess.', items: [
    { k: 'Chapter', d: 'Numbered, on a new page, with the “Chapter n” label.', ex: () => page(opener('CHAPTER 3', 'The Shop on the Meir', 'ANTWERP, 1889–1914', lead(T)), { fo: 21 }) },
    { k: 'Chapter without number', d: 'No number and no label, only the title; chapter numbers carry on after it.', ex: () => page(opener('', 'The Night Before', '', p(T, 'first')), { fo: 12 }) },
    { k: 'Interlude', d: 'Unnumbered and labelled “Interlude”; chapter numbers carry on after it.', ex: () => page(opener('INTERLUDE', 'A Song from the Quay', '', p(T, 'first')), { fo: 20 }) },
    { k: 'Appendix', d: 'Keeps the running chapter number and is titled “Appendix 1 – …”, for documents, transcriptions and overviews at the end.', ex: () => page(opener('CHAPTER 9', 'Appendix 1 – Baptisms 1820–1860', '', '<table class="tb"><tr><th>DATE</th><th>NAME</th><th>PARISH</th></tr><tr><td>1819</td><td>Pieter</td><td>Turnhout</td></tr><tr><td>1849</td><td>Rosalie</td><td>Turnhout</td></tr></table>'), { fo: 41 }) },
    { k: 'Front section', d: 'Preface, foreword or introduction before the chapters: unnumbered, starts on a right-hand page, listed at the top of the contents.', ex: () => page(stitle('Preface', lead(T) + p(T2)), { fo: 9 }) },
    { k: 'Back section', d: 'Sources, notes, acknowledgements, glossary: unnumbered, starts on a right-hand page, after the last chapter.', ex: () => page(stitle('Acknowledgements', lead(T)), { fo: 25 }) }
  ] },
  { group: 'Book tab', items: [
    { k: 'Recipes', d: 'One click sets the layout for a kind of book. Your title, texts and cover stay as they are.',
      ex: () => `<table class="gt"><tr><th>Recipe</th><th>Page</th><th>Opening</th><th>Other</th></tr><tr><td>Novel</td><td>5×8 in</td><td>drop cap</td><td>chapters on the right, author/title heads</td></tr><tr><td>Non-fiction</td><td>6×9 in</td><td>small caps</td><td>index by surname</td></tr><tr><td>Memoir</td><td>A5</td><td>small caps</td><td>index by surname, map clean-up</td></tr><tr><td>Photo book</td><td>B5</td><td>plain</td><td>larger photos, photo cover</td></tr><tr><td>Poetry</td><td>pocket</td><td>plain</td><td>no chapter numbers</td></tr><tr><td>Report</td><td>A4</td><td>plain</td><td>11 pt body</td></tr></table>` },
    { k: 'Title, subtitle, author', d: 'Used on the half title, the title page, the cover, the running heads and the file details. The second subtitle is a smaller line under the subtitle (for example the period covered).',
      ex: () => spread(page('<div class="ht">SALT AND LINEN</div>', { tag: 'half title' }), page('<div class="tp1">SALT AND LINEN</div><div class="tp2">A family on the Scheldt</div><div class="tp3">1852–1914</div><div class="tp4">ANNA VERHULST</div>', { tag: 'title page' })) },
    { k: 'Language', d: 'Sets the words the kit adds itself and the hyphenation rules: English, Dutch, French, German, Spanish or Italian.',
      ex: () => `<table class="gt"><tr><th></th><th>English</th><th>Nederlands</th><th>Français</th></tr><tr><td>label</td><td>Chapter 3</td><td>Hoofdstuk 3</td><td>Chapitre 3</td></tr><tr><td>contents</td><td>Contents</td><td>Inhoud</td><td>Table des matières</td></tr><tr><td>index</td><td>Index</td><td>Register</td><td>Index</td></tr><tr><td>appendix</td><td>Appendix 1</td><td>Bijlage 1</td><td>Annexe 1</td></tr></table>` },
    { k: 'Page size', d: 'The trim size of the printed book. Margins grow with the page; the inner margin (at the spine) is a little wider than the outer one.',
      ex: () => `<div class="sizes">${[['pocket', 110, 178], ['5×8', 127, 203], ['A5', 148, 210], ['6×9', 152, 229], ['B5', 176, 250], ['A4', 210, 297]].map(([n, w, h]) => `<div><span style="width:${w * .42}px;height:${h * .42}px"></span>${n}</div>`).join('')}</div>` },
    { k: 'Typeface', d: 'The book type for text, headings and cover. All six are embedded in the PDF and EPUB.',
      ex: () => `<div class="faces">${[['EB Garamond', 'EB Garamond'], ['Crimson Pro', 'Crimson Pro'], ['Cormorant Garamond', 'Cormorant Garamond'], ['Libre Baskerville', 'Libre Baskerville'], ['Lora', 'Lora'], ['Source Serif 4', 'Source Serif 4']].map(([n, f]) => `<div style="font-family:'${f}',Georgia,serif"><b>${n}</b> The weaver’s house on the Gasthuisstraat, <i>1852</i></div>`).join('')}</div>` },
    { k: 'Body size', d: 'Size of the running text in points. Automatic is 10.5 pt on smaller pages and 11.5 pt on larger ones; headings scale with it.',
      ex: () => spread(page(p(T) + p(T2) + p(T), { style: 'font-size:6.2px', tag: '9.5 pt' }), page(p(T) + p(T2), { style: 'font-size:7.8px', tag: '12 pt' })) },
    { k: 'Chapter opening', d: 'How the first paragraph of a chapter begins: the first words in small capitals, a large drop cap over two lines, or plain text.',
      ex: () => `<div class="three">${page(opener('CHAPTER 1', 'The Weaver’s House', '', lead(T)), { tag: 'small caps' })}${page(opener('CHAPTER 1', 'The Weaver’s House', '', '<p class="first"><span class="dc">T</span>he archive keeps its records in grey boxes along a cold corridor, and the clerk who fetches them has worked there for thirty-one years.</p>'), { tag: 'drop cap' })}${page(opener('CHAPTER 1', 'The Weaver’s House', '', p(T, 'first')), { tag: 'plain' })}</div>` },
    { k: 'Chapter numbers', d: 'Arabic (Chapter 3), Roman (Chapter III) or none: then chapters only show their title, in the book and in the contents.',
      ex: () => `<div class="three">${page(opener('CHAPTER 3', 'The Shop', '', ''), { tag: '1, 2, 3' })}${page(opener('CHAPTER III', 'The Shop', '', ''), { tag: 'I, II, III' })}${page(opener('', 'The Shop', '', ''), { tag: 'none' })}</div>` },
    { k: 'Word “Chapter” in the headings', d: 'Show: “CHAPTER 3” above the title. Number only: just “3” (or “III”), with no word in front, in the PDF and the EPUB. The word itself follows the book’s language.',
      ex: () => `<div class="two">${page(opener('CHAPTER 3', 'The Shop', '', ''), { tag: 'Chapter 3' })}${page(opener('3', 'The Shop', '', ''), { tag: 'number only' })}</div>` },
    { k: 'Chapters start on', d: 'Any page: a chapter starts on the next page. Right-hand page: a blank page is added when needed, as in most printed novels. Parts and front and back sections always start on the right.',
      ex: () => spread(page('', { tag: 'blank page added' }), page(opener('CHAPTER 4', 'The War Years', '', lead(T)), { fo: 27 })) },
    { k: 'Running heads', d: 'The small line at the top of each page. Choose book title, author, chapter title or nothing, separately for left and right pages. Never on chapter openings, blank pages, maps or the front matter.',
      ex: () => spread(page(p(T) + p(T2) + p(T), { rh: 'SALT AND LINEN', fo: 14 }), page(p(T2) + p(T) + p(T2), { rh: 'THE WEAVER’S HOUSE', fo: 15 })) },
    { k: 'Scene break ornament', d: 'The text printed where you typed ***. For example “*   *   *”, a single “*”, “❦” or “~”.',
      ex: () => `<div class="three">${['*&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;*', '*', '❦'].map(o => page(p(T) + `<div class="sb">${o}</div>` + p(T2, 'first'))).join('')}</div>` },
    { k: 'Contents page', d: 'A contents page on a right-hand page after the title pages, with dotted leaders and page numbers.',
      ex: () => page(stitle('Contents', '<div class="toc big"><div><span>Preface</span><i></i><b>9</b></div><div class="tp"><span>PART ONE – THE RIVER</span><i></i><b>11</b></div><div class="t1"><span>1. The Weaver’s House</span><i></i><b>14</b></div><div class="t1"><span>2. Letters Home</span><i></i><b>16</b></div><div class="tp"><span>PART TWO – THE SHOP</span><i></i><b>17</b></div><div class="t1"><span>Interlude: A Song</span><i></i><b>20</b></div><div class="t1"><span>3. The Shop on the Meir</span><i></i><b>21</b></div><div><span>Sources</span><i></i><b>23</b></div><div><span>Index</span><i></i><b>27</b></div></div>')) },
    { k: 'Leave parts out of the book', d: 'On the Book tab, untick “Part title pages and introductions” to print the chapters without any part pages: no part title page, no introduction and no part rows in the contents. Chapter numbering carries on as before, and your manuscript keeps its parts so you can switch them back on.', ex: () => page(stitle('Contents', '<div class="toc"><div><span>1. The Weaver’s House</span><i></i><b>12</b></div><div><span>2. Letters Home</span><i></i><b>14</b></div><div><span>3. The Shop on the Meir</span><i></i><b>19</b></div></div>')) },
    { k: 'Include or exclude any item', d: 'On the Structure tab, every front section, chapter, interlude and back section has a tick box, and every part has “Part title page”. Untick it to leave that item out of the PDF, the EPUB and the contents. The text stays in your manuscript, chapter numbers close up around it, and you can tick it again at any time.', ex: () => page(stitle('Contents', '<div class="toc"><div><span>1. The Weaver’s House</span><i></i><b>12</b></div><div><span>2. The Shop on the Meir</span><i></i><b>14</b></div></div>')) },
    { k: 'Cover text always fits its band', d: 'Long titles, subtitles, authors, quotes and blurbs wrap to the width of the cover and shrink a little when needed, so text never runs from the light band into the coloured band, over the QR code or onto the barcode box.' },
    { k: 'Part introduction on or off', d: 'On the Structure tab, every part that has extra paragraphs after its subtitle shows an “Introduction page” checkbox. Untick it for parts that need no introduction page: the page and its row in the contents disappear (the text stays in your manuscript).', ex: () => page(stitle('Contents', '<div class="toc"><div><span>Part One – The River</span><i></i><b>11</b></div><div><span>Part Two – The Shop</span><i></i><b>17</b></div></div>')) },
    { k: 'Mini contents in parts', d: 'A part with an introduction lists its own chapters, with sublines and page numbers, at the end of that introduction.',
      ex: () => page(stitle('Introduction', p(T, 'first') + '<div class="mtl">IN THIS PART</div><div class="toc"><div><span>1. The Weaver’s House</span><i></i><b>14</b></div><div class="mtd">Turnhout, 1852</div><div><span>2. Letters Home</span><i></i><b>16</b></div><div class="mtd">1871–1874</div></div>'), { fo: 13 }) },
    { k: 'Index of bold names', d: 'Collects every **bold** name or term from the chapters into an index at the back, in two columns, with page numbers in the PDF and chapter links in the EPUB.',
      ex: () => page(stitle('Index', '<div class="ix"><div><b class="ixl">C</b><div>Claes, Mathilde <b>14, 16</b></div><b class="ixl">V</b><div>Verhulst, Frans <b>21</b></div><div>Verhulst, Louise <b>21, 22</b></div></div><div><div>Verhulst, Pieter <b>9, 14, 16</b></div><b class="ixl">W</b><div>Wilde, Hendrik de <b>15</b></div></div></div>'), { fo: 27 }) },
    { k: 'Sort by surname', d: 'Names are filed under the surname: “Anna van der Berg” becomes “van der Berg, Anna”. The surname starts at a particle such as van, de, der or von, otherwise it is the last word.',
      ex: () => `<table class="gt"><tr><th>In the text</th><th>In the index</th></tr><tr><td>Pieter Verhulst</td><td>Verhulst, Pieter</td></tr><tr><td>Hendrik de Wilde</td><td>de Wilde, Hendrik</td></tr><tr><td>Anna van der Berg</td><td>van der Berg, Anna</td></tr></table>` },
    { k: 'Hyphenation', d: 'Long words are split at the end of a line so justified text has even word spacing, using the rules of the book’s language.',
      ex: () => spread(page(`<p class="nohy" lang="en">${T} ${T2}</p>`, { tag: 'off', style: 'padding-left:24px;padding-right:24px' }), page(`<p class="hy" lang="en">${T} ${T2}</p>`, { tag: 'on', style: 'padding-left:24px;padding-right:24px' })) },
    { k: 'Clean up old maps', d: 'Turns scanned, yellowed maps (MAP:) into clean black-and-white images: the paper tone and stains go, hand-coloured areas become light grey.',
      ex: () => `<div class="two"><div><div class="ph mapimg old"></div><span>scan</span></div><div><div class="ph mapimg"></div><span>cleaned</span></div></div>` },
    { k: 'Leave out of the index', d: 'Bold phrases that should not become index entries, one per line, for example a bold warning or a bold heading inside a box.' },
    { k: 'Photo sizes', d: 'Width of upright photos, height of two photos side by side, and width of SMALL images, in millimetres.',
      ex: () => `<div class="three">${page(photo(48, '3/4') + cap('58 mm'), { tag: 'portrait width' })}${page('<div class="pair"><div>' + photo(100, '3/4') + '</div><div>' + photo(100, '3/4') + '</div></div>' + cap('66 mm high'), { tag: 'pair height' })}${page('<div class="sig">P. Verhulst</div>' + cap('62 mm'), { tag: 'small' })}</div>` },
    { k: 'Dedication and epigraph', d: 'On a right-hand page of their own after the colophon, centred: the dedication in italics, the epigraph smaller below it.',
      ex: () => page('<div class="ded"><i>For my grandmother, who kept the letters</i><div>Cloth remembers every hand.</div></div>') },
    { k: 'Colophon', d: 'Copyright, publisher, ISBN, printing and typeface, in small type at the foot of the page behind the title page. Without it the page shows © and the author.',
      ex: () => page('<div class="colo">© Anna Verhulst 2026<br>ISBN 978-90-000-0000-0<br>Set in EB Garamond.<br>Printed in Belgium.</div>') },
    { k: 'EPUB description', d: 'The short description that e-readers and online shops show with the book. It is not printed.' }
  ] },
  { group: 'Cover tab', items: [
    { k: 'Classic bands', d: 'Typographic cover in three bands, in the tradition of classic paperbacks: label in the top band, title, rule, subtitle and author in the light middle band, a footer line at the bottom.',
      ex: () => `<div class="two">${cover({})}${back({})}</div>` },
    { k: 'Photo', d: 'The same bands with your photo filling the middle band. Title and label in the top band, subtitle, author and footer in the bottom band, with thin light lines along the photo.',
      ex: () => `<div class="two">${cover({ photo: true })}${back({})}</div>` },
    { k: 'Automatic', d: 'Photo style when a cover photo is set, classic bands when not.' },
    { k: 'Colours', d: 'Band: top and bottom bands. Text on band: label, footer, quote and photo-cover texts. Middle band: the light band on the classic front and on the back. Text on middle: title, author and blurb. The swatches are quick picks for the band. Next to each colour box you can type or paste a colour code (#2f4858, 2f4858 or #fa0); an invalid code is outlined in red and ignored.',
      ex: () => `<div class="three">${cover({ band: '#2f4858' })}${cover({ band: '#e8762c', mid: '#f4ecd8' })}${cover({ band: '#2e6b4f' })}</div>` },
    { k: 'Cover photo and crop', d: 'Choose a photo (landscape works best, at least 1800 px wide). The sliders move the crop left–right and top–bottom when the photo does not fit the band exactly.',
      ex: () => `<div class="three">${cover({ photo: true, pos: '50% 0%' })}${cover({ photo: true, pos: '50% 50%' })}${cover({ photo: true, pos: '50% 100%' })}</div>` },
    { k: 'Band height', d: 'With a cover photo, the coloured bands above and below it can be made thinner, down to 0% so the photo fills the whole cover. The title and author keep their place; where they now sit on the photo, a soft shade of the band colour keeps them readable (untick it to switch that off).',
      ex: () => `<div class="three">${cover({ photo: true })}${cover({ photo: true, pos: '50% 30%' })}${cover({ photo: true, pos: '50% 70%' })}</div>` },
    { k: 'Subtitles on the cover', d: 'The cover can take over the Subtitle and Second subtitle of the Book tab: only the second one if there is one (the default), both, either one alone, or none. Both appear under the title, the second in smaller type. Edit them on the Book tab and the cover follows. The back cover has the same choice (off by default) with its own position slider.' },
    { k: 'Show or hide cover text', d: 'If your cover picture already contains the title, the author or other lines, untick them under “Show on the front cover”. On the back, the quote, the blurb and the QR code can be switched off the same way. Nothing is deleted: the text stays in your settings and comes back when you tick it again.' },
    { k: 'Back cover bands, picture and text position', d: 'The back cover has its own band height (0% removes the bands) and an optional picture that fills the middle. The sliders move the quote and the blurb up or down. Text that no longer sits on its own plain area gets a soft panel behind it so it stays readable; untick that option to go without.' },
    { k: 'Label and footer', d: 'Small spaced capitals: the label above the title (“A family history”, “A novel”), the footer at the bottom (series, publisher, parts).',
      ex: () => `<div class="two">${cover({ label: 'A NOVEL', footer: 'HARBOUR BOOKS' })}${cover({ label: 'A FAMILY HISTORY', footer: 'VOLUME ONE' })}</div>` },
    { k: 'Title broken over lines', d: 'Decide yourself where a long cover title breaks, one line per row. Leave it empty to let the title wrap by itself.',
      ex: () => `<div class="two">${cover({ title: 'THE WEAVERS OF THE KEMPEN AND THE SCHELDT' })}${cover({ title: 'THE WEAVERS<br>OF THE KEMPEN<br>AND THE SCHELDT' })}</div>` },
    { k: 'Quote and blurb', d: 'The back cover: a quote in italics in the top band, the blurb justified in the middle band. Leave an empty line between blurb paragraphs.',
      ex: () => back({}) },
    { k: 'QR code', d: 'A web address printed as a QR code at the bottom of the back cover, with a short line of text beside it.',
      ex: () => back({ qr: true }) },
    { k: 'Covers in the PDF', d: 'On: the PDF opens with the front cover and ends with the back cover, the body is padded to an even number of pages, and the viewer shows “Cover”, 1, 2, 3 … “Back cover”. Off: the PDF holds only the inside pages, which is what most printers want, with the cover supplied separately.' }
  ] },
    { group: 'Editing in the page viewer', intro: 'In the Pages view you can change the book from the pages themselves. Click a page to select it; the buttons under the page slider then work on that page. Every change goes into your manuscript text, so it appears in the PDF and the EPUB; the pages themselves update after a rebuild.', items: [
    { k: 'Select items', d: 'Switch this on and every text block, heading and picture on the page gets an outline (blue for text, purple for a heading, green for a picture). Click an item to select it, click again to deselect; select as many as you like, also on other pages. Then use Remove selected (or the Delete key) to take them out of the manuscript, or Edit selected for one item. Hover an item to see which manuscript text it is. Removing a heading removes its whole chapter or section, and a part heading removes the part with its chapters. Pictures are matched to their lines in the manuscript by their order on the page; check the hover text if a page has several.' },
    { k: 'Edit text', d: 'Opens the paragraphs that start on the selected page in a small editor, in the manuscript’s markdown (**bold**, *italic*, headings). Switch to “Whole section” to see the whole chapter, including a paragraph that began on the page before. Save, or Save and rebuild PDF.' },
    { k: 'Delete page', d: 'Removes everything on the selected page from the manuscript: its text, pictures and the footnotes that belong to them. A paragraph that runs over to a neighbouring page is removed whole. A chapter heading is kept (use Remove chapter for that), so a page that holds only a heading is not deleted. The pages close up after a rebuild.' },
    { k: 'Remove page text', d: 'Deletes the paragraphs that start on the selected page. A paragraph that carries on from the previous page is not removed; use Edit text for that. Chapter or part opening pages are removed with the buttons below.' },
    { k: 'Remove chapter, section or part', d: 'Removes the whole chapter or section the selected page belongs to, or, with “Remove part”, the part it sits in with all its chapters. Chapter numbers close up after a rebuild.' },
    { k: 'Undo', d: 'Every change from the viewer can be undone, one step at a time (up to 30). Title page, contents and index pages are generated from your settings, so they are changed on the Book tab instead.' }
  ] },
{ group: 'Print on Amazon KDP', intro: 'The KDP tab walks you through five steps. KDP prints a paperback from two files: the inside pages (no cover) and a cover as wide as back, spine and front together.', items: [
    { k: 'Prepare this book for KDP', d: 'Turns on the KDP steps. The PDF then holds only the inside pages (KDP wants the cover as a separate file), the Print cover view appears next to Pages, and the Kindle e-book cover is used inside the EPUB.' },
    { k: 'Step 1: Size and paper', d: 'Pick the trim size (also available under Page size on the Book tab): 5x8, 5.25x8, 5.5x8.5, 6x9, 6.14x9.21, 6.69x9.61, 7x10, 7.44x9.69, 7.5x9.25, 8x10, 8.25x6, 8.25x8.25, 8.5x8.5, 8.5x11 or A4. The check in step 1 tells you when the size is not one of them and offers the nearest.' },
    { k: 'Paperback or hardcover', d: 'Paperback covers have a 3.2 mm bleed. A case-laminate hardcover is printed on a larger sheet: the cover wraps 15 mm round the boards, text stays 16 mm from the edge and 10 mm from the spine (the hinge), and the spine panel is 4.8 mm wider than the spine itself. Hardcover takes 75 to 550 pages, in 5.5x8.5, 6x9, 6.14x9.21, 7x10 or 8.25x11 inches, on white or cream paper in black ink or on white in premium colour (no standard colour). Check the figures with KDP’s own cover calculator before you print.' },
    { k: 'Printing cost', d: 'The estimate uses KDP’s euro table for Amazon.de, .es, .fr, .it, .nl, .ie and .com.be, so it is right for Amazon.com.be. A cost is a fixed amount plus a rate per page (for example €0.75 + €0.012 a page for black ink on a regular trim; large trims, wider than 6.12 in or taller than 9 in, cost more). Very short books pay a flat amount. Shipping, VAT on author copies and other marketplaces are not included. Fill in your list price to see the royalty: 60% of the price without 6% VAT, minus the printing cost. KDP can change its prices, so the final figure is the one KDP shows.' },
    { k: 'Paper', d: 'The paper decides how thick every page is, and so how wide the spine is: white 0.002252 in per page, cream 0.0025 in, standard colour 0.002252 in, premium colour 0.002347 in. Cream and colour also change the most pages KDP can print.',
      ex: () => `<div class="two">${back({})}${cover({})}</div>` },
    { k: 'Number of pages', d: 'The number of pages of the inside PDF. Leave it empty to use the count of the last build; type it in to design the cover before the book is built (until then the spine is drawn for 200 pages and marked as an estimate).' },
    { k: 'Step 2: Inside pages', d: 'Builds the PDF without covers and shows its page count, size and whether the page numbers are stable. Download it as the file you upload for “Paperback content”.' },
    { k: 'Step 3: Cover', d: 'A diagram with the real measurements (back, spine, front, bleed, whole sheet), the settings for spine text and barcode, a preview with guides on the right, and the print cover as PDF (upload this) or JPG.' },
    { k: 'Step 4 and 5', d: 'Step 4 makes the EPUB and the Kindle cover image. Step 5 lists which file goes where on kdp.amazon.com, with the real file names.' },
    { k: 'Bleed, trim and safe zone', d: 'The cover sheet is 0.125 in (3.2 mm) larger than the finished book on the three outer sides, so colour runs to the edge after cutting. “Show guides” draws the trim line (red), keeps text inside the safe zone (green dashed), shows the spine folds (pink) and the barcode box (blue). The guides are never in the exported file.' },
    { k: 'Spine text', d: 'Title and author, reading from top to bottom, in the band colour’s text colour. KDP allows spine text from 79 pages, and the kit also leaves it out when the spine is too thin to read.' },
    { k: 'Barcode', d: 'KDP adds a white 2 × 1.2 in box with the ISBN barcode at the lower right of the back cover when you do not supply one. The kit keeps that corner free. Add your own barcode as an image on the Manuscript tab and pick it here to place it in that box.' },
    { k: 'KDP check', d: 'After a build: the trim size, the page count against the most KDP prints for that paper and size, and the inside margin against the gutter KDP asks for (9.5 mm up to 150 pages, 12.7 mm up to 300, 15.9 mm up to 500, 19.1 mm up to 700). A button widens the margin for you.' },
    { k: 'Cover files', d: 'Also on the Export tab: front and back as JPG at 300 dpi, the Kindle e-book cover (1600 × 2560 px), and, with KDP on, the print cover as PDF or JPG.' }
  ] },
  { group: 'Extract tab (downloaded app)', intro: 'Reads a scanned or printed book and rebuilds it as a manuscript with the layout marks already in place. Only in the downloaded app; it needs an internet connection the first time to fetch the reader.', items: [
    { k: 'Drop a scanned book', d: 'A PDF (scanned or digital), or photos or scans of the pages, one image per page. Images are read in file-name order, so number them (page-001.jpg, page-002.jpg …).' },
    { k: 'Languages in the book', d: 'Tick every language that occurs in the book. More languages make reading a little slower but recognise words, accents and hyphenation better.' },
    { k: 'From page / To page', d: 'Read only part of the file, for a quick test on a few pages before you read the whole book.' },
    { k: 'Use the PDF’s own text', d: 'A PDF made on a computer already contains its text. Then the text is taken over exactly and quickly, and only pages without text (scans, photos) are recognised.' },
    { k: 'Keep the pictures', d: 'Photos, drawings and maps on the pages are cut out as separate images and placed in the manuscript at the same spot, with the caption printed under them.' },
    { k: 'What is recognised', d: 'Chapter and part titles (with “Chapter 3” and “Part One” labels), sublines, interludes, section headings and dividers, epigraphs, quotations, poems, centred lines, lists, tables, scene breaks, footnotes with their references, pictures with captions, the drop cap and small capitals at chapter openings. Running heads, page numbers and the contents page are left out. The title page, colophon and dedication go into the Book settings; an index at the back becomes the list of index names.' },
    { k: 'What is not recognised', d: 'Italics and bold are not visible to the reader, so add *…* and **…** yourself where they matter. Hand-written pages, very faded print and pages in two columns need more checking.' },
    { k: 'The monk', d: 'Brother Tesseract copies the book while you wait: the progress bar shows how many pages are done and roughly how long it will take. You can stop at any time.' },
    { k: 'Checking the result', d: 'The Scan view shows every page with what was found: headings blue, pictures and captions green, quotes and poems purple, tables olive, index entries pink, footnotes orange, left-out running heads and page numbers struck through, uncertain words outlined in red. Browse with the slider or the arrow keys.' },
    { k: 'Fixing the boxes', d: 'Click a box to change what it is (chapter heading, subheading, picture, caption, quote or poem, table, index entries, footnote, leave out) or to remove it. Delete removes the selected box. Drag the handles to resize it, or drag inside it to move it. Drag on an empty part of the page to draw a new box and pick its kind. A picture box you draw or resize is cut from the page again. The text on the left is rebuilt after every change. Undo steps back, and Reset page goes back to what was found.' },
    { k: 'Uncertain words', d: 'Words the reader was unsure of are outlined in red. Click one, or press “Check uncertain words”, to see it close up (use + and − to zoom). Type the right word and press Enter, or choose Ignore (keep it as read), Remove word, or Skip. “Ignore on this page” and “Ignore all” clear the marks in one go, and “Show them” hides the red outlines.' },
    { k: 'Use as manuscript', d: 'Puts the text on the Manuscript tab, adds the pictures, and fills in the title, author, colophon, dedication and index names that were found. You can still edit the text before or after. Save as .md keeps a copy of the extracted text.' }
  ] },
  { group: 'Building and saving', items: [
    { k: 'Build PDF & EPUB', d: 'Lays out the whole book twice, so that the contents and index have the right page numbers, then writes the PDF and the EPUB. PDF only or EPUB only is quicker when you are checking one of them.' },
    { k: 'Page numbers stable', d: 'Shows whether the second layout pass ended with the same page for every chapter and index entry as expected. It should say yes; if not, build again and tell me.' },
    { k: 'Pages preview', d: 'After a build, the right side shows the book spread by spread: covers alone, then left and right pages as they face each other in print. Use the slider, the buttons or the arrow keys.' },
    { k: 'File name', d: 'Name of the PDF and EPUB, without extension. Empty: made from the title (Salt_and_Linen.pdf).' },
    { k: 'Kit bundle', d: 'A .zip with book.json, the manuscript split into front, part, chapter and back files, and the images. bookmaker.py builds the same book from it, and you can drop it back here to continue later.' },
    { k: 'book.json and Manuscript (.md)', d: 'Just the settings file, or just the text as one markdown file.' }
  ] }
];

// ---------------------------------------------------------------- render
const list = document.getElementById('guideList');
const pop = document.getElementById('gpop');
let n = 0;
for (const g of G) {
  const sec = document.createElement('div'); sec.className = 'sect gsect';
  sec.innerHTML = `<h2>${g.group}</h2>${g.intro ? `<p class="hint">${g.intro}</p>` : ''}`;
  for (const it of g.items) {
    const id = 'g' + (++n);
    const d = document.createElement('div');
    d.className = 'gi' + (it.ex ? ' has-ex' : '');
    d.tabIndex = 0;
    d.dataset.search = (it.k + ' ' + it.d + ' ' + (it.code || '')).toLowerCase();
    d.innerHTML = `<div class="gk">${esc(it.k)}${it.ex ? '<span class="eye" aria-hidden="true">example</span>' : ''}</div><div class="gd">${esc(it.d)}</div>${it.code ? code(it.code) : ''}`;
    d._ex = it;
    sec.append(d);
  }
  list.append(sec);
}

const narrow = () => window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(hover: none)').matches;
let current = null;
function show(el) {
  const it = el._ex;
  if (!it || !it.ex) { hide(); return; }
  if (narrow()) {
    const open = el.querySelector('.gex');
    document.querySelectorAll('.gex').forEach(x => x.remove());
    if (open) return;
    const box = document.createElement('div'); box.className = 'gex'; box.innerHTML = it.ex();
    el.append(box);
    return;
  }
  if (current === el && !pop.hidden) return;
  current = el;
  pop.innerHTML = `<div class="gpt">${esc(it.k)}</div>${it.ex()}`;
  pop.hidden = false;
  const r = el.getBoundingClientRect(), bench = document.querySelector('.bench').getBoundingClientRect();
  const ph = pop.offsetHeight;
  pop.style.left = (bench.right + 14) + 'px';
  pop.style.top = Math.max(64, Math.min(window.innerHeight - ph - 12, r.top - 10)) + 'px';
}
function hide() { pop.hidden = true; current = null; }
list.addEventListener('mousemove', e => { const el = e.target.closest('.gi'); if (el && !narrow()) show(el); });
list.addEventListener('mouseleave', () => { if (!narrow()) hide(); });
list.addEventListener('focusin', e => { const el = e.target.closest('.gi'); if (el && !narrow()) show(el); });
list.addEventListener('click', e => { const el = e.target.closest('.gi'); if (el && narrow()) show(el); });
list.addEventListener('keydown', e => { const el = e.target.closest('.gi'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); show(el); } if (e.key === 'Escape') hide(); });
document.getElementById('panel-guide').addEventListener('scroll', hide, { passive: true });
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', hide));

const q = document.getElementById('guideSearch');
q.addEventListener('input', () => {
  const s = q.value.trim().toLowerCase();
  document.querySelectorAll('.gsect').forEach(sec => {
    let any = false;
    sec.querySelectorAll('.gi').forEach(gi => { const m = !s || gi.dataset.search.includes(s); gi.hidden = !m; any = any || m; });
    sec.hidden = !any;
  });
  hide();
});
})();
