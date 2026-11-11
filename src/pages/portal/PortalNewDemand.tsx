import { useState, useRef, useCallback } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Loader2, ClipboardList, Send, Sparkles, ImagePlus, X, FileImage } from "lucide-react";

// Áreas que o cliente escolhe. O responsável de cada área é resolvido no banco
// (trigger demand_requests_after_insert), nunca no navegador.
const AREA_OPTIONS = [
    { value: "Gestão", label: "Gestão" },
    { value: "Tráfego", label: "Tráfego" },
    { value: "Design", label: "Design" },
    { value: "Operacional", label: "Operacional" },
    { value: "Comercial", label: "Comercial" },
    { value: "Dev", label: "Dev" },
];

const PRIORITY_OPTIONS = [
    { value: "urgente", label: "Urgente 🔥" },
    { value: "alta", label: "Alta" },
    { value: "normal", label: "Normal" },
    { value: "baixa", label: "Baixa" },
];

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 10;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

interface FilePreview {
    file: File;
    previewUrl: string | null;
    id: string;
}

export default function PortalNewDemand() {
    const { clientData, workspaceId: dashboardWorkspaceId } = useDashboard();
    const { user } = useAuth();
    const { linkedClientId } = usePermissions();


    const [title, setTitle] = useState("");
    const [area, setArea] = useState("");
    const [priority, setPriority] = useState("normal");
    const [description, setDescription] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [files, setFiles] = useState<FilePreview[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFiles = useCallback((newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles);
        const remaining = MAX_FILES - files.length;
        if (remaining <= 0) {
            toast.error(`Máximo de ${MAX_FILES} arquivos permitidos.`);
            return;
        }

        const validFiles: FilePreview[] = [];
        for (const file of fileArray.slice(0, remaining)) {
            if (!ACCEPTED_TYPES.includes(file.type)) {
                toast.error(`Tipo não suportado: ${file.name}. Use PNG, JPG, GIF, WebP ou PDF.`);
                continue;
            }
            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                toast.error(`Arquivo muito grande: ${file.name}. Máximo ${MAX_FILE_SIZE_MB}MB.`);
                continue;
            }
            const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
            validFiles.push({ file, previewUrl, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
        }

        setFiles(prev => [...prev, ...validFiles]);
    }, [files.length]);

    const removeFile = (id: string) => {
        setFiles(prev => {
            const removed = prev.find(f => f.id === id);
            if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
            return prev.filter(f => f.id !== id);
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
            addFiles(e.dataTransfer.files);
        }
    };

    // Sobe os anexos e devolve URL pública + caminho (o caminho serve pra limpar
    // os arquivos se a solicitação não for gravada). Se um upload falhar no meio,
    // apaga os que já subiram e propaga o erro.
    const uploadFiles = async (clientId: string): Promise<{ urls: string[]; paths: string[] }> => {
        const urls: string[] = [];
        const paths: string[] = [];
        for (const fp of files) {
            const ext = fp.file.name.split('.').pop() || 'png';
            const path = `demands/${clientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

            const { data, error } = await supabase.storage
                .from('attachments')
                .upload(path, fp.file, { upsert: false });

            if (error) {
                await removeUploaded(paths);
                throw new Error(`Falha no upload de ${fp.file.name}: ${error.message}`);
            }

            paths.push(data.path);
            urls.push(supabase.storage.from('attachments').getPublicUrl(data.path).data.publicUrl);
        }
        return { urls, paths };
    };

    const removeUploaded = async (paths: string[]) => {
        if (paths.length === 0) return;
        const { error } = await supabase.storage.from('attachments').remove(paths);
        if (error) console.error('[PortalNewDemand] Falha ao limpar anexos órfãos:', error);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // SOURCE OF TRUTH: linkedClientId from PermissionsContext.
        // O workspace e o autor são definidos pelo banco (trigger), não pelo navegador.
        const finalClientId = linkedClientId || clientData?.id;

        if (!title.trim() || !area || !description.trim()) {
            toast.error("Por favor, preencha todos os campos obrigatórios.");
            return;
        }

        if (!finalClientId || !user?.id) {
            toast.error("Erro de identificação do cliente. Tente recarregar a página.");
            return;
        }

        const workspaceId = dashboardWorkspaceId || clientData?.workspace_id;
        if (!workspaceId) {
            toast.error("Erro de identificação do workspace. Tente recarregar a página.");
            return;
        }

        setIsSubmitting(true);
        let uploadedPaths: string[] = [];

        try {
            let attachmentUrls: string[] = [];
            if (files.length > 0) {
                const uploaded = await uploadFiles(finalClientId);
                attachmentUrls = uploaded.urls;
                uploadedPaths = uploaded.paths;
            }

            // Um único INSERT. O banco cria o card no quadro "A fazer", define o
            // responsável pela área, vincula task_id e avisa a equipe, tudo na mesma
            // transação: se gravou, o card existe.
            const { data: created, error: reqError } = await supabase
                .from('demand_requests')
                .insert({
                    client_id: finalClientId,
                    workspace_id: workspaceId,
                    title: title.trim(),
                    description: description.trim(),
                    area,
                    client_priority: priority,
                    status: "pending",
                    created_by: user.id,
                    attachments: attachmentUrls,
                })
                .select('id')
                .single();

            if (reqError || !created) {
                await removeUploaded(uploadedPaths);
                throw reqError || new Error("A solicitação não foi gravada.");
            }

            toast.success("Demanda enviada!", {
                description: "Ela já está no quadro da nossa equipe. Acompanhe pelo Quadro de Demandas.",
            });

            setTitle("");
            setArea("");
            setPriority("normal");
            setDescription("");
            files.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
            setFiles([]);
        } catch (error: any) {
            console.error("[PortalNewDemand] Erro ao enviar demanda:", error);
            toast.error("Não foi possível enviar a demanda", {
                description: error?.message || "Tente novamente em instantes.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="space-y-8">
                <div className="space-y-2">
                    <h1 className="text-4xl font-black tracking-tight">
                        Solicitar Demanda
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        Preencha os detalhes abaixo para que nosso squad possa priorizar sua solicitação.
                    </p>
                </div>

                <Card className="border-border shadow-2xl overflow-hidden bg-background/50 backdrop-blur-sm">
                    <div className="h-1.5 w-full bg-gradient-to-r from-primary to-primary/60" />
                    <CardHeader className="bg-muted/30 border-b border-border/50 py-6 px-8">
                        <div>
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-primary" />
                                Detalhes da Solicitação
                            </CardTitle>
                            <CardDescription className="text-sm">
                                Explique o que precisa ser feito com o máximo de clareza.
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-8 p-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <Label htmlFor="title" className="text-base font-bold flex items-center gap-2">
                                        Título da Demanda
                                        <span className="text-red-500 font-bold">*</span>
                                    </Label>
                                    <Input
                                        id="title"
                                        placeholder="Ex: Alteração de criativos de Ads"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="h-12 text-base border-border/60 focus:ring-primary/20 bg-background"
                                        required
                                    />
                                    <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider opacity-70">O que vamos fazer?</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <Label htmlFor="area" className="text-base font-bold flex items-center gap-2">
                                            Área Responsável
                                            <span className="text-red-500 font-bold">*</span>
                                        </Label>
                                        <Select value={area} onValueChange={setArea} required>
                                            <SelectTrigger className="h-12 text-base border-border/60 bg-background">
                                                <SelectValue placeholder="Selecionar área..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {AREA_OPTIONS.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value} className="text-base py-3">
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider opacity-70">Quem deve atuar?</p>
                                    </div>

                                    <div className="space-y-3">
                                        <Label htmlFor="priority" className="text-base font-bold flex items-center gap-2">
                                            Urgência
                                            <Sparkles className="w-4 h-4 text-primary" />
                                        </Label>
                                        <Select value={priority} onValueChange={setPriority}>
                                            <SelectTrigger className="h-12 text-base border-border/60 bg-background">
                                                <SelectValue placeholder="Escolha a urgência" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PRIORITY_OPTIONS.map(opt => (
                                                    <SelectItem key={opt.value} value={opt.value} className="text-base py-3">
                                                        {opt.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider opacity-70">Qual a prioridade?</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="description" className="text-base font-bold flex items-center gap-2">
                                    Descrição detalhada
                                    <span className="text-red-500 font-bold">*</span>
                                </Label>
                                <Textarea
                                    id="description"
                                    placeholder="Explique o contexto, o objetivo e as referências se houver..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="min-h-[200px] text-base border-border/60 bg-background resize-none p-4 leading-relaxed"
                                    required
                                />
                                <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider opacity-70">Forneça todos os detalhes necessários.</p>
                            </div>

                            {/* Attachments / Image Upload */}
                            <div className="space-y-3">
                                <Label className="text-base font-bold flex items-center gap-2">
                                    <ImagePlus className="w-4 h-4 text-primary" />
                                    Anexos
                                    <span className="text-xs text-muted-foreground font-normal ml-1">(opcional — até {MAX_FILES} arquivos, máx. {MAX_FILE_SIZE_MB}MB cada)</span>
                                </Label>

                                {/* Drop Zone */}
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`
                                        relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200
                                        flex flex-col items-center justify-center gap-3 py-8 px-4
                                        ${isDragging
                                            ? 'border-primary bg-primary/5 scale-[1.01]'
                                            : 'border-border/60 hover:border-primary/40 hover:bg-muted/30'
                                        }
                                        ${files.length >= MAX_FILES ? 'opacity-50 pointer-events-none' : ''}
                                    `}
                                >
                                    <div className={`p-3 rounded-full transition-colors ${isDragging ? 'bg-primary/10' : 'bg-muted'}`}>
                                        <ImagePlus className={`w-6 h-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-semibold">
                                            {isDragging ? 'Solte os arquivos aqui' : 'Arraste imagens ou clique para selecionar'}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            PNG, JPG, GIF, WebP ou PDF
                                        </p>
                                    </div>
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPTED_TYPES.join(',')}
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                        if (e.target.files?.length) {
                                            addFiles(e.target.files);
                                            e.target.value = '';
                                        }
                                    }}
                                />

                                {/* File Previews */}
                                {files.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                                        {files.map((fp) => (
                                            <div
                                                key={fp.id}
                                                className="relative group rounded-lg border border-border overflow-hidden bg-muted/30 aspect-square"
                                            >
                                                {fp.previewUrl ? (
                                                    <img
                                                        src={fp.previewUrl}
                                                        alt={fp.file.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                                                        <FileImage className="w-8 h-8 text-muted-foreground" />
                                                        <span className="text-[10px] text-muted-foreground text-center truncate w-full">
                                                            {fp.file.name}
                                                        </span>
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); removeFile(fp.id); }}
                                                    className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all duration-200"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <p className="text-[9px] text-white truncate">{fp.file.name}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>

                        <CardFooter className="bg-muted/20 border-t border-border/50 p-6 flex justify-end gap-4">
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="h-12 px-8 text-base font-bold gap-2 transition-all rounded-xl shadow-none"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {files.length > 0 ? 'Enviando arquivos...' : 'Enviando...'}
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Enviar Solicitação
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    );
}
