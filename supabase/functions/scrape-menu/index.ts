// Scrape a restaurant website and extract a structured menu using Groq.
// Strategy:
//   1. Fetch the given URL.
//   2. Discover menu-related sub-pages (links containing "menu", "food",
//      "dishes", "carte", etc.) and fetch a handful of them in parallel.
//   3. Strip each page to plain-text candidates + a fallback full-text body.
//   4. Send the merged corpus to Groq via tool-calling for clean JSON.
//   5. Persist the structured items to Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const PDF_EXT = /\.pdf(\?|#|$)/i;
const IMG_EXT = /\.(jpe?g|png|webp)(\?|#|$)/i;
const MAX_BINARY_BYTES = 12 * 1024 * 1024; // 12MB cap per file

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Keywords that suggest a link points at a menu / food listing page.
const MENU_LINK_KEYWORDS = [
  "menu", "menus", "food", "dishes", "dining", "carte", "a-la-carte",
  "alacarte", "lunch", "dinner", "breakfast", "brunch", "drinks",
  "beverages", "desserts", "specials", "order", "eat",
];

interface RawCandidate {
  text: string;
  source: string;
}

interface DishImageHint {
  /** Lower-cased, normalized dish name (used as lookup key). */
  nameKey: string;
  /** Original dish name as it appeared on the page. */
  name: string;
  /** Absolute, https-preferred image URL. */
  imageUrl: string;
}

/** Normalize a dish name for fuzzy matching (lowercase, strip punctuation/extra spaces). */
function normalizeDishName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url: string): string {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return await res.text();
}

/**
 * Find links on a page that look like they lead to menu content.
 * Resolves them against the page's base URL and dedupes.
 */
/**
 * Try to find the restaurant logo in the HTML. Strategy:
 *  1. og:image / twitter:image meta tags (often the brand image).
 *  2. <link rel="icon"> / apple-touch-icon (high-res favicon).
 *  3. <img> elements whose src/alt/class/id mention "logo" or "brand".
 *  4. Fallback: /favicon.ico at the site root.
 * Returns an absolute URL or null.
 */
function findLogoUrl(html: string, baseUrl: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return null;
  const base = new URL(baseUrl);

  const resolve = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const v = raw.trim();
    if (!v || v.startsWith("data:")) return null;
    try {
      return new URL(v, base).toString();
    } catch {
      return null;
    }
  };

  // 1. Logo-ish <img> tags first — usually the actual brand mark.
  const imgs = doc.querySelectorAll("img") as unknown as ArrayLike<Element>;
  let bestLogo: string | null = null;
  let bestScore = 0;
  Array.from(imgs).forEach((node: Element) => {
    const img = node as Element;
    const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
    if (!src) return;
    const alt = (img.getAttribute("alt") || "").toLowerCase();
    const cls = (img.getAttribute("class") || "").toLowerCase();
    const id = (img.getAttribute("id") || "").toLowerCase();
    const parentCls = ((img.parentElement?.getAttribute("class") || "") as string).toLowerCase();
    const haystack = `${src.toLowerCase()} ${alt} ${cls} ${id} ${parentCls}`;
    let score = 0;
    if (haystack.includes("logo")) score += 5;
    if (haystack.includes("brand")) score += 3;
    if (haystack.includes("site-identity") || haystack.includes("site-title")) score += 2;
    if (alt.includes("home")) score += 1;
    // Penalize obvious non-logo images
    if (haystack.includes("hero") || haystack.includes("banner") || haystack.includes("cover")) score -= 2;
    if (score > bestScore) {
      const resolved = resolve(src);
      if (resolved && /\.(svg|png|jpe?g|webp|gif|ico)(\?|$)/i.test(resolved)) {
        bestScore = score;
        bestLogo = resolved;
      }
    }
  });
  if (bestLogo && bestScore >= 3) return bestLogo;

  // 2. og:image / twitter:image
  const ogImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="og:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute("content");
  const ogResolved = resolve(ogImage);
  if (ogResolved) return ogResolved;

  // Fall back to whichever logo-ish img we found, even if score was low.
  if (bestLogo) return bestLogo;

  // 3. apple-touch-icon (usually 180px+ and clean)
  const apple = doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ||
    doc.querySelector('link[rel="apple-touch-icon-precomposed"]')?.getAttribute("href");
  const appleResolved = resolve(apple);
  if (appleResolved) return appleResolved;

  // 4. <link rel="icon"> (prefer largest sizes)
  const iconLinks = doc.querySelectorAll('link[rel~="icon"]') as unknown as ArrayLike<Element>;
  let bestIcon: string | null = null;
  let bestIconSize = 0;
  Array.from(iconLinks).forEach((node: Element) => {
    const link = node as Element;
    const href = link.getAttribute("href");
    if (!href) return;
    const sizes = link.getAttribute("sizes") || "";
    const sz = parseInt(sizes.split("x")[0], 10) || 16;
    if (sz > bestIconSize) {
      const r = resolve(href);
      if (r) {
        bestIconSize = sz;
        bestIcon = r;
      }
    }
  });
  if (bestIcon) return bestIcon;

  // 5. Final fallback: /favicon.ico
  return resolve("/favicon.ico");
}

