import { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import { Task, ChecklistItem, ProcessStep, OnboardingPhase } from '@/types/lever-os';

import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from './PermissionsContext';
import { useDashboard } from './DashboardContext';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

export interface TaskColumn {
    id: string;
    title: string;
    position: number;
    color: string;
    // Posição vertical no quadro (Kanban)
    order_position?: number;
}

// Templates de checklist padrão para cada tipo de step da timeline
// Cada item pode ter um link de documentacao no Notion
const STEP_TEMPLATES: Record<string, { title: string; documentationUrl?: string }[]> = {
    'Call de Kick-off': [
        { title: 'Agendar horário com o cliente', documentationUrl: 'https://www.notion.so/lever/call-kickoff-agendamento' },
        { title: 'Preparar pauta da reunião', documentationUrl: 'https://www.notion.so/lever/call-kickoff-pauta' },
        { title: 'Realizar a call', documentationUrl: 'https://www.notion.so/lever/call-kickoff-execucao' },
        { title: 'Enviar resumo e próximos passos', documentationUrl: 'https://www.notion.so/lever/call-kickoff-resumo' },
    ],
    'Definição de Personas': [
        { title: 'Coletar informações do público-alvo', documentationUrl: 'https://www.notion.so/lever/personas-coleta' },
        { title: 'Criar documento de personas', documentationUrl: 'https://www.notion.so/lever/personas-documento' },
        { title: 'Validar com o cliente', documentationUrl: 'https://www.notion.so/lever/personas-validacao' },
    ],
    'Aprovação do Plano de Mídia': [
        { title: 'Montar plano de mídia', documentationUrl: 'https://www.notion.so/lever/plano-midia-criacao' },
        { title: 'Definir orçamento por canal', documentationUrl: 'https://www.notion.so/lever/plano-midia-orcamento' },
        { title: 'Enviar para aprovação do cliente', documentationUrl: 'https://www.notion.so/lever/plano-midia-aprovacao' },
        { title: 'Receber feedback e ajustar', documentationUrl: 'https://www.notion.so/lever/plano-midia-ajustes' },
    ],
    'Solicitar acesso Shopify': [
        { title: 'Enviar e-mail solicitando acesso de colaborador', documentationUrl: 'https://www.notion.so/lever/shopify-acesso-email' },
        { title: 'Aguardar convite', documentationUrl: 'https://www.notion.so/lever/shopify-acesso-convite' },
        { title: 'Aceitar convite e testar acesso', documentationUrl: 'https://www.notion.so/lever/shopify-acesso-teste' },
    ],
    'Criar BM e Pixel': [
        { title: 'Criar Business Manager no Meta', documentationUrl: 'https://www.notion.so/lever/meta-bm-criacao' },
        { title: 'Criar Pixel do Facebook', documentationUrl: 'https://www.notion.so/lever/meta-pixel-criacao' },
        { title: 'Instalar pixel no site', documentationUrl: 'https://www.notion.so/lever/meta-pixel-instalacao' },
        { title: 'Configurar eventos padrão', documentationUrl: 'https://www.notion.so/lever/meta-pixel-eventos' },
        { title: 'Testar eventos com Extension', documentationUrl: 'https://www.notion.so/lever/meta-pixel-teste' },
    ],
    'Verificar acesso Google Drive': [
        { title: 'Solicitar acesso à pasta compartilhada', documentationUrl: 'https://www.notion.so/lever/drive-acesso-solicitacao' },
        { title: 'Verificar permissões de edição', documentationUrl: 'https://www.notion.so/lever/drive-permissoes' },
        { title: 'Organizar estrutura de pastas', documentationUrl: 'https://www.notion.so/lever/drive-estrutura' },
    ],
    'Upload do Tema Premium': [
        { title: 'Baixar tema do fornecedor', documentationUrl: 'https://www.notion.so/lever/tema-download' },
        { title: 'Fazer backup do tema atual', documentationUrl: 'https://www.notion.so/lever/tema-backup' },
        { title: 'Fazer upload do novo tema', documentationUrl: 'https://www.notion.so/lever/tema-upload' },
        { title: 'Ativar e testar tema', documentationUrl: 'https://www.notion.so/lever/tema-ativacao' },
    ],
    'Importação de Produtos': [
        { title: 'Solicitar planilha de produtos', documentationUrl: 'https://www.notion.so/lever/produtos-planilha' },
        { title: 'Formatar CSV para Shopify', documentationUrl: 'https://www.notion.so/lever/produtos-csv' },
        { title: 'Importar produtos', documentationUrl: 'https://www.notion.so/lever/produtos-importacao' },
        { title: 'Revisar produtos importados', documentationUrl: 'https://www.notion.so/lever/produtos-revisao' },
        { title: 'Ajustar imagens e descrições', documentationUrl: 'https://www.notion.so/lever/produtos-ajustes' },
    ],
    'Configuração Checkout': [
        { title: 'Configurar métodos de pagamento', documentationUrl: 'https://www.notion.so/lever/checkout-pagamento' },
        { title: 'Configurar métodos de envio', documentationUrl: 'https://www.notion.so/lever/checkout-envio' },
        { title: 'Testar fluxo de compra completo', documentationUrl: 'https://www.notion.so/lever/checkout-teste' },
    ],
    'Conexão de Domínio': [
        { title: 'Verificar propriedade do domínio', documentationUrl: 'https://www.notion.so/lever/dominio-propriedade' },
        { title: 'Configurar DNS (CNAME/A Record)', documentationUrl: 'https://www.notion.so/lever/dominio-dns' },
        { title: 'Aguardar propagação', documentationUrl: 'https://www.notion.so/lever/dominio-propagacao' },
        { title: 'Instalar certificado SSL', documentationUrl: 'https://www.notion.so/lever/dominio-ssl' },
        { title: 'Testar domínio funcionando', documentationUrl: 'https://www.notion.so/lever/dominio-teste' },
    ],
    'Configurar Reportana (WhatsApp)': [
        { title: 'Criar conta no Reportana', documentationUrl: 'https://www.notion.so/lever/reportana-conta' },
        { title: 'Conectar WhatsApp Business', documentationUrl: 'https://www.notion.so/lever/reportana-whatsapp' },
        { title: 'Configurar automações', documentationUrl: 'https://www.notion.so/lever/reportana-automacoes' },
        { title: 'Testar fluxos de mensagem', documentationUrl: 'https://www.notion.so/lever/reportana-teste' },
    ],
    'Validar Eventos (GTM/Pixel)': [
        { title: 'Verificar GTM instalado', documentationUrl: 'https://www.notion.so/lever/gtm-verificacao' },
        { title: 'Testar evento de PageView', documentationUrl: 'https://www.notion.so/lever/gtm-pageview' },
        { title: 'Testar evento de AddToCart', documentationUrl: 'https://www.notion.so/lever/gtm-addtocart' },
        { title: 'Testar evento de Purchase', documentationUrl: 'https://www.notion.so/lever/gtm-purchase' },
        { title: 'Validar no Events Manager', documentationUrl: 'https://www.notion.so/lever/gtm-events-manager' },
    ],
};

// Gerar checklist padrão baseado no título do step
function generateDefaultChecklist(stepTitle: string): ChecklistItem[] {
    const template = STEP_TEMPLATES[stepTitle] || [
        { title: 'Iniciar tarefa' },
        { title: 'Executar processo' },
        { title: 'Validar resultado' },
        { title: 'Finalizar e documentar' },
    ];

    return template.map((item, index) => ({
        id: `cl_${Date.now()}_${index} `,
        title: item.title,
        isCompleted: false,
        documentationUrl: item.documentationUrl,
    }));
}

// Mapear status do ProcessStep para Task
function mapStepStatusToTaskStatus(stepStatus: ProcessStep['status']): Task['status'] {
    const map: Record<ProcessStep['status'], Task['status']> = {
        'pending': 'todo',
        'in_progress': 'in_progress',
        'completed': 'done',
        'blocked': 'backlog',
    };
    return map[stepStatus];
}

// Mapear status da Task para ProcessStep
function mapTaskStatusToStepStatus(taskStatus: Task['status']): ProcessStep['status'] {
    const map: Record<Task['status'], ProcessStep['status']> = {
        'backlog': 'blocked',
        'todo': 'pending',
        'in_progress': 'in_progress',
        'validation': 'in_progress',
        'done': 'completed',
    };
    return map[taskStatus];
}

// Mapear role para area
function mapRoleToArea(role: ProcessStep['assigneeRole']): Task['area'] {
    const map: Record<ProcessStep['assigneeRole'], Task['area']> = {
        'head': 'strategy',
        'media_buyer': 'traffic',
        'dev': 'dev',
        'designer': 'design',
    };
    return map[role];
}

// NOTA: A geração de tasks acontece agora no ProductSelector
// quando produtos são atribuídos a um cliente.
// TasksContext apenas lê as tasks do banco (client_tasks).


interface TasksContextType {
    tasks: Task[];
    columns: TaskColumn[]; // New state for columns
    isLoading: boolean;

    // CRUD de Columns
    addColumn: (title: string, color: string) => Promise<void>;
    updateColumn: (columnId: string, updates: Partial<TaskColumn>) => Promise<void>;
    moveColumn: (columnId: string, newPosition: number) => Promise<void>;
    deleteColumn: (columnId: string) => Promise<void>;

    // CRUD de Tasks
    getTaskById: (taskId: string) => Task | undefined;
    getTasksByClient: (clientId: string) => Task[];
    getTaskByStepId: (stepId: string) => Task | undefined;

    // Criar task a partir de um step da timeline
    createTaskFromStep: (
        clientId: string,
        phaseId: string,
        step: ProcessStep
    ) => Task;

    // Atualizar task
    updateTask: (taskId: string, updates: Partial<Task>) => void;

    // Mover task (status)
    moveTask: (taskId: string, newStatus: Task['status'], newPosition?: number) => void;

    // Excluir task
    deleteTask: (taskId: string) => Promise<void>;

    // Arquivar task (concluir e arquivar)
    archiveTask: (taskId: string) => Promise<void>;

    // Criar uma nova task manualmente
    createTask: (taskData: Partial<Task>) => Promise<Task | null>;

    // Checklist
    toggleChecklistItem: (taskId: string, checklistItemId: string) => void;
    addChecklistItem: (taskId: string, title: string) => void;
    removeChecklistItem: (taskId: string, checklistItemId: string) => void;

    // Sincronização - callback para quando task mudar
    onTaskStatusChange?: (taskId: string, newStatus: Task['status'], stepId?: string) => void;
    setOnTaskStatusChange: (callback: (taskId: string, newStatus: Task['status'], stepId?: string) => void) => void;

    // Abrir modal de detalhes
    selectedTask: Task | null;
    openTaskDetail: (task: Task) => void;
    closeTaskDetail: () => void;

    // Recarregar tasks dos clientes
    loadClientTasks: (ignoreClientFilter?: boolean) => Promise<void>;
}

const TasksContext = createContext<TasksContextType | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [columns, setColumns] = useState<TaskColumn[]>([]); // Initialize empty
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [onTaskStatusChangeCallback, setOnTaskStatusChangeCallback] = useState<
        ((taskId: string, newStatus: Task['status'], stepId?: string) => void) | undefined
    >();


    // CENTRALIZED: Use getDataFilter for consistent filtering across all users
    const { isClient, linkedClientId, getDataFilter, isLoading: isLoadingPermissions, isAdmin } = usePermissions();
    const { user } = useAuth();
    const dataFilter = getDataFilter();
    const { workspaceId, selectedClientId } = useDashboard();

    // Carregar tasks dos clientes do Supabase
    // A criação acontece no ProductSelector quando produtos são atribuídos
    const loadClientTasks = useCallback(async (ignoreClientFilter: boolean = false) => {
        try {
            setIsLoading(true);

            console.log('[TasksContext] === LOADING TASKS ===');
            console.log('[TasksContext] isAdmin:', isAdmin, '| isClient:', isClient, '| user.id:', user?.id);
            console.log('[TasksContext] workspaceId:', workspaceId, '| selectedClientId:', selectedClientId);
            console.log('[TasksContext] dataFilter:', JSON.stringify(dataFilter));
            console.log('[TasksContext] isLoadingPermissions:', isLoadingPermissions);

            // Calculate the 30-day cutoff date for showing recently archived tasks
            const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

            // Buscar tasks do banco (join com clients para nome)
            let dbTasksQuery = (supabase as any)
                .from('client_tasks')
                .select('*, clients:client_id(name)')
                .order('order_position', { ascending: true, nullsFirst: true })
                .order('created_at', { ascending: false });

            // CENTRALIZED FILTER: Apply client filter if exists AND not ignored
            const effectiveClientId = dataFilter?.client_id || (!ignoreClientFilter ? selectedClientId : null);

            console.log('[TasksContext] effectiveClientId:', effectiveClientId);

            if (effectiveClientId) {
                dbTasksQuery = dbTasksQuery.eq('client_id', effectiveClientId);
            }

            // Filtrar por workspace
            if (workspaceId) {
                dbTasksQuery = dbTasksQuery.eq('workspace_id', workspaceId);
            }

            // UMA UNICA chamada .or() que combina archived + assignee
            // PostgREST sobrescreve .or() anteriores, entao tudo precisa estar em uma unica chamada
            if (!isAdmin && !isClient && user?.id) {
                // Funcionarios: (archived_at IS NULL OR archived_at >= cutoff) AND (assignee = uid OR assignee IS NULL)
                // Expandido em DNF para PostgREST:
                console.log('[TasksContext] Employee filter: my tasks + unassigned, with archive filter');
                dbTasksQuery = dbTasksQuery.or(
                    `and(archived_at.is.null,assignee_id.eq.${user.id}),` +
                    `and(archived_at.is.null,assignee_id.is.null),` +
                    `and(archived_at.gte.${archiveCutoff},assignee_id.eq.${user.id}),` +
                    `and(archived_at.gte.${archiveCutoff},assignee_id.is.null)`
                );
            } else {
                // Admins/Clients: apenas filtro de archive
                dbTasksQuery = dbTasksQuery.or(`archived_at.is.null,archived_at.gte.${archiveCutoff}`);
            }

            // Bug 5: Limitar resultados para evitar carregamento lento
            dbTasksQuery = dbTasksQuery.limit(1000);

            const { data: dbTasks, error: dbError } = await dbTasksQuery;

            console.log('[TasksContext] Query result: ', dbTasks?.length ?? 0, 'tasks | error:', dbError);

            if (dbError) {
                console.error('[TasksContext] Error loading tasks:', dbError);
                setTasks([]);
                setIsLoading(false);
                return;
            }

            // Mapear tasks do banco para o formato do front-end.
            // Status agora é canônico (alinhado com task_columns.id):
            //   todo · em_progresso · validation · alteracao_revisao · concluido.
            // Antes havia ETL pending→todo / completed→done (legado); removido após
            // migration de normalize em 2026-05-27.
            const mappedTasks: Task[] = (dbTasks || []).map((t: any) => {
                const mappedStatus = t.status || 'todo';

                return {
                    id: t.id,
                    clientId: t.client_id,
                    clientName: t.clients?.name,
                    completedAt: t.completed_at,
                    title: t.title || "Sem título",
                    description: t.description || "",
                    status: (mappedStatus || 'todo') as Task['status'],
                    priority: (t.priority || 'medium') as Task['priority'],
                    area: t.area as Task['area'],
                    createdAt: t.created_at,
                    dueDate: t.due_date ? (t.due_date.includes('T') ? t.due_date : `${t.due_date}T12:00:00.000Z`) : undefined,
                    checklist: t.checklist || [],
                    productId: t.product_id,
                    productName: t.product_name,
                    category: t.category,
                    stepId: t.step_id,
                    assigneeId: t.assignee_id,
                    projectType: t.project_type ?? null,
                    coverImageUrl: t.cover_image_url,
                    images: t.images || [],
                    order_position: t.order_position,
                    workspace_id: t.workspace_id,
                    drive_links: t.drive_links || [],
                    attachments: t.attachments || [],
                    archivedAt: t.archived_at || undefined
                };
            });

            // Deduplicação inteligente: 
            // Só remove se tiverem o mesmo stepId E o mesmo clientId
            // E se uma tiver workspace e a outra não
            const uniqueTasksMap = new Map<string, Task>();
            const legacyTasksToKeep: Task[] = [];

            mappedTasks.forEach(task => {
                if (!task.stepId) {
                    legacyTasksToKeep.push(task);
                    return;
                }

                const key = `${task.clientId}-${task.stepId}`;
                const existing = uniqueTasksMap.get(key);

                if (!existing) {
                    uniqueTasksMap.set(key, task);
                } else {
                    console.log(`[TasksContext] Collision detected for step_id: ${task.stepId}. Previous ID: ${existing.id}, New ID: ${task.id}`);
                    // Se a atual tiver workspace_id e a existente não (legacy), prefira a atual
                    if ((task as any).workspace_id && !(existing as any).workspace_id) {
                        uniqueTasksMap.set(key, task);
                    } else if (task.createdAt && existing.createdAt && new Date(task.createdAt) > new Date(existing.createdAt)) {
                        // Caso ambas tenham ou ambas não tenham workspace, pegamos a mais recente
                        uniqueTasksMap.set(key, task);
                    }
                }
            });

            const finalTasks = [...legacyTasksToKeep, ...Array.from(uniqueTasksMap.values())];

            // NORMALIZAÇÃO DE ORDEM: Garantir que todas as tasks tenham um order_position numérico único e sequencial
            const tasksWithNormalizedOrder: Task[] = [];

            // Agrupar por status para normalizar dentro de cada coluna
            const statusGroups: Record<string, Task[]> = {};
            finalTasks.forEach(t => {
                const s = t.status || 'todo';
                if (!statusGroups[s]) statusGroups[s] = [];
                statusGroups[s].push(t);
            });

            Object.keys(statusGroups).forEach(status => {
                const group = statusGroups[status].sort((a, b) => {
                    const posA = a.order_position ?? 0;
                    const posB = b.order_position ?? 0;
                    if (posA === posB) {
                        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
                    }
                    return posA - posB;
                });

                group.forEach((t, idx) => {
                    tasksWithNormalizedOrder.push({
                        ...t,
                        order_position: idx
                    });
                });
            });

            console.log(`[TasksContext] Loaded and strictly normalized ${tasksWithNormalizedOrder.length} tasks.`);
            setTasks(tasksWithNormalizedOrder);

            // AUTO-FIX: Persist normalized positions back to DB if they were inconsistent
            const needsSync = tasksWithNormalizedOrder.some((t, idx) => t.order_position !== finalTasks.find(ft => ft.id === t.id)?.order_position);
            if (needsSync) {
                console.log('[TasksContext] Syncing normalized positions to database...');
                const dbTasksToUpdate = tasksWithNormalizedOrder.filter(t => !t.id.startsWith('task_') && !t.id.startsWith('t_'));
                Promise.all(dbTasksToUpdate.map(t =>
                    (supabase as any).from('client_tasks').update({ order_position: t.order_position }).eq('id', t.id)
                )).then(() => console.log('[TasksContext] Database positions normalized.'));
            }

            // AUTO-ARCHIVE REMOVIDO — arquivamento agora é apenas manual pelo admin
            // Tasks concluídas permanecem na coluna "Concluído" até serem arquivadas manualmente
        } catch (err) {
            console.error('[TasksContext] Failed to load tasks:', err);
        } finally {
            setIsLoading(false);
        }
    }, [dataFilter?.client_id, selectedClientId, workspaceId, user?.id, isAdmin, isClient]);

    // Load columns from database
    const loadColumns = useCallback(async () => {
        try {
            // Carrega apenas colunas operacionais (não-hidden) pro kanban principal.
            // Coluna "Concluído" tem hidden=true → fica fora do quadro, mas o status
            // 'concluido' continua válido (tasks concluídas existem no DB, só não
            // aparecem visualmente no kanban — vão pra histórico futuramente).
            const { data, error } = await (supabase as any)
                .from('task_columns')
                .select('*')
                .eq('hidden', false)
                .order('position', { ascending: true });

            if (error) {
                // Suppress standard error if table doesn't exist (expected for now)
                if (error.code !== 'PGRST204' && error.code !== 'PGRST205') {
                    console.error('[TasksContext] Error loading columns:', error);
                }

                // Fallback defaults if table doesn't exist or error
                setColumns([
                    { id: 'todo', title: 'A Fazer', position: 0, color: 'bg-slate-500' },
                    { id: 'in_progress', title: 'Em Andamento', position: 1, color: 'bg-blue-500' },
                    { id: 'validation', title: 'Validação', position: 2, color: 'bg-purple-500' },
                    { id: 'done', title: 'Concluído', position: 3, color: 'bg-green-500' }
                ]);
            } else if (data && data.length > 0) {
                setColumns(data);
            } else {
                // Table exists but empty, use defaults
                setColumns([
                    { id: 'todo', title: 'A Fazer', position: 0, color: 'bg-slate-500' },
                    { id: 'in_progress', title: 'Em Andamento', position: 1, color: 'bg-blue-500' },
                    { id: 'validation', title: 'Validação', position: 2, color: 'bg-purple-500' },
                    { id: 'done', title: 'Concluído', position: 3, color: 'bg-green-500' }
                ]);
            }
        } catch (err) {
            console.error('[TasksContext] Failed to load columns:', err);
        }
    }, []);

    const addColumn = useCallback(async (title: string, color: string) => {
        const newColumn: TaskColumn = {
            id: title.toLowerCase().replace(/\s+/g, '_'),
            title,
            position: columns.length,
            color
        };

        // Optimistic update
        setColumns(prev => [...prev, newColumn]);

        try {
            const { error } = await (supabase as any)
                .from('task_columns')
                .upsert(newColumn);

            if (error) throw error;
            toast.success("Coluna adicionada!");
        } catch (error) {
            console.error('[TasksContext] Error adding column:', error);
            toast.error("Erro ao adicionar coluna");
        }
    }, [columns]);

    const updateColumn = useCallback(async (columnId: string, updates: Partial<TaskColumn>) => {
        setColumns(prev => prev.map(c => c.id === columnId ? { ...c, ...updates } : c));

        try {
            const { error } = await (supabase as any)
                .from('task_columns')
                .update(updates)
                .eq('id', columnId);

            if (error) throw error;
            toast.success("Coluna atualizada!");
        } catch (error) {
            console.error('[TasksContext] Error updating column:', error);
            toast.error("Erro ao atualizar coluna");
            loadColumns(); // Revert state
        }
    }, [loadColumns]);

    const moveColumn = useCallback(async (columnId: string, newPosition: number) => {
        setColumns(prev => {
            const newCols = [...prev];
            const colIdx = newCols.findIndex(c => c.id === columnId);
            if (colIdx === -1) return prev;

            const [movedCol] = newCols.splice(colIdx, 1);
            newCols.splice(newPosition, 0, movedCol);

            return newCols.map((c, idx) => ({ ...c, position: idx }));
        });

        try {
            const { data: allCols } = await (supabase as any)
                .from('task_columns')
                .select('id, position')
                .order('position', { ascending: true });

            if (!allCols) return;

            const reordered = [...allCols];
            const idx = reordered.findIndex(c => c.id === columnId);
            if (idx === -1) return;

            const [moved] = reordered.splice(idx, 1);
            reordered.splice(newPosition, 0, moved);

            const updatePromises = reordered.map((c, idx) =>
                (supabase as any).from('task_columns').update({ position: idx }).eq('id', c.id)
            );

            await Promise.all(updatePromises);
        } catch (error) {
            console.error('[TasksContext] Error moving column:', error);
            loadColumns(); // Revert
        }
    }, [loadColumns]);

    const deleteColumn = useCallback(async (columnId: string) => {
        // Fallback safety: don't delete essential columns easily if needed
        // But the user requested generic delete, so we proceed.
        setColumns(prev => prev.filter(c => c.id !== columnId));

        try {
            const { error } = await (supabase as any)
                .from('task_columns')
                .delete()
                .eq('id', columnId);

            if (error) throw error;
            toast.success("Coluna removida!");
        } catch (error) {
            console.error('[TasksContext] Error deleting column:', error);
            // Re-load to sync state
            loadColumns();
        }
    }, [loadColumns]);

    // Inicializar carregando tasks e columns
    useEffect(() => {
        loadColumns();
        loadClientTasks();
    }, [loadClientTasks, loadColumns]);

    const getTaskById = useCallback((taskId: string) => {
        return tasks.find(t => t.id === taskId);
    }, [tasks]);

    const getTasksByClient = useCallback((clientId: string) => {
        return tasks.filter(t => t.clientId === clientId);
    }, [tasks]);

    const getTaskByStepId = useCallback((stepId: string) => {
        return tasks.find(t => t.stepId === stepId);
    }, [tasks]);

    // Lock para prevenir criação duplicada por click rápido
    const creatingStepIds = useRef(new Set<string>());

    const createTaskFromStep = useCallback((
        clientId: string,
        phaseId: string,
        step: ProcessStep
    ): Task => {
        // Verifica se já existe task para esse step
        const existingTask = tasks.find(t => t.stepId === step.id);
        if (existingTask) {
            return existingTask;
        }

        // Lock: se já está criando essa task, retorna task temporária sem duplicar
        if (creatingStepIds.current.has(step.id)) {
            const pendingTask = tasks.find(t => t.stepId === step.id);
            if (pendingTask) return pendingTask;
        }
        creatingStepIds.current.add(step.id);

        const tempId = `t_${Date.now()}`;
        const newTask: Task = {
            id: tempId,
            clientId,
            phaseId,
            stepId: step.id,
            title: step.title,
            description: step.description || `Demanda da timeline: ${step.title}`,
            status: mapStepStatusToTaskStatus(step.status),
            priority: 'medium',
            area: mapRoleToArea(step.assigneeRole),
            createdAt: new Date().toISOString(),
            checklist: step.initialChecklist && step.initialChecklist.length > 0
                ? step.initialChecklist
                : generateDefaultChecklist(step.title),
        };

        // Add to local state immediately for responsive UI
        setTasks(prev => [...prev, newTask]);

        // Persist to database in background
        (async () => {
            try {
                const dbTask: any = {
                    client_id: clientId,
                    title: newTask.title,
                    description: newTask.description,
                    status: newTask.status,
                    priority: newTask.priority,
                    area: newTask.area,
                    step_id: step.id,
                    checklist: newTask.checklist || [],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                if (workspaceId) {
                    dbTask.workspace_id = workspaceId;
                }

                const { data, error } = await (supabase as any)
                    .from('client_tasks')
                    .insert(dbTask)
                    .select()
                    .single();

                if (error) {
                    console.error('[TasksContext] Error persisting step task:', error);
                    return;
                }

                // Replace temp ID with real DB ID
                console.log('[TasksContext] Step task persisted:', tempId, '->', data.id);
                setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: data.id } : t));
            } catch (err) {
                console.error('[TasksContext] Failed to persist step task:', err);
            } finally {
                creatingStepIds.current.delete(step.id);
            }
        })();

        return newTask;
    }, [tasks, workspaceId]);

    const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
        // 1. Atualização local imediata para UI responsiva
        setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, ...updates } : t
        ));

        try {
            // 2. Persistência no Supabase
            const task = tasks.find(t => t.id === taskId);

            if (taskId.startsWith('task_')) {
                // É uma task gerada dinamicamente que ainda não está no banco.
                // Criamos ela se o usuário fizer qualquer edição importante.
                if (!task) return;

                const newTaskData = {
                    client_id: task.clientId,
                    title: updates.title || task.title,
                    description: updates.description !== undefined ? updates.description : (task.description || ""),
                    status: updates.status || task.status || 'todo',
                    priority: updates.priority || task.priority,
                    area: updates.area || task.area,
                    assignee_id: updates.assigneeId === 'none' ? null : (updates.assigneeId || task.assigneeId),
                    checklist: updates.checklist || task.checklist || [],
                    product_id: task.productId,
                    product_name: task.productName,
                    created_at: new Date().toISOString()
                };

                const { data, error } = await (supabase as any)
                    .from('client_tasks')
                    .insert(newTaskData)
                    .select()
                    .single();

                if (error) throw error;

                // Atualizar o ID local para o real ID do banco para permitir edições futuras
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates, id: data.id } : t));
            } else {
                // Task real já existente no banco (ou t_ prefixo de timeline)
                const dbUpdates: any = {};
                if (updates.title) dbUpdates.title = updates.title;
                if (updates.description !== undefined) dbUpdates.description = updates.description;
                if (updates.status) {
                    // Defensivo: traduz status legacy (done/completed/in_progress/pending)
                    // pro canônico antes de gravar. Sem isso, o trigger validate_client_task_status
                    // rejeita e o UPDATE inteiro falha silenciosamente (bug 2026-05-27).
                    const STATUS_ALIAS_UPDATE: Record<string, string> = {
                        done: 'concluido',
                        completed: 'concluido',
                        in_progress: 'em_progresso',
                        pending: 'todo',
                    };
                    const canonical = STATUS_ALIAS_UPDATE[updates.status as string] || updates.status;
                    dbUpdates.status = canonical;
                    if (canonical === 'concluido') {
                        dbUpdates.completed_at = new Date().toISOString();
                    } else if (canonical === 'todo' || canonical === 'em_progresso') {
                        dbUpdates.completed_at = null;
                    }
                }
                if (updates.priority) dbUpdates.priority = updates.priority;
                if (updates.area) dbUpdates.area = updates.area;
                if (updates.dueDate) dbUpdates.due_date = updates.dueDate;

                // Mapear assigneeId 'none' para null no banco
                if (updates.hasOwnProperty('assigneeId')) {
                    dbUpdates.assignee_id = updates.assigneeId === 'none' ? null : updates.assigneeId;
                }

                if (updates.checklist) dbUpdates.checklist = updates.checklist;
                if (updates.hasOwnProperty('projectType')) {
                    dbUpdates.project_type = updates.projectType ?? null;
                }
                if (updates.coverImageUrl !== undefined) dbUpdates.cover_image_url = updates.coverImageUrl;
                if (updates.images !== undefined) dbUpdates.images = updates.images;
                if ((updates as any).drive_links !== undefined) dbUpdates.drive_links = (updates as any).drive_links;

                const { error } = await (supabase as any)
                    .from('client_tasks')
                    .update(dbUpdates)
                    .eq('id', taskId);

                if (error) throw error;

                // CRUCIAL: Atualizar o estado local também para tarefas existentes!
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
            }

            // 3. WhatsApp: disparado pelos triggers SQL tr_notify_task_assign e tr_notify_task_complete
            //    (migration 20260527d). Sem invoke aqui pra evitar notificação duplicada.

            // 4. Notificar callback de sincronização (ex: timeline)
            if (updates.status) {
                const task = tasks.find(t => t.id === taskId);
                if (task && onTaskStatusChangeCallback) {
                    onTaskStatusChangeCallback(taskId, updates.status, task.stepId);
                }
            }
        } catch (error) {
            console.error('[TasksContext] Error updating task:', error);
            // Reverter em caso de erro (opcional, para simplicidade mantemos o log)
        }
    }, [tasks, onTaskStatusChangeCallback]);

    const moveTask = useCallback(async (taskId: string, newStatus: Task['status'], newPosition?: number) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        console.log(`[TasksContext] Moving task ${taskId} to ${newStatus}${newPosition !== undefined ? ` at position ${newPosition}` : ''}`);

        // Defensivo: aceitar status legacy ('done', 'in_progress', 'completed', 'pending')
        // de callers que ainda não foram migrados. Sempre traduz pro canônico antes de tocar
        // qualquer coisa. Status canônico no banco: todo · em_progresso · validation ·
        // alteracao_revisao · concluido.
        const STATUS_ALIAS: Record<string, string> = {
            done: 'concluido',
            completed: 'concluido',
            in_progress: 'em_progresso',
            pending: 'todo',
        };
        const canonicalStatus = (STATUS_ALIAS[newStatus as string] || newStatus) as Task['status'];

        // 1. Local update for UI responsiveness
        setTasks(prev => {
            const afterMove = prev.map(t => {
                if (t.id === taskId) {
                    return {
                        ...t,
                        status: canonicalStatus,
                        order_position: newPosition ?? t.order_position,
                        completedAt: canonicalStatus === 'concluido' ? new Date().toISOString() : undefined
                    };
                }
                return t;
            });

            const statusTasks = afterMove
                .filter(t => t.status === canonicalStatus)
                .sort((a, b) => {
                    // Se for a task movida, usamos a nova posição pretendida
                    // Caso contrário, usamos a posição atual (ou 0 se for nula)
                    const posA = (a.order_position !== undefined && a.order_position !== null) ? a.order_position : 0;
                    const posB = (b.order_position !== undefined && b.order_position !== null) ? b.order_position : 0;

                    if (posA === posB) {
                        // Se as posições forem iguais (o que acontece no drop), 
                        // a task que está sendo movida deve vir PRIMEIRO (acima do target)
                        return a.id === taskId ? -1 : 1;
                    }
                    return posA - posB;
                });

            const reindexedIds = new Set(statusTasks.map(t => t.id));

            return afterMove.map(t => {
                if (reindexedIds.has(t.id)) {
                    const newIdx = statusTasks.findIndex(st => st.id === t.id);
                    return { ...t, order_position: newIdx };
                }
                return t;
            });
        });

        try {
            // 2. Persist to DB in Batch (re-indexing affects multiple tasks)
            const currentTasksInCol = tasks.map(t => {
                if (t.id === taskId) {
                    return { ...t, status: canonicalStatus, order_position: newPosition ?? t.order_position };
                }
                return t;
            }).filter(t => t.status === canonicalStatus);

            const sortedTasks = [...currentTasksInCol].sort((a, b) => {
                const posA = a.order_position ?? 0;
                const posB = b.order_position ?? 0;
                if (posA === posB) return a.id === taskId ? -1 : 1;
                return posA - posB;
            });

            // Filter only real DB tasks
            const dbTasksToUpdate = tasks.filter(t =>
                (t.status === canonicalStatus || t.id === taskId) &&
                !t.id.startsWith('task_') && !t.id.startsWith('t_')
            );

            if (dbTasksToUpdate.length > 0) {
                const updatePromises = dbTasksToUpdate.map(t => {
                    const isTheMovedTask = t.id === taskId;
                    const finalStatus = isTheMovedTask ? canonicalStatus : t.status;
                    const finalIdx = sortedTasks.findIndex(st => st.id === t.id);

                    const updatePayload: any = {
                        status: finalStatus,
                        order_position: finalIdx !== -1 ? finalIdx : (t.order_position || 0),
                        updated_at: new Date().toISOString()
                    };

                    // Mantém completed_at em sincronia com status 'concluido'
                    if (isTheMovedTask && canonicalStatus === 'concluido') {
                        updatePayload.completed_at = new Date().toISOString();
                    } else if (isTheMovedTask && canonicalStatus !== 'concluido') {
                        updatePayload.completed_at = null;
                    }

                    return (supabase as any)
                        .from('client_tasks')
                        .update(updatePayload)
                        .eq('id', t.id);
                });

                await Promise.all(updatePromises);
                console.log(`[TasksContext] Batch persistence completed for ${updatePromises.length} tasks.`);
            }

            // WhatsApp do grupo do cliente disparado pelo trigger SQL tr_notify_task_complete.

            // Notify synchronization (e.g., timeline)
            if (onTaskStatusChangeCallback && task.stepId) {
                onTaskStatusChangeCallback(taskId, canonicalStatus, task.stepId);
            }
        } catch (error) {
            console.error('[TasksContext] Error persisting move:', error);
        }
    }, [tasks, onTaskStatusChangeCallback]);

    const deleteTask = useCallback(async (taskId: string) => {
        try {
            console.log('[TasksContext] Task deleted from local state:', taskId);

            if (!taskId.startsWith('task_') && !taskId.startsWith('t_')) {
                const { error } = await (supabase as any)
                    .from('client_tasks')
                    .delete()
                    .eq('id', taskId);

                if (error) {
                    console.error('[TasksContext] Supabase error deleting task:', error);
                    toast.error(`Erro ao excluir no banco: ${error.message}`);
                    return;
                }
            }

            // Remove do estado apenas se deletar com sucesso no banco (ou se for mock)
            setTasks(prev => prev.filter(t => t.id !== taskId));
            toast.success("Demanda excluída com sucesso.");
        } catch (error: any) {
            console.error('[TasksContext] Internal error deleting task:', error);
            toast.error(`Erro inesperado ao excluir: ${error.message}`);
        }
    }, []);

    // Archive a task (concluir — ficará visível no "Concluído" por 7 dias antes de ser arquivada automaticamente)
    const archiveTask = useCallback(async (taskId: string) => {
        try {
            console.log('[TasksContext] Completing task (will auto-archive after 7 days):', taskId);

            const now = new Date().toISOString();

            if (!taskId.startsWith('task_') && !taskId.startsWith('t_')) {
                const { error } = await (supabase as any)
                    .from('client_tasks')
                    .update({
                        status: 'concluido',
                        completed_at: now,
                        updated_at: now
                    })
                    .eq('id', taskId);

                if (error) {
                    console.error('[TasksContext] Error completing task:', error);
                    toast.error(`Erro ao concluir: ${error.message}`);
                    return;
                }
            }

            // Move to 'concluido' in local state (stays visible for 7 days)
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'concluido' as Task['status'], completedAt: now } : t));
            toast.success('Demanda concluída! Ficará visível por 7 dias antes de ser arquivada.');
            console.log('[TasksContext] Task completed:', taskId);

            // WhatsApp do grupo do cliente disparado pelo trigger SQL tr_notify_task_complete.
        } catch (error) {
            console.error('[TasksContext] Error completing task:', error);
            toast.error('Erro ao concluir demanda');
        }
    }, []);

    const createTask = useCallback(async (taskData: Partial<Task>): Promise<Task | null> => {
        const isUUID = (str: string | null | undefined) => {
            if (!str) return false;
            const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return regex.test(str);
        };

        const tryInsert = async (includeWorkspace: boolean = true): Promise<Task | null> => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error('User not authenticated');

                console.log(`[TasksContext] Attempting to create task (includeWorkspace=${includeWorkspace}):`, taskData);

                // Remover 'isUUID' silenciosa. Deixar db retornar erro se o id não for válido para o campo.
                const cleanedClientId = taskData.clientId || null;
                const cleanedAssigneeId = taskData.assigneeId || null;

                // Mapeia data ignorando UTC shift salvando-a apontando para o meio dia UTC
                let cleanedDueDate = taskData.dueDate || null;
                if (cleanedDueDate && !cleanedDueDate.includes('T')) {
                    cleanedDueDate = `${cleanedDueDate}T12:00:00.000Z`;
                }

                const cleanedProductId = taskData.productId || null;
                const cleanedProductName = taskData.productName || null;

                const dbTask: any = {
                    client_id: cleanedClientId,
                    title: taskData.title,
                    description: taskData.description || "",
                    status: (taskData.status || 'todo') === 'done' ? 'concluido' : (taskData.status || 'todo'),
                    priority: taskData.priority || 'medium',
                    area: taskData.area || null,
                    assignee_id: cleanedAssigneeId,
                    due_date: cleanedDueDate,
                    checklist: taskData.checklist || [],
                    product_id: cleanedProductId,
                    product_name: cleanedProductName,
                    step_id: taskData.stepId || null,
                    order_position: taskData.order_position || 0,
                    images: taskData.images || null,
                    cover_image_url: taskData.images?.[0] || null,
                    drive_links: (taskData as any).drive_links || null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                if (includeWorkspace && workspaceId) {
                    dbTask.workspace_id = workspaceId;
                }

                const { data, error } = await (supabase as any)
                    .from('client_tasks')
                    .insert(dbTask)
                    .select()
                    .single();

                if (error) {
                    // Specific retry logic if workspace_id column is missing
                    if (includeWorkspace && error.message.includes('column "workspace_id" does not exist')) {
                        console.warn('[TasksContext] workspace_id column missing, retrying without it...');
                        return tryInsert(false);
                    }

                    console.error('[TasksContext] Supabase Error creating task:', error);
                    // IMPORTANTE: Mostrar o erro real no toast para diagnóstico
                    toast.error(`Erro no Banco: ${error.message} (${error.code})`);
                    return null;
                }

                const newTask: Task = {
                    id: data.id,
                    clientId: data.client_id,
                    title: data.title,
                    description: data.description,
                    status: (data.status || 'todo') as Task['status'],
                    priority: data.priority as Task['priority'],
                    area: data.area as Task['area'],
                    createdAt: data.created_at,
                    dueDate: data.due_date,
                    checklist: data.checklist || [],
                    productId: data.product_id,
                    productName: data.product_name,
                    stepId: data.step_id,
                    assigneeId: data.assignee_id,
                    coverImageUrl: data.cover_image_url || (data.images?.[0] || null),
                    images: data.images,
                    drive_links: data.drive_links
                };

                setTasks(prev => [newTask, ...prev]);

                // WhatsApp do assignee disparado pelo trigger SQL tr_notify_task_assign.

                return newTask;
            } catch (err: any) {
                console.error('[TasksContext] Internal error in tryInsert:', err);
                toast.error(`Erro Interno: ${err.message || 'Erro desconhecido'}`);
                return null;
            }
        };

        return tryInsert(!!workspaceId);
    }, [workspaceId]);

    const toggleChecklistItem = useCallback(async (taskId: string, checklistItemId: string) => {
        let updatedTask: Task | null = null;

        setTasks(prev => prev.map(task => {
            if (task.id !== taskId) return task;

            const updatedChecklist = task.checklist?.map(item => {
                if (item.id !== checklistItemId) return item;
                return {
                    ...item,
                    isCompleted: !item.isCompleted,
                    completedAt: !item.isCompleted ? new Date().toISOString() : undefined,
                };
            });

            updatedTask = {
                ...task,
                checklist: updatedChecklist,
            };

            return updatedTask;
        }));

        // Persistir no banco de dados se for uma task real
        if (updatedTask && !taskId.startsWith('task_') && !taskId.startsWith('t_')) {
            try {
                const dbUpdates: any = {
                    checklist: (updatedTask as Task).checklist,
                    updated_at: new Date().toISOString()
                };

                const { error } = await (supabase as any)
                    .from('client_tasks')
                    .update(dbUpdates)
                    .eq('id', taskId);

                if (error) throw error;
            } catch (error) {
                console.error('[TasksContext] Error persisting checklist toggle:', error);
            }
        }
    }, []);

    const addChecklistItem = useCallback((taskId: string, title: string) => {
        setTasks(prev => prev.map(task => {
            if (task.id !== taskId) return task;

            const newItem: ChecklistItem = {
                id: `cl_${Date.now()} `,
                title,
                isCompleted: false,
            };

            return {
                ...task,
                checklist: [...(task.checklist || []), newItem],
            };
        }));
    }, []);

    const removeChecklistItem = useCallback((taskId: string, checklistItemId: string) => {
        setTasks(prev => prev.map(task => {
            if (task.id !== taskId) return task;

            return {
                ...task,
                checklist: task.checklist?.filter(item => item.id !== checklistItemId),
            };
        }));
    }, []);

    const setOnTaskStatusChange = useCallback((
        callback: (taskId: string, newStatus: Task['status'], stepId?: string) => void
    ) => {
        setOnTaskStatusChangeCallback(() => callback);
    }, []);

    const openTaskDetail = useCallback((task: Task) => {
        setSelectedTask(task);
    }, []);


    const closeTaskDetail = useCallback(() => {
        setSelectedTask(null);
    }, []);

    return (
        <TasksContext.Provider value={{
            tasks,
            columns,
            isLoading,
            getTaskById,
            getTasksByClient,
            getTaskByStepId,
            createTaskFromStep,
            updateTask,
            moveTask,
            deleteTask,
            archiveTask,
            createTask,
            toggleChecklistItem,
            addChecklistItem,
            removeChecklistItem,
            deleteColumn,
            addColumn,
            updateColumn,
            moveColumn,
            setOnTaskStatusChange,
            selectedTask,
            openTaskDetail,
            closeTaskDetail,
            loadClientTasks,
        }}>
            {children}
        </TasksContext.Provider>
    );
}

export function useTasks() {
    const context = useContext(TasksContext);
    if (!context) {
        throw new Error('useTasks must be used within a TasksProvider');
    }
    return context;
}
