"""One-off import of the live static site (~/njmc-site) into src/content/{en,ar}/<slug>.json.
Each file: {"title", "description", "html", "jsonld"}. Body = everything between the site nav
and the footer, breadcrumb and scripts removed, links rewritten to the new URL scheme
(docs/DECISIONS.md 27 Sep "Keep the live slug stems"). Facts superseded by BRAND.md are fixed
in fix() so the change is visible and repeatable."""
import html, json, pathlib, re, sys

SRC = pathlib.Path.home() / 'njmc-site'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'content'

def new_path(href: str) -> str:
    if href.startswith(('http', 'mailto:', 'tel:', '#')) or not href.startswith('/'):
        m = re.match(r'https?://(www\.)?njmcmedicsupp\.com(/.*)?$', href)
        if not m:
            return href
        href = m.group(2) or '/'
    path, _, frag = href.partition('#')
    frag = '#' + frag if frag else ''
    if path in ('/', '/index.html'):
        return '/' + frag
    if path in ('/index-ar.html', '/ar/', '/ar/index.html'):
        return '/ar/' + frag
    ar = path.startswith('/ar/')
    slug = path[4:] if ar else path[1:]
    slug = slug.removesuffix('.html').strip('/')
    if slug.startswith('insights-'):
        slug = 'insights/' + slug[len('insights-'):]
    if slug.startswith('drqaria'):
        return 'https://drqaria.njmcmedicsupp.com/' + frag
    return ('/ar/' if ar else '/') + slug + '/' + frag

MARKETS_EN = r'China, Yemen, the (?:wider )?Middle East,? (?:and|&amp;|&) the (?:United Kingdom|UK)'
MARKETS_AR = r'الصين واليمن والشرق الأوسط والمملكة المتحدة'

def fix(s: str, ar: bool) -> str:
    # BRAND.md supersedes: head office and markets (docs/DECISIONS.md 26 Sep).
    s = s.replace('Pukou District', 'Jianye District')
    s = s.replace('مقاطعة بوكو', 'حي جيانيه').replace('حي بوكو', 'حي جيانيه').replace('بوكو', 'جيانيه')
    s = re.sub(r'(?:in|across) ' + MARKETS_EN, 'internationally', s)
    s = re.sub(MARKETS_EN, 'Buyers in any country', s)
    s = re.sub(r'في ' + MARKETS_AR, 'حول العالم', s)
    s = re.sub(MARKETS_AR, 'مشترون في أي دولة', s)
    s = s.replace('الصين، اليمن، منطقة الشرق الأوسط، والمملكة المتحدة', 'مشترون في أي دولة')
    # Owner's name as published: "Dr. Qaria" (owner rule), Arabic spelling قاريه (BRAND.md:
    # never مجيد, never قارية). Title per BRAND.md, not the old "Business Manager".
    s = s.replace('Led by Dr. Majjid A. Qaria, PhD, Business Manager', 'Led by Dr. Qaria, Founder and Technical Director')
    s = re.sub(r'Dr\. Majj?id A\. Qaria', 'Dr. Qaria', s)
    s = s.replace('بقيادة الدكتور مجيد أ. قارية، مدير الأعمال', 'بقيادة الدكتور قاريه، المؤسس والمدير الفني')
    s = re.sub(r'(د\.|الدكتور) (?:ماجد|مجيد) أ\. قارية', r'\1 قاريه', s)
    s = s.replace('قارية', 'قاريه')
    # LNJC per BRAND.md: a pharmaceutical company operating only in Yemen. The Arabic line
    # is dropped rather than rewritten (new Arabic waits for review, docs/arabic-review.md).
    s = s.replace('<p>A wholesale distributor of pharmaceuticals and medical supplies, sourcing from internationally certified manufacturers for markets across the region.</p>',
                  '<p>A pharmaceutical company operating in Yemen: APIs, IVF products, medicines and endotoxin testing. A sister company within the NJMC group.</p>')
    s = s.replace('<p>موزع جملة للأدوية والمستلزمات الطبية، يورّد من مصنّعين معتمدين دولياً لأسواق المنطقة.</p>', '')
    # Style rules (docs/02): no "empower", no "tailored solutions".
    s = s.replace('empowers medical institutions with tailored solutions and support, sourcing', 'supports medical institutions by sourcing')
    s = s.replace("Tailored solutions for medical institutions' needs", "Consultancy for medical institutions")
    s = s.replace('we are a team of highly educated medical experts committed to serving hospitals and medical care facilities. We empower their services',
                  'we serve hospitals and medical care facilities. We support their services')
    s = s.replace('etc...', '').replace('etc…', '')
    s = s.replace('disposals', 'disposables').replace('competiive', 'competitive')
    # Dashes used as ranges in the old hours line.
    s = re.sub(r'\s*[\u2013\u2014]\s*', ' to ' if not ar else ' إلى ', s)
    # Hidden notes to the owner and build comments do not ship.
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    # Confidentiality: no testimonials (client names) at launch; no third-party stock photos.
    s = re.sub(r'<section id="testimonials".*?</section>', '', s, flags=re.S)
    s = re.sub(r'<img[^>]*src="https://images\.unsplash\.com[^"]*"[^>]*>', '', s)
    # The old "+5 markets" stat counted the withdrawn market list.
    s = re.sub(r'<div[^>]*>\s*<div class="num">\+5</div>\s*<p>.*?</p>\s*</div>', '', s, flags=re.S)
    return s

