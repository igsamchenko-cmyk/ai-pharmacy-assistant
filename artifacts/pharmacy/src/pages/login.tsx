import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LogIn, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth, roleLabel } from "@/lib/auth";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await auth.login({ email, name: name || null });
      setLocation("/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося увійти.");
    }
  }

  if (auth.session?.authenticated) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <Card className="bg-card/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Вхід активний</h1>
                <p className="text-sm text-muted-foreground">
                  {auth.session.user?.email}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge>{roleLabel(auth.session.role)}</Badge>
              {auth.isLocalBeta && <Badge variant="outline">Локальна бета</Badge>}
            </div>
            <Button asChild>
              <Link href="/search">Продовжити</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-10">
      <Card className="bg-card/50">
        <CardContent className="p-6 space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">
              Вхід до приватної бети
            </h1>
            <p className="text-sm text-muted-foreground">
              Використайте email, який додано до списку доступу.
            </p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Ім'я
              </label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Необов'язково"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full gap-2">
              <LogIn className="w-4 h-4" />
              Увійти
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Реєстрація відкрита не для всіх. Доступ надає адміністратор через
            ADMIN_EMAILS або ALLOWED_EMAILS у deployment settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
