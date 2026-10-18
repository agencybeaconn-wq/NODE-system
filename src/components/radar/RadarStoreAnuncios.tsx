import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listarAnunciosDaLoja, type RadarStore } from "./radarApi";
import { ImagemExterna } from "./RadarBits";
import { fmtNumero, linkBiblioteca } from "./radarUtils";

const FILTROS = [
    { v: "todos", rotulo: "Todos" },
    { v: "vencedores", rotulo: "30+ dias" },
    { v: "video", rotulo: "Vídeo" },
    { v: "img", rotulo: "Imagem" },
] as const;

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
    return (
        <div className="rounded-xl bg-muted/50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{rotulo}</div>
            <div className="text-sm font-semibold tabular-nums text-foreground">{valor}</div>
        </div>
    );
}

export function RadarStoreAnuncios({ store }: { store: RadarStore }) {
    const a = store.profile?.anuncios;
    const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["v"]>("todos");
    const anuncios = useQuery({ queryKey: ["radar_ads", store.id, store.profile_at], queryFn: () => listarAnunciosDaLoja(store.id) });
    const lista = useMemo(
        () =>
            (anuncios.data ?? []).filter((x) =>
                filtro === "todos" ? true : filtro === "vencedores" ? (x.dias ?? 0) >= 30 : x.midia === filtro,
            ),
        [anuncios.data, filtro],
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Dado rotulo="Ativos" valor={a?.criativos != null && a.criativos !== a.ativos ? `${fmtNumero(a.ativos)} (${fmtNumero(a.criativos)} criativos)` : fmtNumero(a?.ativos)} />
                <Dado rotulo="Rodando 30+ dias" valor={fmtNumero(a?.vencedores)} />
                <Dado rotulo="Vídeo / imagem" valor={a ? `${a.video} / ${a.imagem}` : "–"} />
                <Dado rotulo="Novos (7 dias)" valor={a?.novos_7d == null ? "sem histórico" : fmtNumero(a.novos_7d)} />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {FILTROS.map((f) => (
                    <button
                        key={f.v}
                        type="button"
                        onClick={() => setFiltro(f.v)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors active:scale-[0.98]",
                            filtro === f.v ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                    >
                        {f.rotulo}
                    </button>
                ))}
                {store.meta_page_id && (
                    <a
                        href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id=${store.meta_page_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                        Ver na Biblioteca <ExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>

            {anuncios.isLoading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-xl" />)}
                </div>
            )}
            {anuncios.error && <p className="text-sm text-destructive">{(anuncios.error as Error).message}</p>}
            {!anuncios.isLoading && lista.length === 0 && (
                <p className="rounded-xl bg-muted/50 px-3 py-6 text-center text-xs text-muted-foreground">Nenhum anúncio nesse filtro.</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {lista.map((x) => (
                    <a
                        key={x.id}
                        href={linkBiblioteca(x.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block space-y-1.5 rounded-xl transition-opacity hover:opacity-90"
                    >
                        <div className="relative">
                            <ImagemExterna src={x.capa} alt={x.texto ?? "anúncio"} className="aspect-[4/5] w-full rounded-xl" />
                            {x.midia === "video" && (
                                <span className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1"><Play className="h-3 w-3 fill-foreground" /></span>
                            )}
                            {x.dias != null && (
                                <span className={cn("absolute bottom-1.5 left-1.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums", x.dias >= 30 ? "bg-emerald-500 text-white" : "bg-background/90 text-foreground")}>
                                    {x.dias} dias
                                </span>
                            )}
                        </div>
                        {x.texto && <p className="line-clamp-2 text-[11px] text-muted-foreground">{x.texto}</p>}
                    </a>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">As capas vêm do servidor da Meta e expiram em alguns dias; a próxima coleta renova.</p>
        </div>
    );
}