def extract(path: pathlib.Path, ar: bool):
    h = path.read_text('utf-8')
    title = html.unescape(re.search(r'<title>(.*?)</title>', h, re.S).group(1).strip())
    d = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', h)
    desc = html.unescape(d.group(1)) if d else ''
    jsonld = [m for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)]
    body = h[h.find('<body'):]
    start = body.find('</nav>') + len('</nav>')
    end = body.rfind('<footer')
    main = body[start:end]
    main = re.sub(r'<script\b.*?</script>', '', main, flags=re.S)
    main = re.sub(r'<div class="breadcrumb".*?</div>', '', main, flags=re.S)
    main = re.sub(r'href="([^"]+)"', lambda m: 'href="%s"' % new_path(html.unescape(m.group(1))), main)
    main = re.sub(r'\n\s*\n+', '\n', main).strip()
    lds = []
    for j in jsonld:
        j = re.sub(r'https://njmcmedicsupp\.com(/[^"]*)', lambda m: 'https://njmcmedicsupp.com' + new_path(m.group(1)), j)
        j = re.sub(r'\s*"areaServed"\s*:\s*(\[[^\]]*\]|"[^"]*"|\{[^}]*\})\s*,?', '', j)
        j = j.replace('"name": "Majjid A. Qaria"', '"name": "Qaria"')
        lds.append(fix(j, ar))
    return {'title': fix(title, ar), 'description': fix(desc, ar), 'html': fix(main, ar), 'jsonld': lds}

pages = sorted(p for p in SRC.rglob('*.html') if p.parts[len(SRC.parts)] not in ('.automation', 'drqaria', '.git'))
for p in pages:
    rel = p.relative_to(SRC).as_posix()
    ar = rel.startswith('ar/') or rel == 'index-ar.html'
    if rel in ('index.html', 'index-ar.html', '404.html'):
        slug = 'home' if rel != '404.html' else '404'
    else:
        slug = (rel[3:] if rel.startswith('ar/') else rel).removesuffix('.html')
        if slug.startswith('insights-'):
            slug = 'insights__' + slug[len('insights-'):]
    out = OUT / ('ar' if ar else 'en') / (slug + '.json')
    data = extract(p, ar)
    if slug == 'verification' and not ar:
        # Approved by the owner 27 Sep 2026 (BRAND.md, docs/02).
        note = ('<div class="callout"><p>Verification is an independent review of the goods, documents and evidence '
                'available at the time of review. It supports, and does not replace, your own supplier qualification '
                'and regulatory obligations.</p><p>The fee is payable regardless of outcome and is never tied to a '
                'later sourcing order.</p></div>')
        at = data['html'].find('<div class="faq"')
        at = at if at >= 0 else data['html'].find('<section class="alt-bg"')
        data['html'] = data['html'][:at] + note + data['html'][at:] if at >= 0 else data['html'] + note
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), 'utf-8')
    print(out.relative_to(OUT))
