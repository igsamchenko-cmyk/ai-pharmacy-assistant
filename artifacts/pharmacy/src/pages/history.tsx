import { useListHistory, getListHistoryQueryKey, useDeleteHistory, useClearHistory } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, Trash, Search, GitCompare, Sparkles, Scan as ScanIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { type HistoryEntryType } from "@workspace/api-client-react";

export default function History() {
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useListHistory({
    query: { queryKey: getListHistoryQueryKey() }
  });

  const deleteHistory = useDeleteHistory();
  const clearHistory = useClearHistory();

  const handleDelete = (id: string) => {
    deleteHistory.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListHistoryQueryKey() })
    });
  };

  const handleClear = () => {
    clearHistory.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListHistoryQueryKey() })
    });
  };

  const typeConfig: Record<HistoryEntryType, { icon: any, label: string, color: string }> = {
    search: { icon: Search, label: "Пошук", color: "bg-blue-500/10 text-blue-700 border-blue-200" },
    interaction: { icon: GitCompare, label: "Взаємодії", color: "bg-amber-500/10 text-amber-700 border-amber-200" },
    ai: { icon: Sparkles, label: "AI", color: "bg-purple-500/10 text-purple-700 border-purple-200" },
    ocr: { icon: ScanIcon, label: "Скан", color: "bg-green-500/10 text-green-700 border-green-200" },
    analogs: { icon: GitCompare, label: "Аналоги", color: "bg-teal-500/10 text-teal-700 border-teal-200" }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('uk-UA', { 
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    }).format(d);
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Clock className="w-6 h-6" />
            Історія запитів
          </h1>
          <p className="text-sm text-muted-foreground">Ваші останні дії в системі.</p>
        </div>
        
        {history && history.length > 0 && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClear} 
            disabled={clearHistory.isPending}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
            data-testid="btn-clear-history"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Очистити все
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))
        ) : !history || history.length === 0 ? (
          <div className="text-center py-16 px-4 border-2 border-dashed border-border rounded-xl">
            <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-lg font-bold text-foreground">Історія порожня</p>
            <p className="text-sm text-muted-foreground mt-2">Тут будуть зберігатися ваші останні пошуки та перевірки.</p>
          </div>
        ) : (
          history.map((entry) => {
            const config = typeConfig[entry.type];
            const Icon = config.icon;
            return (
              <Card key={entry.id} className="overflow-hidden group hover:border-border/80 transition-colors">
                <CardContent className="p-4 flex items-start justify-between gap-4">
                  <div className="flex gap-4 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg shrink-0 flex items-center justify-center ${config.color.split(' ')[0]}`}>
                      <Icon className="w-5 h-5 opacity-70" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] uppercase font-bold ${config.color}`}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                      </div>
                      <h4 className="font-bold text-foreground truncate">{entry.title}</h4>
                      {entry.detail && <p className="text-sm text-muted-foreground truncate">{entry.detail}</p>}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(entry.id)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100 shrink-0"
                    title="Видалити"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
