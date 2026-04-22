import { MenuItem } from "@/types/menu";
import { Tag } from "lucide-react";

interface MenuItemCardProps {
  item: MenuItem;
  accentVar: string;
}

export const MenuItemCard = ({ item, accentVar }: MenuItemCardProps) => {
  const accent = `hsl(var(${accentVar}))`;

  return (
    <article
      className="group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-soft transition-smooth hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elegant"
      style={{ ["--accent" as string]: accent }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl opacity-70 transition-smooth group-hover:opacity-100"
        style={{ backgroundColor: accent }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-4">
        <h3 className="flex-1 text-lg font-semibold leading-tight text-foreground">
          {item.name}
        </h3>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-sm font-bold tracking-wide"
          style={
            item.price
              ? {
                  backgroundColor: `hsl(var(${accentVar}) / 0.12)`,
                  color: accent,
                }
              : {
                  backgroundColor: "hsl(var(--muted) / 0.6)",
                  color: "hsl(var(--muted-foreground))",
                }
          }
          aria-label={item.price ? `Price ${item.price}` : "Price not listed"}
          title={item.price ? undefined : "Price not listed on website"}
        >
          {item.price || "—"}
        </span>
      </div>

      {item.description && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      )}

      {item.category && (
        <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs font-medium text-muted-foreground">
          <Tag className="h-3 w-3" />
          {item.category}
        </div>
      )}
    </article>
  );
};
