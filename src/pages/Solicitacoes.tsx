import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DemandForm } from "@/components/demands/DemandForm";
import { demandAreaLabel } from "@/config/demandAreas";
import { DemandStatusBadge, DemandStatus } from "@/components/demands/DemandStatusBadge";
import { DemandPrioritySelector, DemandPriority } from "@/components/demands/DemandPrioritySelector";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, X, Building2, Calendar, AlertCircle, Trash2, Eye, EyeOff, Expand, FileIcon, ImageIcon, Send, UserCheck, ListChecks, Wrench, ExternalLink, Link2, Film, UserCircle2 } from "lucide-react";
import BibliotecaTab from "@/components/biblioteca/BibliotecaTab";
import { useDashboard } from "@/contexts/DashboardContext";
import { useAccountType } from "@/contexts/AccountTypeContext";
import { useTasks } from "@/contexts/TasksContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ClipboardList, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TriageAssignee {
    userId: string | null;
    name: string;
    role: 'claude' | 'junior' | 'senior' | 'lead';
    overflowFrom?: string;
}

interface TriageResult {
    type: string;
    complexity: 'trivial' | 'medium' | 'complex' | 'unknown';
    suggestedSkill: string | null;
    canAutoExecute: boolean;
    suggestedRole: 'claude' | 'junior' | 'senior' | 'lead';
    suggestedAssignee?: TriageAssignee | null;
    confidence: number;
    readinessScore?: number;
    missingInfo?: string[];
    blockers?: string[];
    suggestedNextSteps?: string[];
    reasoning?: string;
    classifier?: 'heuristic' | 'llm' | 'hybrid' | 'fallback';
    matchedPattern?: string;
}

interface DemandRequest {
    id: string;
    title: string;
    description: string;
    area: string;
    client_priority: DemandPriority;
    status: DemandStatus;
    created_at: string;
    client_id: string;
    workspace_id: string;
    task_id?: string;
    attachments?: string[];
    triage_result?: TriageResult | null;
    triaged_at?: string | null;
    agency_clients: {
        name: string;
    };
}

// Config visual do badge de triage
const TRIAGE_ROLE_CONFIG: Record<string, { label: string; bg: string; fg: string; emoji: string }> = {
    claude: { label: 'Auto (Claude)', bg: 'bg-blue-100', fg: 'text-blue-800', emoji: '🤖' },
    junior: { label: 'Júnior', bg: 'bg-green-100', fg: 'text-green-800', emoji: '🟢' },
    senior: { label: 'Sênior', bg: 'bg-yellow-100', fg: 'text-yellow-800', emoji: '🟡' },
    lead: { label: 'Lead', bg: 'bg-red-100', fg: 'text-red-800', emoji: '🔴' },
};

const TRIAGE_COMPLEXITY_LABEL: Record<string, string> = {
    trivial: 'Trivial',
    medium: 'Médio',
    complex: 'Complexo',
    unknown: 'Sem classificação',
};

interface ClientAssignedTask {
    id: string;
    client_id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    category: string | null;
    due_date: string | null;
    assigned_at: string;
    completed_at: string | null;
    agency_clients?: { name: string };
}

const ASSIGN_PRIORITY_OPTIONS = [
    { value: "low", label: "Baixa" },
    { value: "medium", label: "Normal" },
    { value: "high", label: "Alta" },
    { value: "critical", label: "Urgente 🔥" },
];

const RESOURCE_TYPE_OPTIONS = [
    { value: "gpt_agent", label: "🤖 Agente GPT" },
    { value: "google_sheets", label: "📊 Google Sheets" },
    { value: "google_docs", label: "📄 Google Docs" },
    { value: "notion", label: "📝 Notion" },
    { value: "figma", label: "🎨 Figma" },
    { value: "canva", label: "🖌️ Canva" },
    { value: "drive", label: "📁 Google Drive" },
    { value: "trello", label: "📋 Trello" },
    { value: "whatsapp", label: "💬 WhatsApp" },
    { value: "slack", label: "💬 Slack" },
    { value: "link", label: "🔗 Outro Link" },
];

interface ClientResource {
    id: string;
    client_id: string;
    is_pinned: boolean;
    title: string;
    url: string;
    resource_type: string;
    description: string | null;
    created_at: string;
    agency_clients?: { name: string };
}

