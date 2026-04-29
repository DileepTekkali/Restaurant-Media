import { Loader2, Search, Globe } from "lucide-react";
import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UrlInputFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

export const UrlInputForm = ({ onSubmit, isLoading }: UrlInputFormProps) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl rounded-2xl border border-border bg-card p-2 shadow-elegant transition-smooth focus-within:shadow-glow"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="url"
            placeholder="yourrestaurant.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            className="h-14 border-0 bg-transparent pl-12 pr-4 text-base shadow-none focus-visible:ring-0"
            aria-label="Restaurant website URL"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={isLoading || !url.trim()}
          className="h-14 gap-2 bg-gradient-warm px-8 text-base font-semibold text-primary-foreground shadow-soft transition-smooth hover:shadow-glow"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Scraping…
            </>
          ) : (
            <>
              <Search className="h-5 w-5" />
              Extract menu
            </>
          )}
        </Button>
      </div>
    </form>
  );
};
