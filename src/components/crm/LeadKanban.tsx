import { useState, useMemo, useRef, Fragment } from "react";
import { CrmLead, KanbanColumn } from "@/pages/Comercial";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Store, MoreHorizontal, Pencil, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import { useDashboard } from "@/contexts/DashboardContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const COLUMN_COLORS = [
    { name: 'Padrão', value: 'bg-muted/10 dark:bg-secondary/20 border-border dark:border-border text-muted-foreground' },
    { name: 'Azul', value: 'bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/20 text-blue-500' },
    { name: 'Verde', value: 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 text-emerald-500' },
    { name: 'Amarelo', value: 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/20 text-amber-500' },
    { name: 'Laranja', value: 'bg-orange-500/5 dark:bg-orange-500/10 border-orange-500/20 text-orange-500' },
    { name: 'Roxo', value: 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/20 text-purple-500' },
    { name: 'Rosa', value: 'bg-pink-500/5 dark:bg-pink-500/10 border-pink-500/20 text-pink-500' },
    { name: 'Vermelho', value: 'bg-red-500/5 dark:bg-red-500/10 border-red-500/20 text-red-500' },
];

interface LeadKanbanProps {
    leads: CrmLead[];
    columns: KanbanColumn[];
    isLoading: boolean;
    onEditLead: (lead: CrmLead) => void;
    onDeleteLead: (id: string) => void;
    onArchiveLead: (id: string) => void;
    onLeadMoved: () => void;
    onColumnsChanged: () => void;
    onColumnsReordered: (newColumns: KanbanColumn[]) => void;
    onEditColumn: (column: KanbanColumn) => void;
}

export function LeadKanban({ leads, columns, isLoading, onEditLead, onDeleteLead, onArchiveLead, onLeadMoved, onColumnsChanged, onColumnsReordered }: LeadKanbanProps) {
    const { workspaceId } = useDashboard();
    const [draggedLead, setDraggedLead] = useState<CrmLead | null>(null);
    const [targetTask, setTargetTask] = useState<string | null>(null);
    const [dropSide, setDropSide] = useState<'top' | 'bottom' | null>(null);

    // Refs to track drag target without causing re-renders during rapid dragOver
    const targetTaskRef = useRef<string | null>(null);
    const dropSideRef = useRef<'top' | 'bottom' | null>(null);
    const rafRef = useRef<number | null>(null);
    const cardRectsRef = useRef<Map<string, { top: number; bottom: number; height: number }>>(new Map());

    const syncDragState = () => {
        setTargetTask(targetTaskRef.current);
        setDropSide(dropSideRef.current);
        rafRef.current = null;
    };

    const scheduleDragSync = () => {
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(syncDragState);
        }
    };
    const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
    const [newColumnTitle, setNewColumnTitle] = useState("");
    const [scoreFilter, setScoreFilter] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const SCORE_ORDER: Record<string, number> = { 'Quente': 0, 'Morno': 1, 'Frio': 2 };

    const leadsByStatus = useMemo(() => {
        const acc: Record<string, CrmLead[]> = {};

        if (Array.isArray(columns)) {
            columns.forEach(col => {
                if (col && col.id) {
                    acc[col.id] = [];
                }
            });
        }

        if (Array.isArray(leads)) {
            const busca = searchTerm.trim().toLowerCase();
            leads.forEach(lead => {
                if (scoreFilter && lead.lead_score !== scoreFilter) return;
                if (busca && !`${lead.name} ${lead.store_name || ''}`.toLowerCase().includes(busca)) return;
                const statusKey = lead.column_id || (columns.find(c => c.title.toLowerCase().replace(/\s+/g, '_') === lead.lead_status)?.id || '');
                if (statusKey) {
                    if (!acc[statusKey]) {
                        acc[statusKey] = [];
                    }
                    acc[statusKey].push(lead);
                }
            });
        }

        // Mais quentes primeiro dentro de cada coluna
        Object.values(acc).forEach(list => list.sort((a, b) =>
            (SCORE_ORDER[a.lead_score ?? ''] ?? 3) - (SCORE_ORDER[b.lead_score ?? ''] ?? 3)
        ));

        return acc;
    }, [leads, columns, scoreFilter, searchTerm]);

    const handleDragStart = (e: React.DragEvent, lead: CrmLead) => {
        setDraggedLead(lead);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData("text/plain", lead.id);

        // Capture all card positions at drag start
        const rects = new Map<string, { top: number; bottom: number; height: number }>();
        document.querySelectorAll('[data-lead-id]').forEach(el => {
            const id = el.getAttribute('data-lead-id');
            const rect = el.getBoundingClientRect();
            if (id) rects.set(id, { top: rect.top, bottom: rect.bottom, height: rect.height });
        });
        cardRectsRef.current = rects;
    };

    const handleDragOver = (e: React.DragEvent, targetStatus?: string, overLeadId?: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (overLeadId && overLeadId !== draggedLead?.id) {
            const storedRect = cardRectsRef.current.get(overLeadId);
            if (storedRect) {
                const relativeY = e.clientY - storedRect.top;
                const side = relativeY < storedRect.height / 2 ? 'top' : 'bottom';

                if (overLeadId !== targetTaskRef.current || side !== dropSideRef.current) {
                    targetTaskRef.current = overLeadId;
                    dropSideRef.current = side;
                    scheduleDragSync();
                }
            }
        }
    };

    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
        if (!draggedLead) return;

        const targetColumn = columns.find(c => c.id === targetColumnId);
        if (!targetColumn) return;

        if (draggedLead.column_id !== targetColumnId) {
            try {
                // Optimistically update locally could go here

                const { error } = await supabase
                    .from('crm_leads')
                    .update({
                        column_id: targetColumnId,
                        lead_status: targetColumn.title.toLowerCase().replace(/\s+/g, '_') as any
                    })
                    .eq('id', draggedLead.id);

                if (error) throw error;
                toast.success(`Movido para ${targetColumn.title}`);
                onLeadMoved();
            } catch (error: any) {
                toast.error("Erro ao mover lead: " + error.message);
            }
        }

        setDraggedLead(null);
        setTargetTask(null);
        setDropSide(null);
        targetTaskRef.current = null;
        dropSideRef.current = null;
        cardRectsRef.current.clear();
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };

    const handleDragEnd = () => {
        setDraggedLead(null);
        setTargetTask(null);
        setDropSide(null);
        targetTaskRef.current = null;
        dropSideRef.current = null;
        cardRectsRef.current.clear();
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };

    const handleAddColumn = async () => {
        if (!workspaceId || !newColumnTitle.trim()) return;

        try {
            const { error } = await supabase
                .from('crm_kanban_columns' as any)
                .insert({
                    workspace_id: workspaceId,
                    title: newColumnTitle.trim(),
                    order_index: columns.length,
                    color: "bg-secondary/20 border-border text-muted-foreground"
                });

            if (error) throw error;
            toast.success("Coluna adicionada!");
            setIsAddColumnOpen(false);
            setNewColumnTitle("");
            onColumnsChanged();
        } catch (error: any) {
            toast.error("Erro ao adicionar coluna: " + error.message);
        }
    };

    const handleDeleteColumn = async (columnId: string, leadCount: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (leadCount > 0) {
            if (!confirm(`Existem ${leadCount} leads nesta coluna. Ao excluí-la, os leads ficarão sem coluna vinculada. Deseja continuar?`)) return;
        } else {
            if (!confirm("Excluir esta coluna?")) return;
        }

        try {
            const { error } = await supabase
                .from('crm_kanban_columns' as any)
                .delete()
                .eq('id', columnId);

            if (error) throw error;
            toast.success("Coluna excluída!");
            onColumnsChanged();
        } catch (error: any) {
            toast.error("Erro ao excluir coluna: " + error.message);
        }
    };

    if (isLoading) {
        return (
            <div className="flex gap-4 items-stretch overflow-x-auto p-1 h-[400px]">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="min-w-[300px] flex flex-col gap-4">
                        <Skeleton className="h-12 w-full rounded-2xl" />
                        <Skeleton className="h-40 w-full rounded-2xl" />
                        <Skeleton className="h-40 w-full rounded-2xl" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="h-full">
            <div className="flex items-center gap-2 pb-3 flex-wrap">
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por loja ou nome..."
                    className="h-8 w-64 px-3 rounded-full text-[12px] bg-muted/30 border border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 ml-1">Filtrar:</span>
                {[
                    { v: null, label: 'Todos' },
                    { v: 'Quente', label: 'Quente 🔥' },
                    { v: 'Morno', label: 'Morno 🌤' },
                    { v: 'Frio', label: 'Frio ❄️' },
                ].map(f => (
                    <button
                        key={f.label}
                        onClick={() => setScoreFilter(f.v)}
                        className={cn(
                            "text-[11px] font-bold px-3 py-1 rounded-full border transition-colors",
                            scoreFilter === f.v
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/60"
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
            <div className="flex gap-4 items-stretch overflow-x-auto pb-4">
                {columns.map((col, colIdx) => {
                    const colLeads = leadsByStatus[col.id] || [];
                    const isOverThisColumn = draggedLead && !targetTask /* Only light up empty areas */;
                    const colText = col.color?.split(' ').find(c => c.startsWith('text-')) || 'text-muted-foreground';

                    return (
                        <div
                            key={col.id}
                            className={cn(
                                "flex flex-col h-full rounded-2xl bg-muted/20 border border-border/50 transition-all group/column shrink-0",
                                colIdx === 0 ? "min-w-[340px] flex-1 max-w-[420px]" : "w-[250px] min-w-[250px]",
                                "shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] hover:shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)]",
                                draggedLead && "border-dashed border-primary/50"
                            )}
                            onDragOver={(e) => handleDragOver(e, col.id)}
                            onDragLeave={(e) => {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                                    setTargetTask(null);
                                }
                            }}
                            onDrop={(e) => handleDrop(e, col.id)}
                        >
                            <div className="p-3 flex items-center justify-between border-b border-border/50 bg-muted/30 rounded-t-2xl">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2.5 h-2.5 rounded-full bg-current shadow-[0_0_8px_rgba(0,0,0,0.1)]", colText)} />
                                    <span className={cn("font-bold text-xs uppercase tracking-wider", colText === 'text-muted-foreground' ? 'text-muted-foreground/80' : colText)}>{col.title}</span>
                                    <span className="ml-1 text-[10px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                                        {colLeads.length}
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-red-500 opacity-0 group-hover/column:opacity-100 transition-opacity"
                                    onClick={(e) => handleDeleteColumn(col.id, colLeads.length, e)}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>

                            <div className="p-3 flex-1 overflow-y-auto space-y-4 min-h-[400px] max-h-[calc(100vh-320px)] custom-scrollbar">
                                {colLeads.map((lead) => {
                                    return (
                                        <Fragment key={lead.id}>
                                            {targetTask === lead.id && dropSide === 'top' && (
                                                <div className="h-16 border-2 border-dashed border-primary/30 rounded-2xl bg-primary/5 mx-0.5 shrink-0 pointer-events-none" />
                                            )}

                                            <div
                                                data-lead-id={lead.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, lead)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => {
                                                    e.stopPropagation();
                                                    handleDragOver(e, col.id, lead.id);
                                                }}
                                                onClick={() => onEditLead(lead)}
                                                className={cn(
                                                    "bg-card text-card-foreground rounded-2xl border border-border/40 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer overflow-hidden relative shrink-0",
                                                    draggedLead?.id === lead.id && "opacity-40 ring-2 ring-primary scale-[0.98] rotate-2"
                                                )}
                                            >
                                                <div className="p-2.5 space-y-2">
                                                    {/* Title & Menu */}
                                                    <div className="flex items-start justify-between gap-2 group/title">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-sm font-bold tracking-tight text-foreground block truncate group-hover:text-primary transition-colors">
                                                                {lead.name}
                                                            </h4>
                                                        </div>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6 -mr-2 -mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-transparent"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <MoreHorizontal className="w-4 h-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48 shadow-lg border-border">
                                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditLead(lead); }}>
                                                                    <Pencil className="w-4 h-4 mr-2" />
                                                                    Editar Detalhes
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchiveLead(lead.id); }}>
                                                                    <Archive className="w-4 h-4 mr-2" />
                                                                    Arquivar Lead
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="text-red-500 focus:text-red-500 focus:bg-red-50 dark:focus:bg-red-950/20"
                                                                    onClick={(e) => { e.stopPropagation(); onDeleteLead(lead.id); }}
                                                                >
                                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                                    Excluir Lead
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>

                                                    {lead.store_name && (
                                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
                                                            <Store className="h-3 w-3 shrink-0 opacity-70" />
                                                            <span className="truncate">{lead.store_name}</span>
                                                        </div>
                                                    )}

                                                    {/* Footer Info */}
                                                    <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-border/40">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {lead.product_interest && (() => {
                                                                const v = lead.product_interest.toLowerCase();
                                                                const variant = v === 'assessoria' ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                                                    : v === 'site' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                                                    : v === 'sistema' ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                                                                    : v === 'academy' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                                                    : v === 'automação & ia' ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                                                                    : 'bg-slate-500/10 text-slate-500 border-slate-500/30';
                                                                return (
                                                                    <span className={cn(
                                                                        "text-[10px] font-black uppercase tracking-wider truncate px-2 py-0.5 rounded-md border",
                                                                        variant
                                                                    )}>
                                                                        {lead.product_interest}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>

                                                        <div className="flex items-center shrink-0 ml-2 gap-1.5">
                                                            {lead.lead_score && (
                                                                <span className={cn(
                                                                    "text-[10px] font-black capitalize tracking-tight flex items-center gap-1.5 px-2 py-0.5 rounded-md",
                                                                    lead.lead_score === 'Quente' ? "bg-red-500/20 text-red-500" :
                                                                        lead.lead_score === 'Morno' ? "bg-amber-500/20 text-amber-500" :
                                                                            lead.lead_score === 'Frio' ? "bg-blue-500/20 text-blue-500" : "bg-slate-500/20 text-slate-500"
                                                                )}>
                                                                    {lead.lead_score.toLowerCase()}
                                                                    <span>
                                                                        {lead.lead_score === 'Quente' ? '🔥' :
                                                                            lead.lead_score === 'Morno' ? '🌤' :
                                                                                lead.lead_score === 'Frio' ? '❄️' : ''}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {targetTask === lead.id && dropSide === 'bottom' && (
                                                <div className="h-16 border-2 border-dashed border-primary/30 rounded-2xl bg-primary/5 mx-0.5 shrink-0 pointer-events-none" />
                                            )}
                                        </Fragment>
                                    );
                                })}

                                {colLeads.length === 0 && (
                                    <div className={cn(
                                        "h-full flex items-center justify-center border-2 border-dashed border-muted rounded-md p-4 bg-muted/5 opacity-50 transition-all",
                                        draggedLead && "border-primary/50 bg-primary/5 opacity-100"
                                    )}>
                                        <p className="text-sm text-muted-foreground text-center">
                                            {draggedLead ? "Solte aqui" : "Sem leads"}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Add Column Button */}
                <div
                    className="flex flex-col h-full min-w-[280px] flex-1 rounded-2xl border-2 border-dashed border-border/20 hover:border-primary/30 hover:bg-primary/5 transition-all group/addcol shrink-0 cursor-pointer"
                    onClick={() => setIsAddColumnOpen(true)}
                >
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[400px] max-h-[calc(100vh-320px)]">
                        <div className="p-3 bg-primary/10 rounded-full group-hover/addcol:scale-110 transition-transform">
                            <Plus className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 group-hover/addcol:text-primary transition-colors">Adicionar Coluna</span>
                    </div>
                </div>
            </div>

            <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
                <DialogContent className="rounded-[2rem] p-8 border-primary/20 bg-card/80 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Nova Coluna</DialogTitle>
                    </DialogHeader>
                    <div className="py-6 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="col-title" className="text-xs font-bold uppercase opacity-70">Nome da Coluna</Label>
                            <Input
                                id="col-title"
                                placeholder="Ex: Negociação"
                                value={newColumnTitle}
                                onChange={(e) => setNewColumnTitle(e.target.value)}
                                className="h-12 rounded-xl bg-background/50 border-primary/10 focus:border-primary/40 focus:ring-primary/20"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsAddColumnOpen(false)} className="rounded-xl h-12 font-bold uppercase tracking-widest text-[10px]">Cancelar</Button>
                        <Button onClick={handleAddColumn} className="rounded-xl h-12 px-8 font-black uppercase tracking-widest text-[11px] border border-slate-200">Criar Coluna</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
