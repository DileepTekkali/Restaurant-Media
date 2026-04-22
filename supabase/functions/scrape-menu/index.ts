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
function discoverMenuLinks(html: string, baseUrl: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];

  const base = new URL(baseUrl);
  const found = new Map<string, number>(); // url -> score

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

    // Same-host only — don't wander off to social media etc.
    if (resolved.hostname !== base.hostname) return;
    // Skip obvious non-HTML assets.
    if (/\.(pdf|jpe?g|png|gif|svg|webp|mp4|zip|doc|docx)$/i.test(resolved.pathname)) {
      return;
    }

    const haystack = (
      (a.textContent || "") + " " + resolved.pathname + " " + (a.getAttribute("title") || "")
    ).toLowerCase();

    let score = 0;
    for (const kw of MENU_LINK_KEYWORDS) {
      if (haystack.includes(kw)) score += kw === "menu" ? 3 : 1;
    }

    if (score > 0) {
      const key = resolved.origin + resolved.pathname;
      found.set(key, Math.max(found.get(key) ?? 0, score));
    }
  });

  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);
}

/**
 * Extract candidate menu text + page title from raw HTML.
 */
function extractCandidates(html: string): {
  title: string | null;
  candidates: RawCandidate[];
  fullText: string;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { title: null, candidates: [], fullText: "" };

  doc.querySelectorAll("script, style, noscript, svg, iframe").forEach((n) => {
    (n as Element).remove();
  });

  const title =
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector("h1")?.textContent?.trim() ||
    null;

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
    let nodes: NodeListOf<Element>;
    try {
      nodes = doc.querySelectorAll(sel) as unknown as NodeListOf<Element>;
    } catch {
      continue;
    }
    nodes.forEach((node) => {
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

  return { title, candidates: candidates.slice(0, 300), fullText };
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
}> {
  const visited = new Set<string>();
  const pagesFetched: string[] = [];
  let title: string | null = null;
  const allCandidates: RawCandidate[] = [];
  const seenText = new Set<string>();
  const fullTextParts: string[] = [];

  // Always fetch the entry URL first.
  const entryHtml = await fetchHtml(entryUrl);
  visited.add(entryUrl);
  pagesFetched.push(entryUrl);

  const entry = extractCandidates(entryHtml);
  title = entry.title;
  for (const c of entry.candidates) {
    if (!seenText.has(c.text)) {
      seenText.add(c.text);
      allCandidates.push(c);
    }
  }
  if (entry.fullText) fullTextParts.push(entry.fullText);

  // Discover candidate menu sub-pages from the entry HTML.
  const subLinks = discoverMenuLinks(entryHtml, entryUrl)
    .filter((u) => !visited.has(u))
    .slice(0, 5); // cap to keep runtime sane

  console.log(`Discovered ${subLinks.length} menu-like sub-pages`);

  // Fetch them in parallel; tolerate individual failures.
  const subResults = await Promise.allSettled(
    subLinks.map(async (url) => {
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
    if (ex.fullText) fullTextParts.push(`--- ${url} ---\n${ex.fullText}`);
  }

  // Cap merged full text so we stay within Groq's context window.
  const fullText = fullTextParts.join("\n\n").slice(0, 20000);

  return {
    title,
    candidates: allCandidates.slice(0, 400),
    fullText,
    pagesFetched,
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
): Promise<ParsedItem[]> {
  const candidateBlock =
    candidates.length > 0
      ? candidates.map((c, i) => `${i + 1}. ${c.text}`).join("\n")
      : "(no structured candidates extracted)";

  const userPrompt = `You are a menu data extraction AI for restaurant websites.

Restaurant: ${restaurantName ?? "unknown"}

Below are text snippets scraped from one or more pages of the restaurant's website (homepage + menu pages). Some are real menu items, some are noise (navigation, footer, marketing copy). Extract ONLY the actual food and drink menu items.

Rules:
- Deduplicate items across pages.
- Standardize categories into a small set: "Starters", "Mains", "Desserts", "Beverages", "Sides", "Specials", or "Other".
- Preserve original currency symbols in price (₹, $, €, £, etc.). Use null if no price is visible.
- Descriptions max 25 words. Use null if absent — do NOT invent descriptions.
- Fix obvious typos in dish names but keep the original meaning.
- Return ONLY genuine menu items. Skip headings, contact info, hours, addresses, marketing copy.
- Be EXHAUSTIVE — if the source clearly lists 30+ dishes across multiple categories, return them all.

Structured candidates:
${candidateBlock}

Full page text from all crawled pages (additional context, may contain menu data not in the candidates):
${fullText.slice(0, 12000)}`;

  const body = {
    model: GROQ_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You extract restaurant menu data. You always call the return_menu function with cleaned, deduplicated items.",
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
                      enum: [
                        "Starters",
                        "Mains",
                        "Desserts",
                        "Beverages",
                        "Sides",
                        "Specials",
                        "Other",
                      ],
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

  // Final sanity filter + dedupe by lowercased name.
  const byName = new Map<string, ParsedItem>();
  for (const i of items) {
    if (!i.name || i.name.length < 2 || i.name.length > 120) continue;
    const key = i.name.trim().toLowerCase();
    if (byName.has(key)) continue;
    byName.set(key, {
      name: i.name.trim(),
      category: i.category ?? "Other",
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
      const { title, candidates, fullText, pagesFetched } =
        await gatherMenuCorpus(url);
      console.log(
        `Crawled ${pagesFetched.length} page(s): ${pagesFetched.join(", ")}`,
      );
      console.log(
        `Extracted ${candidates.length} candidates, fullText=${fullText.length} chars, title="${title}"`,
      );

      const items = await structureWithGroq(groqKey, title, candidates, fullText);
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
