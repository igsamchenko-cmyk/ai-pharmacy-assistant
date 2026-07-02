import { Card, CardContent } from "@/components/ui/card";
import { GlobalDisclaimer } from "@/components/disclaimer";
import { Pill, ShieldAlert, HeartHandshake, Database } from "lucide-react";
import { DEMO_LABEL } from "@/lib/constants";

export default function About() {
  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1 text-center py-6">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Pill className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Про FarmAssist</h1>
        <p className="text-muted-foreground">
          Інформаційний помічник фармацевта
        </p>
      </div>

      <GlobalDisclaimer />

      <div className="grid gap-4 mt-6">
        <Card className="border-l-4 border-l-primary bg-card/50">
          <CardContent className="p-5 flex gap-4">
            <HeartHandshake className="w-6 h-6 text-primary shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-foreground text-lg mb-1">
                Що робить застосунок?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Допомагає швидко знаходити інформацію про препарати, їх аналоги
                та можливі взаємодії. Штучний інтелект структурує складні
                інструкції у зручний формат для швидкого читання за першим
                столом.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive bg-card/50">
          <CardContent className="p-5 flex gap-4">
            <ShieldAlert className="w-6 h-6 text-destructive shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-foreground text-lg mb-1">
                Чого застосунок НЕ робить?
              </h3>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-4 space-y-1">
                <li>Не ставить діагнози</li>
                <li>Не призначає лікування</li>
                <li>Не замінює консультацію лікаря</li>
                <li>Не несе юридичної відповідальності за медичні рішення</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-accent bg-card/50">
          <CardContent className="p-5 flex gap-4">
            <Database className="w-6 h-6 text-accent-foreground shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-foreground text-lg mb-1">
                Дані та безпека
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Наразі система працює на{" "}
                <span className="font-bold text-foreground bg-accent/30 px-1 rounded">
                  {DEMO_LABEL}
                </span>
                . Всі препарати вигадані, а інформація згенерована для
                демонстрації можливостей платформи.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-center text-xs text-muted-foreground pt-8">
        Версія 1.0.0 • Створено за допомогою AI
      </div>
    </div>
  );
}
