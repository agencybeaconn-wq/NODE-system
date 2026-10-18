import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
    adicionarLoja, alternarLoja, alternarTagDaLoja, listarUltimasExecucoes, novaLojaSchema,
    type NivelPotencial, type RadarRun, type RadarStore, type RadarTag,
} from "./radarApi";
import { RadarStoreCard } from "./RadarStoreCard";
import { PAISES, PLATAFORMAS, diasAtras, nivelDe } from "./radarUtils";

interface RadarStoresGridProps {
    stores: RadarStore[];
    tags: RadarTag[];
    niches: string[];
    niche: string;
    carregando: boolean;
    onOpenStore: (store: RadarStore) => void;
    onGerenciarTags: () => void;
}

const ORDENS = {
    potencial: { rotulo: "Maior potencial", chave: (s: RadarStore) => s.potential ?? -1 },
    anuncios: { rotulo: "Mais anúncios ativos", chave: (s: RadarStore) => s.profile?.anuncios?.ativos ?? -1 },
    vencedores: { rotulo: "Mais anúncios 30+ dias", chave: (s: RadarStore) => s.profile?.anuncios?.vencedores ?? -1 },
    crescimento: { rotulo: "Mais crescimento (7 dias)", chave: (s: RadarStore) => s.profile?.anuncios?.crescimento_7d ?? -1e9 },
    nota: { rotulo: "Melhor nota", chave: (s: RadarStore) => s.rating ?? -1 },
    produtos: { rotulo: "Mais produtos", chave: (s: RadarStore) => s.profile?.catalogo?.lidos ?? -1 },
    recentes: { rotulo: "Adicionadas por último", chave: (s: RadarStore) => new Date(s.created_at).getTime() },
    nome: { rotulo: "Nome (A–Z)", chave: null },
} as const;
type Ordem = keyof typeof ORDENS;

const NIVEIS: { value: "all" | NivelPotencial; label: string }[] = [
    { value: "all", label: "Todo potencial" },
    { value: "alto", label: "Potencial alto" },
    { value: "medio", label: "Potencial médio" },
    { value: "baixo", label: "Potencial baixo" },
    { value: "sem_dados", label: "Aguardando dados" },
];