function discoverMenuLinks(html: string, baseUrl: string): {
  pages: string[];
  pdfs: string[];
  images: string[];
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { pages: [], pdfs: [], images: [] };

  const base = new URL(baseUrl);
  const pageScores = new Map<string, number>();
  const pdfScores = new Map<string, number>();
  const imageScores = new Map<string, number>();

  doc.querySelectorAll("a[href]").forEach((node) => {
    const a = node as Element;
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      return;
    }

    if (resolved.hostname !== base.hostname) return;

    const haystack = (
      (a.textContent || "") + " " + resolved.pathname + " " + (a.getAttribute("title") || "")
    ).toLowerCase();

    let score = 0;
    for (const kw of MENU_LINK_KEYWORDS) {
      if (haystack.includes(kw)) score += kw === "menu" ? 3 : 1;
    }
    if (score === 0) return;

    const key = resolved.origin + resolved.pathname + resolved.search;
    if (PDF_EXT.test(resolved.pathname)) {
      pdfScores.set(key, Math.max(pdfScores.get(key) ?? 0, score + 2));
    } else if (IMG_EXT.test(resolved.pathname)) {
      imageScores.set(key, Math.max(imageScores.get(key) ?? 0, score + 1));
    } else if (!/\.(gif|svg|mp4|zip|doc|docx)$/i.test(resolved.pathname)) {
      const k = resolved.origin + resolved.pathname;
      pageScores.set(k, Math.max(pageScores.get(k) ?? 0, score));
    }
  });

  // Also pick up <img> tags whose alt/src/class strongly suggest a menu board image.
  doc.querySelectorAll("img").forEach((node) => {
    const img = node as Element;
    const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    if (!src) return;
    let resolved: URL;
    try {
      resolved = new URL(src, base);
    } catch {
      return;
    }
    if (!IMG_EXT.test(resolved.pathname)) return;
    const haystack = (
      (img.getAttribute("alt") || "") + " " +
      (img.getAttribute("class") || "") + " " +
      (img.getAttribute("id") || "") + " " +
      resolved.pathname
    ).toLowerCase();
    let score = 0;
    if (haystack.includes("menu")) score += 4;
    if (haystack.includes("food") || haystack.includes("dish")) score += 1;
    if (score >= 4) {
      const key = resolved.origin + resolved.pathname + resolved.search;
      imageScores.set(key, Math.max(imageScores.get(key) ?? 0, score));
    }
  });

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);

  return {
    pages: sortDesc(pageScores),
    pdfs: sortDesc(pdfScores),
    images: sortDesc(imageScores),
  };
}

// Headings that are clearly NOT food categories.
const HEADING_BLOCKLIST = [
  "menu", "our menu", "the menu", "home", "about", "about us", "contact",
  "contact us", "reservation", "reservations", "book", "booking", "gallery",
  "location", "locations", "press", "events", "private dining", "careers",
  "follow us", "newsletter", "sign up", "login", "search", "cart",
  "order online", "find us", "hours", "opening hours",
];

