import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { alternarTagDaLoja, editarLoja, type RadarStore, type RadarTag } from "./radarApi";
import { Estrelas, NivelSelo, PotencialAnel } from "./RadarBits";
import { dataHora, fmtMoeda, fmtNumero, moedaDaLoja, nivelDe } from "./radarUtils";

const SINAIS: Record<string, string> = {
    pixel_meta: "Pixel da Meta",
    checkout_otimizado: "Checkout otimizado (Yampi/CartPanda/Appmax)",
    avaliacoes: "App de avaliações",
    email_crm: "E-mail marketing / CRM",
    whatsapp: "Botão de WhatsApp",
};

function Bloco({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn("space-y-2", className)}>
            <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
            {children}
        </section>
    );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
    return (
        <div className="rounded-xl bg-muted/50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{rotulo}</div>
            <div className="text-sm font-semibold tabular-nums text-foreground">{valor}</div>
        </div>
    );
}

interface RadarStoreResumoProps {
    store: RadarStore;
    tags: RadarTag[];
    // Rascunho da anotação mora na ficha (sobrevive à troca de aba); undefined = sem edição.
    rascunho: string | undefined;
    onRascunho: (texto: string | undefined) => void;
}

export function RadarStoreResumo({ store, tags, rascunho, onRascunho }: RadarStoreResumoProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const notas = rascunho ?? store.notes ?? "";
    const sujo = rascunho !== undefined && rascunho.trim() !== (store.notes ?? "").trim();
    const rascunhoAtual = useRef(rascunho);
    rascunhoAtual.current = rascunho;
    const p = store.profile;
    const moeda = moedaDaLoja(store);
    const det = store.potential_detail;
    const nivel = nivelDe(det);

    const recarregar = () => queryClient.invalidateQueries({ queryKey: ["radar_stores"] });
    const falhou = (e: Error) => toast({ variant: "destructive", title: "Não salvou", description: e.message });
    const salvar = useMutation({
        mutationFn: (patch: Parameters<typeof editarLoja>[1]) => editarLoja(store.id, patch),
        onSuccess: recarregar,
        onError: falhou,
    });
    const tag = useMutation({
        mutationFn: ({ tagId, ligar }: { tagId: number; ligar: boolean }) => alternarTagDaLoja(store.id, tagId, ligar),
        onSuccess: recarregar,
        onError: falhou,
    });
    const salvarNotas = useMutation({
        mutationFn: (texto: string | null) => editarLoja(store.id, { notes: texto }),
        onSuccess: (_, enviado) => {
            // Só limpa o rascunho se nada foi digitado depois do clique em salvar.
            if ((rascunhoAtual.current ?? "").trim() === (enviado ?? "")) onRascunho(undefined);
            recarregar();
        },
        onError: falhou,
    });

    return (
        <div className="space-y-6">
            <Bloco titulo="Potencial">
                <div className="flex items-center gap-4 rounded-2xl border border-border/60 p-4">
                    <PotencialAnel score={store.potential} nivel={nivel} tamanho={72} />
                    <div className="min-w-0 space-y-1">
                        <NivelSelo nivel={nivel} />
                        <p className="text-xs text-muted-foreground">
                            {nivel === "sem_dados"
                                ? det?.anuncios_desatualizados
                                    ? "A coleta de anúncios desta loja está parada há mais de 3 dias; a nota volta quando ela for coletada de novo."
                                    : "Aguardando a coleta de anúncios pra calcular."
                                : det?.parcial
                                  ? "Parcial: alguns itens precisam de mais dias de histórico e ainda não contam."
                                  : "Calculado com todos os itens."}
                            {det?.anuncios_capturados_em ? ` Anúncios coletados em ${dataHora(det.anuncios_capturados_em)}.` : ""}
                            {store.profile_at ? ` Recalculado em ${dataHora(store.profile_at)}.` : ""}
                        </p>
                    </div>
                </div>
                {det && (
                    <div className="space-y-2">
                        {Object.entries(det.componentes).map(([k, c]) => (
                            <div key={k} className="space-y-1">
                                <div className="flex items-baseline justify-between gap-2 text-xs">
                                    <span className={cn("text-foreground", !c.disponivel && "text-muted-foreground")}>
                                        {c.rotulo}
                                        {c.valor != null && <span className="ml-1 text-muted-foreground">({k === "video" ? `${c.valor}%` : fmtNumero(c.valor)})</span>}
                                    </span>
                                    <span className="tabular-nums text-muted-foreground">{c.disponivel ? `${c.pontos}/${c.max}` : "sem histórico"}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full origin-left rounded-full bg-foreground/70 transition-transform duration-500" style={{ transform: `scaleX(${c.disponivel ? (c.pontos ?? 0) / c.max : 0})` }} />
                                </div>
                            </div>
                        ))}
                        <p className="pt-1 text-[11px] text-muted-foreground">
                            O potencial mede a intensidade e a saúde da operação com dado público. Venda real de loja de terceiro não é pública:
                            anúncio que fica ligado 30+ dias é o melhor sinal de que paga.
                        </p>
                    </div>
                )}
            </Bloco>

            <Bloco titulo="Avaliação de vocês">
                <div className="space-y-3 rounded-2xl border border-border/60 p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Nota</span>
                        <Estrelas valor={store.rating} onMudar={(v) => salvar.mutate({ rating: v })} tamanho="h-5 w-5" />
                    </div>
                    <Textarea
                        placeholder="Anotações: o que essa loja faz bem, o que copiar, o que evitar…"
                        value={notas}
                        onChange={(e) => onRascunho(e.target.value)}
                        maxLength={5000}
                        rows={4}
                    />
                    {sujo && (
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => onRascunho(undefined)}>
                                <X className="mr-1 h-3.5 w-3.5" /> Descartar
                            </Button>
                            <Button size="sm" onClick={() => salvarNotas.mutate(notas.trim() || null)} disabled={salvarNotas.isPending}>
                                <Check className="mr-1 h-3.5 w-3.5" /> Salvar anotação
                            </Button>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">Tags</span>
                        <div className="flex flex-wrap gap-1.5">
                            {tags.length === 0 && <span className="text-xs text-muted-foreground">Crie tags pelo botão "Tags" na aba Lojas.</span>}
                            {tags.map((t) => {
                                const ligada = store.tag_ids.includes(t.id);
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => tag.mutate({ tagId: t.id, ligar: !ligada })}
                                        className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-[opacity,transform] hover:opacity-90 active:scale-95", !ligada && "opacity-50")}
                                        style={ligada ? { borderColor: `${t.color}66`, backgroundColor: `${t.color}22`, color: t.color } : undefined}
                                    >
                                        {ligada ? "✓ " : "+ "}{t.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </Bloco>

            {p && (
                <>
                    <Bloco titulo="Sobre a loja">
                        {p.titulo && <p className="text-sm font-medium text-foreground">{p.titulo}</p>}
                        {p.descricao && <p className="text-sm text-muted-foreground">{p.descricao}</p>}
                        {p.avisos.length > 0 && (
                            <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Barra de aviso</span>
                                {p.avisos.map((a, i) => <p key={i} className="rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-foreground">{a}</p>)}
                            </div>
                        )}
                        {p.destaques_home.length > 0 && (
                            <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">Chamadas da home</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {p.destaques_home.map((d, i) => <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground">{d}</span>)}
                                </div>
                            </div>
                        )}
                    </Bloco>

                    {p.catalogo && (
                        <Bloco titulo="Catálogo">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <Dado rotulo="Produtos" valor={p.catalogo.truncado ? `${fmtNumero(p.catalogo.lidos)}+` : fmtNumero(p.catalogo.total)} />
                                <Dado rotulo="Preço mediano" valor={fmtMoeda(p.catalogo.preco_mediano, moeda)} />
                                <Dado rotulo="Faixa de preço" valor={`${fmtMoeda(p.catalogo.preco_min, moeda)} – ${fmtMoeda(p.catalogo.preco_max, moeda)}`} />
                                <Dado rotulo="Com preço de/por" valor={fmtNumero(p.catalogo.com_desconto)} />
                                <Dado rotulo="Esgotados" valor={fmtNumero(p.catalogo.esgotados)} />
                                <Dado rotulo="Lançados (30 dias)" valor={p.catalogo.novos_30d == null ? "sem histórico" : fmtNumero(p.catalogo.novos_30d)} />
                            </div>
                        </Bloco>
                    )}

                    <Bloco titulo="Estrutura da loja">
                        <div className="grid grid-cols-2 gap-2">
                            <Dado rotulo="Checkout" valor={p.checkout ?? "–"} />
                            <Dado rotulo="Tema" valor={<span className="block truncate">{p.tema?.schema || p.tema?.nome || "–"}</span>} />
                        </div>
                        <ul className="space-y-1">
                            {Object.entries(SINAIS).map(([k, rotulo]) => (
                                <li key={k} className="flex items-center gap-2 text-xs">
                                    <span className={cn("h-1.5 w-1.5 rounded-full", p.sinais?.[k as keyof typeof p.sinais] ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                                    <span className={p.sinais?.[k as keyof typeof p.sinais] ? "text-foreground" : "text-muted-foreground"}>{rotulo}</span>
                                </li>
                            ))}
                        </ul>
                        {p.apps.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {p.apps.map((a) => <span key={a} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{a}</span>)}
                            </div>
                        )}
                    </Bloco>
                </>
            )}
        </div>
    );
}
