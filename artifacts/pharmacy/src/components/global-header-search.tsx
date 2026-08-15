import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CatalogNormalizedCandidate } from "@workspace/catalog-index";
import { Search } from "lucide-react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { useCatalogClientNormalizedSearch } from "@/lib/catalog-client-index";
import { registryProductDetailHref } from "@/lib/registry-product-route";

export function isEditableSearchTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
  };
  return (
    element.isContentEditable === true ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(
      element.tagName?.toLocaleUpperCase("en-US") ?? "",
    )
  );
}

export function shouldFocusGlobalSearch(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "defaultPrevented"
    | "isComposing"
    | "ctrlKey"
    | "metaKey"
    | "altKey"
    | "target"
  >,
): boolean {
  return (
    event.key === "/" &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !isEditableSearchTarget(event.target)
  );
}

export function nextHeaderSearchIndex(
  current: number,
  key: "ArrowDown" | "ArrowUp",
  total: number,
): number {
  if (total <= 0) return -1;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % total;
  return current < 0 ? total - 1 : (current - 1 + total) % total;
}

interface HeaderSearchChoice {
  item: CatalogNormalizedCandidate;
  section: "primary" | "suggested";
}

export function flattenHeaderSearchChoices(
  primary: CatalogNormalizedCandidate[],
  suggested: CatalogNormalizedCandidate[],
): HeaderSearchChoice[] {
  return [
    ...primary.map((item) => ({ item, section: "primary" as const })),
    ...suggested.map((item) => ({ item, section: "suggested" as const })),
  ];
}

function headerSearchChoiceHref(choice: HeaderSearchChoice): string {
  const href = registryProductDetailHref({
    id: choice.item.product.productId,
    registration: { number: choice.item.product.registration },
  });
  const corrected = choice.item.correctedQuery?.trim();
  return corrected
    ? `${href}&correctedQuery=${encodeURIComponent(corrected)}`
    : href;
}

function ActiveGlobalHeaderSearch({
  className,
  registerShortcut,
  navigate,
}: {
  className: string;
  registerShortcut: boolean;
  navigate: (target: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const normalized = useCatalogClientNormalizedSearch(query.trim(), {
    limit: 5,
    scope: "registry_products",
  });
  const choices = useMemo(
    () =>
      flattenHeaderSearchChoices(
        normalized?.primary ?? [],
        normalized?.suggested ?? [],
      ),
    [normalized],
  );
  const showResults = open && query.trim().length >= 3 && choices.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [normalized?.query]);

  useEffect(() => {
    if (!registerShortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !window.matchMedia("(min-width: 768px)").matches ||
        !shouldFocusGlobalSearch(event)
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [registerShortcut]);

  const openChoice = (choice: HeaderSearchChoice) => {
    setOpen(false);
    setActiveIndex(-1);
    navigate(headerSearchChoiceHref(choice));
  };

  const renderChoices = (
    section: HeaderSearchChoice["section"],
    label: string,
  ) => {
    const sectionChoices = choices.filter(
      (choice) => choice.section === section,
    );
    if (!sectionChoices.length) return null;
    return (
      <section aria-label={label}>
        {section === "suggested" ? (
          <p className="border-t px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Можливо, ви мали на увазі
          </p>
        ) : null}
        {sectionChoices.map((choice) => {
          const index = choices.indexOf(choice);
          const product = choice.item.product;
          const active = activeIndex === index;
          return (
            <button
              key={`${section}:${product.productId}`}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={active}
              className={`flex min-h-12 w-full min-w-0 items-start gap-2 px-3 py-2 text-left ${
                active ? "bg-accent" : "hover:bg-accent/70"
              }`}
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openChoice(choice)}
              data-match-section={section}
            >
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold">
                  {product.tradeName}
                </span>
                <span className="block break-words text-xs text-muted-foreground">
                  {[product.inn, product.strength, product.form]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </button>
          );
        })}
      </section>
    );
  };

  return (
    <form
      className={`relative min-w-0 ${className}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const normalizedQuery = query.trim();
        navigate(
          normalizedQuery ? `/?q=${encodeURIComponent(normalizedQuery)}` : "/",
        );
        setOpen(false);
      }}
      data-testid="global-header-search"
    >
      <Search className="pointer-events-none absolute left-3 top-[1.375rem] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setQuery("");
            setOpen(false);
            setActiveIndex(-1);
            event.currentTarget.blur();
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!choices.length) return;
            const direction = event.key;
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) =>
              nextHeaderSearchIndex(current, direction, choices.length),
            );
            return;
          }
          if (event.key === "Enter" && showResults && activeIndex >= 0) {
            event.preventDefault();
            const choice = choices[activeIndex];
            if (choice) openChoice(choice);
          }
        }}
        placeholder="Швидкий пошук…"
        aria-label="Швидкий пошук препарату"
        aria-autocomplete="list"
        aria-controls={showResults ? listboxId : undefined}
        aria-expanded={showResults}
        aria-activedescendant={
          showResults && activeIndex >= 0
            ? `${listboxId}-${activeIndex}`
            : undefined
        }
        className="min-h-11 w-full bg-background pl-9 pr-3"
        data-testid="global-header-search-input"
      />
      {showResults ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Швидкі результати пошуку"
          className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-[70] max-h-[min(24rem,60vh)] overflow-y-auto rounded-xl border bg-popover py-1 text-popover-foreground shadow-xl"
          data-testid="global-header-search-results"
        >
          {renderChoices("primary", "Точні результати")}
          {renderChoices("suggested", "Виправлені підказки")}
        </div>
      ) : null}
    </form>
  );
}

export function GlobalHeaderSearch({
  className = "",
  registerShortcut = false,
}: {
  className?: string;
  registerShortcut?: boolean;
}) {
  const [location, navigate] = useLocation();
  if (location === "/" || location === "/search") return null;
  return (
    <ActiveGlobalHeaderSearch
      className={className}
      registerShortcut={registerShortcut}
      navigate={navigate}
    />
  );
}
