import { ExternalLink, MoreHorizontal, Pause, Play, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RadarRun, RadarStore, RadarTag } from "./radarApi";
import { Estrelas, ImagemExterna, NivelSelo, PotencialAnel, TagChip } from "./RadarBits";
import { PLATAFORMAS, dataHora, fmtMoeda, fmtNumero, moedaDaLoja, nivelDe, sinal, statusColeta } from "./radarUtils";

interface RadarStoreCardProps {
    store: RadarStore;
    tags: RadarTag[];
    runs: RadarRun[];
    onAbrir: () => void;
    onAlternarTag: (tagId: number, ligar: boolean) => void;
    onAlternarAtiva: () => void;
    onGerenciarTags: () => void;
}

const COR_STATUS: Record<string, string> = {
    ok: "bg-emerald-500",
    skipped: "bg-amber-500",
    blocked: "bg-amber-500",
    error: "bg-destructive",
    never: "bg-muted-foreground/40",
};
const TEXTO_STATUS: Record<string, string> = { ok: "coleta ok", skipped: "coleta parcial", blocked: "anúncios bloqueados", error: "erro na coleta", never: "aguardando 1ª coleta" };

function Numero({ rotulo, valor, extra }: { rotulo: string; valor: string; extra?: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="truncate text-[11px] text-muted-foreground">{rotulo}</div>
            <div className="truncate text-base font-semibold tabular-nums text-foreground">
                {valor}
                {extra}
            </div>
        </div>
    );
}

export function RadarStoreCard({ store, tags, runs, onAbrir, onAlternarTag, onAlternarAtiva, onGerenciarTags }: RadarStoreCardProps) {
    const p = store.profile;
    const nivel = nivelDe(store.potential_detail);
    const st = statusColeta(runs);
    const minhasTags = tags.filter((t) => store.tag_ids.includes(t.id));
    // Vitrine do card: mais vendidos > mais anunciados > capas dos anúncios
    const vitrine = [
        ...(p?.mais_vendidos ?? []).map((x) => ({ img: x.img, titulo: x.titulo })),
        ...(p?.mais_anunciados ?? []).filter((x) => x.img).map((x) => ({ img: x.img, titulo: x.titulo })),
        ...(p?.anuncios_destaque ?? []).map((x) => ({ img: x.capa, titulo: x.texto ?? "anúncio" })),
    ].filter((x) => x.img).slice(0, 3);
    const crescimento = p?.anuncios?.crescimento_7d ?? null;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onAbrir}
            onKeyDown={(e) => {
                // Enter/Espaço do menu de ações sobe pelo portal até aqui: só o próprio card abre a ficha.
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAbrir();
                }
            }}
            className={cn(
                "group flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-200",
                "hover:-translate-y-0.5 hover:border-border hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !store.active && "opacity-60",
            )}
        >
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">{store.name || store.domain}</div>
                    <div className="truncate text-xs text-muted-foreground">{store.domain}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <NivelSelo nivel={nivel} />
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{store.niche}</span>
                        <span className="text-[11px] text-muted-foreground">{PLATAFORMAS[store.platform] ?? store.platform} · {store.country}</span>
                    </div>
                </div>
                <PotencialAnel score={store.potential} nivel={nivel} />
            </div>

            {vitrine.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                    {vitrine.map((v, i) => (
                        <ImagemExterna key={`${v.img}-${i}`} src={v.img} alt={v.titulo} className="aspect-square w-full rounded-lg" />
                    ))}
                </div>
            ) : (
                <div className="flex h-16 items-center justify-center rounded-lg bg-muted/50 text-xs text-muted-foreground">sem imagens ainda</div>
            )}

            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Numero
                    rotulo="Anúncios ativos"
                    valor={fmtNumero(p?.anuncios?.ativos)}
                    extra={crescimento ? <span className={cn("ml-1 text-xs", crescimento > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{sinal(crescimento)}</span> : null}
                />
                <Numero rotulo="Rodando há 30+ dias" valor={fmtNumero(p?.anuncios?.vencedores)} />
                <Numero rotulo="Produtos" valor={p?.catalogo ? (p.catalogo.truncado ? `${fmtNumero(p.catalogo.lidos)}+` : fmtNumero(p.catalogo.total)) : "–"} />
                <Numero rotulo="Preço mediano" valor={fmtMoeda(p?.catalogo?.preco_mediano, moedaDaLoja(store))} />
            </div>

            {minhasTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {minhasTags.map((t) => <TagChip key={t.id} tag={t} />)}
                </div>
            )}

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                <div className="flex items-center gap-2">
                    <Estrelas valor={store.rating} tamanho="h-3.5 w-3.5" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className={cn("h-2 w-2 rounded-full", COR_STATUS[st.status])} aria-label={TEXTO_STATUS[st.status]} />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                            {TEXTO_STATUS[st.status]}
                            {st.quando ? ` · ${dataHora(st.quando)}` : ""}
                            {st.erro ? ` · ${st.erro}` : ""}
                        </TooltipContent>
                    </Tooltip>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações da loja">
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuLabel className="flex items-center gap-2 text-xs"><Tags className="h-3.5 w-3.5" /> Tags</DropdownMenuLabel>
                        {tags.length === 0 && <div className="px-2 pb-1.5 text-xs text-muted-foreground">Nenhuma tag criada.</div>}
                        {tags.map((t) => (
                            <DropdownMenuCheckboxItem
                                key={t.id}
                                checked={store.tag_ids.includes(t.id)}
                                onCheckedChange={(v) => onAlternarTag(t.id, !!v)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                                {t.name}
                            </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuItem onSelect={onGerenciarTags}>Criar ou editar tags…</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <a href={`https://${store.domain}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir a loja
                            </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onAlternarAtiva}>
                            {store.active ? <Pause className="mr-2 h-3.5 w-3.5" /> : <Play className="mr-2 h-3.5 w-3.5" />}
                            {store.active ? "Pausar coleta" : "Retomar coleta"}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
