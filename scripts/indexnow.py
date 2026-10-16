"""Tell Bing (and the other IndexNow engines) about NJMC pages.

Usage:
  python3 scripts/indexnow.py            # every URL in the live sitemap
  python3 scripts/indexnow.py URL [URL]  # only these URLs

The key file public/<key>.txt must stay on the site: IndexNow fetches it to confirm
the submission comes from the site owner. No account is needed (added 16 Oct 2026,
because NJMC had no Bing Webmaster account and Bing showed no NJMC pages).
"""
import json, pathlib, re, sys, urllib.request

SITE = "https://njmcmedicsupp.com"
KEY = next(p.stem for p in (pathlib.Path(__file__).resolve().parent.parent / "public").glob("*.txt")
           if re.fullmatch(r"[0-9a-f]{32}", p.stem))

def sitemap_urls():
    with urllib.request.urlopen(SITE + "/sitemap.xml", timeout=60) as r:
        return re.findall(r"<loc>(.*?)</loc>", r.read().decode())

urls = sys.argv[1:] or sitemap_urls()
body = json.dumps({"host": "njmcmedicsupp.com", "key": KEY, "keyLocation": f"{SITE}/{KEY}.txt", "urlList": urls}).encode()
req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, method="POST",
                             headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=60) as r:
    print("IndexNow:", r.status, "for", len(urls), "URLs")