function isPlausibleCategoryHeading(raw: string): boolean {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (t.length < 2 || t.length > 60) return false;
  // Must be mostly letters (allow &, -, /, spaces, apostrophes).
  if (!/^[A-Za-z][A-Za-z0-9 &/\-'’.]*$/.test(t)) return false;
  // Avoid sentences.
  if (t.split(/\s+/).length > 6) return false;
  if (/[.!?]$/.test(t)) return false;
  const lower = t.toLowerCase();
  if (HEADING_BLOCKLIST.includes(lower)) return false;
  return true;
}

/**
 * Extract candidate menu text + page title + category headings from raw HTML.
 */
function extractCandidates(html: string): {
  title: string | null;
  candidates: RawCandidate[];
  fullText: string;
  headings: string[];
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { title: null, candidates: [], fullText: "", headings: [] };

  doc.querySelectorAll("script, style, noscript, svg, iframe").forEach((n) => {
    (n as Element).remove();
  });

  const title =
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector("h1")?.textContent?.trim() ||
    null;

  // Collect candidate category headings: h2-h4, plus elements with class
  // patterns like "menu-section-title", "category-title", etc.
  const headingSet = new Set<string>();
  const headingSelectors = [
    "h2", "h3", "h4",
    "[class*='category' i]", "[class*='section-title' i]",
    "[class*='menu-title' i]", "[class*='menu-heading' i]",
    "[class*='menu-section' i] > :first-child",
  ];
  for (const sel of headingSelectors) {
    let nodes: ArrayLike<Element>;
    try {
      nodes = doc.querySelectorAll(sel) as unknown as ArrayLike<Element>;
    } catch {
      continue;
    }
    Array.from(nodes).forEach((node: Element) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (isPlausibleCategoryHeading(text)) {
        // Title-case-ish: strip trailing punctuation.
        headingSet.add(text.replace(/[:•·\-–—]+$/, "").trim());
      }
    });
    if (headingSet.size > 60) break;
  }

  const selectors = [
    ".menu-item", ".menu_item", ".dish", ".food-item",
    "[data-menu-item]", ".product-item", ".product",
    ".menu li", ".menu > div", "ul.dishes > li",
    "[class*='menu'] li", "[class*='menu'] article",
    "[id*='menu'] li", "[id*='menu'] article",
    ".item", ".card",
    // Common WordPress / page-builder patterns
    ".elementor-widget-container li",
    ".wp-block-group li",
    "table tr",
  ];

  const candidates: RawCandidate[] = [];
  const seen = new Set<string>();

  for (const sel of selectors) {
    let nodes: ArrayLike<Element>;
    try {
      nodes = doc.querySelectorAll(sel) as unknown as ArrayLike<Element>;
    } catch {
      continue;
    }
    Array.from(nodes).forEach((node: Element) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < 8 || text.length > 600) return;
      if (seen.has(text)) return;
      seen.add(text);
      candidates.push({ text, source: sel });
    });
    if (candidates.length > 300) break;
  }

  const fullText = (doc.body?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16000);

  return {
    title,
    candidates: candidates.slice(0, 300),
    fullText,
    headings: [...headingSet].slice(0, 60),
  };
}

/**
 * Walk the page and try to associate <img> tags with the dish name they
 * appear next to. We look inside common menu-item containers and use the
 * heaviest text node (or alt text) as the dish name candidate. Result is a
 * list of (dishName, imageUrl) hints — the LLM step later matches them to
 * structured items by normalized name.
 */
