// Radar de clientes: possíveis clientes da NODE achados no Google Maps, na
// Biblioteca de Anúncios (aba "Buscar lojas") ou cadastrados na mão.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Plus, Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
    SEGMENTOS_SUGERIDOS, SERVICOS, STATUS_PROSPECT, TIPO_SITE,
    buscaGoogleSchema, criarProspect, enfileirarBuscaMaps, listarBuscasGoogle, listarProspects,
    type BuscaGoogle, type RadarProspect, type Servico, type StatusProspect, type TipoSite,
} from "./prospectApi";
import { PotencialAnel, ServicosToggle } from "./RadarBits";
import { RadarProspectSheet } from "./RadarProspectSheet";
import { nivelProspect } from "./prospectUtils";
import { PAISES, dataHora, fmtNumero } from "./radarUtils";

const OUTRO = "__outro__";
const TODOS = "all";
const ATIVOS = "ativos"; // novo + qualificado: o que ainda dá pra trabalhar

const emAndamento = (b: BuscaGoogle) => b.status === "pending" || b.status === "running";

// Linha de status da busca na lista "Buscas no Google".
function resumoBusca(b: BuscaGoogle): string {
    const r = b.result;
    if (b.status === "pending") return "na fila: o PC processa em até 10 min";
    if (b.status === "running") return r?.total ? `lendo fichas: ${r.lidos ?? 0} de ${r.total}` : "abrindo o Google Maps…";
    if (b.status === "error") return b.error ?? "falhou";
    if (!r) return b.query;
    return `${r.novos ?? 0} novos de ${r.encontrados ?? 0} · ${(r.sem_site ?? 0) + (r.so_rede ?? 0)} sem site próprio`;
}

