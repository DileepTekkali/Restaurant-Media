import { MenuItem, GENERIC_CATEGORY_ORDER, getCategoryColorVar } from "@/types/menu";
import { MenuItemCard } from "./MenuItemCard";

interface MenuListProps {
  items: MenuItem[];
  restaurantName?: string | null;
  websiteUrl?: string;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectCategory?: (ids: string[], allAlreadySelected: boolean) => void;
}

const GENERIC_SET = new Set<string>(GENERIC_CATEGORY_ORDER);

export const MenuList = ({
  items,
  restaurantName,
  websiteUrl,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onSelectCategory,
}: MenuListProps) => {
  const grouped = new Map<string, MenuItem[]>();
  for (const item of items) {
    const cat = (item.category && item.category.trim()) || "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  const allCats = [...grouped.keys()];
  const customCats = allCats.filter((c) => !GENERIC_SET.has(c));
  const genericCats = GENERIC_CATEGORY_ORDER.filter((c) => grouped.has(c));
  const orderedCats = [...customCats, ...genericCats];

  return (
    <section className="w-full max-w-6xl animate-fade-in-up">
      <header className="mb-8 flex flex-col gap-2 border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Extracted menu
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {restaurantName || "Your restaurant"}
        </h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-primary hover:underline"
            >
              {websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
          <span>
            <strong className="text-foreground">{items.length}</strong> items in{" "}
            <strong className="text-foreground">{orderedCats.length}</strong>{" "}
            categories
          </span>
          {selectable && selectedIds && (
            <span>
              <strong className="text-primary">{selectedIds.size}</strong>{" "}
              selected
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-12">
        {orderedCats.map((cat) => {
          const accentVar = getCategoryColorVar(cat);
          const catItems = grouped.get(cat)!;
          const catIds = catItems.map((i) => i.id);
          const allSelected =
            selectable && selectedIds
              ? catIds.every((id) => selectedIds.has(id))
              : false;

          return (
            <div key={cat}>
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `hsl(var(${accentVar}))` }}
                />
                <h3 className="text-lg font-semibold text-foreground">
                  {cat}
                </h3>
                <span className="text-sm text-muted-foreground">
                  ({catItems.length})
                </span>
                <div className="ml-2 flex-1 border-t border-dashed border-border" />
                {selectable && onSelectCategory && (
                  <button
                    type="button"
                    onClick={() => onSelectCategory(catIds, allSelected)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {allSelected ? "Clear" : "Select all"}
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {catItems.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    accentVar={accentVar}
                    selectable={selectable}
                    selected={selectedIds?.has(item.id)}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