function extractDishImageHints(html: string, baseUrl: string): DishImageHint[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const base = new URL(baseUrl);

  const resolve = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const v = raw.trim();
    if (!v || v.startsWith("data:")) return null;
    try {
      return new URL(v, base).toString();
    } catch {
      return null;
    }
  };

  // Likely dish-card containers. We deliberately reuse the menu-item selectors
  // so the harvest stays close to the same DOM regions as text candidates.
  const containerSelectors = [
    ".menu-item", ".menu_item", ".dish", ".food-item", "[data-menu-item]",
    ".product-item", ".product",
    ".menu li", ".menu > div", "ul.dishes > li",
    "[class*='menu'] li", "[class*='menu'] article",
    "[id*='menu'] li", "[id*='menu'] article",
    "[class*='dish']", "[class*='food']",
    ".item", ".card", "article", "figure",
  ];

  const hints: DishImageHint[] = [];
  const seenKey = new Set<string>();

  const pushHint = (rawName: string | null | undefined, rawSrc: string | null | undefined) => {
    if (!rawName || !rawSrc) return;
    const url = resolve(rawSrc);
    if (!url) return;
    if (!/\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(url)) return;
    const name = rawName.replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 120) return;
    const key = normalizeDishName(name);
    if (!key || seenKey.has(key)) return;
    // Skip obvious non-food image names (logos, icons, hero banners).
    const lowerSrc = url.toLowerCase();
    if (/logo|favicon|sprite|icon[-_/.]/.test(lowerSrc)) return;
    seenKey.add(key);
    hints.push({ nameKey: key, name, imageUrl: url });
  };

  for (const sel of containerSelectors) {
    let nodes: ArrayLike<Element>;
    try {
      nodes = doc.querySelectorAll(sel) as unknown as ArrayLike<Element>;
    } catch {
      continue;
    }
    Array.from(nodes).forEach((node: Element) => {
      const img = node.querySelector("img");
      if (!img) return;
      const src =
        img.getAttribute("src") ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-original") ||
        "";
      if (!src) return;

      // Prefer a heading inside the container, then alt text, then the first
      // non-trivial text node.
      const headingEl =
        node.querySelector("h1, h2, h3, h4, h5, h6, .title, [class*='title' i], [class*='name' i]");
      let name = headingEl?.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!name) name = (img.getAttribute("alt") || "").trim();
      if (!name) {
        // First text fragment under ~80 chars
        const txt = (node.textContent || "").replace(/\s+/g, " ").trim();
        name = txt.split(/[•·|–—-]/)[0]?.trim().slice(0, 80) || "";
      }
      pushHint(name, src);
    });
    if (hints.length > 200) break;
  }

  // Fallback: any <img> with a meaningful alt that mentions food-ish words.
  if (hints.length < 5) {
    doc.querySelectorAll("img[alt]").forEach((node) => {
      const img = node as Element;
      const alt = (img.getAttribute("alt") || "").trim();
      if (alt.length < 3 || alt.length > 120) return;
      const src =
        img.getAttribute("src") ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        "";
      pushHint(alt, src);
    });
  }

  return hints.slice(0, 200);
}

async function fetchBinary(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > MAX_BINARY_BYTES) {
      console.warn(`Skipping ${url} — too large (${len} bytes)`);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BINARY_BYTES) return null;
    return buf;
  } catch (e) {
    console.warn(`Binary fetch failed for ${url}:`, e);
    return null;
  }
}

/** Extract text from a PDF menu (first ~10 pages). Returns "" on failure. */
async function extractPdfText(url: string): Promise<string> {
  const bytes = await fetchBinary(url);
  if (!bytes) return "";
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : String(text || ""))
      .replace(/\u0000/g, "")
      .slice(0, 16000);
  } catch (e) {
    console.warn(`PDF parse failed for ${url}:`, e);
    return "";
  }
}

/**
 * Use Groq's vision model to OCR a menu image and return raw text lines
 * (dish · price · description), one per line. Returns "" on failure.
 */
async function extractImageMenuText(url: string, groqKey: string): Promise<string> {
  // Pass URL directly to the vision model — Groq fetches it server-side.
  const body = {
    model: GROQ_VISION_MODEL,
    temperature: 0.1,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "This image is a restaurant menu. Transcribe every dish exactly as printed. " +
              "Output ONE item per line in the format: `<Category> | <Dish Name> | <Price or -> | <Short description or ->`. " +
              "Use the menu's own section headings as Category. Skip headers, footers, addresses, hours, marketing copy. " +
              "Preserve currency symbols. No commentary, no markdown — just the lines.",
          },
          { type: "image_url", image_url: { url } },
        ],
      },
    ],
  };

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`Vision OCR HTTP ${res.status} for ${url}:`, (await res.text()).slice(0, 200));
      return "";
    }
    const data = await res.json();
    return (data?.choices?.[0]?.message?.content || "").toString().slice(0, 16000);
  } catch (e) {
    console.warn(`Vision OCR threw for ${url}:`, e);
    return "";
  }
}

/**
 * Crawl the entry URL plus up to N menu-related sub-pages and merge their
 * extracted candidates + full text. Title is taken from the first page that
 * has one.
 */
