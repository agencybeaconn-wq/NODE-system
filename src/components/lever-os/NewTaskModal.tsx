import { useState, useMemo, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
// Import do Select do Radix UI foi removido por causar erros de Portal com o Dialog
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CalendarIcon, Plus, Loader2, Image as ImageIcon, X, Link } from "lucide-react";
import { useSelectedClient } from "@/contexts/DashboardContext";
import { useTasks } from "@/contexts/TasksContext";
import { useAgencyTeam } from "@/hooks/useAgencyTeam";
import { useImageUpload } from "@/hooks/useImageUpload";
import { toast } from "sonner";
import { DEMAND_AREAS } from "@/config/demandAreas";

interface NewTaskModalProps {
    trigger?: React.ReactNode;
    defaultPhase?: string; // Para pré-selecionar fase quando vem da Timeline
    onTaskCreated?: (task: any) => void;
}

const PRIORITY_OPTIONS = [
    { value: "low", label: "Baixa", color: "bg-green-500" },
    { value: "medium", label: "Média", color: "bg-orange-500" },
    { value: "high", label: "Alta", color: "bg-red-500" },
    { value: "critical", label: "Crítica", color: "bg-purple-500" },
];

export function NewTaskModal({ trigger, defaultPhase, onTaskCreated }: NewTaskModalProps) {
    const { selectedClientId, selectedClientName, clients } = useSelectedClient();
    const { members, isLoading: loadingTeam } = useAgencyTeam();
    const [open, setOpen] = useState(false);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [priority, setPriority] = useState("medium");
    const [area, setArea] = useState("");
    const [localClientId, setLocalClientId] = useState("");
    const [linkUrl, setLinkUrl] = useState("");
    const [linkTitle, setLinkTitle] = useState("");

    const activeClientId = localClientId || selectedClientId;

    const { createTask } = useTasks();
    const { uploadImage, deleteImage, isUploading } = useImageUpload();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            setLocalClientId(selectedClientId || "");
            setTitle("");
            setDescription("");
            setDueDate("");
            setAssigneeId("");
            setPriority("medium");
            setArea("");
            setUploadedImages([]);
            setLinkUrl("");
            setLinkTitle("");
        }
    }, [open, selectedClientId]);

    // Mapping for avatars/display since we are using real data
    const teamOptions = useMemo(() => {
        return (members || [])
            .filter(m => m.role?.toLowerCase() !== 'cliente')
            .map(m => ({
                id: m.user_id, // This is the UUID needed for Postgres
                name: m.profile?.full_name || 'Membro',
                role: m.role,
                avatar: m.profile?.avatar_url
            })).filter(m => m.id && !m.id.startsWith('invited_')); // Filter only those with real IDs
    }, [members]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (const file of Array.from(files)) {
            const url = await uploadImage(file);
            if (url) {
                setUploadedImages(prev => [...prev, url]);
            }
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveImage = async (url: string) => {
        await deleteImage(url);
        setUploadedImages(prev => prev.filter(u => u !== url));
    };

    const handleSubmit = async () => {
        console.log('[NewTaskModal] handleSubmit clicked. activeClientId:', activeClientId, 'isFormValid:', isFormValid);
        if (!isFormValid) return;

        try {
            const newTaskData = {
                clientId: activeClientId,
                title,
                description,
                dueDate: dueDate || undefined,
                assigneeId: assigneeId === "none" ? undefined : assigneeId,
                priority: priority as any,
                area: area as any,
                status: "todo" as const,
                images: uploadedImages.length > 0 ? uploadedImages : undefined,
                drive_links: linkUrl.trim() ? [{ title: linkTitle.trim() || "Link Adicional", url: linkUrl.trim() }] : undefined,
            };

            const result = await createTask(newTaskData);

            if (result) {
                toast.success("Tarefa criada com sucesso!");
                onTaskCreated?.(result);

                // Reset form
                setTitle("");
                setDescription("");
                setDueDate("");
                setAssigneeId("");
                setPriority("medium");
                setArea("");
                setLinkUrl("");
                setLinkTitle("");
                setOpen(false);
            }
            // Error is handled inside createTask with a toast
        } catch (error) {
            console.error("Error in handleSubmit:", error);
            toast.error("Erro inesperado ao criar tarefa.");
        }
    };

    const isFormValid = title.trim().length > 0 && activeClientId;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Tarefa
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Nova Tarefa
                        {selectedClientName && (
                            <span className="text-sm font-normal text-muted-foreground">
                                • {selectedClientName}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1">
                    {/* Client Selector - uses native <select> to avoid Radix portal conflict with Dialog */}
                    <div className="space-y-2">
                        <Label>Cliente da Demanda *</Label>
                        <select
                            value={localClientId}
                            onChange={(e) => setLocalClientId(e.target.value)}
                            className="flex h-10 w-full items-center rounded-md border border-input/50 bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer"
                        >
                            <option value="">Selecionar cliente...</option>
                            {clients.filter(c => c && c.id && c.name).map(client => (
                                <option key={client.id} value={client.id}>
                                    {client.name}{client.name === 'Beacon' ? ' (Interno)' : ''}
                                </option>
                            ))}
                        </select>
                        {!activeClientId && (
                            <p className="text-[11px] text-orange-600 font-medium">
                                Por favor, selecione um cliente para vincular a tarefa.
                            </p>
                        )}
                    </div>

                    {/* Título */}
                    <div className="space-y-2">
                        <Label htmlFor="title">Título *</Label>
                        <Input
                            id="title"
                            placeholder="Ex: Configurar pixel do Meta"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    {/* Descrição */}
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                            id="description"
                            placeholder="Detalhes da tarefa..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <div className="space-y-4 pt-2">
                        <Label className="text-sm font-semibold text-foreground/80">Anexos e Links</Label>

                        <div className="space-y-4">
                            {/* Link Inputs - One per line */}
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="linkTitle" className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Nome do link</Label>
                                    <Input
                                        id="linkTitle"
                                        placeholder="Ex: Briefing da Campanha, Pasta do Drive"
                                        value={linkTitle}
                                        onChange={(e) => setLinkTitle(e.target.value)}
                                        className="h-11 text-sm bg-muted/10 border-input/40 focus:bg-background transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="linkUrl" className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">URL do Link</Label>
                                    <div className="relative group/url">
                                        <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within/url:text-primary transition-colors z-10" />
                                        <Input
                                            id="linkUrl"
                                            placeholder="https://drive.google.com/..."
                                            value={linkUrl}
                                            onChange={(e) => setLinkUrl(e.target.value)}
                                            className="h-11 text-sm bg-muted/10 border-input/40 pl-10 focus:bg-background transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Full-width Attach Button */}
                            <div className="space-y-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full h-24 border-dashed border-2 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all group shadow-sm rounded-xl"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                >
                                    {isUploading ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <>
                                            <div className="w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                                <ImageIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-semibold">Anexar Arquivos</span>
                                                <span className="text-[11px] opacity-60">Imagens (JPG, PNG, GIF)</span>
                                            </div>
                                        </>
                                    )}
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                />

                                {/* Images Gallery Preview */}
                                {uploadedImages.length > 0 && (
                                    <div className="flex flex-wrap gap-2 p-2 bg-muted/5 rounded-lg border border-border/40">
                                        {uploadedImages.map((url, idx) => (
                                            <div key={idx} className="relative group w-16 h-16 rounded-md border border-border/50 overflow-hidden shadow-sm hover:shadow-md transition-all">
                                                <img src={url} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveImage(url)}
                                                    className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-destructive"
                                                >
                                                    <X className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="dueDate" className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Data de Entrega</Label>
                            <div className="relative group/date">
                                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within/date:text-primary transition-colors z-10" />
                                <Input
                                    id="dueDate"
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="pl-10 h-11 bg-muted/10 border-input/40 focus:bg-background transition-all appearance-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Prioridade</Label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="flex h-11 w-full items-center rounded-md border border-input/40 bg-muted/10 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer focus:bg-background transition-all"
                            >
                                {PRIORITY_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Responsável */}
                    <div className="space-y-2">
                        <Label>Responsável</Label>
                        <select
                            value={assigneeId}
                            onChange={(e) => setAssigneeId(e.target.value)}
                            disabled={loadingTeam}
                            className="flex h-10 w-full items-center rounded-md border border-input/50 bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer"
                        >
                            <option value="none">Nenhum (Sem responsável)</option>
                            {teamOptions.map(member => (
                                <option key={member.id} value={member.id}>
                                    {member.name} {member.role ? `(${member.role})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Área Responsável */}
                    <div className="space-y-2">
                        <Label>Área Responsável</Label>
                        <select
                            value={area}
                            onChange={(e) => setArea(e.target.value)}
                            className="flex h-10 w-full items-center rounded-md border border-input/50 bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer"
                        >
                            <option value="" disabled>Selecionar área...</option>
                            {DEMAND_AREAS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                </div>

                <DialogFooter className="pt-2 border-t mt-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={!isFormValid || loadingTeam || isUploading}>
                        {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando Imagem...</> : 'Criar Tarefa'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );
}
