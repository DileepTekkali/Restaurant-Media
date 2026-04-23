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

/** Build a Pollinations image URL for a dish. Free, no key needed. */
function pollinationsUrl(item: MenuItem, w: number, h: number): string {
  const parts = [
    "professional food photography of",
    item.name,
    item.description ? `, ${item.description}` : "",
    ", restaurant menu hero shot, top-down or 45-degree angle, soft natural light, shallow depth of field, on a rustic plate, vibrant colors, high detail, appetizing, magazine quality",
  ];
  const prompt = parts.join(" ").slice(0, 380);
  // seed makes results stable per dish so re-renders don't reshuffle
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

/** Load image with CORS so it can be drawn into the canvas without tainting it. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/** Wrap text within a max width and return the lines. */
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
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Add ellipsis if we ran out
  if (words.join(" ") !== lines.join(" ")) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] = last.replace(/[,;:.\s]+$/, "") + "…";
  }
  return lines;
}

interface ComposeArgs {
  format: FormatSpec;
  restaurantName: string;
  websiteUrl: string;
  dishes: { item: MenuItem; img: HTMLImageElement }[];
}

/**
 * Compose a single banner. Layouts adapt to format:
 *  - square: 1 hero (top half) + up to 4 dish names below in a list
 *  - story: vertical stack — header / hero / dish list / footer
 *  - landscape: collage on left, dish list panel on right
 */
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

  // Background — warm gradient matching the app theme
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#7a1d12");
  bg.addColorStop(0.55, "#c93a1a");
  bg.addColorStop(1, "#f0a526");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle vignette overlay
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  const drawImageCover = (img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) => {
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
  };

  const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // ====== Layout-specific composition ======
  if (format.key === "square") {
    // Top 60% = hero collage; bottom 40% = title + dish list
    const heroH = Math.round(H * 0.58);
    const heroY = 0;
    const cols = Math.min(dishes.length, 4);
    const cellW = W / cols;
    dishes.slice(0, cols).forEach((d, i) => {
      ctx.save();
      roundRectPath(i * cellW, heroY, cellW, heroH, 0);
      ctx.clip();
      drawImageCover(d.img, i * cellW, heroY, cellW, heroH);
      ctx.restore();
    });
    // Dark gradient bottom over hero for legibility around badge
    const heroFade = ctx.createLinearGradient(0, heroH - 200, 0, heroH);
    heroFade.addColorStop(0, "rgba(0,0,0,0)");
    heroFade.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = heroFade;
    ctx.fillRect(0, heroH - 200, W, 200);

    // Bottom panel
    const panelY = heroH;
    const panelH = H - heroH;
    ctx.fillStyle = "rgba(15, 8, 5, 0.92)";
    ctx.fillRect(0, panelY, W, panelH);

    // Restaurant name
    ctx.fillStyle = "#f7c873";
    ctx.font = "700 28px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("FEATURED MENU", 60, panelY + 60);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 56px system-ui, -apple-system, 'Segoe UI', sans-serif";
    const nameLines = wrapText(ctx, restaurantName, W - 120, 1);
    ctx.fillText(nameLines[0], 60, panelY + 120);

    // Dish rows
    const listTop = panelY + 170;
    const rowGap = 14;
    const rowH = Math.min(78, (panelH - 230) / Math.max(1, dishes.length));
    ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
    dishes.forEach((d, i) => {
      const y = listTop + i * (rowH + rowGap);
      if (y + rowH > H - 60) return;
      // accent dot
      ctx.fillStyle = "#f0a526";
      ctx.beginPath();
      ctx.arc(75, y + rowH / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      // name
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      const nameMax = W - 280;
      const lines = wrapText(ctx, d.item.name, nameMax, 1);
      ctx.fillText(lines[0], 100, y + rowH / 2 + 10);
      // price
      if (d.item.price) {
        ctx.fillStyle = "#f7c873";
        ctx.textAlign = "right";
        ctx.fillText(d.item.price, W - 60, y + rowH / 2 + 10);
      }
    });

    // Footer URL
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "500 22px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(websiteUrl.replace(/^https?:\/\//, ""), 60, H - 40);
  }

  if (format.key === "story") {
    // Top 55% hero, bottom 45% panel
    const heroH = Math.round(H * 0.55);
    const cols = Math.min(dishes.length, 2);
    if (cols === 1) {
      ctx.save();
      drawImageCover(dishes[0].img, 0, 0, W, heroH);
      ctx.restore();
    } else {
      const cellW = W / cols;
      dishes.slice(0, cols).forEach((d, i) => {
        ctx.save();
        drawImageCover(d.img, i * cellW, 0, cellW, heroH);
        ctx.restore();
      });
    }
    // Hero fade
    const heroFade = ctx.createLinearGradient(0, heroH - 280, 0, heroH);
    heroFade.addColorStop(0, "rgba(0,0,0,0)");
    heroFade.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = heroFade;
    ctx.fillRect(0, heroH - 280, W, 280);

    // Panel
    ctx.fillStyle = "rgba(15, 8, 5, 0.94)";
    ctx.fillRect(0, heroH, W, H - heroH);

    // Eyebrow
    ctx.fillStyle = "#f7c873";
    ctx.font = "700 32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TODAY'S MENU", W / 2, heroH + 80);

    // Restaurant name
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 80px system-ui, sans-serif";
    const nameLines = wrapText(ctx, restaurantName, W - 100, 2);
    nameLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, heroH + 170 + i * 90);
    });

    // Divider
    ctx.fillStyle = "#f0a526";
    ctx.fillRect(W / 2 - 80, heroH + 200 + nameLines.length * 90, 160, 4);

    // Dish list (centered)
    const listTop = heroH + 250 + nameLines.length * 90;
    const available = H - listTop - 120;
    const rowH = Math.min(96, available / Math.max(1, dishes.length));
    dishes.forEach((d, i) => {
      const y = listTop + i * rowH;
      if (y + rowH > H - 100) return;
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 38px system-ui, sans-serif";
      ctx.textAlign = "center";
      const lines = wrapText(ctx, d.item.name, W - 120, 1);
      ctx.fillText(lines[0], W / 2, y + 44);
      if (d.item.price) {
        ctx.fillStyle = "#f7c873";
        ctx.font = "600 30px system-ui, sans-serif";
        ctx.fillText(d.item.price, W / 2, y + 82);
      }
    });

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "500 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(websiteUrl.replace(/^https?:\/\//, ""), W / 2, H - 60);
  }

  if (format.key === "landscape") {
    // Left 55% = hero collage, right 45% = info panel
    const leftW = Math.round(W * 0.55);
    const rightW = W - leftW;
    const cols = Math.min(dishes.length, 2);
    const rows = dishes.length > 2 ? 2 : 1;
    const cellW = leftW / cols;
    const cellH = H / rows;
    dishes.slice(0, cols * rows).forEach((d, i) => {
      const cx = (i % cols) * cellW;
      const cy = Math.floor(i / cols) * cellH;
      ctx.save();
      drawImageCover(d.img, cx, cy, cellW, cellH);
      ctx.restore();
    });

    // Right panel
    ctx.fillStyle = "rgba(15, 8, 5, 0.94)";
    ctx.fillRect(leftW, 0, rightW, H);

    // Accent bar
    ctx.fillStyle = "#f0a526";
    ctx.fillRect(leftW, 0, 8, H);

    const px = leftW + 60;
    ctx.textAlign = "left";

    ctx.fillStyle = "#f7c873";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText("FEATURED MENU", px, 80);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 56px system-ui, sans-serif";
    const nameLines = wrapText(ctx, restaurantName, rightW - 120, 2);
    nameLines.forEach((line, i) => {
      ctx.fillText(line, px, 140 + i * 64);
    });

    // Dish rows
    const listTop = 140 + nameLines.length * 64 + 40;
    const available = H - listTop - 80;
    const rowH = Math.min(70, available / Math.max(1, dishes.length));
    dishes.forEach((d, i) => {
      const y = listTop + i * rowH;
      if (y + rowH > H - 70) return;
      ctx.fillStyle = "#f0a526";
      ctx.beginPath();
      ctx.arc(px + 6, y + rowH / 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 26px system-ui, sans-serif";
      const lines = wrapText(ctx, d.item.name, rightW - 220, 1);
      ctx.fillText(lines[0], px + 28, y + rowH / 2 + 9);
      if (d.item.price) {
        ctx.fillStyle = "#f7c873";
        ctx.textAlign = "right";
        ctx.fillText(d.item.price, W - 50, y + rowH / 2 + 9);
        ctx.textAlign = "left";
      }
    });

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.fillText(websiteUrl.replace(/^https?:\/\//, ""), px, H - 40);
  }

  return canvas;
}

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

  // Cap to 6 dishes — beyond that the banner gets cluttered
  const cappedItems = useMemo(() => items.slice(0, 6), [items]);

  useEffect(() => {
    cancelRef.current = false;
    setBanners({
      square: { url: null, loading: true, error: null },
      story: { url: null, loading: true, error: null },
      landscape: { url: null, loading: true, error: null },
    });

    (async () => {
      try {
        // Load each dish image once at a moderate resolution; canvases will scale.
        const dishImages = await Promise.all(
          cappedItems.map(async (item) => {
            const url = pollinationsUrl(item, 1024, 1024);
            try {
              const img = await loadImage(url);
              return { item, img };
            } catch {
              // Fallback transparent 1x1 so layout still works
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
          {cappedItems.length} dish{cappedItems.length === 1 ? "" : "es"} · 3 ready-to-share formats · dish photography by{" "}
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
            Showing first {cappedItems.length} of {items.length} selected — banners stay legible with up to 6 dishes.
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
                      <p className="text-sm">Rendering banner…</p>
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
