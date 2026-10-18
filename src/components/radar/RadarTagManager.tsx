import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CORES_TAG, apagarTag, criarTag, editarTag, type RadarStore, type RadarTag } from "./radarApi";

interface RadarTagManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tags: RadarTag[];
    stores: RadarStore[];
}

function SeletorCor({ valor, onMudar }: { valor: string; onMudar: (c: string) => void }) {
    return (
        <div className="flex gap-1.5">
            {CORES_TAG.map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onMudar(c)}
                    className={cn("h-5 w-5 rounded-full transition-transform hover:scale-110 active:scale-95", valor === c && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                />
            ))}
        </div>
    );
}

export function RadarTagManager({ open, onOpenChange, tags, stores }: RadarTagManagerProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [nova, setNova] = useState({ name: "", color: CORES_TAG[1] });
    const [editando, setEditando] = useState<{ id: number; name: string; color: string } | null>(null);
    const usos = (id: number) => stores.filter((s) => s.tag_ids.includes(id)).length;
    const recarregar = () => {
        queryClient.invalidateQueries({ queryKey: ["radar_tags"] });
        queryClient.invalidateQueries({ queryKey: ["radar_stores"] });
    };
    const falhou = (e: Error) => toast({ variant: "destructive", title: "Não deu", description: e.message });

    const criar = useMutation({
        mutationFn: () => criarTag(nova),
        onSuccess: (t) => {
            toast({ title: `Tag "${t.name}" criada` });
            setNova({ name: "", color: nova.color });
            recarregar();
        },
        onError: falhou,
    });
    const salvar = useMutation({
        mutationFn: (t: { id: number; name: string; color: string }) => editarTag(t.id, { name: t.name, color: t.color }),
        onSuccess: () => {
            setEditando(null);
            recarregar();
        },
        onError: falhou,
    });
    const apagar = useMutation({
        mutationFn: (id: number) => apagarTag(id),
        onSuccess: recarregar,
        onError: falhou,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Tags do Radar</DialogTitle>
                    <DialogDescription>Crie categorias do jeito que fizer sentido pra vocês (ex.: "Referência de criativo", "Escalando", "Concorrente direto").</DialogDescription>
                </DialogHeader>

                <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); criar.mutate(); }}>
                    <div className="flex gap-2">
                        <Input placeholder="Nome da tag" value={nova.name} onChange={(e) => setNova({ ...nova, name: e.target.value })} maxLength={40} />
                        <Button type="submit" disabled={criar.isPending || !nova.name.trim()}>
                            <Plus className="mr-1 h-4 w-4" /> Criar
                        </Button>
                    </div>
                    <SeletorCor valor={nova.color} onMudar={(c) => setNova({ ...nova, color: c })} />
                </form>

                <div className="max-h-72 space-y-1 overflow-y-auto pt-2">
                    {tags.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma tag ainda.</p>}
                    {tags.map((t) =>
                        editando?.id === t.id ? (
                            <div key={t.id} className="space-y-2 rounded-xl border border-border p-2">
                                <div className="flex gap-2">
                                    <Input value={editando.name} onChange={(e) => setEditando({ ...editando, name: e.target.value })} maxLength={40} autoFocus />
                                    <Button size="icon" variant="ghost" aria-label="Salvar" onClick={() => salvar.mutate(editando)} disabled={salvar.isPending}>
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditando(null)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                                <SeletorCor valor={editando.color} onMudar={(c) => setEditando({ ...editando, color: c })} />
                            </div>
                        ) : (
                            <div key={t.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                                <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                                <span className="text-xs text-muted-foreground">{usos(t.id)} loja{usos(t.id) === 1 ? "" : "s"}</span>
                                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Editar ${t.name}`} onClick={() => setEditando({ id: t.id, name: t.name, color: t.color })}>
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    aria-label={`Apagar ${t.name}`}
                                    disabled={apagar.isPending}
                                    onClick={() => {
                                        if (window.confirm(`Apagar a tag "${t.name}"? Ela sai de ${usos(t.id)} loja(s); as lojas continuam no Radar.`)) apagar.mutate(t.id);
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ),
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
