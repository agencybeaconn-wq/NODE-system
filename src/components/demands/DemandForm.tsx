import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDashboard } from "@/contexts/DashboardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DemandPrioritySelector, DemandPriority } from "./DemandPrioritySelector";
import { Loader2, Upload, X, FileIcon, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import nodeTile from "@/assets/node-tile.png";

interface DemandFormProps {
    clientId?: string;
    workspaceId: string;
    clientName?: string;
    onSuccess?: () => void;
}

type AreaType = 'estrategico' | 'trafego' | 'shopify' | 'design' | 'n8n' | 'outro';

const areaOptions: { value: string; label: string }[] = [
    { value: 'estrategico', label: 'Estratégico' },
    { value: 'trafego', label: 'Tráfego' },
    { value: 'shopify', label: 'Shopify' },
    { value: 'projeto', label: 'Projeto' },
    { value: 'design', label: 'Design' },
    { value: 'outro', label: 'Outro' },
];

export function DemandForm({ clientId: propClientId, workspaceId, clientName: propClientName, onSuccess }: DemandFormProps) {
    const { clientData, clients } = useDashboard();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [area, setArea] = useState<string>("");
    const [priority, setPriority] = useState<DemandPriority>("normal");
    const [files, setFiles] = useState<File[]>([]);

    // Base data either from props or from global context
    const initialClientId = propClientId || clientData?.id || "";
    const [localClientId, setLocalClientId] = useState(initialClientId);

    const activeClientId = localClientId;
    const activeClientName = propClientName || clients.find(c => c.id === activeClientId)?.name || clientData?.name || "";

    const onDrop = useCallback((acceptedFiles: File[]) => {
        setFiles(prev => [...prev, ...acceptedFiles]);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
            'application/pdf': ['.pdf'],
            'video/*': ['.mp4', '.mov', '.avi'],
        },
        maxSize: 50 * 1024 * 1024, // 50MB
    });

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim() || !area) {
            toast.error("Preencha todos os campos obrigatórios");
            return;
        }

        setIsSubmitting(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // Upload files if any
            let attachmentUrls: string[] = [];
            if (files.length > 0) {
                for (const file of files) {
                    const fileName = `${Date.now()}_${file.name}`;
                    const filePath = `demand_attachments/${workspaceId}/${activeClientId}/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('attachments')
                        .upload(filePath, file);

                    if (uploadError) {
                        console.error("Upload error:", uploadError);
                        toast.error(`Anexo ${file.name} não foi enviado: ${uploadError.message}`);
                        continue;
                    }

                    const { data: publicUrl } = supabase.storage
                        .from('attachments')
                        .getPublicUrl(filePath);

                    if (publicUrl) {
                        attachmentUrls.push(publicUrl.publicUrl);
                    }
                }
            }

            // Insert demand request
            const { error } = await (supabase as any)
                .from('demand_requests')
                .insert({
                    workspace_id: workspaceId,
                    client_id: activeClientId,
                    title: title.trim(),
                    description: description.trim(),
                    area,
                    client_priority: priority,
                    attachments: attachmentUrls,
                    created_by: user.id,
                });

            if (error) throw error;

            // O banco cria o card no quadro e avisa a equipe na mesma transação do INSERT.
            toast.success("Demanda enviada!", {
                description: "O card já está no quadro de Demandas, na coluna A fazer.",
            });

            // Reset form
            setTitle("");
            setDescription("");
            setArea("");
            setPriority("normal");
            setFiles([]);

            onSuccess?.();
        } catch (error: any) {
            console.error("Error submitting demand:", error);
            const errorMsg = error.message || (error.error_description) || "Erro desconhecido";
            toast.error("Erro ao enviar demanda", {
                description: `Detalhe: ${errorMsg}`,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Header with Logo */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                    <img src={nodeTile} alt="NODE" className="w-7 h-7 rounded" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-foreground">
                        Formulário de Demandas
                        {activeClientName && <span className="text-primary font-medium ml-2">| {activeClientName}</span>}
                    </h2>
                </div>
            </div>

            {/* Seleção de Cliente (nova) */}
            {!propClientId && !clientData?.id && (
                <div className="space-y-2">
                    <Label className="text-sm font-semibold">Cliente da Demanda <span className="text-red-500">*</span></Label>
                    <p className="text-xs text-muted-foreground">Selecione o cliente ao qual esta demanda pertence</p>
                    <Select value={localClientId} onValueChange={setLocalClientId} disabled={isSubmitting}>
                        <SelectTrigger className="h-12 bg-card border-border/50">
                            <SelectValue placeholder="Selecionar cliente..." />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            {clients.map(client => (
                                <SelectItem key={client.id} value={client.id} className="py-3">
                                    {client.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Title */}
            <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-semibold">
                    Título da Demanda<span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">Dê um nome a sua demanda</p>
                <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Alteração de preço na chuteira X"
                    className="h-12 bg-card border-border/50"
                    disabled={isSubmitting}
                />
            </div>

            {/* Area */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold">
                    Área Responsável<span className="text-red-500">*</span>
                </Label>
                <Select value={area} onValueChange={setArea} disabled={isSubmitting}>
                    <SelectTrigger className="h-12 bg-card border-border/50">
                        <SelectValue placeholder="Selecionar opção..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        {areaOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="py-3 focus:bg-primary/10 transition-colors">
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold">
                    Descrição detalhada<span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">Explique o que precisa ser feito com o máximo de detalhes.</p>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Inserir texto"
                    className="min-h-[120px] bg-card border-border/50 resize-y"
                    disabled={isSubmitting}
                />
            </div>

            {/* Priority */}
            <div className="space-y-2">
                <Label className="text-sm font-semibold">
                    Qual é a prioridade do projeto?<span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">Sujeito à análise de viabilidade técnica</p>
                <DemandPrioritySelector
                    value={priority}
                    onChange={setPriority}
                    disabled={isSubmitting}
                />
            </div>

            {/* File Upload */}
            <div className="space-y-3 pt-2">
                <Label className="text-sm font-semibold">
                    Imagens (Anexos)
                </Label>
                <p className="text-xs text-muted-foreground">Imagens ou referências para ajudar no desenvolvimento da sua demanda.</p>

                <div className="flex flex-wrap gap-2">
                    {files.map((file, index) => (
                        <FilePreviewItem key={index} file={file} index={index} onRemove={removeFile} />
                    ))}

                    <div {...getRootProps()}>
                        <input {...getInputProps()} />
                        <Button
                            type="button"
                            variant="outline"
                            className="w-20 h-20 border-dashed flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                        >
                            <ImageIcon className="w-5 h-5 mb-1" />
                            <span className="text-[10px] leading-tight text-center">Adicionar</span>
                        </Button>
                    </div>
                </div>
            </div>

            {/* Submit Button */}
            <Button
                type="submit"
                className="w-full h-12 text-base font-semibold mt-4"
                disabled={isSubmitting || !title.trim() || !area || !activeClientId}
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Enviando...
                    </>
                ) : (
                    "Enviar"
                )}
            </Button>
        </form>
    );
}

// Separate component to safely use hooks for file preview
function FilePreviewItem({ file, index, onRemove }: { file: File; index: number; onRemove: (i: number) => void }) {
    const isImage = file.type.startsWith("image/");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isImage) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [file, isImage]);

    return (
        <div className="relative group w-20 h-20 rounded-md border border-border/50 overflow-hidden bg-muted/30 flex items-center justify-center">
            {isImage && previewUrl ? (
                <img src={previewUrl} alt={`Anexo ${index + 1}`} className="w-full h-full object-cover" />
            ) : (
                <FileIcon className="w-6 h-6 text-muted-foreground" />
            )}
            <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-destructive"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
}

