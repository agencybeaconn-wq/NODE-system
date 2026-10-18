import { ExternalLink, Megaphone } from "lucide-react";
import type { ProdutoPerfil, RadarStore } from "./radarApi";
import { ImagemExterna } from "./RadarBits";
import { dataHora, fmtMoeda, moedaDaLoja } from "./radarUtils";

function CardProduto({ p, moeda, posicao }: { p: ProdutoPerfil; moeda: string | null; posicao: number }) {
    const conteudo = (
        <>
            <div className="relative">
                <ImagemExterna src={p.img} alt={p.titulo} className="aspect-square w-full rounded-xl" />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-1.5 text-[11px] font-bold tabular-nums text-foreground">{posicao}º</span>
                {p.disponivel === false && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/90 px-1.5 text-[10px] text-muted-foreground">esgotado</span>}
            </div>
            <div className="mt-1.5 line-clamp-2 text-xs font-medium text-foreground">{p.titulo}</div>
            <div className="text-xs tabular-nums text-muted-foreground">
                {p.de ? <span className="mr-1 line-through">{fmtMoeda(p.de, moeda)}</span> : null}
                {fmtMoeda(p.preco, moeda)}
            </div>
        </>
    );
    return p.url ? (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl transition-opacity hover:opacity-80">{conteudo}</a>
    ) : (
        <div>{conteudo}</div>
    );
}

export function RadarStoreProdutos({ store }: { store: RadarStore }) {
    const p = store.profile;
    const vendidos = p?.mais_vendidos ?? null;
    const anunciados = p?.mais_anunciados ?? [];
    const suporta = ["shopify", "nuvemshop"].includes(store.platform);
    const moeda = moedaDaLoja(store);

    return (
        <div className="space-y-6">
            <section className="space-y-2">
                <div>
                    <h3 className="text-sm font-semibold">Mais vendidos</h3>
                    <p className="text-xs text-muted-foreground">
                        Na ordem "mais vendidos" que a própria loja publica na vitrine.
                        {p?.mais_vendidos_em ? ` Lido em ${dataHora(p.mais_vendidos_em)}.` : ""}
                    </p>
                </div>
                {vendidos?.length ? (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                        {vendidos.map((v, i) => <CardProduto key={`${v.handle}-${i}`} p={v} moeda={moeda} posicao={i + 1} />)}
                    </div>
                ) : (
                    <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
                        {suporta ? "Aparece depois da próxima coleta." : "Essa plataforma não publica a ordem de mais vendidos."}
                    </p>
                )}
            </section>

            <section className="space-y-2">
                <div>
                    <h3 className="text-sm font-semibold">Mais anunciados</h3>
                    <p className="text-xs text-muted-foreground">Pra onde os anúncios ativos mandam o cliente. Produto com muitos anúncios é aposta da loja.</p>
                </div>
                {anunciados.length ? (
                    <ul className="divide-y divide-border/60 rounded-2xl border border-border/60">
                        {anunciados.map((a, i) => (
                            <li key={`${a.url}-${i}`} className="flex items-center gap-3 px-3 py-2">
                                <ImagemExterna src={a.img} alt={a.titulo} className="h-11 w-11 shrink-0 rounded-lg" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-foreground">{a.titulo}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {a.tipo === "produto" ? "Produto" : a.tipo === "colecao" ? "Coleção" : a.tipo === "home" ? "Página inicial" : a.tipo === "externo" ? "Fora da loja" : "Página"}
                                        {a.preco != null ? ` · ${fmtMoeda(a.preco, moeda)}` : ""}
                                    </div>
                                </div>
                                <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-foreground">
                                    <Megaphone className="h-3.5 w-3.5 text-muted-foreground" /> {a.anuncios}
                                </span>
                                {a.url && (
                                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Abrir destino">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">Sem anúncios ativos coletados.</p>
                )}
            </section>
        </div>
    );
}
