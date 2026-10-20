// Importa possíveis clientes do Radar (aba Clientes NODE) pra coluna Lead, por nicho.
// Mesma função do banco que o Radar usa (radar_levar_pro_comercial).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { disponivelProComercial, levarProComercial, listarProspects } from "@/components/radar/prospectApi";

const TODOS = "__todos__";

interface ImportarDoRadarProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    workspaceId: string | null;
    onImportado: () => void;
}

export function ImportarDoRadar({ open, onOpenChange, workspaceId, onImportado }: ImportarDoRadarProps) {
    const queryClient = useQueryClient();
    const [nicho, setNicho] = useState(TODOS);
    const [soSemSite, setSoSemSite] = useState(true);
    // Quem não está na allowlist do Radar recebe lista vazia (RLS).
    const prospects = useQuery({ queryKey: ["radar_prospects"], queryFn: listarProspects, enabled: open });

    const disponiveis = useMemo(() => (prospects.data ?? []).filter(disponivelProComercial), [prospects.data]);
    const porNicho = useMemo(() => {
        const m = new Map<string, number>();
        for (const p of disponiveis) m.set(p.segment, (m.get(p.segment) ?? 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]);
    }, [disponiveis]);
    const selecionados = useMemo(
        () => disponiveis.filter((p) => (nicho === TODOS || p.segment === nicho) && (!soSemSite || p.site_kind !== "own")),
        [disponiveis, nicho, soSemSite],
    );

    const importar = useMutation({
        mutationFn: () => {
            if (!workspaceId) throw new Error("Workspace não identificado.");
            return levarProComercial(selecionados.map((p) => p.id), workspaceId);
        },
        onSuccess: (n) => {
            toast.success(`${n} leads importados`, { description: "Estão na coluna Lead, com o nicho do Radar." });
            queryClient.invalidateQueries({ queryKey: ["radar_prospects"] });
            onImportado();
            onOpenChange(false);
        },
        onError: (e: Error) => toast.error("Não importou", { description: e.message }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Importar do Radar</DialogTitle>
                    <DialogDescription>
                        Possíveis clientes da aba Clientes NODE entram na coluna Lead (fila de todos), com o nicho. Quem já está aqui fica de fora.
                    </DialogDescription>
                </DialogHeader>
                {prospects.isLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : porNicho.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">
                        Nada novo pra importar. Faça uma busca no Radar (aba Clientes NODE) ou confira se você tem acesso ao Radar.
                    </p>
                ) : (
                    <div className="space-y-3">
                        <Select value={nicho} onValueChange={setNicho}>
                            <SelectTrigger aria-label="Nicho"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={TODOS}>Todos os nichos ({disponiveis.length})</SelectItem>
                                {porNicho.map(([n, qtd]) => <SelectItem key={n} value={n}>{n} ({qtd})</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 p-3 text-sm">
                            <Checkbox checked={soSemSite} onCheckedChange={(v) => setSoSemSite(v === true)} className="mt-0.5" />
                            <span>
                                Só quem não tem site próprio
                                <span className="block text-xs text-muted-foreground">Sem site, só Instagram/agendamento ou site de construtor grátis.</span>
                            </span>
                        </label>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={() => importar.mutate()} disabled={selecionados.length === 0 || importar.isPending}>
                        {importar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Importar {selecionados.length}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
