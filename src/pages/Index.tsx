import { useState } from "react";
import { ChefHat, Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UrlInputForm } from "@/components/UrlInputForm";
import { ScrapingProgress } from "@/components/ScrapingProgress";
import { MenuList } from "@/components/MenuList";
import { MenuItem, ScrapeResponse } from "@/types/menu";
import { Button } from "@/components/ui/button";

type Status = "idle" | "loading" | "success" | "error";

const Index = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [submittedUrl, setSubmittedUrl] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleScrape = async (url: string) => {
    setStatus("loading");
    setItems([]);
    setRestaurantName(null);
    setErrorMsg("");
    setSubmittedUrl(url);

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
              MenuCraft
            </span>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Phase 1 · Menu extraction
          </div>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-6xl flex-col items-center px-6 py-16 sm:py-24">
        {status === "idle" && (
          <div className="flex w-full flex-col items-center gap-10 animate-fade-in-up">
            <div className="flex max-w-3xl flex-col items-center gap-5 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                AI menu scraper
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
                Turn any restaurant website into a{" "}
                <span className="bg-gradient-warm bg-clip-text text-transparent">
                  structured menu
                </span>
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Paste your restaurant's URL. We'll fetch the page, extract every
                dish, and clean the data with AI — ready for campaign banners.
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
                Deduplicated
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

        {status === "success" && (
          <div className="flex w-full flex-col items-center gap-8">
            <div className="flex w-full justify-end">
              <Button onClick={reset} variant="outline" size="sm" className="gap-2">
                <RotateCcw className="h-3.5 w-3.5" />
                New scrape
              </Button>
            </div>
            <MenuList
              items={items}
              restaurantName={restaurantName}
              websiteUrl={submittedUrl}
            />
          </div>
        )}
      </main>

      <footer className="relative border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Built with Lovable Cloud · Phase 1 of restaurant banner generator
      </footer>
    </div>
  );
};

export default Index;
