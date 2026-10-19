import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightCircle, ExternalLink, Globe, Instagram, Loader2, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDashboard } from "@/contexts/DashboardContext";
import {
    STATUS_PROSPECT, TIPO_SITE, editarProspect, levarProComercial,
    type RadarProspect, type StatusProspect,
} from "./prospectApi";
import { PotencialAnel, ServicosToggle } from "./RadarBits";
import { fmtNumero } from "./radarUtils";
import { nivelProspect, linkWhatsApp } from "./prospectUtils";

interface RadarProspectSheetProps {
    prospect: RadarProspect | null;
    onClose: () => void;
}

export function RadarProspectSheet({ prospect: p, onClose }: RadarProspectSheetProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { workspaceId } = useDashboard();
    const [notas, setNotas] = useState("");
    useEffect(() => setNotas(p?.notes ?? ""), [p?.id, p?.notes]);
    const sujo = !!p && notas.trim() !== (p.notes ?? "").trim();

    const recarregar = () => queryClient.invalidateQueries({ queryKey: ["radar_prospects"] });
    const salvar = useMutation({
        mutationFn: (patch: Parameters<typeof editarProspect>[1]) => editarProspect(p!.id, patch),
        onSuccess: recarregar,
        onError: (e: Error) => toast({ variant: "destructive", title: "Não salvou", description: e.message }),
    });
    const comercial = useMutation({
        mutationFn: () => {
            if (!workspaceId) throw new Error("Workspace não identificado; abra o Comercial uma vez e tente de novo.");
            return levarProComercial(p!, workspaceId);
        },
        onSuccess: () => {
            toast({ title: "No Comercial", description: `${p!.name} entrou na primeira coluna do kanban.` });
            recarregar();
        },
        onError: (e: Error) => toast({ variant: "destructive", title: "Não levou pro Comercial", description: e.message }),
    });

    const fechar = () => {
        if (sujo && !window.confirm("A anotação não foi salva. Fechar mesmo assim?")) return;
        onClose();
    };
    const whatsapp = p ? linkWhatsApp(p.phone, p.country) : null;

    return (
        <Sheet open={!!p} onOpenChange={(open) => !open && fechar()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                {p && (
                    <div className="space-y-6">
                        <SheetHeader className="space-y-1.5 pr-6 text-left">
                            <SheetTitle className="text-2xl font-bold tracking-tight">{p.name}</SheetTitle>
                            <SheetDescription asChild>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="rounded-full bg-muted px-2 py-0.5">{p.segment}</span>
                                    {p.category && <span>{p.category}</span>}
                                    {p.city && <span>· {p.city}</span>}
                                </div>
                            </SheetDescription>
                        </SheetHeader>

                        <div className="flex items-center gap-4 rounded-2xl border border-border/60 p-4">
                            <PotencialAnel score={p.score} nivel={nivelProspect(p.score)} />
                            <div className="min-w-0 space-y-0.5 text-sm">
                                <p className="font-medium">{TIPO_SITE[p.site_kind]}</p>
                                {p.reviews != null && (
                                    <p className="flex items-center gap-1 text-muted-foreground">
                                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                        {p.rating ?? "–"} · {fmtNumero(p.reviews)} avaliações no Google
                                    </p>
                                )}
                                {p.ads_active != null && <p className="text-muted-foreground">{fmtNumero(p.ads_active)} anúncios ativos na busca</p>}
                                {p.address && <p className="truncate text-xs text-muted-foreground">{p.address}</p>}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {whatsapp && (
                                <Button asChild size="sm"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>
                            )}
                            {p.phone && (
                                <Button asChild size="sm" variant="outline"><a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}><Phone className="mr-1.5 h-4 w-4" />{p.phone}</a></Button>
                            )}
                            {p.website && p.site_kind !== "social" && (
                                <Button asChild size="sm" variant="outline"><a href={p.website} target="_blank" rel="noopener noreferrer"><Globe className="mr-1.5 h-4 w-4" />Site</a></Button>
                            )}
                            {(p.instagram || p.site_kind === "social") && (
                                <Button asChild size="sm" variant="outline">
                                    <a href={p.instagram ? `https://instagram.com/${p.instagram.replace(/^@/, "")}` : p.website!} target="_blank" rel="noopener noreferrer">
                                        <Instagram className="mr-1.5 h-4 w-4" />{p.instagram ?? "Rede social"}
                                    </a>
                                </Button>
                            )}
                            {p.maps_url && (
                                <Button asChild size="sm" variant="outline"><a href={p.maps_url} target="_blank" rel="noopener noreferrer"><MapPin className="mr-1.5 h-4 w-4" />Maps</a></Button>
                            )}
                        </div>

                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">O que a NODE pode vender</h3>
                            <ServicosToggle valor={p.services} onMudar={(services) => salvar.mutate({ services })} disabled={salvar.isPending} />
                        </section>

                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">Situação</h3>
                            <Select value={p.status} onValueChange={(v) => salvar.mutate({ status: v as StatusProspect })}>
                                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(STATUS_PROSPECT) as StatusProspect[]).map((s) => <SelectItem key={s} value={s}>{STATUS_PROSPECT[s]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </section>

                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">Anotação</h3>
                            <Textarea rows={5} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ex.: dono atende no WhatsApp à tarde; site caiu; pediu orçamento de LP." />
                            <div className="flex justify-end">
                                <Button size="sm" variant="outline" disabled={!sujo || salvar.isPending} onClick={() => salvar.mutate({ notes: notas.trim() || null })}>
                                    {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salvar anotação
                                </Button>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-border/60 p-4">
                            {p.crm_lead_id ? (
                                <p className="text-sm text-muted-foreground">Já está no kanban do Comercial. O contato é acompanhado lá.</p>
                            ) : (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm text-muted-foreground">Vai abordar? O contato é acompanhado no kanban do Comercial.</p>
                                    <Button onClick={() => comercial.mutate()} disabled={comercial.isPending || sujo} title={sujo ? "Salve a anotação antes" : undefined}>
                                        {comercial.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRightCircle className="mr-1.5 h-4 w-4" />}
                                        Levar pro Comercial
                                    </Button>
                                </div>
                            )}
                        </section>

                        {p.website && (
                            <p className="truncate text-xs text-muted-foreground">
                                <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">{p.website} <ExternalLink className="h-3 w-3" /></a>
                            </p>
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