const COR_SITE: Record<TipoSite, string> = {
    none: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    social: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    builder: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    own: "bg-muted text-muted-foreground",
    unknown: "bg-muted text-muted-foreground",
};

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function RadarProspectsPanel() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // ─── busca no Google ───
    const [segSel, setSegSel] = useState("dentista");
    const [segOutro, setSegOutro] = useState("");
    const [termo, setTermo] = useState(SEGMENTOS_SUGERIDOS.dentista);
    const [cidade, setCidade] = useState("");
    const [pais, setPais] = useState("BR");
    const [quantidade, setQuantidade] = useState("60");
    const segmentoBusca = segSel === OUTRO ? segOutro : segSel;

    // ─── filtros da lista ───
    const [fSeg, setFSeg] = useState(TODOS);
    const [fServ, setFServ] = useState(TODOS);
    const [fStatus, setFStatus] = useState(ATIVOS);
    const [fSite, setFSite] = useState(TODOS);
    const [fBusca, setFBusca] = useState<number | null>(null);
    const [texto, setTexto] = useState("");
    const [abertoId, setAbertoId] = useState<string | null>(null);
    const [novoAberto, setNovoAberto] = useState(false);

    // Enquanto alguma busca estiver na fila ou rodando, busca e lista se atualizam sozinhas.
    const buscas = useQuery({
        queryKey: ["radar_prospect_searches"],
        queryFn: listarBuscasGoogle,
        refetchInterval: (q) => ((q.state.data ?? []).some(emAndamento) ? 10_000 : false),
    });
    const ocupado = (buscas.data ?? []).some(emAndamento);
    const prospects = useQuery({ queryKey: ["radar_prospects"], queryFn: listarProspects, refetchInterval: ocupado ? 15_000 : false });

    const segmentos = useMemo(
        () => [...new Set([...Object.keys(SEGMENTOS_SUGERIDOS), ...(prospects.data ?? []).map((p) => p.segment)])].sort(),
        [prospects.data],
    );
    const segmentosComDados = useMemo(() => [...new Set((prospects.data ?? []).map((p) => p.segment))].sort(), [prospects.data]);

    const filtrados = useMemo(() => {
        const q = normalizar(texto.trim());
        return (prospects.data ?? []).filter((p) => {
            if (fSeg !== TODOS && p.segment !== fSeg) return false;
            if (fServ !== TODOS && !p.services.includes(fServ as Servico)) return false;
            if (fStatus === ATIVOS ? !["novo", "qualificado"].includes(p.status) : fStatus !== TODOS && p.status !== fStatus) return false;
            if (fSite === "fraca" ? !["none", "social", "builder"].includes(p.site_kind) : fSite !== TODOS && p.site_kind !== fSite) return false;
            if (fBusca != null && p.search_id !== fBusca) return false;
            if (q && !normalizar(`${p.name} ${p.city ?? ""} ${p.category ?? ""}`).includes(q)) return false;
            return true;
        });
    }, [prospects.data, fSeg, fServ, fStatus, fSite, fBusca, texto]);

    const aberto = useMemo(() => (prospects.data ?? []).find((p) => p.id === abertoId) ?? null, [prospects.data, abertoId]);

    const buscar = useMutation({
        mutationFn: () => {
            const parsed = buscaGoogleSchema.safeParse({ query: termo, city: cidade, segment: segmentoBusca, country: pais, max_results: Number(quantidade) });
            if (!parsed.success) throw new Error(parsed.error.issues[0].message);
            return enfileirarBuscaMaps(parsed.data);
        },
        onSuccess: () => {
            toast({ title: "Busca na fila", description: "O PC lê o Google Maps em até 10 minutos (precisa estar ligado). A lista se atualiza sozinha." });
            queryClient.invalidateQueries({ queryKey: ["radar_prospect_searches"] });
        },
        onError: (e: Error) => toast({ variant: "destructive", title: "Não deu pra buscar", description: e.message }),
    });

    const trocarSegmento = (v: string) => {
        setSegSel(v);
        if (v === OUTRO) setTermo("");
        else setTermo(SEGMENTOS_SUGERIDOS[v] ?? v);
    };

    const filtroAtivo = fSeg !== TODOS || fServ !== TODOS || fStatus !== ATIVOS || fSite !== TODOS || fBusca != null || texto.trim() !== "";
    const limpar = () => {
        setFSeg(TODOS); setFServ(TODOS); setFStatus(ATIVOS); setFSite(TODOS); setFBusca(null); setTexto("");
    };

    return (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <div className="space-y-4">
                <Card className="rounded-2xl">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Buscar no Google Maps</CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Negócios da cidade com telefone, nota e o site que o Google mostra. Sem site, só com Instagram ou página de agendamento sobem na lista.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); buscar.mutate(); }}>
                            <Select value={segSel} onValueChange={trocarSegmento}>
                                <SelectTrigger aria-label="Nicho do negócio"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {segmentos.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    <SelectItem value={OUTRO}>Outro nicho…</SelectItem>
                                </SelectContent>
                            </Select>
                            {segSel === OUTRO && (
                                <Input placeholder="nome do nicho (ex.: nutricionista)" value={segOutro} onChange={(e) => setSegOutro(e.target.value)} />
                            )}
                            <Input placeholder="o que buscar (ex.: clínica odontológica)" value={termo} onChange={(e) => setTermo(e.target.value)} aria-label="O que buscar" />
                            <Input placeholder="cidade (ex.: Uberlândia MG)" value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade" />
                            <div className="grid grid-cols-2 gap-2">
                                <Select value={pais} onValueChange={setPais}>
                                    <SelectTrigger aria-label="País"><SelectValue /></SelectTrigger>
                                    <SelectContent>{PAISES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={quantidade} onValueChange={setQuantidade}>
                                    <SelectTrigger aria-label="Quantidade"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="20">até 20 (~2 min)</SelectItem>
                                        <SelectItem value="60">até 60 (~5 min)</SelectItem>
                                        <SelectItem value="120">até 120 (~10 min)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full" disabled={buscar.isPending}>
                                {buscar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                                Buscar
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl overflow-hidden">
                    <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-base">Buscas no Google</CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => setNovoAberto(true)}><Plus className="mr-1 h-3.5 w-3.5" />Na mão</Button>
                    </CardHeader>
                    <div className="divide-y divide-border/60">
                        {(buscas.data ?? []).length === 0 && <p className="px-6 pb-5 text-sm text-muted-foreground">Nenhuma busca ainda.</p>}
                        {(buscas.data ?? []).map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                onClick={() => setFBusca(fBusca === b.id ? null : b.id)}
                                className={cn(
                                    "flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted",
                                    fBusca === b.id && "bg-muted/60",
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{b.segment} · {b.city}</span>
                                    <span className={cn("block truncate text-xs", b.status === "error" ? "text-destructive" : "text-muted-foreground")}>{resumoBusca(b)}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                    {emAndamento(b) && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {dataHora(b.created_at)}
                                </span>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>

            <Card className="rounded-2xl overflow-hidden">
                <CardHeader className="space-y-3 pb-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <CardTitle className="text-base">Possíveis clientes</CardTitle>
                        <span className="text-sm text-muted-foreground tabular-nums">{filtrados.length} de {prospects.data?.length ?? 0}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                        <Input placeholder="nome, cidade…" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar na lista" className="2xl:col-span-1" />
                        <Select value={fSeg} onValueChange={setFSeg}>
                            <SelectTrigger aria-label="Nicho"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={TODOS}>Todos os nichos</SelectItem>
                                {segmentosComDados.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={fServ} onValueChange={setFServ}>
                            <SelectTrigger aria-label="Serviço"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={TODOS}>Todos os serviços</SelectItem>
                                {(Object.keys(SERVICOS) as Servico[]).map((s) => <SelectItem key={s} value={s}>{SERVICOS[s]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={fSite} onValueChange={setFSite}>
                            <SelectTrigger aria-label="Presença"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={TODOS}>Qualquer presença</SelectItem>
                                <SelectItem value="fraca">Presença fraca</SelectItem>
                                {(Object.keys(TIPO_SITE) as TipoSite[]).map((s) => <SelectItem key={s} value={s}>{TIPO_SITE[s]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={fStatus} onValueChange={setFStatus}>
                            <SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ATIVOS}>Novos e qualificados</SelectItem>
                                <SelectItem value={TODOS}>Todas as situações</SelectItem>
                                {(Object.keys(STATUS_PROSPECT) as StatusProspect[]).map((s) => <SelectItem key={s} value={s}>{STATUS_PROSPECT[s]}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="ghost" onClick={limpar} disabled={!filtroAtivo}><X className="mr-1 h-3.5 w-3.5" />Limpar</Button>
                    </div>
                    {prospects.error && <p className="text-sm text-destructive">{(prospects.error as Error).message}</p>}
                </CardHeader>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-14">Nota</TableHead>
                                <TableHead>Negócio</TableHead>
                                <TableHead>Presença</TableHead>
                                <TableHead className="text-right">Google</TableHead>
                                <TableHead>Serviços</TableHead>
                                <TableHead>Situação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {prospects.isLoading && (
                                <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
                            )}
                            {!prospects.isLoading && filtrados.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                        {(prospects.data ?? []).length === 0 ? "Busque um nicho numa cidade pra começar." : "Nada com esses filtros."}
                                    </TableCell>
                                </TableRow>
                            )}
                            {filtrados.map((p) => (
                                <ProspectLinha key={p.id} p={p} onAbrir={() => setAbertoId(p.id)} />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            <RadarProspectSheet prospect={aberto} onClose={() => setAbertoId(null)} />
            <NovoProspectDialog open={novoAberto} onOpenChange={setNovoAberto} segmentos={segmentos} />
        </div>
    );
}

function ProspectLinha({ p, onAbrir }: { p: RadarProspect; onAbrir: () => void }) {
    return (
        <TableRow
            role="button"
            tabIndex={0}
            onClick={onAbrir}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir())}
            className={cn("cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted", p.status === "descartado" && "opacity-50")}
        >
            <TableCell><PotencialAnel score={p.score} nivel={nivelProspect(p.score)} tamanho={38} /></TableCell>
            <TableCell className="max-w-[260px]">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {p.city && <><MapPin className="h-3 w-3 shrink-0" />{p.city} · </>}{p.category || p.segment}
                </span>
            </TableCell>
            <TableCell>
                <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", COR_SITE[p.site_kind])}>{TIPO_SITE[p.site_kind]}</span>
            </TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">
                {p.reviews != null ? (
                    <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating ?? "–"}
                        <span className="text-xs text-muted-foreground">({fmtNumero(p.reviews)})</span>
                    </span>
                ) : p.ads_active != null ? (
                    <span className="text-xs text-muted-foreground">{fmtNumero(p.ads_active)} anúncios</span>
                ) : "–"}
            </TableCell>
            <TableCell className="max-w-[240px]">
                <div className="flex flex-wrap gap-1">
                    {p.services.length === 0 && <span className="text-xs text-muted-foreground">–</span>}
                    {p.services.map((s) => <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{SERVICOS[s]}</span>)}
                </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{STATUS_PROSPECT[p.status]}</TableCell>
        </TableRow>
    );
}

function NovoProspectDialog({ open, onOpenChange, segmentos }: { open: boolean; onOpenChange: (v: boolean) => void; segmentos: string[] }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const vazio = { name: "", segment: "", city: "", phone: "", website: "", instagram: "" };
    const [f, setF] = useState(vazio);
    const [servicos, setServicos] = useState<Servico[]>([]);
    const campo = (k: keyof typeof vazio) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });

    const criar = useMutation({
        mutationFn: () => criarProspect({ ...f, services: servicos }),
        onSuccess: () => {
            toast({ title: `${f.name} na lista` });
            queryClient.invalidateQueries({ queryKey: ["radar_prospects"] });
            setF(vazio);
            setServicos([]);
            onOpenChange(false);
        },
        onError: (e: Error) => toast({ variant: "destructive", title: "Não adicionou", description: e.message }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Adicionar possível cliente</DialogTitle></DialogHeader>
                <form id="novo-prospect" className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate(); }}>
                    <Input placeholder="nome do negócio" {...campo("name")} />
                    <Input placeholder="nicho (ex.: dentista)" list="radar-segmentos" {...campo("segment")} />
                    <datalist id="radar-segmentos">{segmentos.map((s) => <option key={s} value={s} />)}</datalist>
                    <Input placeholder="cidade" {...campo("city")} />
                    <Input placeholder="telefone / WhatsApp" {...campo("phone")} />
                    <Input placeholder="site (se tiver)" {...campo("website")} />
                    <Input placeholder="@instagram" {...campo("instagram")} />
                    <ServicosToggle valor={servicos} onMudar={setServicos} />
                </form>
                <DialogFooter>
                    <Button type="submit" form="novo-prospect" disabled={criar.isPending}>
                        {criar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Adicionar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
