# 02 Content and claims

## Voice
Plain, specific, professional. Write for a procurement manager with 30 seconds.
Short sentences. Concrete nouns (product categories, countries, standards, steps).
Must read as human-written: strip AI markers (delve, landscape, "in today's world",
"it's important to note", triads of adjectives, closing summaries that repeat the page).

## Carried over from the Aug 2026 spec (still binding)
- NJMC is NOT a manufacturer. Never write or imply that it manufactures or produces anything.
- No product names, molecule names, CAS numbers or catalogue items unless they are in BRAND.md,
  docs/05 or already on the live site.
- No numbers except those in BRAND.md or docs/05 (prices, "three years"). No awards,
  memberships, partnerships, client counts, tonnes, percentages or delivery times.
- Contact: only the emails, WhatsApp numbers and WeChat link in BRAND.md. Location:
  Jianye District, Nanjing, Jiangsu, China only.
- Never open sentences with Moreover, Furthermore, Additionally, "In today's", "In an era of",
  "It is important to note that", "When it comes to". No "not just X, but Y".
- Avoid: leverage (verb), robust, seamless, delve, navigate and landscape (figurative),
  unlock, elevate, empower, streamline, cutting-edge, state-of-the-art, comprehensive
  suite, tailored solutions, your trusted partner, trusted ally.
- Regulatory specifics (requirements, fees, timelines) in articles stay [OPEN] for the owner.

## Confidentiality (owner's absolute rule)
- Never publish client names, supplier names, third-party logos, supplier documents,
  price lists or certificates from supplier files, in text, images, alt text, file
  names or captions.
- Photos of the owner and team: allowed, always retouched first, never as shot.
- Exhibition photos: allowed after retouching, with every legible third-party name
  cropped out; drop any photo where a name cannot be removed.

## Hard rules (CI enforces what it can)
- No em dashes or en dashes in any language. Use commas, colons, full stops, parentheses.
- No exclamation marks. No hype words (revolutionary, world-class, leading, best-in-class,
  cutting-edge, unparalleled, seamless). No fake urgency or scarcity.
- Every statistic: visible source and year, or it is cut.
- No invented facts, people, clients, partners, logos, numbers or testimonials.
- No testimonials or third-party logos at launch. If the owner later supplies one with
  written permission, Testimonial.permissionOnFile must be true to publish.
- `[OPEN` in any published document fails the build.

## Certification language (medical supplies)
- Certifications belong to the PRODUCT, never to NJMC. "We source CE-marked
  consumables", never "NJMC is CE certified".
- Never "FDA certified" (FDA clears, approves or registers depending on the product;
  it does not certify). Never a blanket claim that "all products are CE / FDA / SFDA".
- State certifications per product or category only when a document is on file:
  e.g. "CE marked. Certificate available on request." Store the document in the CMS
  (Certificate collection, private file, visible on request only unless owner says public).

## NJMC verification service
- The owner's words set the tone: "We don't certify. We just verify and check."
- Allowed: verify, verification, check, independent review, due diligence, findings report.
- Never, in any language: certify, certified, certification by NJMC, accredited,
  approves, approval (by NJMC), pass/fail, guaranteed, NON-COMPLIANT.
- NJMC is not a notified body; say so plainly on /verification/ and /trust/.
- The fee is payable regardless of outcome and never tied to a later sourcing order.
- Disclaimer (APPROVED by the owner 27 Sep 2026; a lawyer check before selling is still recommended):
  "Verification is an independent review of the goods, documents and evidence available
  at the time of review. It supports, and does not replace, your own supplier
  qualification and regulatory obligations."

## PharmaTrust (inside the NJMC site)
- Authority: PharmaTrust Brand Manual v3 and the claims gates in GitHub
  Qaria007/PharmaTrust. They override this file on any conflict.
- Name: "PharmaTrust COA Validator". Tagline verbatim: "Certificate analysis you can defend."
  Reports are an "Automated Analysis" or an "Expert-Reviewed Analysis".
- Never on PharmaTrust copy: verifies, certifies, approves, pharmacopoeia-grade,
  regulatory approval, accuracy or detection rates, market statistics, Pharmacopoeial,
  compliance technology, pass/fail. (NJMC's own verification service may use "verify";
  PharmaTrust copy may not. Keep the two apart on the page.)
- Pricing and plans: link to pharmatrust.tech, never restate them on the NJMC site.

## LNJC (inside the NJMC site)
- Only facts from BRAND.md and LNJC's own published sites. Yemen only. No client names.

## Old-copy fixes to carry over
- "disposals" -> "disposables"; remove "etc..." everywhere; fix "competiive".
- Replace "team of highly educated medical experts" with named people and
  credentials, or remove it.
- Title tags: 50 to 60 characters, unique, pattern "<Page topic> | NJMC Medical Supplies".

## claims-lint (build it in Phase 3)
`scripts/claims-lint.ts`: scans all published CMS content and code strings for the
forbidden list, dashes (U+2014, U+2013), "!", "[OPEN", and hype words. Fails CI with
file, field and match. Arabic list included once the Arabic review provides it.
