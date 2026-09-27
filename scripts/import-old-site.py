"""One-off import of the live static site (~/njmc-site) into src/content/{en,ar}/<slug>.json.
Each file: {"title", "description", "html", "jsonld"}. Body = everything between the site nav
and the footer, breadcrumb and scripts removed, links rewritten to the new URL scheme
(docs/DECISIONS.md 27 Sep "Keep the live slug stems"). Facts superseded by BRAND.md are fixed
in fix() so the change is visible and repeatable."""
import html, json, os, pathlib, re, sys

SRC = pathlib.Path(os.environ.get('OLD_SITE_DIR', pathlib.Path.home() / 'njmc-site'))
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
    # Claims review (Fable, 27 Sep 2026): certification belongs to the product, no invented
    # numbers, no scarcity, no go/no-go verdicts, no unapproved price terms. Arabic is only
    # shortened, never rewritten (docs/arabic-review.md).
    R = [
        ('<h3>Trusted Partnerships</h3>\n        <p>Quality medical supplies with the highest certification standards, including CE, FDA, and SFDA.</p>',
         '<h3>Product Certification</h3>\n        <p>Consumables and devices sourced with the CE, FDA or SFDA documentation the destination market requires.</p>'),
        ('We supply medical institutions with a wide range of medical consumables certified by CE, FDA, SFDA, and other recognized quality control standards.',
         'We supply medical consumables carrying CE marking, FDA clearance or registration, or SFDA registration as required by the destination market. Certificates available on request.'),
        ('Our team of medical experts helps hospitals and medical facilities source the required equipment, complete with the necessary certifications.',
         'We help hospitals and medical facilities source the required equipment, with the certification documents the destination market requires.'),
        ('We offer the best medical supplies from the Asian market and consultancy services tailored for',
         'We source medical supplies from China and India and offer consultancy services for'),
        (' in a competitive healthcare landscape.', '.'),
        ('site identity, red flags, and a clear go, caution or no-go.',
         'site identity, and a written findings report listing red flags and gaps.'),
        ('Introductory rates apply to the first ten engagements. Standard rates are USD 300, 500 and 750. Retainers are available where verification is needed regularly.',
         'These are introductory rates. Standard rates are USD 300, 500 and 750.'),
        ('and we have done so for many customers.', 'and have done so for three years.'),
        ('<h3>PharmaTrust</h3>', '<h3>PharmaTrust by NJMC</h3>'),
        ('<h3>PharmaTrust, a product of NJMC</h3>', '<h3>PharmaTrust by NJMC</h3>'),
        ('alt="PharmaTrust: certificate analysis you can defend"', 'alt="PharmaTrust COA Validator: Certificate analysis you can defend."'),
        # Arabic: shorten only.
        ('<h3>شراكات موثوقة</h3>\n        <p>إمدادات طبية عالية الجودة تحمل أعلى معايير الاعتماد، بما في ذلك CE وFDA وSFDA.</p>', ''),
        ('من المستهلكات الطبية المعتمدة وفق معايير CE وFDA وSFDA وغيرها من معايير الجودة المعترف بها.', 'من المستهلكات الطبية.'),
        ('نحن فريق من الخبراء الطبيين المؤهلين تأهيلاً عالياً، ملتزمون بخدمة', 'نحن ملتزمون بخدمة'),
        ('المؤشرات التحذيرية، وتوصية واضحة بالمضي أو التريث أو الرفض.', 'والمؤشرات التحذيرية.'),
        ('تسري الأسعار التعريفية على أول عشرة تكليفات. والأسعار القياسية هي 300 و500 و750 دولاراً. وتتوفر عقود دورية لمن يحتاج التحقق بشكل منتظم.',
         'والأسعار القياسية هي 300 و500 و750 دولاراً.'),
        ('، وقد فعلنا ذلك لعملاء كثيرين.', '.'),
    ]
    for a, b in R:
        s = s.replace(a, b)
    s = re.sub(r'<div class="about-float-card">\s*<div class="num">5\+</div>\s*<p>.*?</p>\s*</div>', '', s, flags=re.S)
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
    if slug == 'verification':
        # Approved by the owner 27 Sep 2026 (BRAND.md, docs/02).
        note = ('<div class="callout"' + (' dir="ltr" lang="en"' if ar else '') + '><p>Verification is an independent review of the goods, documents and evidence '
                'available at the time of review. It supports, and does not replace, your own supplier qualification '
                'and regulatory obligations.</p><p>The fee is payable regardless of outcome and is never tied to a '
                'later sourcing order.</p></div>')
        at = data['html'].find('<div class="faq"')
        at = at if at >= 0 else data['html'].find('<section class="alt-bg"')
        data['html'] = data['html'][:at] + note + data['html'][at:] if at >= 0 else data['html'] + note
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), 'utf-8')
    print(out.relative_to(OUT))