async function gatherMenuCorpus(entryUrl: string): Promise<{
  title: string | null;
  candidates: RawCandidate[];
  fullText: string;
  pagesFetched: string[];
  headings: string[];
  logoUrl: string | null;
  dishImages: Map<string, string>;
}> {
  const visited = new Set<string>();
  const pagesFetched: string[] = [];
  let title: string | null = null;
  const allCandidates: RawCandidate[] = [];
  const seenText = new Set<string>();
  const fullTextParts: string[] = [];
  const headingSet = new Set<string>();
  const dishImages = new Map<string, string>();

  const addImageHints = (hints: DishImageHint[]) => {
    for (const h of hints) {
      if (!dishImages.has(h.nameKey)) dishImages.set(h.nameKey, h.imageUrl);
    }
  };

  const entryHtml = await fetchHtml(entryUrl);
  visited.add(entryUrl);
  pagesFetched.push(entryUrl);

  const logoUrl = findLogoUrl(entryHtml, entryUrl);

  const entry = extractCandidates(entryHtml);
  title = entry.title;
  for (const c of entry.candidates) {
    if (!seenText.has(c.text)) {
      seenText.add(c.text);
      allCandidates.push(c);
    }
  }
  for (const h of entry.headings) headingSet.add(h);
  if (entry.fullText) fullTextParts.push(entry.fullText);
  addImageHints(extractDishImageHints(entryHtml, entryUrl));

  const discovered = discoverMenuLinks(entryHtml, entryUrl);
  const subLinks = discovered.pages.filter((u) => !visited.has(u)).slice(0, 5);
  const pdfLinks = discovered.pdfs.filter((u) => !visited.has(u)).slice(0, 3);
  const imageLinks = discovered.images.filter((u) => !visited.has(u)).slice(0, 3);

  console.log(
    `Discovered ${subLinks.length} HTML sub-pages, ${pdfLinks.length} PDF(s), ${imageLinks.length} image(s)`,
  );

  const subResults = await Promise.allSettled(
    subLinks.map(async (url: string) => {
      const html = await fetchHtml(url);
      return { url, html };
    }),
  );

  for (const r of subResults) {
    if (r.status !== "fulfilled") {
      console.warn("Sub-page fetch failed:", r.reason);
      continue;
    }
    const { url, html } = r.value;
    visited.add(url);
    pagesFetched.push(url);
    const ex = extractCandidates(html);
    if (!title && ex.title) title = ex.title;
    for (const c of ex.candidates) {
      if (!seenText.has(c.text)) {
        seenText.add(c.text);
        allCandidates.push(c);
      }
    }
    for (const h of ex.headings) headingSet.add(h);
    if (ex.fullText) fullTextParts.push(`--- ${url} ---\n${ex.fullText}`);
  }

  // Fetch + extract text from menu PDFs
  const pdfResults = await Promise.allSettled(
    pdfLinks.map(async (url: string) => ({ url, text: await extractPdfText(url) })),
  );
  for (const r of pdfResults) {
    if (r.status !== "fulfilled") {
      console.warn("PDF fetch/parse failed:", r.reason);
      continue;
    }
    const { url, text } = r.value;
    if (!text) continue;
    visited.add(url);
    pagesFetched.push(url);
    fullTextParts.push(`--- PDF ${url} ---\n${text}`);
    // Treat each non-empty line as a candidate row.
    text.split(/\r?\n/).forEach((line: string) => {
      const t = line.replace(/\s+/g, " ").trim();
      if (t.length >= 8 && t.length <= 600 && !seenText.has(t)) {
        seenText.add(t);
        allCandidates.push({ text: t, source: "pdf" });
      }
    });
  }

  // Fetch + OCR menu images via Groq vision
  const groqKeyForVision = Deno.env.get("GROQ_API_KEY");
  if (groqKeyForVision && imageLinks.length > 0) {
    const imgResults = await Promise.allSettled(
      imageLinks.map(async (url: string) => ({
        url,
        text: await extractImageMenuText(url, groqKeyForVision),
      })),
    );
    for (const r of imgResults) {
      if (r.status !== "fulfilled") {
        console.warn("Image OCR failed:", r.reason);
        continue;
      }
      const { url, text } = r.value;
      if (!text) continue;
      visited.add(url);
      pagesFetched.push(url);
      fullTextParts.push(`--- IMAGE ${url} ---\n${text}`);
      text.split(/\r?\n/).forEach((line: string) => {
        const t = line.replace(/\s+/g, " ").trim();
        if (t.length >= 8 && t.length <= 600 && !seenText.has(t)) {
          seenText.add(t);
          allCandidates.push({ text: t, source: "image" });
        }
      });
    }
  }

  const fullText = fullTextParts.join("\n\n").slice(0, 20000);

  return {
    title,
    candidates: allCandidates.slice(0, 400),
    fullText,
    pagesFetched,
    headings: [...headingSet].slice(0, 60),
    logoUrl,
  };
}