export function RadarStoresGrid({ stores, tags, niches, niche, carregando, onOpenStore, onGerenciarTags }: RadarStoresGridProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [busca, setBusca] = useState("");
    const [nivel, setNivel] = useState<"all" | NivelPotencial>("all");
    const [plataforma, setPlataforma] = useState("all");
    const [tagsFiltro, setTagsFiltro] = useState<number[]>([]);
    const [ordem, setOrdem] = useState<Ordem>("potencial");
    const [mostrarPausadas, setMostrarPausadas] = useState(false);
    const [novo, setNovo] = useState({ domain: "", niche: niches[0] ?? "camisas", country: "BR" });

    const execucoes = useQuery({ queryKey: ["radar_runs", "3d"], queryFn: () => listarUltimasExecucoes(diasAtras(3)) });
    const runsPorLoja = useMemo(() => {
        const m = new Map<string, RadarRun[]>();
        for (const r of execucoes.data ?? []) m.set(r.store_id, [...(m.get(r.store_id) ?? []), r]);
        return m;
    }, [execucoes.data]);

    const plataformas = useMemo(() => [...new Set(stores.map((s) => s.platform))].sort(), [stores]);

    // Tag apagada sai do filtro sozinha (senão a grade ficaria vazia sem motivo visível).
    const filtroTags = useMemo(() => tagsFiltro.filter((id) => tags.some((t) => t.id === id)), [tagsFiltro, tags]);

    // Todos os filtros menos o de nível: base da lista e da contagem dos botões de nível.
    const base = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return stores
            .filter((s) => mostrarPausadas || s.active)
            .filter((s) => niche === "all" || s.niche === niche)
            .filter((s) => plataforma === "all" || s.platform === plataforma)
            .filter((s) => !filtroTags.length || filtroTags.some((t) => s.tag_ids.includes(t)))
            .filter((s) => !q || s.domain.includes(q) || (s.name ?? "").toLowerCase().includes(q) || (s.notes ?? "").toLowerCase().includes(q));
    }, [stores, busca, niche, plataforma, filtroTags, mostrarPausadas]);

    const visiveis = useMemo(() => {
        const lista = base.filter((s) => nivel === "all" || nivelDe(s.potential_detail) === nivel);
        const chave = ORDENS[ordem].chave;
        return chave
            ? lista.sort((a, b) => chave(b) - chave(a) || (a.name ?? a.domain).localeCompare(b.name ?? b.domain))
            : lista.sort((a, b) => (a.name ?? a.domain).localeCompare(b.name ?? b.domain, "pt-BR"));
    }, [base, nivel, ordem]);

    const contagemNivel = useMemo(() => {
        const c: Record<string, number> = {};
        for (const s of base) c[nivelDe(s.potential_detail)] = (c[nivelDe(s.potential_detail)] ?? 0) + 1;
        return c;
    }, [base]);

    const recarregar = () => queryClient.invalidateQueries({ queryKey: ["radar_stores"] });
    const falhou = (e: Error) => toast({ variant: "destructive", title: "Não deu", description: e.message });

    const adicionar = useMutation({
        mutationFn: () => {
            const parsed = novaLojaSchema.safeParse(novo);
            if (!parsed.success) throw new Error(parsed.error.issues[0].message);
            return adicionarLoja(parsed.data);
        },
        onSuccess: (dominio) => {
            toast({ title: `${dominio} adicionada`, description: "Entra na próxima coleta diária." });
            setNovo((n) => ({ ...n, domain: "" }));
            recarregar();
        },
        onError: falhou,
    });
    const tag = useMutation({
        mutationFn: ({ s, tagId, ligar }: { s: RadarStore; tagId: number; ligar: boolean }) => alternarTagDaLoja(s.id, tagId, ligar),
        onSuccess: recarregar,
        onError: falhou,
    });
    const ativa = useMutation({
        mutationFn: (s: RadarStore) => alternarLoja(s.id, !s.active),
        onSuccess: recarregar,
        onError: falhou,
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {NIVEIS.filter((n) => n.value !== "all").map((n) => (
                    <button
                        key={n.value}
                        type="button"
                        onClick={() => setNivel(nivel === n.value ? "all" : n.value)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted active:scale-[0.98] ${nivel === n.value ? "border-foreground bg-foreground text-background hover:bg-foreground/90" : "border-border text-muted-foreground"}`}
                    >
                        {n.label.replace("Potencial ", "")} · {contagemNivel[n.value] ?? 0}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                <Input placeholder="Buscar por nome, domínio ou anotação" value={busca} onChange={(e) => setBusca(e.target.value)} className="xl:max-w-xs" />
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={nivel} onValueChange={(v) => setNivel(v as typeof nivel)}>
                        <SelectTrigger className="w-[170px]" aria-label="Potencial"><SelectValue /></SelectTrigger>
                        <SelectContent>{NIVEIS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={plataforma} onValueChange={setPlataforma}>
                        <SelectTrigger className="w-[160px]" aria-label="Plataforma"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toda plataforma</SelectItem>
                            {plataformas.map((p) => <SelectItem key={p} value={p}>{PLATAFORMAS[p] ?? p}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="gap-1.5">
                                <Filter className="h-4 w-4" /> Tags{filtroTags.length ? ` (${filtroTags.length})` : ""}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-60 space-y-1 p-2">
                            {tags.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nenhuma tag criada ainda.</p>}
                            {tags.map((t) => (
                                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                                    <Checkbox
                                        checked={filtroTags.includes(t.id)}
                                        onCheckedChange={(v) => setTagsFiltro((atual) => (v ? [...atual, t.id] : atual.filter((x) => x !== t.id)))}
                                    />
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                                    <span className="truncate">{t.name}</span>
                                </label>
                            ))}
                            {filtroTags.length > 0 && (
                                <Button variant="ghost" size="sm" className="w-full" onClick={() => setTagsFiltro([])}>Limpar filtro</Button>
                            )}
                        </PopoverContent>
                    </Popover>
                    <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
                        <SelectTrigger className="w-[210px]" aria-label="Ordenar"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(ORDENS).map(([k, o]) => <SelectItem key={k} value={k}>{o.rotulo}</SelectItem>)}</SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Switch checked={mostrarPausadas} onCheckedChange={setMostrarPausadas} /> Pausadas
                    </label>
                </div>
                <div className="flex gap-2 xl:ml-auto">
                    <Button variant="outline" className="gap-1.5" onClick={onGerenciarTags}>
                        <Tags className="h-4 w-4" /> Tags
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button className="gap-1.5"><Plus className="h-4 w-4" /> Acompanhar loja</Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72">
                            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); adicionar.mutate(); }}>
                                <Input placeholder="loja.com.br" value={novo.domain} onChange={(e) => setNovo({ ...novo, domain: e.target.value })} aria-label="Domínio da loja" />
                                <Input list="radar-nichos" placeholder="nicho" value={novo.niche} onChange={(e) => setNovo({ ...novo, niche: e.target.value })} aria-label="Nicho" />
                                <datalist id="radar-nichos">{niches.map((n) => <option key={n} value={n} />)}</datalist>
                                <Select value={novo.country} onValueChange={(v) => setNovo({ ...novo, country: v })}>
                                    <SelectTrigger aria-label="País"><SelectValue /></SelectTrigger>
                                    <SelectContent>{PAISES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                                </Select>
                                <Button type="submit" className="w-full" disabled={adicionar.isPending || !novo.domain.trim()}>Adicionar</Button>
                            </form>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <p className="text-sm text-muted-foreground">{visiveis.length} loja{visiveis.length === 1 ? "" : "s"}</p>

            {carregando ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
                </div>
            ) : visiveis.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                    Nenhuma loja com esses filtros.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {visiveis.map((s) => (
                        <RadarStoreCard
                            key={s.id}
                            store={s}
                            tags={tags}
                            runs={runsPorLoja.get(s.id) ?? []}
                            onAbrir={() => onOpenStore(s)}
                            onAlternarTag={(tagId, ligar) => tag.mutate({ s, tagId, ligar })}
                            onAlternarAtiva={() => ativa.mutate(s)}
                            onGerenciarTags={onGerenciarTags}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
