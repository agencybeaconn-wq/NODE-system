import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listarEventos, type RadarEvent, type RadarStore } from "./radarApi";
import { dataLonga, diasAtras } from "./radarUtils";

interface RadarFeedProps {
    stores: RadarStore[];
    niche: string;
    onOpenStore: (store: RadarStore) => void;
}

const PERIODOS = [
    { value: "1", label: "Hoje" },
    { value: "7", label: "Últimos 7 dias" },
    { value: "30", label: "Últimos 30 dias" },
];

const COR_IMPORTANCIA: Record<number, string> = {
    3: "bg-primary",
    2: "bg-primary/60",
    1: "bg-muted-foreground/30",
};

export function RadarFeed({ stores, niche, onOpenStore }: RadarFeedProps) {
    const [periodo, setPeriodo] = useState("7");
    const [minImportancia, setMinImportancia] = useState("2");
    const desde = diasAtras(Number(periodo) - 1);
    const porId = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
    // Filtro de nicho vai pro servidor como lista de lojas (null = todas).
    const idsDoNicho = useMemo(
        () => (niche === "all" ? null : stores.filter((s) => s.niche === niche).map((s) => s.id).sort()),
        [stores, niche],
    );

    const eventos = useQuery({
        queryKey: ["radar_events", desde, minImportancia, idsDoNicho],
        queryFn: () => listarEventos({ desde, minImportancia: Number(minImportancia), storeIds: idsDoNicho ?? undefined }),
    });

    const grupos = useMemo(() => {
        const filtrados = (eventos.data?.eventos ?? []).filter((e) => porId.has(e.store_id));
        const mapa = new Map<string, RadarEvent[]>();
        for (const e of filtrados) {
            const l = mapa.get(e.occurred_on) ?? [];
            l.push(e);
            mapa.set(e.occurred_on, l);
        }
        return [...mapa.entries()];
    }, [eventos.data, porId]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <Select value={periodo} onValueChange={setPeriodo}>
                    <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {PERIODOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={minImportancia} onValueChange={setMinImportancia}>
                    <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="3">Só as grandes</SelectItem>
                        <SelectItem value="2">Relevantes</SelectItem>
                        <SelectItem value="1">Todas as mudanças</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {eventos.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
            {eventos.data?.truncado && (
                <p className="text-xs text-muted-foreground">
                    Mostrando só as 3.000 mudanças mais recentes desse período. Filtre por nicho ou relevância pra ver o resto.
                </p>
            )}
            {eventos.error && (
                <p className="text-sm text-destructive">{(eventos.error as Error).message}</p>
            )}
            {!eventos.isLoading && !eventos.error && grupos.length === 0 && (
                <Card className="rounded-2xl">
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        Nenhuma mudança nesse período. A primeira coleta só registra a linha de base;
                        as mudanças aparecem a partir da segunda.
                    </CardContent>
                </Card>
            )}

            {grupos.map(([dia, lista]) => (
                <section key={dia} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {dataLonga(dia)} · {lista.length}
                    </h3>
                    <Card className="rounded-2xl divide-y divide-border/60 overflow-hidden">
                        {lista.map((e) => {
                            const loja = porId.get(e.store_id)!;
                            return (
                                <button
                                    key={e.id}
                                    type="button"
                                    onClick={() => onOpenStore(loja)}
                                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                                >
                                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", COR_IMPORTANCIA[e.importance])} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-foreground">{e.title}</span>
                                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span className="truncate">{loja.name || loja.domain}</span>
                                            <Badge variant="secondary" className="font-normal">{loja.niche}</Badge>
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </Card>
                </section>
            ))}
        </div>
    );
}
