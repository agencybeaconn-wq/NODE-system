import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
    acompanharCandidata, criarBusca, listarBuscas, listarCandidatas, marcarCandidata, novaBuscaSchema,
    type RadarCandidate, type RadarSearch,
} from "./radarApi";
import { NICHOS_SUGERIDOS, PAISES, PLATAFORMAS, dataHora } from "./radarUtils";

const OUTRO = "__outro__";

const STATUS_BUSCA: Record<RadarSearch["status"], string> = {
    pending: "na fila",
    running: "buscando",
    done: "pronta",
    error: "falhou",
};

interface RadarSearchPanelProps {
    niches: string[];
}

export function RadarSearchPanel({ niches }: RadarSearchPanelProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const opcoes = useMemo(() => [...new Set([...Object.keys(NICHOS_SUGERIDOS), ...niches])].sort(), [niches]);

    const [nichoSel, setNichoSel] = useState("pet");
    const [nichoOutro, setNichoOutro] = useState("");
    const [termo, setTermo] = useState(NICHOS_SUGERIDOS.pet);
    const [pais, setPais] = useState("BR");
    const [buscaAberta, setBuscaAberta] = useState<number | null>(null);

    const nicho = nichoSel === OUTRO ? nichoOutro : nichoSel;

    const buscas = useQuery({
        queryKey: ["radar_searches"],
        queryFn: listarBuscas,
        // Enquanto houver busca na fila, atualiza sozinho (o PC processa a cada 10 min).
        refetchInterval: (q) => ((q.state.data ?? []).some((b) => b.status === "pending" || b.status === "running") ? 15_000 : false),
    });

    useEffect(() => {
        if (buscaAberta == null) {
            const primeira = (buscas.data ?? []).find((b) => b.status === "done");
            if (primeira) setBuscaAberta(primeira.id);
        }
    }, [buscas.data, buscaAberta]);

    // O status da busca aberta entra na chave: quando ela vira "pronta", as candidatas recarregam.
    const statusAberta = buscas.data?.find((b) => b.id === buscaAberta)?.status;
    const candidatas = useQuery({
        queryKey: ["radar_candidates", buscaAberta, statusAberta],
        queryFn: () => listarCandidatas(buscaAberta!),
        enabled: buscaAberta != null,
    });

    const criar = useMutation({
        mutationFn: () => {
            const parsed = novaBuscaSchema.safeParse({ term: termo, niche: nicho, country: pais });
            if (!parsed.success) throw new Error(parsed.error.issues[0].message);
            return criarBusca(parsed.data);
        },
        onSuccess: () => {
            toast({ title: "Busca na fila", description: "O PC do JV processa em até 10 minutos (precisa estar ligado)." });
            queryClient.invalidateQueries({ queryKey: ["radar_searches"] });
        },
        onError: (e: Error) => toast({ variant: "destructive", title: "Não deu pra buscar", description: e.message }),
    });

    const acao = useMutation({
        mutationFn: async ({ c, tipo }: { c: RadarCandidate; tipo: "add" | "dismiss" }) => {
            if (tipo === "add") return acompanharCandidata(c);
            await marcarCandidata(c.id, "dismissed");
            return null;
        },
        onSuccess: (resultado, { c }) => {
            if (resultado === "adicionada") toast({ title: `${c.domain} no Radar`, description: "Entra na próxima coleta diária." });
            if (resultado === "reativada") toast({ title: `${c.domain} reativada`, description: "Estava pausada; volta a ser coletada na próxima coleta." });
            if (resultado === "ja_acompanhada") toast({ title: `${c.domain} já estava no Radar` });
            queryClient.invalidateQueries({ queryKey: ["radar_candidates", buscaAberta] });
            queryClient.invalidateQueries({ queryKey: ["radar_stores"] });
        },
        onError: (e: Error) => toast({ variant: "destructive", title: "Erro", description: e.message }),
    });

    const trocarNicho = (v: string) => {
        setNichoSel(v);
        if (v !== OUTRO && NICHOS_SUGERIDOS[v]) setTermo(NICHOS_SUGERIDOS[v]);
        if (v === OUTRO) setTermo("");
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <div className="space-y-4">
                <Card className="rounded-2xl">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Buscar lojas por nicho</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Quem está anunciando agora na Biblioteca de Anúncios com esses termos.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate(); }}>
                            <Select value={nichoSel} onValueChange={trocarNicho}>
                                <SelectTrigger aria-label="Nicho"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {opcoes.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                                    <SelectItem value={OUTRO}>Outro nicho…</SelectItem>
                                </SelectContent>
                            </Select>
                            {nichoSel === OUTRO && (
                                <Input placeholder="nome do nicho (ex.: fitness)" value={nichoOutro} onChange={(e) => setNichoOutro(e.target.value)} />
                            )}
                            <Input
                                placeholder="termos separados por ;"
                                value={termo}
                                onChange={(e) => setTermo(e.target.value)}
                                aria-label="Termos da busca"
                            />
                            <Select value={pais} onValueChange={setPais}>
                                <SelectTrigger aria-label="País"><SelectValue /></SelectTrigger>
                                <SelectContent>{PAISES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button type="submit" className="w-full" disabled={criar.isPending}>
                                <Search className="mr-1.5 h-4 w-4" /> Buscar
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl overflow-hidden">
                    <CardHeader className="pb-2"><CardTitle className="text-base">Buscas recentes</CardTitle></CardHeader>
                    <div className="divide-y divide-border/60">
                        {(buscas.data ?? []).length === 0 && (
                            <p className="px-6 pb-5 text-sm text-muted-foreground">Nenhuma busca ainda.</p>
                        )}
                        {(buscas.data ?? []).map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                onClick={() => setBuscaAberta(b.id)}
                                className={cn(
                                    "flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted",
                                    buscaAberta === b.id && "bg-muted/60",
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{b.niche} · {b.country}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{b.term}</span>
                                </span>
                                <span className="shrink-0 text-right text-xs text-muted-foreground">
                                    <span className="flex items-center justify-end gap-1">
                                        {(b.status === "pending" || b.status === "running") && <Loader2 className="h-3 w-3 animate-spin" />}
                                        {STATUS_BUSCA[b.status]}
                                    </span>
                                    <span>{dataHora(b.created_at)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            <Card className="rounded-2xl overflow-hidden">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Lojas encontradas</CardTitle>
                    {buscaAberta != null && (() => {
                        const b = buscas.data?.find((x) => x.id === buscaAberta);
                        if (!b) return null;
                        if (b.status === "error") return <p className="text-sm text-destructive">{b.error}</p>;
                        if (b.result) return <p className="text-sm text-muted-foreground">{b.result.anuncios_lidos} anúncios lidos, {b.result.dominios} domínios, {b.result.candidatas} lojas avaliadas.</p>;
                        return null;
                    })()}
                </CardHeader>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Loja</TableHead>
                                <TableHead>Plataforma</TableHead>
                                <TableHead className="text-right">Anúncios na busca</TableHead>
                                <TableHead>Exemplo de anúncio</TableHead>
                                <TableHead className="w-44" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {buscaAberta == null && (
                                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Faça uma busca ou escolha uma busca recente.</TableCell></TableRow>
                            )}
                            {(candidatas.data ?? []).map((c) => (
                                <TableRow key={c.id} className={cn(c.status !== "new" && "opacity-50")}>
                                    <TableCell className="max-w-[220px]">
                                        <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-foreground hover:underline">
                                            {c.name || c.domain}
                                        </a>
                                        <span className="block truncate text-xs text-muted-foreground">{c.domain}</span>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {PLATAFORMAS[c.platform] ?? c.platform}
                                        {c.public_catalog && <Badge variant="secondary" className="ml-1.5 font-normal">catálogo</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {c.ads_active ?? 0}
                                        <span className="ml-1 text-xs text-muted-foreground">({c.ads_video ?? 0} vídeo)</span>
                                    </TableCell>
                                    <TableCell className="max-w-[320px]">
                                        <span className="line-clamp-2 text-xs text-muted-foreground">{c.sample_ad?.texto || "–"}</span>
                                    </TableCell>
                                    <TableCell>
                                        {c.status === "new" ? (
                                            <div className="flex justify-end gap-1.5">
                                                <Button size="sm" onClick={() => acao.mutate({ c, tipo: "add" })} disabled={acao.isPending}>
                                                    <Check className="mr-1 h-3.5 w-3.5" /> Acompanhar
                                                </Button>
                                                <Button size="sm" variant="ghost" aria-label="Descartar" onClick={() => acao.mutate({ c, tipo: "dismiss" })} disabled={acao.isPending}>
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <span className="block text-right text-xs text-muted-foreground">{c.status === "added" ? "no Radar" : "descartada"}</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}
