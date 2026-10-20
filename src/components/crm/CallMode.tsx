// Modo ligação: fila de quem chamar hoje e um lead por vez, com o resultado em um
// clique. O banco agenda o próximo contato (crm_atividade_aplicar).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Copy, ExternalLink, Loader2, MessageCircle, Pencil, Phone, PhoneOff, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { linkWhatsApp } from "@/lib/whatsapp";
import type { TeamMember } from "@/hooks/useAgencyTeam";
import type { CrmLead } from "@/pages/Comercial";
import { RESULTADOS, atividadesDeHoje, editarLead, listarAtividades, mensagemInicial, primeiroNome, registrarContato, type Resultado } from "./crmApi";

type Aba = "hoje" | "novos" | "agendados";
const SEM_DONO = "__sem_dono__";
const SCORE_ORDEM: Record<string, number> = { Quente: 0, Morno: 1, Frio: 2 };

const quando = (iso: string) => {
    const d = parseISO(iso);
    if (isToday(d)) return `hoje ${format(d, "HH:mm")}`;
    if (isTomorrow(d)) return `amanhã ${format(d, "HH:mm")}`;
    return format(d, "dd/MM HH:mm", { locale: ptBR });
};

// Lista de hoje: atrasados e marcados pra hoje (mais antigo primeiro).
// Nunca chamados: sem tentativa e sem agenda (mais quente primeiro).
function montarFila(leads: CrmLead[]) {
    const fimDoDia = new Date();
    fimDoDia.setHours(23, 59, 59, 999);
    const hoje: CrmLead[] = [];
    const novos: CrmLead[] = [];
    const agendados: CrmLead[] = [];
    for (const l of leads) {
        if (l.next_contact_at) (parseISO(l.next_contact_at) <= fimDoDia ? hoje : agendados).push(l);
        else if (!l.contact_attempts) novos.push(l);
    }
    hoje.sort((a, b) => a.next_contact_at!.localeCompare(b.next_contact_at!));
    agendados.sort((a, b) => a.next_contact_at!.localeCompare(b.next_contact_at!));
    novos.sort((a, b) => (SCORE_ORDEM[a.lead_score ?? ""] ?? 3) - (SCORE_ORDEM[b.lead_score ?? ""] ?? 3) || a.created_at.localeCompare(b.created_at));
    return { hoje, novos, agendados };
}

interface CallModeProps {
    leads: CrmLead[];
    membros: TeamMember[];
    userId: string | null;
    nichos: string[];
    onChanged: () => void;
    onEditLead: (lead: CrmLead) => void;
}

