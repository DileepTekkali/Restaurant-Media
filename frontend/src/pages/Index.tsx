import { useMemo, useState } from "react";
import { ChefHat, Sparkles, AlertCircle, RotateCcw, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UrlInputForm } from "@/components/UrlInputForm";
import { ScrapingProgress } from "@/components/ScrapingProgress";
import { MenuList } from "@/components/MenuList";
import { BannerStudio } from "@/components/BannerStudio";
import { CampaignSelector } from "@/components/CampaignSelector";
import { MenuItem, ScrapeResponse } from "@/types/menu";
import { CampaignChoice } from "@/types/campaign";
import { Button } from "@/components/ui/button";

type Status = "idle" | "loading" | "success" | "error";
type Stage = "menu" | "campaign" | "banner";

const Index = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [submittedUrl, setSubmittedUrl] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage>("menu");
  const [campaign, setCampaign] = useState<CampaignChoice | null>(null);

  const handleScrape = async (url: string) => {
    setStatus("loading");
    setItems([]);
    setRestaurantName(null);
    setLogoUrl(null);
    setErrorMsg("");
    setSubmittedUrl(url);
    setSelectedIds(new Set());
    setStage("menu");
    setCampaign(null);

    try {
      const { data, error } = await supabase.functions.invoke<ScrapeResponse>(
        "scrape-menu",
        { body: { restaurantUrl: url } },
      );

      if (error) throw new Error(error.message);
      if (!data) throw new Error("No response from server");

      if (data.status === "failed" || data.menuItems.length === 0) {
        setStatus("error");
        setErrorMsg(
          data.error ||
            "We couldn't extract a menu from this page. The site may load its menu dynamically or use a format we can't read yet.",
        );
        return;
      }

      setItems(data.menuItems);
      setRestaurantName(data.restaurantName ?? null);
      setLogoUrl(data.logoUrl ?? null);
      setStatus("success");
      toast({
        title: "Menu extracted",
        description: `Found ${data.menuItems.length} items`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setStatus("error");
      setErrorMsg(msg);
      toast({
        title: "Scraping failed",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const reset = () => {
    setStatus("idle");
    setItems([]);
    setErrorMsg("");
    setSubmittedUrl("");
    setRestaurantName(null);
    setLogoUrl(null);
    setSelectedIds(new Set());
    setStage("menu");
    setCampaign(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectCategory = (ids: string[], allAlreadySelected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allAlreadySelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds],
  );

  const goToCampaign = () => {
    if (selectedItems.length === 0) {
      toast({
        title: "Pick at least one dish",
        description: "Tap dishes to select them, then choose a campaign.",
      });
      return;
    }
    setStage("campaign");
  };

  const handleCampaignConfirm = (choice: CampaignChoice) => {
    setCampaign(choice);
    setStage("banner");
  };

  return (
    <div className="relative min-h-screen bg-gradient-subtle">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-gradient-hero" />

      {/* Header */}
      <header className="relative border-b border-border/60 bg-background/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-warm shadow-soft">
              <ChefHat className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              MENU2MEDIA
            </span>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {stage === "banner"
              ? "Step 3 · Banner studio"
              : stage === "campaign"
                ? "Step 2 · Campaign"
                : "Step 1 · Menu"}
          </div>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-6xl flex-col items-center px-6 py-16 sm:py-24">
        {status === "idle" && (
          <div className="flex w-full flex-col items-center gap-10 animate-fade-in-up">
            <div className="flex max-w-3xl flex-col items-center gap-5 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                AI menu scraper + banner studio
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
                Turn any restaurant website into
                shareable banners
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Paste your restaurant's URL. We'll extract every dish, then let you
                pick a few favourites and generate ready-to-post campaign banners.
              </p>
            </div>

            <UrlInputForm onSubmit={handleScrape} isLoading={false} />

            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Auto-categorized
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Prices preserved
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--cat-beverages))]" />
                Banners in 3 sizes
              </span>
            </div>
          </div>
        )}

        {status === "loading" && <ScrapingProgress />}

        {status === "error" && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-10 text-center shadow-soft animate-fade-in-up">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold text-foreground">
                Couldn't extract menu
              </h3>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
            </div>
            <Button onClick={reset} variant="outline" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Try another URL
            </Button>
          </div>
        )}

        {status === "success" && stage === "menu" && (
          <div className="flex w-full flex-col items-center gap-8">
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Tap dishes to select them, then build banners.
              </p>
              <Button onClick={reset} variant="outline" size="sm" className="gap-2">
                <RotateCcw className="h-3.5 w-3.5" />
                New scrape
              </Button>
            </div>
            <MenuList
              items={items}
              restaurantName={restaurantName}
              websiteUrl={submittedUrl}
              selectable
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectCategory={selectCategory}
            />
          </div>
        )}

        {status === "success" && stage === "campaign" && (
          <CampaignSelector
            selectedCount={selectedItems.length}
            onBack={() => setStage("menu")}
            onConfirm={handleCampaignConfirm}
          />
        )}

        {status === "success" && stage === "banner" && campaign && (
          <BannerStudio
            items={selectedItems}
            restaurantName={restaurantName}
            websiteUrl={submittedUrl}
            logoUrl={logoUrl}
            campaign={campaign}
            onBack={() => setStage("campaign")}
          />
        )}
      </main>

      {/* Sticky selection bar */}
      {status === "success" && stage === "menu" && selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-3xl items-center justify-between gap-4 rounded-full border border-border bg-card/95 px-5 py-3 shadow-elegant backdrop-blur-sm">
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">
              {selectedIds.size}
            </span>
            <span className="text-foreground">
              dish{selectedIds.size === 1 ? "" : "es"} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Clear
            </button>
          </div>
          <Button onClick={goToCampaign} className="gap-2">
            <Wand2 className="h-4 w-4" />
            Choose campaign
          </Button>
        </div>
      )}

      <footer className="relative mt-12 border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        MENU2MEDIA · Restaurant menus into ready-to-post banners
      </footer>
    </div>
  );
};

export default Index;
