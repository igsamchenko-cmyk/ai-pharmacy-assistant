import { GitCompare } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useInteractionCart } from "@/lib/interaction-cart";

export function InteractionCartIndicator() {
  const cart = useInteractionCart();
  if (!cart.count) return null;
  return (
    <Link
      href="/interactions"
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex min-h-12 items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-xl transition-transform hover:scale-[1.02] md:bottom-6"
      aria-label={`Відкрити перевірку взаємодій: ${cart.count} у списку`}
      data-testid="interaction-cart-indicator"
    >
      <GitCompare className="h-5 w-5" />
      <span className="hidden sm:inline">До взаємодій</span>
      <Badge className="min-w-6 justify-center bg-background text-foreground">
        {cart.count}
      </Badge>
    </Link>
  );
}