interface ParsedItem {
  name: string;
  category: string | null;
  price: string | null;
  description: string | null;
}

async function structureWithGroq(
  groqKey: string,
  restaurantName: string | null,
  candidates: RawCandidate[],
  fullText: string,
  websiteHeadings: string[],
): Promise<ParsedItem[]> {
  const candidateBlock =
    candidates.length > 0
      ? candidates.map((c, i) => `${i + 1}. ${c.text}`).join("\n")
      : "(no structured candidates extracted)";

  const headingsBlock =
    websiteHeadings.length > 0
      ? websiteHeadings.map((h) => `- ${h}`).join("\n")
      : "(none detected — use the generic fallback set)";

  const userPrompt = `You are a menu data extraction AI for restaurant websites.

Restaurant: ${restaurantName ?? "unknown"}

Below are text snippets scraped from one or more pages of the restaurant's website (homepage + menu pages). Extract ONLY the actual food and drink menu items.

CATEGORY RULES (very important):
- The website itself uses these section headings, which are the AUTHORITATIVE category names. Prefer them EXACTLY as written (preserve capitalization, spelling, accents):
${headingsBlock}
- Assign each item to the website heading it most clearly belongs under (use the surrounding text in the full page text to decide which heading an item appears under).
- Only if NO website heading fits an item — or if no headings were detected at all — fall back to a refined generic category from this set: "Starters", "Soups", "Mains", "Sides", "Desserts", "Beverages", "Specials", "Other".
- Soup dishes (anything described as soup, broth, bisque, chowder, shorba, rasam) MUST go under "Soups" if no website heading exists for them.
- Items that don't clearly fit any other category go under "Other" — never drop them.
- Do NOT invent new categories that are neither in the website headings nor in the generic fallback set.
- Keep category names short (max 40 chars).

OTHER RULES:
- Deduplicate items across pages.
- Preserve original currency symbols in price (₹, $, €, £, etc.). Use null if no price is visible.
- Descriptions max 25 words. Use null if absent — do NOT invent descriptions.
- Fix obvious typos in dish names but keep the original meaning.
- Return ONLY genuine menu items. Skip nav, contact info, hours, addresses, marketing copy.
- Be EXHAUSTIVE — if the source lists 30+ dishes across multiple categories, return them all.

Structured candidates:
${candidateBlock}

Full page text from all crawled pages (use this to figure out which website heading each item belongs under):
${fullText.slice(0, 12000)}`;

  const body = {
    model: GROQ_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You extract restaurant menu data. You always call the return_menu function with cleaned, deduplicated items. You preserve the website's own category names whenever they exist.",
      },
      { role: "user", content: userPrompt },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "return_menu",
          description: "Return the cleaned menu items.",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    category: {
                      type: "string",
                      description:
                        "Website's own section heading if available, otherwise one of: Starters, Soups, Mains, Sides, Desserts, Beverages, Specials, Other.",
                    },
                    price: { type: ["string", "null"] },
                    description: { type: ["string", "null"] },
                  },
                  required: ["name", "category"],
                },
              },
            },
            required: ["items"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "return_menu" } },
  };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("Groq did not return a tool call");
  }
  const parsed = JSON.parse(toolCall.function.arguments);
  const items = (parsed.items ?? []) as ParsedItem[];

  const GENERIC_FALLBACK = new Set([
    "Starters", "Soups", "Mains", "Sides", "Desserts", "Beverages", "Specials", "Other",
  ]);
  // Lowercase index of website headings -> canonical (original-case) name.
  const headingIndex = new Map<string, string>();
  for (const h of websiteHeadings) headingIndex.set(h.toLowerCase(), h);

  const normalizeCategory = (raw: string | null | undefined): string => {
    const c = (raw || "").trim();
    if (!c) return "Other";
    // Exact / case-insensitive match against a website heading wins.
    const lower = c.toLowerCase();
    if (headingIndex.has(lower)) return headingIndex.get(lower)!;
    // Accept the generic fallback set as-is.
    if (GENERIC_FALLBACK.has(c)) return c;
    // Title-case generic match (e.g. "starters" -> "Starters").
    const titled = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
    if (GENERIC_FALLBACK.has(titled)) return titled;
    // If headings exist but model invented something new, keep its label
    // trimmed to a sane length so we don't lose info.
    return c.slice(0, 40);
  };

  // Final sanity filter + dedupe by lowercased name.
  const byName = new Map<string, ParsedItem>();
  for (const i of items) {
    if (!i.name || i.name.length < 2 || i.name.length > 120) continue;
    const key = i.name.trim().toLowerCase();
    if (byName.has(key)) continue;
    byName.set(key, {
      name: i.name.trim(),
      category: normalizeCategory(i.category),
      price: i.price?.trim() || null,
      description: i.description?.trim() || null,
    });
  }
  return [...byName.values()];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { restaurantUrl } = await req.json();
    if (!restaurantUrl || typeof restaurantUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "restaurantUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = normalizeUrl(restaurantUrl);
    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) throw new Error("GROQ_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: restaurant, error: upsertErr } = await supabase
      .from("restaurants")
      .upsert(
        { website_url: url, scrape_status: "pending", scrape_error: null },
        { onConflict: "website_url" },
      )
      .select()
      .single();

    if (upsertErr) throw new Error(`DB upsert failed: ${upsertErr.message}`);

    try {
      console.log("Gathering menu corpus for", url);
      const { title, candidates, fullText, pagesFetched, headings, logoUrl } =
        await gatherMenuCorpus(url);
      console.log(`Detected logo: ${logoUrl ?? "(none)"}`);
      console.log(
        `Crawled ${pagesFetched.length} page(s): ${pagesFetched.join(", ")}`,
      );
      console.log(
        `Extracted ${candidates.length} candidates, fullText=${fullText.length} chars, title="${title}", headings=[${headings.join(" | ")}]`,
      );

      const items = await structureWithGroq(
        groqKey,
        title,
        candidates,
        fullText,
        headings,
      );
      console.log(`Groq returned ${items.length} items`);

      if (items.length === 0) {
        await supabase
          .from("restaurants")
          .update({
            name: title,
            scrape_status: "failed",
            scrape_error: "No menu items found on the page",
            scraped_at: new Date().toISOString(),
          })
          .eq("id", restaurant.id);

        return new Response(
          JSON.stringify({
            restaurantId: restaurant.id,
            menuItems: [],
            status: "failed",
            error: "No menu items could be extracted from this URL.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabase.from("menu_items").delete().eq("restaurant_id", restaurant.id);
      const { error: insertErr } = await supabase.from("menu_items").insert(
        items.map((i) => ({
          restaurant_id: restaurant.id,
          name: i.name,
          category: i.category,
          price: i.price,
          description: i.description,
        })),
      );
      if (insertErr) throw new Error(`Insert items failed: ${insertErr.message}`);

      await supabase
        .from("restaurants")
        .update({
          name: title,
          scrape_status: "completed",
          scrape_error: null,
          scraped_at: new Date().toISOString(),
        })
        .eq("id", restaurant.id);

      const { data: savedItems } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("category");

      return new Response(
        JSON.stringify({
          restaurantId: restaurant.id,
          restaurantName: title,
          status: "completed",
          menuItems: savedItems ?? [],
          pagesFetched,
          logoUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (scrapeErr) {
      const msg = scrapeErr instanceof Error ? scrapeErr.message : String(scrapeErr);
      console.error("Scrape error:", msg);
      await supabase
        .from("restaurants")
        .update({
          scrape_status: "failed",
          scrape_error: msg.slice(0, 500),
          scraped_at: new Date().toISOString(),
        })
        .eq("id", restaurant.id);

      return new Response(
        JSON.stringify({
          restaurantId: restaurant.id,
          status: "failed",
          error: msg,
          menuItems: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