export function CallMode({ leads, membros, userId, nichos, onChanged, onEditLead }: CallModeProps) {
    const fila = useMemo(() => montarFila(leads), [leads]);
    const [aba, setAba] = useState<Aba>("hoje");
    const [atualId, setAtualId] = useState<string | null>(null);

    const lista = fila[aba];
    // Sem escolha (ou o escolhido saiu da lista depois do registro): pega o primeiro.
    const atual = useMemo(() => lista.find((l) => l.id === atualId) ?? lista[0] ?? null, [lista, atualId]);
    useEffect(() => {
        if (aba === "hoje" && fila.hoje.length === 0 && fila.novos.length > 0) setAba("novos");
    }, [aba, fila.hoje.length, fila.novos.length]);

    const proximo = () => {
        const i = lista.findIndex((l) => l.id === atual?.id);
        const seguinte = lista[i + 1] ?? lista.find((l) => l.id !== atual?.id) ?? null;
        setAtualId(seguinte?.id ?? null);
    };

    const abas: { chave: Aba; rotulo: string }[] = [
        { chave: "hoje", rotulo: "Pra hoje" },
        { chave: "novos", rotulo: "Nunca chamados" },
        { chave: "agendados", rotulo: "Agendados" },
    ];

    return (
        <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[340px_1fr]">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40">
                <div className="grid grid-cols-3 gap-1 border-b border-border/60 p-1.5">
                    {abas.map((a) => (
                        <button
                            key={a.chave}
                            type="button"
                            onClick={() => { setAba(a.chave); setAtualId(null); }}
                            className={cn(
                                "rounded-lg px-2 py-2 text-xs font-medium transition-colors active:scale-[0.98]",
                                aba === a.chave ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                        >
                            {a.rotulo}
                            <span className="ml-1 tabular-nums opacity-70">{fila[a.chave].length}</span>
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
                    {lista.length === 0 && (
                        <p className="p-6 text-center text-sm text-muted-foreground">
                            {aba === "hoje" ? "Ninguém marcado pra hoje." : aba === "novos" ? "Todo mundo já foi chamado pelo menos uma vez." : "Nada agendado."}
                        </p>
                    )}
                    {lista.map((l) => {
                        const dono = membros.find((m) => m.user_id === l.owner_id);
                        return (
                            <button
                                key={l.id}
                                type="button"
                                onClick={() => setAtualId(l.id)}
                                className={cn(
                                    "flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted",
                                    atual?.id === l.id && "bg-muted",
                                )}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">{l.store_name || l.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {[l.segment, l.contact_attempts ? `${l.contact_attempts}ª tentativa feita` : null, dono ? primeiroNome(dono) : null].filter(Boolean).join(" · ")}
                                    </span>
                                </span>
                                {l.next_contact_at && <span className="shrink-0 text-[11px] text-muted-foreground">{quando(l.next_contact_at)}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {atual ? (
                <LeadAtual
                    key={atual.id}
                    lead={atual}
                    membros={membros}
                    userId={userId}
                    nichos={nichos}
                    onRegistrado={() => { proximo(); onChanged(); }}
                    onChanged={onChanged}
                    onEditLead={onEditLead}
                />
            ) : (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-border/60 p-10 text-sm text-muted-foreground">
                    Escolha um lead na fila.
                </div>
            )}
        </div>
    );
}

// Placar do dia por pessoa: contatos feitos, conversas (alguém atendeu ou respondeu) e interessados.
const CONVERSA: Resultado[] = ["pediu_retorno", "interessado", "sem_interesse", "respondeu"];
export function PlacarDoDia({ workspaceId, membros }: { workspaceId: string; membros: TeamMember[] }) {
    const hoje = useQuery({
        queryKey: ["crm_placar", workspaceId],
        queryFn: () => atividadesDeHoje(workspaceId),
        refetchInterval: 60_000,
    });
    const porPessoa = useMemo(() => {
        const mapa = new Map<string, { contatos: number; conversas: number; interessados: number }>();
        for (const a of hoje.data ?? []) {
            const k = a.user_id ?? "?";
            const p = mapa.get(k) ?? { contatos: 0, conversas: 0, interessados: 0 };
            p.contatos += 1;
            if (CONVERSA.includes(a.outcome)) p.conversas += 1;
            if (a.outcome === "interessado") p.interessados += 1;
            mapa.set(k, p);
        }
        return [...mapa.entries()].sort((a, b) => b[1].contatos - a[1].contatos);
    }, [hoje.data]);
    if (!porPessoa.length) return <p className="text-xs text-muted-foreground">Nenhum contato registrado hoje ainda.</p>;
    return (
        <div className="flex flex-wrap gap-2">
            {porPessoa.map(([uid, p]) => (
                <span key={uid} className="rounded-full border border-border/60 px-3 py-1 text-xs">
                    <b>{primeiroNome(membros.find((m) => m.user_id === uid)) || "Alguém"}</b>
                    <span className="text-muted-foreground"> · {p.contatos} contatos · {p.conversas} conversas · {p.interessados} interessados</span>
                </span>
            ))}
        </div>
    );
}

interface LeadAtualProps {
    lead: CrmLead;
    membros: TeamMember[];
    userId: string | null;
    nichos: string[];
    onRegistrado: () => void;
    onChanged: () => void;
    onEditLead: (lead: CrmLead) => void;
}

function LeadAtual({ lead, membros, userId, nichos, onRegistrado, onChanged, onEditLead }: LeadAtualProps) {
    const queryClient = useQueryClient();
    const eu = membros.find((m) => m.user_id === userId);
    const negocio = lead.store_name || lead.name;
    const [mensagem, setMensagem] = useState(() => mensagemInicial({ remetente: primeiroNome(eu), negocio, nicho: lead.segment ?? null }));
    const [nota, setNota] = useState("");
    const [retorno, setRetorno] = useState("");
    const [pedindoRetorno, setPedindoRetorno] = useState(false);
    const [nicho, setNicho] = useState(lead.segment ?? "");

    const historico = useQuery({ queryKey: ["crm_lead_activities", lead.id], queryFn: () => listarAtividades(lead.id) });

    const registrar = useMutation({
        mutationFn: (outcome: Resultado) =>
            registrarContato({
                lead_id: lead.id,
                outcome,
                note: nota,
                next_contact_at: outcome === "pediu_retorno" && retorno ? new Date(retorno).toISOString() : null,
            }),
        onSuccess: (_, outcome) => {
            toast.success(`${RESULTADOS[outcome].rotulo}: ${negocio}`, { description: `Registrado; ${RESULTADOS[outcome].agenda}.` });
            queryClient.invalidateQueries({ queryKey: ["crm_lead_activities", lead.id] });
            queryClient.invalidateQueries({ queryKey: ["crm_placar"] });
            onRegistrado();
        },
        onError: (e: Error) => toast.error("Não registrou", { description: e.message }),
    });

    const salvar = useMutation({
        mutationFn: (patch: Parameters<typeof editarLead>[1]) => editarLead(lead.id, patch),
        onSuccess: onChanged,
        onError: (e: Error) => toast.error("Não salvou", { description: e.message }),
    });

    const clicarResultado = (r: Resultado) => {
        if (r === "pediu_retorno" && !pedindoRetorno) {
            setPedindoRetorno(true);
            return;
        }
        registrar.mutate(r);
    };

    const whatsapp = linkWhatsApp(lead.phone, { texto: mensagem });
    const telefone = lead.phone?.replace(/[^\d+]/g, "");

    return (
        <div className="min-h-0 space-y-4 overflow-y-auto rounded-2xl border border-border/60 bg-card/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-2xl font-bold tracking-tight">{negocio}</h2>
                    {lead.store_name && lead.name !== lead.store_name && <p className="text-sm text-muted-foreground">{lead.name}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                        {[lead.lead_status?.replace(/_/g, " "), lead.lead_score, lead.contact_attempts ? `${lead.contact_attempts} tentativa(s)` : "nunca chamado",
                            lead.last_outcome ? `último: ${RESULTADOS[lead.last_outcome as Resultado]?.rotulo ?? lead.last_outcome}` : null].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onEditLead(lead)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Ficha completa</Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <Select value={lead.owner_id ?? SEM_DONO} onValueChange={(v) => salvar.mutate({ owner_id: v === SEM_DONO ? null : v })}>
                    <SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SEM_DONO}>Sem responsável</SelectItem>
                        {membros.filter((m) => m.user_id).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.full_name || m.email}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Input
                    aria-label="Nicho"
                    placeholder="nicho (ex.: camisas, dentista)"
                    list="crm-nichos"
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    onBlur={() => nicho.trim() !== (lead.segment ?? "") && salvar.mutate({ segment: nicho.trim() || null })}
                />
                <datalist id="crm-nichos">{nichos.map((n) => <option key={n} value={n} />)}</datalist>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {telefone ? (
                    <>
                        <Button asChild size="lg"><a href={`tel:${telefone}`}><Phone className="mr-2 h-4 w-4" />{lead.phone}</a></Button>
                        <Button size="lg" variant="outline" onClick={() => { navigator.clipboard?.writeText(lead.phone!); toast.success("Número copiado"); }} aria-label="Copiar número">
                            <Copy className="h-4 w-4" />
                        </Button>
                        {whatsapp && (
                            <Button asChild size="lg" variant="outline"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</a></Button>
                        )}
                    </>
                ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><PhoneOff className="h-4 w-4" />Sem telefone. Edite a ficha pra incluir.</p>
                )}
                {lead.site_url && (
                    <Button asChild size="lg" variant="ghost">
                        <a href={/^https?:\/\//.test(lead.site_url) ? lead.site_url : `https://${lead.site_url}`} target="_blank" rel="noopener noreferrer"><Store className="mr-2 h-4 w-4" />Site<ExternalLink className="ml-1 h-3 w-3" /></a>
                    </Button>
                )}
            </div>

            <details className="rounded-xl border border-border/60 p-3">
                <summary className="cursor-pointer text-sm font-medium">Mensagem do WhatsApp</summary>
                <Textarea className="mt-2" rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">O botão WhatsApp abre a conversa com esse texto. Depois de mandar, marque "Mandei WhatsApp".</p>
            </details>

            {lead.observations && (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{lead.observations}</div>
            )}

            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Como foi?</h3>
                <Textarea rows={2} placeholder="Anotação (opcional): falei com o dono, pediu proposta de LP…" value={nota} onChange={(e) => setNota(e.target.value)} />
                {pedindoRetorno && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 p-3">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        <Input type="datetime-local" className="w-auto" value={retorno} onChange={(e) => setRetorno(e.target.value)} aria-label="Data do retorno" />
                        <Button size="sm" disabled={!retorno || registrar.isPending} onClick={() => registrar.mutate("pediu_retorno")}>Agendar retorno</Button>
                        <Button size="sm" variant="ghost" onClick={() => setPedindoRetorno(false)}>Cancelar</Button>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(RESULTADOS) as Resultado[]).map((r) => (
                        <Button
                            key={r}
                            variant={r === "interessado" ? "default" : r === "sem_interesse" || r === "numero_errado" ? "ghost" : "outline"}
                            className={cn("h-auto flex-col items-start gap-0.5 py-2 text-left", (r === "sem_interesse" || r === "numero_errado") && "text-muted-foreground hover:text-destructive")}
                            disabled={registrar.isPending}
                            onClick={() => clicarResultado(r)}
                        >
                            <span className="text-sm">{RESULTADOS[r].rotulo}</span>
                            <span className="text-[10px] font-normal opacity-70">{RESULTADOS[r].agenda}</span>
                        </Button>
                    ))}
                </div>
                {registrar.isPending && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Registrando…</p>}
            </section>

            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Histórico</h3>
                {(historico.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum contato registrado ainda.</p>}
                <ul className="space-y-1.5">
                    {(historico.data ?? []).map((a) => {
                        const quem = membros.find((m) => m.user_id === a.user_id);
                        return (
                            <li key={a.id} className="text-xs">
                                <span className="font-medium">{RESULTADOS[a.outcome]?.rotulo ?? a.outcome}</span>
                                <span className="text-muted-foreground"> · {format(parseISO(a.created_at), "dd/MM HH:mm")}{quem ? ` · ${primeiroNome(quem)}` : ""}</span>
                                {a.note && <p className="text-muted-foreground">{a.note}</p>}
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
}
