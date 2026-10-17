import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listarEventos, listarMetricas, type RadarStore } from "./radarApi";
import { PLATAFORMAS, dataCurta, diasAtras } from "./radarUtils";

interface RadarStoreSheetProps {
    store: RadarStore | null;
    onClose: () => void;
}

const grafico = {
    ads_active: { label: "Anúncios ativos", color: "hsl(var(--primary))" },
    products: { label: "Produtos", color: "hsl(var(--muted-foreground))" },
} satisfies ChartConfig;

export function RadarStoreSheet({ store, onClose }: RadarStoreSheetProps) {
    const desde = diasAtras(60);
    const metricas = useQuery({
        queryKey: ["radar_metrics", store?.id, desde],
        queryFn: () => listarMetricas(desde, store!.id),
        enabled: !!store,
    });
    const eventos = useQuery({
        queryKey: ["radar_events", "loja", store?.id, desde],
        queryFn: async () => (await listarEventos({ desde, storeId: store!.id })).eventos,
        enabled: !!store,
    });

    const serie = useMemo(
        () => (metricas.data ?? []).map((m) => ({ dia: dataCurta(m.day), ads_active: m.ads_active, products: m.products })),
        [metricas.data],
    );
    const temAnuncios = serie.some((p) => p.ads_active != null);
    const temProdutos = serie.some((p) => p.products != null);

    return (
        <Sheet open={!!store} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                {store && (
                    <>
                        <SheetHeader className="space-y-1 text-left">
                            <SheetTitle className="text-xl font-bold tracking-tight">{store.name || store.domain}</SheetTitle>
                            <SheetDescription asChild>
                                <div className="flex flex-wrap items-center gap-2">
                                    <a href={`https://${store.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                        {store.domain} <ExternalLink className="h-3 w-3" />
                                    </a>
                                    <Badge variant="secondary" className="font-normal">{store.niche}</Badge>
                                    <Badge variant="outline" className="font-normal">{PLATAFORMAS[store.platform] ?? store.platform}</Badge>
                                    {store.meta_page_id && (
                                        <a
                                            href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${store.meta_page_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs hover:underline"
                                        >
                                            Biblioteca de Anúncios <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                            </SheetDescription>
                        </SheetHeader>

                        <section className="mt-6 space-y-2">
                            <h3 className="text-sm font-semibold">Últimos 60 dias</h3>
                            {metricas.isLoading ? (
                                <Skeleton className="h-48 w-full rounded-xl" />
                            ) : serie.length < 2 ? (
                                <p className="text-sm text-muted-foreground">O gráfico aparece a partir do segundo dia de coleta.</p>
                            ) : (
                                <ChartContainer config={grafico} className="h-48 w-full">
                                    <LineChart data={serie} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                        <XAxis dataKey="dia" tickLine={false} axisLine={false} fontSize={11} />
                                        {temAnuncios && <YAxis yAxisId="ads" width={32} tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />}
                                        {temProdutos && <YAxis yAxisId="prod" orientation="right" width={40} tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />}
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        {temAnuncios && <Line yAxisId="ads" type="monotone" dataKey="ads_active" stroke="var(--color-ads_active)" strokeWidth={2} dot={false} connectNulls />}
                                        {temProdutos && <Line yAxisId="prod" type="monotone" dataKey="products" stroke="var(--color-products)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />}
                                    </LineChart>
                                </ChartContainer>
                            )}
                        </section>

                        <section className="mt-6 space-y-2">
                            <h3 className="text-sm font-semibold">Linha do tempo</h3>
                            {eventos.isLoading && <Skeleton className="h-32 w-full rounded-xl" />}
                            {!eventos.isLoading && (eventos.data ?? []).length === 0 && (
                                <p className="text-sm text-muted-foreground">Nenhuma mudança registrada ainda.</p>
                            )}
                            <ol className="space-y-3 border-l border-border pl-4">
                                {(eventos.data ?? []).map((e) => (
                                    <li key={e.id} className="relative">
                                        <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background", e.importance === 3 ? "bg-primary" : e.importance === 2 ? "bg-primary/60" : "bg-muted-foreground/40")} />
                                        <p className="text-xs text-muted-foreground">{dataCurta(e.occurred_on)}</p>
                                        <p className="text-sm text-foreground">{e.title}</p>
                                        <EventoDetalhe detail={e.detail} />
                                    </li>
                                ))}
                            </ol>
                        </section>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

// Mostra até 3 exemplos (produto, anúncio ou texto) que o coletor guardou no evento.
function EventoDetalhe({ detail }: { detail: Record<string, unknown> | null }) {
    const exemplos = Array.isArray(detail?.exemplos) ? (detail!.exemplos as Record<string, unknown>[]).slice(0, 3) : [];
    const depois = typeof detail?.depois === "string" ? detail.depois : null;
    if (!exemplos.length && !depois) return null;
    return (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {depois && <p className="line-clamp-2">“{depois}”</p>}
            {exemplos.map((x, i) => {
                // mudança de preço grava "para"; "de/por" ligado grava "por"
                const para = x.para ?? x.por;
                return (
                    <p key={i} className="line-clamp-1">
                        {String(x.titulo ?? x.texto ?? x.link ?? "")}
                        {x.preco != null ? ` · ${x.preco}` : ""}
                        {x.de != null && para != null ? ` · ${x.de} → ${para}` : ""}
                        {x.midia ? ` · ${x.midia === "video" ? "vídeo" : "imagem"}` : ""}
                    </p>
                );
            })}
        </div>
    );
}
