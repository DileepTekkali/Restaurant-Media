import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Download, RefreshCw, ArrowLeft, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MenuItem } from "@/types/menu";

interface BannerStudioProps {
  items: MenuItem[];
  restaurantName: string | null;
  websiteUrl: string;
  onBack: () => void;
}

type FormatKey = "square" | "story" | "landscape";

interface FormatSpec {
  key: FormatKey;
  label: string;
  width: number;
  height: number;
  description: string;
}

const FORMATS: FormatSpec[] = [
  { key: "square", label: "Square 1:1", width: 1080, height: 1080, description: "Instagram feed (1080×1080)" },
  { key: "story", label: "Story 9:16", width: 1080, height: 1920, description: "IG / FB story (1080×1920)" },
  { key: "landscape", label: "Landscape 16:9", width: 1600, height: 900, description: "Web / FB cover (1600×900)" },
];

/* ────────────────────────────────────────────────────────────────
   Editorial typography — load real fonts before composing.
   Playfair Display = serif headlines, Inter = sans labels.
   ──────────────────────────────────────────────────────────────── */

const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,800;1,500&family=Inter:wght@400;500;600;700&display=swap";

let fontsReadyPromise: Promise<void> | null = null;
async function ensureFontsLoaded(): Promise<void> {
  if (fontsReadyPromise) return fontsReadyPromise;
  fontsReadyPromise = (async () => {
    if (!document.querySelector(`link[data-banner-fonts="true"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONT_CSS_URL;
      link.dataset.bannerFonts = "true";
      document.head.appendChild(link);
    }
    try {
      await Promise.all([
        (document as any).fonts?.load("700 80px 'Playfair Display'"),
        (document as any).fonts?.load("500 40px 'Playfair Display'"),
        (document as any).fonts?.load("italic 500 40px 'Playfair Display'"),
        (document as any).fonts?.load("600 24px 'Inter'"),
        (document as any).fonts?.load("400 22px 'Inter'"),
      ]);
      await (document as any).fonts?.ready;
    } catch {
      /* ignore — canvas will fall back to system fonts */
    }
  })();
  return fontsReadyPromise;
}

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

/* ────────────────────────────────────────────────────────────────
   Pollinations dish photography
   ──────────────────────────────────────────────────────────────── */

function pollinationsUrl(item: MenuItem, w: number, h: number): string {
  const parts = [
    "professional food photography of",
    item.name,
    item.description ? `, ${item.description}` : "",
    ", restaurant menu hero shot, 45-degree angle, soft natural light, shallow depth of field, on a rustic plate, dark moody background, vibrant colors, magazine quality, high detail, appetizing",
  ];
  const prompt = parts.join(" ").slice(0, 380);
  const seed = Math.abs(
    [...item.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0),
  );
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    seed: String(seed),
    nologo: "true",
    enhance: "true",
    model: "flux",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/* ────────────────────────────────────────────────────────────────
   Canvas helpers
   ──────────────────────────────────────────────────────────────── */

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        // remaining words go onto last line, will be ellipsised below
      }
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = last.replace(/[,;:.\s]+$/, "") + "…";
    return kept;
  }
  return lines;
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
) {
  const ar = img.width / img.height;
  const targetAr = dw / dh;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ar > targetAr) {
    sw = img.height * targetAr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetAr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Letter-spaced uppercase text (real tracking, not just font metrics). */
function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: "left" | "center" | "right" = "left",
) {
  const chars = text.split("");
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cursor = x;
  if (align === "center") cursor = x - total / 2;
  if (align === "right") cursor = x - total;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y);
    cursor += widths[i] + tracking;
  });
}

/* ────────────────────────────────────────────────────────────────
   Banner composition
   ──────────────────────────────────────────────────────────────── */

interface ComposeArgs {
  format: FormatSpec;
  restaurantName: string;
  websiteUrl: string;
  dishes: { item: MenuItem; img: HTMLImageElement }[];
}

// Editorial palette — cream, deep espresso, antique gold.
const PALETTE = {
  ink: "#1a1411",
  cream: "#f5efe4",
  gold: "#c9a24b",
  goldSoft: "#e2c179",
  mute: "rgba(245, 239, 228, 0.72)",
};

function composeBanner({
  format,
  restaurantName,
  websiteUrl,
  dishes,
}: ComposeArgs): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d")!;
  const W = format.width;
  const H = format.height;
  const cleanUrl = websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Pick a hero dish (first selected) — its image becomes the full-bleed background.
  const hero = dishes[0];

  // Full-bleed hero photograph
  if (hero) {
    drawImageCover(ctx, hero.img, 0, 0, W, H);
  } else {
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(0, 0, W, H);
  }

  // Editorial darkening + gradient for legibility (NOT a hard panel)
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, "rgba(20, 14, 10, 0.55)");
  overlay.addColorStop(0.45, "rgba(20, 14, 10, 0.25)");
  overlay.addColorStop(1, "rgba(20, 14, 10, 0.88)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // Soft side vignette for depth
  const side = ctx.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, "rgba(20, 14, 10, 0.35)");
  side.addColorStop(0.5, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(20, 14, 10, 0.35)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, W, H);

  // Margin used for the hairline frame & content insets
  const m = Math.round(Math.min(W, H) * 0.045);

  // Hairline gold frame
  ctx.strokeStyle = "rgba(201, 162, 75, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);

  /* ──────────── Top header (eyebrow + restaurant name + small underline) ──────────── */
  const headerTop = m + Math.round(H * 0.05);
  // Eyebrow
  ctx.fillStyle = PALETTE.goldSoft;
  ctx.font = `600 ${Math.round(H * 0.018)}px ${SANS}`;
  drawTrackedText(
    ctx,
    "CHEF'S SELECTION",
    W / 2,
    headerTop,
    Math.round(H * 0.006),
    "center",
  );

  // Tiny gold rule under eyebrow
  ctx.fillStyle = PALETTE.gold;
  const ruleW = Math.round(W * 0.05);
  ctx.fillRect(W / 2 - ruleW / 2, headerTop + Math.round(H * 0.012), ruleW, 2);

  // Restaurant name (italic serif — feels editorial / hospitality)
  ctx.fillStyle = PALETTE.cream;
  const nameSize = Math.round(H * 0.045);
  ctx.font = `italic 500 ${nameSize}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const nameLines = wrapText(ctx, restaurantName, W - m * 4, 1);
  ctx.fillText(nameLines[0], W / 2, headerTop + Math.round(H * 0.06));

  /* ──────────── Featured dish — large serif title ──────────── */
  if (hero) {
    const titleY = Math.round(H * 0.5);
    ctx.fillStyle = PALETTE.cream;
    const titleSize =
      format.key === "story"
        ? Math.round(H * 0.06)
        : format.key === "landscape"
          ? Math.round(H * 0.085)
          : Math.round(H * 0.075);
    ctx.font = `700 ${titleSize}px ${SERIF}`;
    ctx.textAlign = "center";
    const titleLines = wrapText(
      ctx,
      hero.item.name,
      W - m * 3,
      format.key === "landscape" ? 1 : 2,
    );

    // Subtle text shadow for legibility over photography
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 2;
    titleLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, titleY + i * titleSize * 1.05);
    });
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Description (small, italic, muted) — only if short enough
    if (hero.item.description) {
      ctx.fillStyle = PALETTE.mute;
      const descSize = Math.round(H * 0.022);
      ctx.font = `italic 400 ${descSize}px ${SERIF}`;
      const descLines = wrapText(
        ctx,
        hero.item.description,
        W - m * 4,
        2,
      );
      const descTop = titleY + titleLines.length * titleSize * 1.05 + Math.round(H * 0.03);
      descLines.forEach((line, i) => {
        ctx.fillText(line, W / 2, descTop + i * descSize * 1.4);
      });
    }
  }

  /* ──────────── Lower panel: companion dishes & price list ──────────── */
  const companions = dishes.slice(1);
  const panelTop =
    format.key === "story"
      ? Math.round(H * 0.7)
      : format.key === "landscape"
        ? Math.round(H * 0.7)
        : Math.round(H * 0.72);

  if (companions.length > 0) {
    // Small "ALSO FEATURING" eyebrow centered
    ctx.fillStyle = PALETTE.goldSoft;
    ctx.font = `600 ${Math.round(H * 0.014)}px ${SANS}`;
    drawTrackedText(
      ctx,
      "ALSO FEATURING",
      W / 2,
      panelTop,
      Math.round(H * 0.005),
      "center",
    );

    // Dish chips — laid out horizontally, no hard panels, just typographic rhythm
    const chipsTop = panelTop + Math.round(H * 0.03);
    const visible = companions.slice(0, format.key === "story" ? 4 : 3);
    const colW = (W - m * 2) / visible.length;

    visible.forEach((d, i) => {
      const cx = m + colW * (i + 0.5);

      // Dish name (serif, smaller)
      ctx.fillStyle = PALETTE.cream;
      const dishSize = Math.round(H * 0.022);
      ctx.font = `500 ${dishSize}px ${SERIF}`;
      ctx.textAlign = "center";
      const dishLines = wrapText(ctx, d.item.name, colW - 30, 2);
      dishLines.forEach((line, li) => {
        ctx.fillText(line, cx, chipsTop + (li + 1) * dishSize * 1.2);
      });

      // Price under it (sans, gold, small)
      if (d.item.price) {
        ctx.fillStyle = PALETTE.gold;
        const pSize = Math.round(H * 0.018);
        ctx.font = `600 ${pSize}px ${SANS}`;
        const priceY = chipsTop + (dishLines.length + 1) * dishSize * 1.2 + Math.round(H * 0.012);
        ctx.fillText(d.item.price, cx, priceY);
      }

      // Vertical divider between chips
      if (i < visible.length - 1) {
        ctx.strokeStyle = "rgba(201, 162, 75, 0.35)";
        ctx.lineWidth = 1;
        const dx = m + colW * (i + 1);
        ctx.beginPath();
        ctx.moveTo(dx, chipsTop + 8);
        ctx.lineTo(dx, chipsTop + Math.round(H * 0.085));
        ctx.stroke();
      }
    });
  }

  /* ──────────── Hero price badge (top right, elegant) ──────────── */
  if (hero?.item.price) {
    const padX = 22;
    const padY = 12;
    ctx.font = `700 ${Math.round(H * 0.022)}px ${SANS}`;
    const priceText = hero.item.price;
    const tw = ctx.measureText(priceText).width;
    const bw = tw + padX * 2;
    const bh = Math.round(H * 0.022) + padY * 2;
    const bx = W - m - bw - 6;
    const by = m + 6;

    // gold pill with thin stroke
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = "rgba(20, 14, 10, 0.55)";
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = PALETTE.goldSoft;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(priceText, bx + bw / 2, by + bh / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  /* ──────────── Footer: website URL + tiny gold rule ──────────── */
  const footY = H - m - Math.round(H * 0.025);
  ctx.fillStyle = PALETTE.gold;
  const fRuleW = Math.round(W * 0.04);
  ctx.fillRect(W / 2 - fRuleW / 2, footY - Math.round(H * 0.025), fRuleW, 1);

  ctx.fillStyle = PALETTE.mute;
  ctx.font = `500 ${Math.round(H * 0.016)}px ${SANS}`;
  drawTrackedText(
    ctx,
    cleanUrl.toUpperCase(),
    W / 2,
    footY,
    Math.round(H * 0.004),
    "center",
  );

  return canvas;
}

/* ────────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────────── */

interface BannerState {
  url: string | null;
  loading: boolean;
  error: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "banner";

export const BannerStudio = ({ items, restaurantName, websiteUrl, onBack }: BannerStudioProps) => {
  const { toast } = useToast();
  const [banners, setBanners] = useState<Record<FormatKey, BannerState>>({
    square: { url: null, loading: true, error: null },
    story: { url: null, loading: true, error: null },
    landscape: { url: null, loading: true, error: null },
  });
  const [generationKey, setGenerationKey] = useState(0);
  const cancelRef = useRef(false);

  const safeName = useMemo(() => restaurantName || "Your Restaurant", [restaurantName]);
  const cappedItems = useMemo(() => items.slice(0, 5), [items]);

  useEffect(() => {
    cancelRef.current = false;
    setBanners({
      square: { url: null, loading: true, error: null },
      story: { url: null, loading: true, error: null },
      landscape: { url: null, loading: true, error: null },
    });

    (async () => {
      try {
        await ensureFontsLoaded();
        const dishImages = await Promise.all(
          cappedItems.map(async (item) => {
            const url = pollinationsUrl(item, 1280, 1280);
            try {
              const img = await loadImage(url);
              return { item, img };
            } catch {
              const img = await loadImage(
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
              );
              return { item, img };
            }
          }),
        );
        if (cancelRef.current) return;

        for (const format of FORMATS) {
          if (cancelRef.current) return;
          try {
            const canvas = composeBanner({
              format,
              restaurantName: safeName,
              websiteUrl,
              dishes: dishImages,
            });
            const url = canvas.toDataURL("image/png");
            setBanners((prev) => ({
              ...prev,
              [format.key]: { url, loading: false, error: null },
            }));
          } catch (e) {
            setBanners((prev) => ({
              ...prev,
              [format.key]: {
                url: null,
                loading: false,
                error: e instanceof Error ? e.message : "Failed to render",
              },
            }));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to generate banners";
        toast({ title: "Banner generation failed", description: msg, variant: "destructive" });
        setBanners({
          square: { url: null, loading: false, error: msg },
          story: { url: null, loading: false, error: msg },
          landscape: { url: null, loading: false, error: msg },
        });
      }
    })();

    return () => {
      cancelRef.current = true;
    };
  }, [cappedItems, safeName, websiteUrl, generationKey, toast]);

  const downloadBanner = (key: FormatKey) => {
    const banner = banners[key];
    if (!banner.url) return;
    const a = document.createElement("a");
    a.href = banner.url;
    a.download = `${slugify(safeName)}-${key}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = () => {
    FORMATS.forEach((f, i) => {
      setTimeout(() => downloadBanner(f.key), i * 250);
    });
  };

  const allReady = FORMATS.every((f) => banners[f.key].url);

  return (
    <section className="w-full max-w-5xl animate-fade-in-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button onClick={onBack} variant="outline" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to menu
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setGenerationKey((k) => k + 1)}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
          <Button onClick={downloadAll} size="sm" disabled={!allReady} className="gap-2">
            <Download className="h-4 w-4" />
            Download all
          </Button>
        </div>
      </div>

      <header className="mb-6 flex flex-col gap-2 border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Banner studio
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {safeName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {cappedItems.length} dish{cappedItems.length === 1 ? "" : "es"} · 3 editorial-grade formats · dish photography by{" "}
          <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Pollinations AI
          </a>
        </p>
        {items.length > cappedItems.length && (
          <p className="text-xs text-muted-foreground">
            Showing first {cappedItems.length} of {items.length} selected — first dish is the hero, the rest are featured below.
          </p>
        )}
      </header>

      <Tabs defaultValue="square" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          {FORMATS.map((f) => (
            <TabsTrigger key={f.key} value={f.key} className="text-xs sm:text-sm">
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {FORMATS.map((f) => {
          const state = banners[f.key];
          return (
            <TabsContent key={f.key} value={f.key} className="mt-6">
              <div className="flex flex-col items-center gap-4">
                <p className="text-xs text-muted-foreground">{f.description}</p>
                <div
                  className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-elegant"
                  style={{
                    maxWidth:
                      f.key === "story"
                        ? "min(420px, 100%)"
                        : f.key === "landscape"
                          ? "min(900px, 100%)"
                          : "min(640px, 100%)",
                    aspectRatio: `${f.width} / ${f.height}`,
                  }}
                >
                  {state.loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm">Composing banner…</p>
                    </div>
                  )}
                  {state.error && !state.loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-destructive">
                      <ImageIcon className="h-8 w-8" />
                      {state.error}
                    </div>
                  )}
                  {state.url && (
                    <img
                      src={state.url}
                      alt={`${f.label} banner for ${safeName}`}
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
                <Button
                  onClick={() => downloadBanner(f.key)}
                  disabled={!state.url}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download {f.label}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
};
