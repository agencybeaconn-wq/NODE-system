import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { adicionarLoja, alternarLoja, listarMetricas, listarUltimasExecucoes, novaLojaSchema, type RadarRun, type RadarStore } from "./radarApi";
import { PAISES, PLATAFORMAS, dataHora, diasAtras, resumirMetricas, sinal, statusColeta } from "./radarUtils";

interface RadarStoresTableProps {
    stores: RadarStore[];
    niches: string[];
    niche: string;
    onOpenStore: (store: RadarStore) => void;
}

const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
    ok: { texto: "ok", classe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    skipped: { texto: "parcial", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    blocked: { texto: "bloqueado", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    error: { texto: "erro", classe: "bg-destructive/15 text-destructive" },
    never: { texto: "aguardando", classe: "bg-muted text-muted-foreground" },
};

function Delta({ valor }: { valor: number | null }) {
    if (!valor) return null;
    return <span className={cn("ml-1.5 text-xs", valor > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{sinal(valor)}</span>;
}

export function RadarStoresTable({ stores, niches, niche, onOpenStore }: RadarStoresTableProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [busca, setBusca] = useState("");
    const [novo, setNovo] = useState({ domain: "", niche: niches[0] ?? "camisas", country: "BR" });

    const metricas = useQuery({ queryKey: ["radar_metrics", "8d"], queryFn: () => listarMetricas(diasAtras(8)) });
    const execucoes = useQuery({ queryKey: ["radar_runs", "3d"], queryFn: () => listarUltimasExecucoes(diasAtras(3)) });

    const resumo = useMemo(() => resumirMetricas(metricas.data ?? []), [metricas.data]);
    const runsPorLoja = useMemo(() => {
        const m = new Map<string, RadarRun[]>();
        for (const r of execucoes.data ?? []) m.set(r.store_id, [...(m.get(r.store_id) ?? []), r]);
        return m;
    }, [execucoes.data]);

    const visiveis = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return stores
            .filter((s) => niche === "all" || s.niche === niche)
            .filter((s) => !q || s.domain.includes(q) || (s.name ?? "").toLowerCase().includes(q))
            .sort((a, b) => (resumo.get(b.id)?.ads ?? -1) - (resumo.get(a.id)?.ads ?? -1));
    }, [stores, niche, busca, resumo]);

    const adicionar = useMutation({
        mutationFn: () => {
            const parsed = novaLojaSchema.safeParse(novo);
            if (!parsed.success) throw new Error(parsed.error.issues[0].message);
            return adicionarLoja(parsed.data);
        },
        onSuccess: (dominio) => {
            toast({ title: `${dominio} adicionada`, description: "Entra na próxima coleta diária." });
            setNovo((n) => ({ ...n, domain: "" }));
            queryClient.invalidateQueries({ queryKey: ["radar_stores"] });
        },
        onError: (e: Error) => toast({ variant: "destructive", title: "Não deu pra adicionar", description: e.message }),
    });

    const alternar = useMutation({
        mutationFn: (s: RadarStore) => alternarLoja(s.id, !s.active),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["radar_stores"] }),
        onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message }),
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <Input
                    placeholder="Filtrar por nome ou domínio"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="lg:max-w-xs"
                />
                <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); adicionar.mutate(); }}
                >
                    <Input
                        placeholder="loja.com.br"
                        value={novo.domain}
                        onChange={(e) => setNovo({ ...novo, domain: e.target.value })}
                        className="w-48"
                        aria-label="Domínio da loja"
                    />
                    <Input
                        list="radar-nichos"
                        placeholder="nicho"
                        value={novo.niche}
                        onChange={(e) => setNovo({ ...novo, niche: e.target.value })}
                        className="w-36"
                        aria-label="Nicho"
                    />
                    <datalist id="radar-nichos">{niches.map((n) => <option key={n} value={n} />)}</datalist>
                    <Select value={novo.country} onValueChange={(v) => setNovo({ ...novo, country: v })}>
                        <SelectTrigger className="w-24" aria-label="País"><SelectValue /></SelectTrigger>
                        <SelectContent>{PAISES.map((p) => <SelectItem key={p.value} value={p.value}>{p.value}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="submit" disabled={adicionar.isPending || !novo.domain.trim()}>
                        <Plus className="mr-1.5 h-4 w-4" /> Acompanhar
                    </Button>
                </form>
            </div>

            <Card className="rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Loja</TableHead>
                                <TableHead>Nicho</TableHead>
                                <TableHead>Plataforma</TableHead>
                                <TableHead className="text-right">Produtos (7d)</TableHead>
                                <TableHead className="text-right">Anúncios ativos (7d)</TableHead>
                                <TableHead className="text-right">Anúncio mais antigo</TableHead>
                                <TableHead>Coleta</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {metricas.isLoading && (
                                <TableRow><TableCell colSpan={8}><Skeleton className="h-24 w-full" /></TableCell></TableRow>
                            )}
                            {!metricas.isLoading && visiveis.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                                        Nenhuma loja aqui. Adicione pelo domínio ou pela aba Buscar lojas.
                                    </TableCell>
                                </TableRow>
                            )}
                            {visiveis.map((s) => {
                                const r = resumo.get(s.id);
                                const st = statusColeta(runsPorLoja.get(s.id) ?? []);
                                const rotulo = ROTULO_STATUS[st.status];
                                return (
                                    <TableRow
                                        key={s.id}
                                        className={cn("cursor-pointer transition-colors hover:bg-muted/50", !s.active && "opacity-50")}
                                        onClick={() => onOpenStore(s)}
                                    >
                                        <TableCell className="max-w-[260px]">
                                            <div className="truncate font-medium text-foreground">{s.name || s.domain}</div>
                                            <div className="truncate text-xs text-muted-foreground">{s.domain} · {s.country}</div>
                                        </TableCell>
                                        <TableCell><Badge variant="secondary" className="font-normal">{s.niche}</Badge></TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{PLATAFORMAS[s.platform] ?? s.platform}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {s.public_catalog ? (r?.products ?? "–") : <span className="text-xs text-muted-foreground">sem catálogo</span>}
                                            {s.public_catalog && <Delta valor={r?.productsDelta ?? null} />}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {r?.ads ?? "–"}
                                            <Delta valor={r?.adsDelta ?? null} />
                                            {r?.ads ? <span className="ml-1.5 text-xs text-muted-foreground">({r.adsVideo ?? 0} vídeo)</span> : null}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">
                                            {r?.oldestAdDays != null ? `${r.oldestAdDays} dias` : "–"}
                                        </TableCell>
                                        <TableCell>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", rotulo.classe)}>{rotulo.texto}</span>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-xs">
                                                    {st.quando ? `Última: ${dataHora(st.quando)}` : "Ainda não coletada"}
                                                    {st.erro ? ` · ${st.erro}` : ""}
                                                </TooltipContent>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                aria-label={s.active ? "Pausar coleta" : "Retomar coleta"}
                                                onClick={(e) => { e.stopPropagation(); alternar.mutate(s); }}
                                            >
                                                {s.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}
