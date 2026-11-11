import type { DemandArea } from "@/config/demandAreas";
export type ClientStatus = 'onboarding' | 'implementation' | 'growth' | 'churned';

export type ServiceType = 'assessoria_completa' | 'trafego_pago' | 'consultoria';

export interface ClientFinancials {
    fixedFee: number;
    variableFeePercentage: number;
    currency: string;
    contractStartDate: string;
}

export interface ProcessStep {
    id: string;
    title: string;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    assigneeRole: 'head' | 'media_buyer' | 'dev' | 'designer';
    description?: string;
    completedAt?: string;
    // Vínculo com task no quadro de demandas
    linkedTaskId?: string;
    // Checklist inicial vindo de produtos ou templates
    initialChecklist?: ChecklistItem[];
}

export interface OnboardingPhase {
    id: string;
    title: string;
    steps: ProcessStep[];
    isLocked: boolean;
}

export interface Client {
    id: string;
    name: string;
    logoUrl?: string;
    primaryColor: string;
    status: ClientStatus;
    serviceType: ServiceType;
    serviceName?: string;
    financials: ClientFinancials;
    progress: number; // 0-100
    onboardingPhases: OnboardingPhase[];
    assignedProductIds?: string[];
    payment_due_day?: number;
    workspace_id?: string;
}

// Item de checklist para processos dentro de uma tarefa
export interface ChecklistItem {
    id: string;
    title: string;
    isCompleted: boolean;
    completedAt?: string;
    completedBy?: string; // ID do membro da equipe
    documentationUrl?: string; // Link para documentacao no Notion
}

// Tarefa expandida com suporte a checklist e vínculo com timeline
export interface Task {
    id: string;
    clientId: string;
    clientName?: string; // Nome do cliente para visualização geral
    title: string;
    description: string;
    status: string;
    assigneeId?: string; // ID do colaborador
    priority: 'low' | 'medium' | 'high' | 'critical';
    createdAt: string;
    dueDate?: string;
    // Novas tarefas usam DemandArea; os demais valores só existem em cards antigos.
    area?: DemandArea | 'traffic' | 'design' | 'copy' | 'strategy' | 'dev';
    // Tipo do projeto (fixo/MRR ou avulso). NULL = herda do cliente pai
    projectType?: 'fixo' | 'avulso' | null;
    // Campos para sincronização com Timeline
    phaseId?: string; // ID da fase na timeline
    stepId?: string; // ID do step na timeline (vincula task ao step)
    // Checklist de processos
    checklist?: ChecklistItem[];
    completedAt?: string;
    archivedAt?: string;
    // Campos para vínculo com produtos
    productId?: string;
    productName?: string;
    category?: string; // Grupo/categoria da feature (ex: Shopify, Estratégico)
    // Imagem de capa para visual Kanban (campo antigo - mantido por compatibilidade)
    coverImageUrl?: string;
    // Array de imagens (novo campo - principal)
    images?: string[];
    // Posição vertical no quadro (Kanban)
    order_position?: number;
    // Novos campos ClickUp Level
    drive_links?: { title: string; url: string }[];
    attachments?: { name: string; url: string; type: string }[];
}


// Status da tarefa mapeado para Timeline
export type TaskStatusMap = {
    'pending': string;
    'in_progress': string;
    'completed': string;
    'blocked': string;
};

// Templates de processos para cada tipo de demanda
export interface ProcessTemplate {
    id: string;
    title: string;
    description?: string;
    defaultChecklist: Omit<ChecklistItem, 'id' | 'isCompleted' | 'completedAt' | 'completedBy'>[];
}
