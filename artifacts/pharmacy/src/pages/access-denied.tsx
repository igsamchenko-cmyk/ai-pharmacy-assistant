import { Link } from "wouter";
import { LockKeyhole } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AccessDenied({
  title = "Доступ обмежено",
  message = "Цей розділ доступний лише користувачам з відповідною роллю.",
  actionHref = "/",
  actionLabel = "На головну",
}: {
  title?: string;
  message?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="max-w-lg mx-auto py-12">
      <Card className="bg-card/50">
        <CardContent className="p-6 space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <LockKeyhole className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-2">{message}</p>
          </div>
          <Button asChild>
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