export default function Solicitacoes() {
    const { t } = useTranslation();
    const { workspaceId, selectedClientId, clients } = useDashboard();
    const { isAgency: actualIsAgency } = useAccountType();
    const { loadClientTasks } = useTasks();
    const { canView } = usePermissions();
    const { user } = useAuth();

    const [searchParams, setSearchParams] = useSearchParams();
    const currentTab = searchParams.get("tab") || (actualIsAgency ? "list" : "form");

    const handleTabChange = (value: string) => {
        setSearchParams({ tab: value });
    };

    const isAgency = currentTab === 'list';

    const [demands, setDemands] = useState<DemandRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("pending");
    const [selectedDemand, setSelectedDemand] = useState<DemandRequest | null>(null);
    // IDs de demandas sendo processadas (aprovar/recusar). Bloqueia clique duplo
    // e mostra loading visual no botão. Reset garantido em finally.
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    // === Assign Task to Client state ===
    const [assignClientId, setAssignClientId] = useState("");
    const [assignTitle, setAssignTitle] = useState("");
    const [assignDescription, setAssignDescription] = useState("");
    const [assignPriority, setAssignPriority] = useState("medium");
    const [assignDueDate, setAssignDueDate] = useState("");
    const [assignCategory, setAssignCategory] = useState("");
    const [isAssigning, setIsAssigning] = useState(false);

    // === Client Tasks Tracking state ===
    const [assignedTasks, setAssignedTasks] = useState<ClientAssignedTask[]>([]);
    const [isLoadingAssigned, setIsLoadingAssigned] = useState(false);
    const [assignedFilter, setAssignedFilter] = useState("all");

    // === Client Resources state ===
    const [clientResources, setClientResources] = useState<ClientResource[]>([]);
    const [isLoadingResources, setIsLoadingResources] = useState(false);
    const [resClientId, setResClientId] = useState("");
    const [resTitle, setResTitle] = useState("");
    const [resUrl, setResUrl] = useState("");
    const [resType, setResType] = useState("link");
    const [resDescription, setResDescription] = useState("");
    const [isSavingResource, setIsSavingResource] = useState(false);

    // Edit Resource state
    const [editingResource, setEditingResource] = useState<ClientResource | null>(null);
    const [editResTitle, setEditResTitle] = useState("");
    const [editResUrl, setEditResUrl] = useState("");
    const [editResType, setEditResType] = useState("link");
    const [resourceToDelete, setResourceToDelete] = useState<string | null>(null);
    const [editResDescription, setEditResDescription] = useState("");
    const [isUpdatingResource, setIsUpdatingResource] = useState(false);

    // === Team Members for Assignee Selector ===
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; email: string }[]>([]);
    const [demandAssignees, setDemandAssignees] = useState<Record<string, string>>({});

    const fetchTeamMembers = useCallback(async () => {
        if (!workspaceId) return;
        try {
            const { data, error } = await (supabase as any)
                .from('team_members')
                .select('user_id, name, email, role, user_type, linked_client_id')
                .eq('workspace_id', workspaceId)
                .in('status', ['active', 'invited'])
                .neq('user_type', 'client')
                .neq('role', 'client')
                .neq('role', 'cliente')
                .is('linked_client_id', null);

            if (error) throw error;
            const members = (data || []).filter((m: any) => m.user_id).map((m: any) => ({
                id: m.user_id,
                name: m.name || m.email?.split('@')[0] || 'Sem nome',
                email: m.email || ''
            }));
            setTeamMembers(members);
        } catch (err) {
            console.error('[Solicitacoes] Error fetching team members:', err);
        }
    }, [workspaceId]);

    const fetchDemands = async () => {
        if (!workspaceId) return;
        setIsLoading(true);
        try {
            let query = (supabase as any)
                .from('demand_requests')
                .select(`
                    *,
                    agency_clients (
                        name
                    )
                `)
                .eq('workspace_id', workspaceId)
                .order('created_at', { ascending: false });

            // Filter by selected client if one is chosen
            if (selectedClientId) {
                query = query.eq('client_id', selectedClientId);
            }

            const { data, error } = await query;

            if (error) throw error;
            // O card no quadro é criado pelo banco no INSERT da solicitação
            // (trigger demand_requests_after_insert). Aqui só listamos.
            setDemands(data || []);
        } catch (error: any) {
            console.error("Error fetching demands:", error);
            const errorMsg = error.message || "Erro desconhecido";
            toast.error("Erro ao carregar solicitações", {
                description: `Detalhe: ${errorMsg}`
            });
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAssignedTasks = useCallback(async () => {
        if (!workspaceId) return;
        setIsLoadingAssigned(true);
        try {
            let query = (supabase as any)
                .from('client_assigned_tasks')
                .select(`*, agency_clients ( name )`)
                .eq('workspace_id', workspaceId)
                .order('created_at', { ascending: false });

            if (selectedClientId) {
                query = query.eq('client_id', selectedClientId);
            }

            const { data, error } = await query;

            if (error) throw error;
            setAssignedTasks(data || []);
        } catch (error: any) {
            console.error('[Solicitacoes] Error fetching assigned tasks:', error);
        } finally {
            setIsLoadingAssigned(false);
        }
    }, [workspaceId, selectedClientId]);


    const handleAssignTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignTitle.trim() || !assignClientId) {
            toast.error("Preencha o título e selecione um cliente.");
            return;
        }
        if (!workspaceId || !user?.id) {
            toast.error("Erro de identificação. Recarregue a página.");
            return;
        }

        setIsAssigning(true);
        try {
            const { error } = await (supabase as any)
                .from('client_assigned_tasks')
                .insert({
                    client_id: assignClientId,
                    workspace_id: workspaceId,
                    title: assignTitle.trim(),
                    description: assignDescription.trim() || null,
                    priority: assignPriority,
                    category: assignCategory.trim() || null,
                    due_date: assignDueDate || null,
                    created_by: user.id,
                    // status canônico do kanban (alinhado com task_columns.id)
                    status: 'todo',
                });

            if (error) throw error;

            toast.success("Tarefa atribuída ao cliente! ✅", {
                description: "O cliente verá esta tarefa no portal."
            });

            // Reset form
            setAssignTitle("");
            setAssignDescription("");
            setAssignPriority("medium");
            setAssignDueDate("");
            setAssignCategory("");
        } catch (error: any) {
            console.error('[Solicitacoes] Error assigning task:', error);
            toast.error("Erro ao atribuir tarefa: " + error.message);
        } finally {
            setIsAssigning(false);
        }
    };

    const handleDeleteAssignedTask = async (id: string) => {
        if (!window.confirm("Excluir esta tarefa atribuída ao cliente?")) return;
        try {
            const { error } = await (supabase as any)
                .from('client_assigned_tasks')
                .delete()
                .eq('id', id);
            if (error) throw error;
            toast.success("Tarefa excluída");
            fetchAssignedTasks();
        } catch (error: any) {
            toast.error("Erro ao excluir: " + error.message);
        }
    };

    // === Resources CRUD ===
    const fetchResources = useCallback(async () => {
        console.log('[DEBUG-RESOURCES] Fetching resources...');
        setIsLoadingResources(true);
        try {
            let query = (supabase as any)
                .from('client_resources')
                .select('*, agency_clients ( name )')
                .order('created_at', { ascending: false });

            if (selectedClientId) {
                query = query.eq('client_id', selectedClientId);
            }

            const { data, error } = await query;

            if (error) {
                console.error('[DEBUG-RESOURCES] Fetch error:', error);
                toast.error("Erro ao carregar ferramentas: " + error.message);
                throw error;
            }

            setClientResources(data || []);
        } catch (error: any) {
            console.error('[Solicitacoes] Error fetching resources:', error);
        } finally {
            setIsLoadingResources(false);
        }
    }, [workspaceId, selectedClientId]);

    useEffect(() => {
        fetchDemands();
        fetchTeamMembers();
        if (currentTab === 'client-tasks') {
            fetchAssignedTasks();
        }
        if (currentTab === 'resources') {
            fetchResources();
        }
    }, [workspaceId, selectedClientId, currentTab, fetchAssignedTasks, fetchResources, fetchTeamMembers]);


    const handleAddResource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resTitle.trim() || !resUrl.trim() || !resClientId) {
            toast.error("Preencha cliente, título e URL.");
            return;
        }
        if (!workspaceId || !user?.id) {
            console.warn('[DEBUG-RESOURCES] Cannot add resource: Missing context', { workspaceId, userId: user?.id });
            toast.error("Erro de identificação (Workspace/Usuário). Tente recarregar a página.");
            return;
        }

        setIsSavingResource(true);
        try {
            const { error } = await (supabase as any)
                .from('client_resources')
                .insert({
                    client_id: resClientId,
                    workspace_id: workspaceId,
                    title: resTitle.trim(),
                    url: resUrl.trim(),
                    resource_type: resType,
                    description: resDescription.trim() || null,
                    created_by: user.id,
                });
            console.log('[DEBUG-RESOURCES] Insert response:', { error });
            if (error) throw error;
            toast.success("Recurso adicionado! ✅");
            setResTitle(""); setResUrl(""); setResDescription(""); setResType("link");

            // Re-fetch immediately
            setTimeout(() => {
                fetchResources();
            }, 500);
        } catch (error: any) {
            console.error('[DEBUG-RESOURCES] Insert error:', error);
            toast.error("Erro ao adicionar: " + (error.details || error.message));
        } finally {
            setIsSavingResource(false);
        }
    };

    const handleDeleteResource = (id: string) => {
        setResourceToDelete(id);
    };

    const confirmDeleteResource = async () => {
        if (!resourceToDelete) return;
        try {
            const { error } = await (supabase as any).from('client_resources').delete().eq('id', resourceToDelete);
            if (error) throw error;
            toast.success("Recurso excluído com sucesso");
            setTimeout(() => fetchResources(), 500);
        } catch (error: any) {
            toast.error("Erro ao excluir: " + error.message);
        } finally {
            setResourceToDelete(null);
        }
    };

    const handleTogglePinResource = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await (supabase as any)
                .from('client_resources')
                .update({ is_pinned: !currentStatus })
                .eq('id', id);
            if (error) throw error;
            toast.success(!currentStatus ? "Recurso fixado! 📌" : "Recurso desafixado");
            fetchResources();
        } catch (error: any) {
            toast.error("Erro ao atualizar: " + error.message);
        }
    };

    const handleEditResource = (res: ClientResource) => {
        setEditingResource(res);
        setEditResTitle(res.title);
        setEditResUrl(res.url);
        setEditResType(res.resource_type);
        setEditResDescription(res.description || "");
    };

    const handleUpdateResource = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingResource) return;
        if (!editResTitle.trim() || !editResUrl.trim()) {
            toast.error("Título e URL são obrigatórios.");
            return;
        }

        setIsUpdatingResource(true);
        try {
            const { error } = await (supabase as any)
                .from('client_resources')
                .update({
                    title: editResTitle.trim(),
                    url: editResUrl.trim(),
                    resource_type: editResType,
                    description: editResDescription.trim() || null,
                })
                .eq('id', editingResource.id);

            if (error) throw error;
            toast.success("Recurso atualizado! ✅");
            setEditingResource(null);
            fetchResources();
        } catch (error: any) {
            toast.error("Erro ao atualizar: " + error.message);
        } finally {
            setIsUpdatingResource(false);
        }
    };

    const handleAction = async (id: string, newStatus: DemandStatus, assigneeId?: string) => {
        // ─── LOCK contra clique duplo ───────────────────────────
        // Se essa demanda já está sendo processada, ignora.
        // Evita 2 inserts paralelos criando 2 tasks pra mesma solicitação.
        if (processingIds.has(id)) {
            console.log('[Solicitacoes] Already processing demand', id, '— ignoring duplicate click');
            return;
        }
        setProcessingIds(prev => new Set(prev).add(id));

        try {
            // ─── 1. Atualizar status com guarda de idempotência ──
            // Inclui WHERE status='pending' no UPDATE: se outro processo já mudou
            // pra 'approved' ou 'rejected', a query retorna 0 rows e abortamos.
            // Garante que a aprovação só roda uma vez mesmo em race condition.
            const { data: updatedRows, error: updateError } = await (supabase as any)
                .from('demand_requests')
                .update({ status: newStatus })
                .eq('id', id)
                .eq('status', 'pending')  // só atualiza se ainda estiver pendente
                .select('id');

            if (updateError) throw updateError;
            if (!updatedRows || updatedRows.length === 0) {
                // Outro processo já mudou — sai silenciosamente, sem erro.
                console.log('[Solicitacoes] Demand', id, 'já não estava pending — processamento concorrente. Abortando.');
                toast.info('Esta solicitação já foi processada.');
                return;
            }

            // ─── 2. Se aprovado, sincronizar com o Kanban ───────
            if (newStatus === 'approved') {
                // Re-fetch antes de criar task: pode ter sido criada por outro request.
                // Se demand.task_id já existir, usa o existente em vez de criar duplicata.
                const { data: freshDemand } = await (supabase as any)
                    .from('demand_requests')
                    .select('task_id, client_id, workspace_id, title, description, area, client_priority, attachments')
                    .eq('id', id)
                    .single();
                if (!freshDemand) throw new Error("Solicitação não encontrada");
                const existingTaskId = freshDemand?.task_id;

                if (existingTaskId && existingTaskId.trim() !== "" && existingTaskId !== 'null') {
                    // Task já existe — só move pra coluna Pendente
                    const updatePayload: any = {
                        status: 'todo',
                        updated_at: new Date().toISOString()
                    };
                    const sanitizedAssignee = (assigneeId && assigneeId !== 'none') ? assigneeId : null;
                    if (sanitizedAssignee) updatePayload.assignee_id = sanitizedAssignee;
                    const { error: moveError } = await (supabase as any)
                        .from('client_tasks')
                        .update(updatePayload)
                        .eq('id', existingTaskId);

                    if (moveError) {
                        console.error("[Solicitacoes] Erro ao mover task vinculada:", moveError);
                        toast.error("Erro ao mover tarefa no Kanban. A tarefa pode ter sido excluída.");
                    } else {
                        loadClientTasks();
                        toast.success("Demanda aprovada!", {
                            description: "A tarefa foi movida para o quadro do cliente."
                        });
                    }
                } else {
                    // Nenhuma task vinculada ainda — cria uma.
                    const d = freshDemand;
                    const { data: newTask, error: taskError } = await (supabase as any)
                        .from('client_tasks')
                        .insert({
                            client_id: d.client_id,
                            workspace_id: d.workspace_id,
                            title: `[SOLICITAÇÃO] ${d.title}`,
                            description: `Área: ${demandAreaLabel(d.area)}\n\n${d.description || ''}`,
                            area: d.area || null,
                            category: 'Solicitação do cliente',
                            source: 'demand_request',
                            priority: d.client_priority === 'urgente' ? 'critical' :
                                d.client_priority === 'alta' ? 'high' :
                                    d.client_priority === 'normal' ? 'medium' : 'low',
                            // status canônico do kanban (alinhado com task_columns.id)
                            status: 'todo',
                            assignee_id: (assigneeId && assigneeId !== 'none') ? assigneeId : null,
                            attachments: d.attachments && d.attachments.length > 0
                                ? d.attachments.map((url: string) => ({ url, name: url.split('/').pop() || 'file', type: 'image' }))
                                : [],
                            created_at: new Date().toISOString()
                        })
                        .select('id')
                        .single();

                    if (taskError || !newTask) {
                        console.error("Error creating client task:", taskError);
                        // ROLLBACK: reverter status da demanda para pendente
                        await (supabase as any)
                            .from('demand_requests')
                            .update({ status: 'pending' })
                            .eq('id', id);
                        toast.error("Erro ao criar tarefa no quadro. A demanda voltou para pendente — tente aprovar novamente.");
                    } else {
                        // VINCULAR: salvar o task_id na demanda pra nunca perder o link
                        await (supabase as any)
                            .from('demand_requests')
                            .update({ task_id: newTask.id })
                            .eq('id', id);
                        loadClientTasks();
                        toast.success("Demanda aprovada e criada com sucesso!");
                    }
                }
            } else if (newStatus === 'rejected') {
                toast.success("Demanda enviada para reanálise", {
                    description: "O cliente poderá ver os ajustes necessários."
                });
            } else {
                toast.success("Status atualizado!");
            }

            fetchDemands();
        } catch (error) {
            console.error("Error updating demand:", error);
            toast.error("Erro ao processar solicitação");
        } finally {
            // Libera o lock SEMPRE — mesmo se deu erro, o user pode tentar de novo.
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Tem certeza que deseja excluir esta solicitação permanentemente?")) return;

        try {
            const { error } = await (supabase as any)
                .from('demand_requests')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success("Solicitação excluída com sucesso");
            fetchDemands();
        } catch (error) {
            console.error("Error deleting demand:", error);
            toast.error("Erro ao excluir solicitação");
        }
    };

    const filteredDemands = demands.filter(d => {
        if (activeTab === "pending") return d.status === "pending";
        if (activeTab === "reanalysis") return d.status === "rejected";
        return true;
    });

    if (!workspaceId) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-screen w-full bg-transparent p-10 flex flex-col">
            <Tabs defaultValue={currentTab} value={currentTab} onValueChange={handleTabChange} className="space-y-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-foreground">
                            {t('sidebar.request_demand', 'Solicitações')}
                        </h1>
                        <p className="text-muted-foreground mt-1 max-w-2xl">
                            {t('solicitacoes.description', 'Gerencie e envie solicitações de demandas.')}
                        </p>
                    </div>

                    <div className="hidden lg:flex items-center">
                        <TabsList className="h-10">
                            <TabsTrigger value="form" className="flex items-center gap-2">
                                <ClipboardList className="h-4 w-4" />
                                <span>Novo Formulário</span>
                            </TabsTrigger>
                            <TabsTrigger value="list" className="flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4" />
                                <span>Solicitações</span>
                            </TabsTrigger>
                            <TabsTrigger value="assign" className="flex items-center gap-2">
                                <UserCheck className="h-4 w-4" />
                                <span>Atribuir ao Cliente</span>
                            </TabsTrigger>
                            <TabsTrigger value="client-tasks" className="flex items-center gap-2">
                                <ListChecks className="h-4 w-4" />
                                <span>Tarefas do Cliente</span>
                            </TabsTrigger>
                            <TabsTrigger value="resources" className="flex items-center gap-2">
                                <Wrench className="h-4 w-4" />
                                <span>Recursos do Cliente</span>
                            </TabsTrigger>
                            <TabsTrigger value="biblioteca" className="flex items-center gap-2">
                                <Film className="h-4 w-4" />
                                <span>Biblioteca</span>
                            </TabsTrigger>
                        </TabsList>
                    </div>
                </div>

                {/* Mobile Tabs List underneath header */}
                <div className="flex lg:hidden overflow-x-auto pb-2 no-scrollbar">
                    <TabsList className="h-10 w-max shrink-0">
                        <TabsTrigger value="form" className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4" />
                            <span>Novo Formulário</span>
                        </TabsTrigger>
                        <TabsTrigger value="list" className="flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4" />
                            <span>Solicitações</span>
                        </TabsTrigger>
                        <TabsTrigger value="assign" className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4" />
                            <span>Atribuir ao Cliente</span>
                        </TabsTrigger>
                        <TabsTrigger value="client-tasks" className="flex items-center gap-2">
                            <ListChecks className="h-4 w-4" />
                            <span>Tarefas do Cliente</span>
                        </TabsTrigger>
                        <TabsTrigger value="resources" className="flex items-center gap-2">
                            <Wrench className="h-4 w-4" />
                            <span>Recursos do Cliente</span>
                        </TabsTrigger>
                        <TabsTrigger value="biblioteca" className="flex items-center gap-2">
                            <Film className="h-4 w-4" />
                            <span>Biblioteca</span>
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="form" className="border-none w-full p-0 m-0">
                    <div className="w-full">
                        <div className="w-full bg-transparent">
                            <DemandForm
                                workspaceId={workspaceId!}
                                onSuccess={() => {
                                    handleTabChange('list');
                                    fetchDemands();
                                }}
                            />
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="list" className="border-none p-0 m-0">
                    <div className="space-y-6">
                        <Tabs defaultValue="pending" className="w-full" onValueChange={setActiveTab}>
                            <TabsList className="h-10 inline-flex mb-6">
                                <TabsTrigger value="pending" className="font-medium">
                                    Pendentes
                                </TabsTrigger>
                                <TabsTrigger value="reanalysis" className="font-medium">
                                    Reanálise
                                </TabsTrigger>
                            </TabsList>

                            <div className="mt-6">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-20">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    </div>
                                ) : filteredDemands.length === 0 ? (
                                    <div className="p-12 text-center bg-transparent border border-border/50 border-dashed rounded-[12px]">
                                        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                                        <h3 className="text-lg font-medium text-foreground">Nenhuma solicitação encontrada</h3>
                                        <p className="text-muted-foreground max-w-xs mx-auto mt-2">
                                            {activeTab === "pending"
                                                ? "Não há solicitações pendentes no momento."
                                                : "Não há solicitações recusadas para reanálise."}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        {filteredDemands.map((demand) => (
                                            <Card key={demand.id} className="relative overflow-hidden bg-card border-border/50 hover:border-primary/30 transition-all shadow-sm group">
                                                <div className="p-4 border-b border-border/50 bg-muted/10 flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                            <Building2 className="h-4 w-4 text-primary" />
                                                        </div>
                                                        <div className="truncate">
                                                            <h3 className="text-sm font-bold text-foreground">
                                                                {demand.agency_clients?.name}
                                                            </h3>
                                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                                <Calendar className="h-3 w-3" />
                                                                {new Date(demand.created_at).toLocaleDateString('pt-BR')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {demand.triage_result?.suggestedRole && (
                                                            <span
                                                                className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1",
                                                                    TRIAGE_ROLE_CONFIG[demand.triage_result.suggestedRole]?.bg,
                                                                    TRIAGE_ROLE_CONFIG[demand.triage_result.suggestedRole]?.fg
                                                                )}
                                                                title={demand.triage_result.reasoning || `Triage: ${demand.triage_result.type} · ${TRIAGE_COMPLEXITY_LABEL[demand.triage_result.complexity] || demand.triage_result.complexity}${demand.triage_result.suggestedSkill ? ` · /${demand.triage_result.suggestedSkill}` : ''}`}
                                                            >
                                                                💡 {demand.triage_result.suggestedAssignee?.name || TRIAGE_ROLE_CONFIG[demand.triage_result.suggestedRole]?.label}
                                                            </span>
                                                        )}
                                                        <DemandStatusBadge status={demand.status} className="text-[10px]" />
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => handleDelete(demand.id)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="p-5 space-y-4">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-bold text-base leading-tight">{demand.title}</h4>
                                                            <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                                demand.client_priority === 'urgente' ? "bg-red-500/20 text-red-500" : "bg-blue-500/20 text-blue-500")}>
                                                                {demand.client_priority}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                                                            <span className="text-[10px] font-medium text-muted-foreground uppercase bg-muted/50 px-1.5 py-0.5 rounded">
                                                                {demandAreaLabel(demand.area)}
                                                            </span>
                                                            {demand.triage_result?.suggestedSkill && (
                                                                <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                                                    /{demand.triage_result.suggestedSkill}
                                                                </span>
                                                            )}
                                                            {demand.triage_result?.canAutoExecute && (
                                                                <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                                    Auto-executável
                                                                </span>
                                                            )}
                                                            {demand.triage_result?.readinessScore != null && (
                                                                <span className={cn(
                                                                    "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                                                    demand.triage_result.readinessScore >= 70 ? "bg-green-50 text-green-700" :
                                                                    demand.triage_result.readinessScore >= 40 ? "bg-yellow-50 text-yellow-700" :
                                                                    "bg-red-50 text-red-700"
                                                                )}>
                                                                    Pronta: {demand.triage_result.readinessScore}%
                                                                </span>
                                                            )}
                                                            {demand.triage_result?.missingInfo && demand.triage_result.missingInfo.length > 0 && (
                                                                <span className="text-[10px] font-medium text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
                                                                    ❓ {demand.triage_result.missingInfo.length} info faltando
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-muted-foreground line-clamp-3">{demand.description}</p>
                                                        {demand.triage_result && (demand.triage_result.missingInfo?.length || demand.triage_result.suggestedNextSteps?.length) ? (
                                                            <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                                                                {demand.triage_result.missingInfo && demand.triage_result.missingInfo.length > 0 && (
                                                                    <div>
                                                                        <div className="text-[10px] font-bold text-orange-700 mb-1">❓ Perguntas pro cliente</div>
                                                                        <ul className="text-xs space-y-0.5">
                                                                            {demand.triage_result.missingInfo.slice(0, 3).map((q, idx) => (
                                                                                <li key={idx} className="text-muted-foreground">· {q}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                                {demand.triage_result.suggestedNextSteps && demand.triage_result.suggestedNextSteps.length > 0 && (
                                                                    <div>
                                                                        <div className="text-[10px] font-bold text-blue-700 mb-1">✓ Próximos passos</div>
                                                                        <ul className="text-xs space-y-0.5">
                                                                            {demand.triage_result.suggestedNextSteps.slice(0, 3).map((s, idx) => (
                                                                                <li key={idx} className="text-muted-foreground">· {s}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    {/* Ver Detalhes Button */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full text-muted-foreground hover:text-primary"
                                                        onClick={() => setSelectedDemand(demand)}
                                                    >
                                                        <Expand className="h-4 w-4 mr-2" />
                                                        Ver Detalhes Completos
                                                    </Button>

                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Tabs>
                    </div>
                </TabsContent>

                {/* === TAB: Atribuir ao Cliente === */}
                <TabsContent value="assign" className="border-none p-0 m-0">
                    <div className="w-full">
                        <div className="w-full bg-transparent">
                            <form onSubmit={handleAssignTask} className="space-y-6">
                                {/* Header */}
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                                        <UserCheck className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-foreground">
                                            Atribuir Tarefa ao Cliente
                                        </h2>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Cliente <span className="text-red-500">*</span></Label>
                                    <p className="text-xs text-muted-foreground">Selecione o cliente para atribuir a tarefa</p>
                                    <Select value={assignClientId} onValueChange={setAssignClientId}>
                                        <SelectTrigger className="h-12 bg-card border-border/50">
                                            <SelectValue placeholder="Selecionar cliente..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            {clients.map(c => (
                                                <SelectItem key={c.id} value={c.id} className="py-3">{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Título da Tarefa <span className="text-red-500">*</span></Label>
                                    <p className="text-xs text-muted-foreground">Dê um nome para a tarefa</p>
                                    <Input
                                        placeholder="Ex: Enviar fotos dos produtos"
                                        value={assignTitle}
                                        onChange={(e) => setAssignTitle(e.target.value)}
                                        className="h-12 bg-card border-border/50"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Categoria</Label>
                                    <p className="text-xs text-muted-foreground">Opcional, agrupe a tarefa por categoria</p>
                                    <Input
                                        placeholder="Ex: Conteúdo, Financeiro..."
                                        value={assignCategory}
                                        onChange={(e) => setAssignCategory(e.target.value)}
                                        className="h-12 bg-card border-border/50"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Descrição (opcional)</Label>
                                    <p className="text-xs text-muted-foreground">Explique o que precisa ser feito com detalhes.</p>
                                    <Textarea
                                        placeholder="Inserir texto"
                                        value={assignDescription}
                                        onChange={(e) => setAssignDescription(e.target.value)}
                                        className="min-h-[120px] bg-card border-border/50 resize-y"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Prioridade</Label>
                                    <p className="text-xs text-muted-foreground">Nivel de urgência da tarefa</p>
                                    <Select value={assignPriority} onValueChange={setAssignPriority}>
                                        <SelectTrigger className="h-12 bg-card border-border/50">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            {ASSIGN_PRIORITY_OPTIONS.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value} className="py-3 focus:bg-primary/10 transition-colors">{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Prazo (opcional)</Label>
                                    <p className="text-xs text-muted-foreground">Data limite para o cliente concluir a tarefa</p>
                                    <Input
                                        type="date"
                                        value={assignDueDate}
                                        onChange={(e) => setAssignDueDate(e.target.value)}
                                        className="h-12 bg-card border-border/50"
                                    />
                                </div>

                                {/* Submit Button */}
                                <Button
                                    type="submit"
                                    className="w-full h-12 text-base font-semibold mt-4 bg-primary hover:bg-primary/90 text-primary-foreground"
                                    disabled={isAssigning || !assignTitle.trim() || !assignClientId}
                                >
                                    {isAssigning ? (
                                        <>
                                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                            Enviando...
                                        </>
                                    ) : (
                                        "Atribuir ao Cliente"
                                    )}
                                </Button>
                            </form>
                        </div>
                    </div>
                </TabsContent>

                {/* === TAB: Tarefas do Cliente (tracking) === */}
                <TabsContent value="client-tasks" className="border-none p-0 m-0">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <Tabs defaultValue="all" className="w-full" onValueChange={setAssignedFilter}>
                                <TabsList className="h-10 inline-flex">
                                    <TabsTrigger value="all" className="font-medium">Todas</TabsTrigger>
                                    <TabsTrigger value="pending" className="font-medium">Pendente</TabsTrigger>
                                    <TabsTrigger value="in_progress" className="font-medium">Em Andamento</TabsTrigger>
                                    <TabsTrigger value="done" className="font-medium">Concluído</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        {isLoadingAssigned ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : (() => {
                            const filtered = assignedFilter === 'all'
                                ? assignedTasks
                                : assignedTasks.filter(t => t.status === assignedFilter);

                            if (filtered.length === 0) {
                                return (
                                    <Card className="p-12 text-center bg-card border-border/50 border-dashed">
                                        <ListChecks className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                                        <h3 className="text-lg font-medium">Nenhuma tarefa encontrada</h3>
                                        <p className="text-muted-foreground mt-2 text-sm">Use a aba "Atribuir ao Cliente" para criar tarefas.</p>
                                    </Card>
                                );
                            }

                            return (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {filtered.map(task => (
                                        <Card key={task.id} className="relative overflow-hidden bg-card border-border/50 hover:border-primary/30 transition-all shadow-sm">
                                            <div className="p-4 border-b border-border/50 bg-muted/10 flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                                        <Building2 className="h-4 w-4 text-blue-500" />
                                                    </div>
                                                    <div className="truncate">
                                                        <h3 className="text-sm font-bold">{task.agency_clients?.name || 'Cliente'}</h3>
                                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                            <Calendar className="h-3 w-3" />
                                                            {new Date(task.assigned_at).toLocaleDateString('pt-BR')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                        task.status === 'done' ? 'bg-emerald-500/20 text-emerald-500' :
                                                            task.status === 'in_progress' ? 'bg-blue-500/20 text-blue-500' :
                                                                'bg-amber-500/20 text-amber-500'
                                                    )}>
                                                        {task.status === 'done' ? 'Concluído' : task.status === 'in_progress' ? 'Em Andamento' : 'Pendente'}
                                                    </span>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => handleDeleteAssignedTask(task.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="p-5 space-y-2">
                                                <h4 className="font-bold text-base">{task.title}</h4>
                                                {task.description && (
                                                    <p className="text-sm text-muted-foreground line-clamp-2" style={{ whiteSpace: 'pre-wrap' }}>{task.description}</p>
                                                )}
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                                                    <span className={cn("px-1.5 py-0.5 rounded font-bold uppercase",
                                                        task.priority === 'critical' ? 'bg-red-500/20 text-red-500' :
                                                            task.priority === 'high' ? 'bg-orange-500/20 text-orange-500' :
                                                                'bg-blue-500/20 text-blue-500'
                                                    )}>
                                                        {task.priority === 'critical' ? 'Urgente' : task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Normal' : 'Baixa'}
                                                    </span>
                                                    {task.due_date && (
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            Prazo: {new Date(task.due_date).toLocaleDateString('pt-BR')}
                                                        </span>
                                                    )}
                                                    {task.completed_at && (
                                                        <span className="text-emerald-500">
                                                            ✅ Concluído em {new Date(task.completed_at).toLocaleDateString('pt-BR')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </TabsContent>

                {/* === TAB: Recursos do Cliente === */}
                <TabsContent value="resources" className="border-none p-0 m-0">
                    <div className="space-y-12">
                        {/* Add Resource Form */}
                        <div className="w-full">
                            <div className="w-full bg-transparent">
                                <form onSubmit={handleAddResource} className="space-y-6">
                                    {/* Header */}
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                                            <Link2 className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-foreground">
                                                Adicionar Recurso
                                            </h2>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Cliente <span className="text-red-500">*</span></Label>
                                        <p className="text-xs text-muted-foreground">Selecione o cliente para adicionar o recurso</p>
                                        <Select value={resClientId} onValueChange={setResClientId}>
                                            <SelectTrigger className="h-12 bg-card border-border/50">
                                                <SelectValue placeholder="Selecionar cliente..." />
                                            </SelectTrigger>
                                            <SelectContent className="bg-card border-border">
                                                {clients.map(c => (<SelectItem key={c.id} value={c.id} className="py-3">{c.name}</SelectItem>))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Tipo de Recurso</Label>
                                        <p className="text-xs text-muted-foreground">Classifique o recurso</p>
                                        <Select value={resType} onValueChange={setResType}>
                                            <SelectTrigger className="h-12 bg-card border-border/50">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-card border-border">
                                                {RESOURCE_TYPE_OPTIONS.map(opt => (<SelectItem key={opt.value} value={opt.value} className="py-3 focus:bg-primary/10 transition-colors">{opt.label}</SelectItem>))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Título <span className="text-red-500">*</span></Label>
                                        <p className="text-xs text-muted-foreground">Dê um nome ao recurso</p>
                                        <Input placeholder="Ex: Planilha de Conteúdo" value={resTitle} onChange={(e) => setResTitle(e.target.value)} className="h-12 bg-card border-border/50" required />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">URL <span className="text-red-500">*</span></Label>
                                        <p className="text-xs text-muted-foreground">Link para acessar o recurso</p>
                                        <Input placeholder="https://..." value={resUrl} onChange={(e) => setResUrl(e.target.value)} className="h-12 bg-card border-border/50" required />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold">Descrição (opcional)</Label>
                                        <p className="text-xs text-muted-foreground">Breve descrição do recurso</p>
                                        <Textarea placeholder="Breve descrição do recurso..." value={resDescription} onChange={(e) => setResDescription(e.target.value)} className="min-h-[120px] bg-card border-border/50 resize-y" />
                                    </div>

                                    <Button type="submit" disabled={isSavingResource} className="w-full h-12 text-base font-semibold mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                                        {isSavingResource ? (<><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Salvando...</>) : (<>Adicionar Recurso</>)}
                                    </Button>
                                </form>
                            </div>
                        </div>

                        {/* Resources List Grouped by Client */}
                        {isLoadingResources ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : clientResources.length === 0 ? (
                            <Card className="p-12 text-center bg-card border-border/50 border-dashed">
                                <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                                <h3 className="text-lg font-medium">Nenhum recurso cadastrado</h3>
                                <p className="text-muted-foreground mt-2 text-sm">Use o formulário acima para adicionar planilhas, agentes de IA e outros links.</p>
                            </Card>
                        ) : (
                            <div className="space-y-12">
                                {(() => {
                                    // Use selectedClientId from context if available, otherwise show all
                                    const filteredResources = selectedClientId
                                        ? clientResources.filter(r => r.client_id === selectedClientId)
                                        : clientResources;

                                    console.log('[DEBUG-RESOURCES] UI Render:', {
                                        totalFetched: clientResources.length,
                                        filtered: filteredResources.length,
                                        selectedClientId
                                    });

                                    if (filteredResources.length === 0 && selectedClientId) {
                                        return (
                                            <Card className="p-12 text-center bg-card/30 border-border/40 border-dashed">
                                                <AlertCircle className="h-10 w-10 mx-auto mb-4 text-muted-foreground opacity-40" />
                                                <h4 className="text-lg font-bold uppercase tracking-tight">Nenhuma ferramenta para este cliente</h4>
                                                <p className="text-muted-foreground mt-2 text-sm">
                                                    Você está visualizando apenas ferramentas vinculadas a este cliente específico.
                                                    <br />
                                                    <span className="font-black text-primary">Limpe o filtro no topo da página para ver todas.</span>
                                                </p>
                                            </Card>
                                        );
                                    }

                                    // Group by client
                                    const groupedClientIds = Array.from(new Set(filteredResources.map(r => r.client_id)));

                                    return groupedClientIds.map(clientId => {
                                        const resourcesForClient = filteredResources.filter(r => r.client_id === clientId);
                                        const clientName = resourcesForClient[0]?.agency_clients?.name || "Cliente Desconhecido";

                                        return (
                                            <div key={clientId} className="space-y-6">
                                                <div className="flex items-center gap-4 px-2">
                                                    <h3 className="text-xl font-black tracking-tight text-foreground/80">{clientName}</h3>
                                                    <div className="h-px flex-1 bg-border/40" />
                                                    <span className="text-xs font-bold text-muted-foreground uppercase bg-muted/30 px-3 py-1 rounded-full">
                                                        {resourcesForClient.length} {resourcesForClient.length === 1 ? 'recurso' : 'recursos'}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                                    {resourcesForClient.map(res => {
                                                        const typeLabel = RESOURCE_TYPE_OPTIONS.find(o => o.value === res.resource_type)?.label || res.resource_type;
                                                        return (
                                                            <Card key={res.id} className={cn(
                                                                "group relative overflow-hidden bg-card/40 border-border/40 hover:border-primary/40 transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1",
                                                                res.is_pinned && "border-primary/30 ring-1 ring-primary/20 bg-primary/5"
                                                            )}>
                                                                {res.is_pinned && (
                                                                    <div className="absolute top-0 right-0 w-12 h-12 bg-primary/10 flex items-center justify-center rounded-bl-3xl">
                                                                        <Link2 className="h-4 w-4 text-primary animate-pulse" />
                                                                    </div>
                                                                )}

                                                                <div className="p-5 flex flex-col h-full">
                                                                    <div className="flex items-start justify-between gap-4 mb-4">
                                                                        <div className="flex items-center gap-4 min-w-0">
                                                                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                                                                                <span className="text-2xl">{typeLabel.split(' ')[0]}</span>
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <h4 className="font-black text-lg tracking-tight leading-tight group-hover:text-primary transition-colors truncate">{res.title}</h4>
                                                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{typeLabel.split(' ').slice(1).join(' ')}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className={cn("h-9 w-9", res.is_pinned ? "text-primary" : "text-muted-foreground hover:text-primary")}
                                                                                onClick={() => handleTogglePinResource(res.id, res.is_pinned)}
                                                                                title={res.is_pinned ? "Desafixar" : "Fixar no topo"}
                                                                            >
                                                                                <Link2 className={cn("h-4 w-4", res.is_pinned ? "fill-primary" : "")} />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-9 w-9 text-muted-foreground hover:text-blue-500"
                                                                                onClick={() => handleEditResource(res)}
                                                                                title="Editar"
                                                                            >
                                                                                <Wrench className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-9 w-9 text-muted-foreground hover:text-red-500"
                                                                                onClick={() => handleDeleteResource(res.id)}
                                                                                title="Excluir"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>

                                                                    {res.description && (
                                                                        <div className="flex-1">
                                                                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 font-medium">
                                                                                "{res.description}"
                                                                            </p>
                                                                        </div>
                                                                    )}

                                                                    <div className="mt-6 pt-4 border-t border-border/10 flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Ativo</span>
                                                                            {res.agency_clients?.name && (
                                                                                <>
                                                                                    <span className="text-border/40">|</span>
                                                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                                                                                        <UserCheck className="h-3 w-3" />
                                                                                        {res.agency_clients.name}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        <Button variant="link" className="h-auto p-0 text-primary font-black text-xs hover:no-underline" asChild>
                                                                            <a href={res.url} target="_blank" rel="noopener noreferrer">
                                                                                ABRIR <ExternalLink className="h-3 w-3 ml-1" />
                                                                            </a>
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* === TAB: Biblioteca === */}
                <TabsContent value="biblioteca" className="border-none p-0 m-0">
                    <BibliotecaTab />
                </TabsContent>
            </Tabs>

            {/* Modal de Edição de Recurso */}
            <Dialog open={!!editingResource} onOpenChange={(open) => !open && setEditingResource(null)}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <Wrench className="h-5 w-5 text-primary" />
                            <DialogTitle>Editar Ferramenta</DialogTitle>
                        </div>
                        <DialogDescription>
                            Atualize as informações do recurso compartilhado com o cliente.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleUpdateResource} className="space-y-6 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="font-bold">Título <span className="text-red-500">*</span></Label>
                                <Input
                                    value={editResTitle}
                                    onChange={(e) => setEditResTitle(e.target.value)}
                                    placeholder="Ex: Planilha de Conteúdo"
                                    className="h-11"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="font-bold">Tipo</Label>
                                <Select value={editResType} onValueChange={setEditResType}>
                                    <SelectTrigger className="h-11">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {RESOURCE_TYPE_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="font-bold">URL <span className="text-red-500">*</span></Label>
                            <Input
                                value={editResUrl}
                                onChange={(e) => setEditResUrl(e.target.value)}
                                placeholder="https://..."
                                className="h-11"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="font-bold">Descrição (opcional)</Label>
                            <Textarea
                                value={editResDescription}
                                onChange={(e) => setEditResDescription(e.target.value)}
                                placeholder="Breve descrição do recurso..."
                                className="min-h-[80px] resize-none"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setEditingResource(null)}
                                className="font-bold"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isUpdatingResource}
                                className="bg-purple-600 hover:bg-purple-700 font-black px-8"
                            >
                                {isUpdatingResource ? (
                                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</>
                                ) : (
                                    "Salvar Alterações"
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal de Detalhes da Demanda */}
            <Dialog open={!!selectedDemand} onOpenChange={() => setSelectedDemand(null)}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                    {selectedDemand && (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-2">
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <Building2 className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <DialogTitle className="text-xl">{selectedDemand.title}</DialogTitle>
                                        <DialogDescription>
                                            {selectedDemand.agency_clients?.name} • {new Date(selectedDemand.created_at).toLocaleDateString('pt-BR')}
                                        </DialogDescription>
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-6 mt-4">
                                {/* Meta Info */}
                                <div className="flex flex-wrap gap-2">
                                    <span className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase",
                                        selectedDemand.client_priority === 'urgente' ? "bg-red-500/20 text-red-500" : "bg-blue-500/20 text-blue-500")}>
                                        {selectedDemand.client_priority}
                                    </span>
                                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground uppercase">
                                        {demandAreaLabel(selectedDemand.area)}
                                    </span>
                                    <DemandStatusBadge status={selectedDemand.status} />
                                </div>

                                {/* Description */}
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 text-foreground">Descrição Completa</h4>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 p-4 rounded-lg border border-border/50">
                                        {selectedDemand.description || "Sem descrição adicional."}
                                    </p>
                                </div>

                                {/* Attachments */}
                                {selectedDemand.attachments && selectedDemand.attachments.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-semibold mb-2 text-foreground">Anexos ({selectedDemand.attachments.length})</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {selectedDemand.attachments.map((url, index) => {
                                                const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                                                return (
                                                    <a
                                                        key={index}
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="relative group overflow-hidden rounded-lg border border-border/50 hover:border-primary/50 transition-all"
                                                    >
                                                        {isImage ? (
                                                            <img src={url} alt={`Anexo ${index + 1}`} className="w-full h-24 object-cover" />
                                                        ) : (
                                                            <div className="w-full h-24 bg-muted/30 flex flex-col items-center justify-center gap-1">
                                                                <FileIcon className="h-8 w-8 text-muted-foreground" />
                                                                <span className="text-[10px] text-muted-foreground">Arquivo {index + 1}</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="text-white text-xs">Abrir</span>
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                {selectedDemand.status === 'pending' && (
                                    <div className="space-y-3 pt-4 border-t border-border/50">
                                        {/* Assignee Selector */}
                                        <div className="flex items-center gap-2">
                                            <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <Select
                                                value={demandAssignees[selectedDemand.id] || ''}
                                                onValueChange={(val) => setDemandAssignees(prev => ({ ...prev, [selectedDemand.id]: val }))}
                                            >
                                                <SelectTrigger className="h-10 text-sm bg-muted/30 border-border/50">
                                                    <SelectValue placeholder="Selecionar responsável (opcional)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Sem responsável</SelectItem>
                                                    {teamMembers.map(m => (
                                                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Button
                                                variant="outline"
                                                className="h-12 text-red-500 border-red-500/20"
                                                disabled={processingIds.has(selectedDemand.id)}
                                                onClick={() => {
                                                    handleAction(selectedDemand.id, 'rejected');
                                                    setSelectedDemand(null);
                                                }}
                                            >
                                                {processingIds.has(selectedDemand.id) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />} Recusar
                                            </Button>
                                            <Button
                                                className="h-12 bg-green-600 hover:bg-green-700 font-bold"
                                                disabled={processingIds.has(selectedDemand.id)}
                                                onClick={() => {
                                                    const assignee = demandAssignees[selectedDemand.id];
                                                    handleAction(selectedDemand.id, 'approved', assignee && assignee !== 'none' ? assignee : undefined);
                                                    setSelectedDemand(null);
                                                }}
                                            >
                                                {processingIds.has(selectedDemand.id) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />} Aprovar
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!resourceToDelete} onOpenChange={(open) => !open && setResourceToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Ferramenta?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A ferramenta será removida permanentemente da lista do cliente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDeleteResource} className="bg-red-600 hover:bg-red-700">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}
