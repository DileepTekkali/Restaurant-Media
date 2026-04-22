// Scrape a restaurant website and extract a structured menu using Groq.
// Strategy: fetch HTML -> strip to plain text candidates -> ask Groq to return
// a clean JSON array via tool calling -> persist to Supabase.

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
 * Extract candidate menu text + restaurant title from raw HTML.
 * We strip script/style noise, walk likely menu containers, and also keep
 * the full visible text (truncated) as a fallback so Groq has context.
 */
function extractCandidates(html: string): {
  title: string | null;
  candidates: RawCandidate[];
  fullText: string;
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { title: null, candidates: [], fullText: "" };

  // Remove noise
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
      const text = (node.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length < 8 || text.length > 600) return;
      if (seen.has(text)) return;
      seen.add(text);
      candidates.push({ text, source: sel });
    });
    if (candidates.length > 200) break;
  }

  // Full visible text as fallback
  const fullText = (doc.body?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);

  return { title, candidates: candidates.slice(0, 200), fullText };
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

Below are text snippets scraped from the restaurant's website. Some are real menu items, some are noise (navigation, footer, marketing copy). Extract ONLY the actual food and drink menu items.

Rules:
- Deduplicate items.
- Standardize categories into a small set: "Starters", "Mains", "Desserts", "Beverages", "Sides", "Specials", or "Other".
- Preserve original currency symbols in price (₹, $, €, £, etc.). Use null if no price is visible.
- Descriptions max 25 words. Use null if absent — do NOT invent descriptions.
- Fix obvious typos in dish names but keep the original meaning.
- Return ONLY genuine menu items. If something looks like a heading, contact info, hours, or marketing copy, skip it.
- Aim for at least 10 items if the source contains them.

Structured candidates:
${candidateBlock}

Full page text (for additional context, may contain menu data not in the candidates):
${fullText.slice(0, 6000)}`;

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

  // Final sanity filter
  return items
    .filter((i) => i.name && i.name.length >= 2 && i.name.length <= 120)
    .map((i) => ({
      name: i.name.trim(),
      category: i.category ?? "Other",
      price: i.price?.trim() || null,
      description: i.description?.trim() || null,
    }));
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

    // Upsert restaurant row (pending)
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
      console.log("Fetching HTML for", url);
      const html = await fetchHtml(url);
      console.log("HTML length:", html.length);

      const { title, candidates, fullText } = extractCandidates(html);
      console.log(`Extracted ${candidates.length} candidates, title="${title}"`);

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

      // Replace existing menu items
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
