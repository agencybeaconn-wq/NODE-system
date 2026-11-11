import { useState, useMemo } from "react";
import { useTeamAnalytics } from "@/hooks/useTeamAnalytics";
import type { AnalyticsDateRange } from "@/hooks/useTeamAnalytics";
import { TimeAnalyticsSection } from "@/components/paineis/TimeAnalyticsSection";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useDashboard } from "@/contexts/DashboardContext";
import { useTasks } from "@/contexts/TasksContext";
import { Navigate, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { DEMAND_AREAS, demandAreaLabel } from "@/config/demandAreas";
import {
    ClipboardList,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Filter,
    Users,
    Zap,
    Loader2,
    TrendingUp,
    BarChart3,
    ShieldCheck,
    User,
    Timer,
    Activity,
    ArrowUpDown,
    Sparkles,
    MessageCircle,
    ChevronDown,
    ChevronRight,
} from "lucide-react";

// --- Helpers de status ---
const isDone = (s: string) => s === 'done' || s === 'completed' || s === 'concluido.';
const isInProgress = (s: string) => s === 'in_progress' || s === 'em_progresso';
const isPending = (s: string) => s === 'pending' || s === 'todo';
const isBlocked = (s: string) => s === 'blocked';
const isBacklog = (s: string) => s === 'backlog' || s === 'triage';

const statusLabel = (s: string) => {
    if (isDone(s)) return "Concluída";
    if (isInProgress(s)) return "Em Progresso";
    if (isPending(s)) return "Pendente";
    if (isBlocked(s)) return "Bloqueada";
    if (isBacklog(s)) return "Backlog";
    return s;
};

const statusStyle = (s: string) => {
    if (isInProgress(s)) return "bg-blue-500/15 text-blue-400 border border-blue-500/20";
    if (isPending(s)) return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
    if (isBlocked(s)) return "bg-red-500/15 text-red-400 border border-red-500/20";
    if (isBacklog(s)) return "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20";
    return "bg-primary/15 text-primary border border-primary/20";
};

const PRIORITY_LABELS: Record<string, string> = {
    low: "Baixa", medium: "Normal", high: "Alta", critical: "Urgente",
};
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type SortField = "priority" | "due_date" | "area" | "status" | "assignee";
type SortDir = "asc" | "desc";
type PainelPeriod = "today" | "week" | "month" | "30d" | "custom";

const PERIOD_BUTTONS: { label: string; value: PainelPeriod }[] = [
    { label: "Dia", value: "today" },
    { label: "Semana", value: "week" },
    { label: "Mês", value: "month" },
    { label: "Últimos 30 dias", value: "30d" },
];

export default function Paineis() {
    const { isAdmin, isLoading: isLoadingPerms } = usePermissions();
    const { clients } = useDashboard();

    // --- Filtro de período LOCAL (não compartilha com DashboardContext) ---
    const [period, setPeriod] = useState<PainelPeriod>("month");
    const [customRange, setCustomRange] = useState<{ from: Date; to?: Date } | undefined>();

    const dateRangeForHook: AnalyticsDateRange = useMemo(() => {
        const today = new Date();
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const start = (d: Date) => `${fmt(d)} 00:00:00`;
        const end = (d: Date) => `${fmt(d)} 23:59:59`;

        if (period === "today") return { startDate: start(today), endDate: end(today) };
        if (period === "week") {
            const dow = today.getDay();
            const mon = new Date(today);
            mon.setDate(today.getDate() - ((dow + 6) % 7));
            return { startDate: start(mon), endDate: end(today) };
        }
        if (period === "month") {
            const first = new Date(today.getFullYear(), today.getMonth(), 1);
            return { startDate: start(first), endDate: end(today) };
        }
        if (period === "30d") {
            const d30 = new Date(today);
            d30.setDate(d30.getDate() - 30);
            return { startDate: start(d30), endDate: end(today) };
        }
        if (period === "custom" && customRange?.from && customRange?.to) {
            return { startDate: start(customRange.from), endDate: end(customRange.to) };
        }
        // fallback: mês
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: start(first), endDate: end(today) };
    }, [period, customRange]);

    const analytics = useTeamAnalytics(dateRangeForHook);
    const { refetch: refetchAnalytics } = analytics;
    const navigate = useNavigate();
    const { updateTask } = useTasks();

    const handleInlineUpdate = async (taskId: string, updates: Record<string, any>) => {
        await updateTask(taskId, updates);
        setTimeout(() => refetchAnalytics(), 500);
    };
    const [sortField, setSortField] = useState<SortField>("priority");
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [showAiAnalysis, setShowAiAnalysis] = useState(false);
    const [expandedInsight, setExpandedInsight] = useState<number | null>(null);

    if (!isLoadingPerms && !isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    if (analytics.isLoading) {
        return (
            <div className="flex-1 min-h-screen w-full bg-transparent p-10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const completionRate = analytics.totalTasks > 0 ? Math.round((analytics.doneTasks / analytics.totalTasks) * 100) : 0;
    const maxSectorTotal = Math.max(...analytics.sectorMetrics.map((s) => s.total), 1);

    // --- Mapa de IDs ---
    const clientMap = new Map(clients.map(c => [c.id, c.name]));
    const memberMap = new Map(analytics.members.map(m => [m.id, m]));

    // --- Demandas Ativas: dados completos ---
    const now = new Date();
    const activeTasks = analytics.tasks.filter(t => !isDone(t.status));
    const activeTotal = activeTasks.length;

    const activeStages = [
        { label: "Em Progresso", count: activeTasks.filter(t => isInProgress(t.status)).length, opacity: 0.6 },
        { label: "Pendente", count: activeTasks.filter(t => isPending(t.status)).length, opacity: 0.4 },
        { label: "Bloqueada", count: activeTasks.filter(t => isBlocked(t.status)).length, opacity: 0.8 },
        { label: "Backlog", count: activeTasks.filter(t => isBacklog(t.status)).length, opacity: 0.2 },
    ];
    const maxStageCount = Math.max(...activeStages.map(s => s.count), 1);

    // Enriquecer tasks ativas com dados cruzados
    const enrichedActive = activeTasks.map(t => {
        const dueDate = t.due_date ? new Date(t.due_date) : null;
        const createdDate = new Date(t.created_at);
        const daysOpen = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        const isOverdue = dueDate ? dueDate < now : false;
        const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
        const member = t.assignee_id ? memberMap.get(t.assignee_id) : null;
        return {
            ...t,
            dueDate,
            createdDate,
            daysOpen,
            isOverdue,
            daysUntilDue,
            memberName: member?.name || "Sem responsável",
            memberAvatar: member?.avatar_url,
            memberPhone: member?.phone || null,
            assigneeId: t.assignee_id,
            clientName: clientMap.get(t.client_id) || "—",
            areaLabel: demandAreaLabel(t.area),
            priorityLabel: PRIORITY_LABELS[t.priority] || t.priority,
        };
    });

    // Ordenação
    const sortedActive = [...enrichedActive].sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortField) {
            case "priority": return dir * ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
            case "due_date": {
                if (!a.dueDate && !b.dueDate) return 0;
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return dir * (a.dueDate.getTime() - b.dueDate.getTime());
            }
            case "area": return dir * a.areaLabel.localeCompare(b.areaLabel);
            case "status": return dir * statusLabel(a.status).localeCompare(statusLabel(b.status));
            case "assignee": return dir * a.memberName.localeCompare(b.memberName);
            default: return 0;
        }
    });

    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortField(field); setSortDir("asc"); }
    };

    // ══════ Análise IA (insights computados com tasks) ══════
    type InsightTask = { id: string; title: string; clientName: string; daysOpen: number; priorityLabel: string; memberName: string };
    type Insight = { type: "alert" | "info" | "bottleneck"; text: string; detail?: string; tasks: InsightTask[] };

    const generateInsights = (): Insight[] => {
        const insights: Insight[] = [];
        const toInsightTask = (t: typeof enrichedActive[0]): InsightTask => ({
            id: t.id, title: t.title, clientName: t.clientName,
            daysOpen: t.daysOpen, priorityLabel: t.priorityLabel, memberName: t.memberName,
        });

        // 1. Clientes com mais demandas ativas
        const clientDemandCount = new Map<string, typeof enrichedActive>();
        enrichedActive.forEach(t => {
            const list = clientDemandCount.get(t.clientName) || [];
            list.push(t);
            clientDemandCount.set(t.clientName, list);
        });
        const topClients = [...clientDemandCount.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
        if (topClients.length > 0) {
            insights.push({
                type: "info",
                text: `Clientes com mais demandas ativas: ${topClients.map(([name, list]) => `${name} (${list.length})`).join(", ")}.`,
                detail: "Clique para ver as demandas por cliente",
                tasks: topClients.flatMap(([, list]) => list.slice(0, 3).map(toInsightTask)),
            });
        }

        // 2. Gargalo por responsável
        const memberTaskMap = new Map<string, typeof enrichedActive>();
        enrichedActive.forEach(t => {
            const list = memberTaskMap.get(t.memberName) || [];
            list.push(t);
            memberTaskMap.set(t.memberName, list);
        });
        const overloaded = [...memberTaskMap.entries()]
            .filter(([, list]) => list.length >= 5)
            .sort((a, b) => b[1].length - a[1].length);
        overloaded.forEach(([name, list]) => {
            const overdueCount = list.filter(t => t.isOverdue).length;
            const blockedCount = list.filter(t => isBlocked(t.status)).length;
            const avgDays = Math.round(list.reduce((a, t) => a + t.daysOpen, 0) / list.length);
            insights.push({
                type: "bottleneck",
                text: `${name}: ${list.length} demandas ativas (média ${avgDays}d aberta)${overdueCount > 0 ? `, ${overdueCount} atrasada${overdueCount > 1 ? "s" : ""}` : ""}${blockedCount > 0 ? `, ${blockedCount} bloqueada${blockedCount > 1 ? "s" : ""}` : ""}.`,
                detail: `Demandas de ${name}`,
                tasks: list.slice(0, 5).map(toInsightTask),
            });
        });

        // 3. Demandas atrasadas de prioridade alta/urgente
        const overdueHigh = enrichedActive.filter(t => t.isOverdue && (t.priority === "critical" || t.priority === "high"));
        if (overdueHigh.length > 0) {
            insights.push({
                type: "alert",
                text: `${overdueHigh.length} demanda${overdueHigh.length > 1 ? "s" : ""} de prioridade alta/urgente atrasada${overdueHigh.length > 1 ? "s" : ""}.`,
                detail: "Demandas atrasadas com prioridade alta",
                tasks: overdueHigh.map(toInsightTask),
            });
        }

        // 4. Tempo médio + demandas mais antigas
        if (enrichedActive.length > 0) {
            const avgDaysOpen = Math.round(enrichedActive.reduce((acc, t) => acc + t.daysOpen, 0) / enrichedActive.length);
            const oldest = [...enrichedActive].sort((a, b) => b.daysOpen - a.daysOpen).slice(0, 5);
            insights.push({
                type: "info",
                text: `Tempo médio: ${avgDaysOpen} dia${avgDaysOpen !== 1 ? "s" : ""} aberta${avgDaysOpen !== 1 ? "s" : ""}. ${avgDaysOpen > 10 ? "Revise as mais antigas." : ""}`,
                detail: "Demandas abertas há mais tempo",
                tasks: oldest.map(toInsightTask),
            });
        }

        // 5. Membro mais produtivo no período
        const doneInPeriod = analytics.tasks.filter(t => isDone(t.status));
        if (doneInPeriod.length > 0) {
            const memberDoneMap = new Map<string, number>();
            doneInPeriod.forEach(t => {
                const m = t.assignee_id ? memberMap.get(t.assignee_id)?.name || "?" : "?";
                memberDoneMap.set(m, (memberDoneMap.get(m) || 0) + 1);
            });
            const topProducer = [...memberDoneMap.entries()].sort((a, b) => b[1] - a[1])[0];
            if (topProducer && topProducer[1] > 0) {
                insights.push({
                    type: "info",
                    text: `Mais produtivo no período: ${topProducer[0]} com ${topProducer[1]} demanda${topProducer[1] > 1 ? "s" : ""} concluída${topProducer[1] > 1 ? "s" : ""}.`,
                    tasks: [],
                });
            }
        }

        // 6. Sem responsável
        const unassigned = enrichedActive.filter(t => t.memberName === "Sem responsável");
        if (unassigned.length > 0) {
            insights.push({
                type: "alert",
                text: `${unassigned.length} demanda${unassigned.length > 1 ? "s" : ""} sem responsável atribuído.`,
                detail: "Demandas sem responsável",
                tasks: unassigned.map(toInsightTask),
            });
        }

        // 7. Excesso de urgências
        const activePriorities = { critical: 0, high: 0, medium: 0, low: 0 };
        enrichedActive.forEach(t => {
            if (t.priority in activePriorities) activePriorities[t.priority as keyof typeof activePriorities]++;
        });
        if (activePriorities.critical + activePriorities.high > activeTotal * 0.5 && activeTotal >= 4) {
            insights.push({
                type: "alert",
                text: `${Math.round(((activePriorities.critical + activePriorities.high) / activeTotal) * 100)}% das demandas são prioridade alta/urgente. Pode indicar problema no planejamento.`,
                tasks: [],
            });
        }

        return insights;
    };

    const aiInsights = showAiAnalysis ? generateInsights() : [];

    return (
        <div className="flex-1 min-h-screen w-full bg-transparent p-10 pt-10 space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black tracking-tight text-foreground">Painéis</h1>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-wider">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Admin
                        </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">Acompanhe a produtividade da equipe e a distribuição de demandas.</p>
                </div>
            </div>

            {/* Period Selectors */}
            <div className="flex items-center gap-2 flex-wrap">
                {PERIOD_BUTTONS.map((btn) => (
                    <button
                        type="button"
                        key={btn.value}
                        onClick={() => setPeriod(btn.value)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            period === btn.value
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                : "bg-muted/10 text-muted-foreground hover:bg-muted/20 border border-border/20"
                        )}
                    >
                        {btn.label}
                    </button>
                ))}
                <DateRangePicker
                    dateRange={period === "custom" && customRange ? { from: customRange.from, to: customRange.to } : undefined}
                    onDateRangeChange={(range) => {
                        if (range?.from && range?.to) {
                            setPeriod("custom");
                            setCustomRange({ from: range.from, to: range.to });
                        }
                    }}
                />
            </div>

            {/* Stat Cards — monochromatic primary */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard label="Total de Demandas" value={analytics.totalTasks} icon={ClipboardList} />
                <StatCard label="Em Andamento" value={analytics.inProgressTasks} icon={Clock} />
                <StatCard label="Concluídas" value={analytics.doneTasks} icon={CheckCircle2} suffix={completionRate > 0 ? `${completionRate}%` : undefined} />
                <StatCard label="Atrasadas" value={analytics.overdueTasks} icon={AlertTriangle} alert={analytics.overdueTasks > 0} />
                <StatCard label="Vel. Média" value={analytics.avgDeliveryDays !== null ? `${analytics.avgDeliveryDays}d` : "—"} icon={Zap} isString />
            </div>

            {/* ══════ DEMANDAS ATIVAS — Full Width ══════ */}
            <Card className="p-6 bg-muted/5 border border-border/20">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Activity className="h-5 w-5 text-primary" />
                        <h2 className="text-base font-bold text-foreground">Demandas Ativas</h2>
                        <span className="text-2xl font-black text-primary ml-1">{activeTotal}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAiAnalysis(v => !v)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            showAiAnalysis
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                        Análise IA
                    </button>
                </div>

                {/* Resumo por etapa — horizontal */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {activeStages.map((stage) => (
                        <div key={stage.label} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-muted-foreground">{stage.label}</span>
                                <span className="text-sm font-black">{stage.count}</span>
                            </div>
                            <div className="h-2 bg-muted/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700 bg-primary"
                                    style={{ width: `${(stage.count / maxStageCount) * 100}%`, opacity: stage.opacity }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Análise IA — Insights */}
                {showAiAnalysis && (
                    <div className="mb-6 p-5 rounded-xl bg-zinc-900/50 border border-primary/10 space-y-2.5">
                        <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold text-primary uppercase tracking-wider">Panorama Geral</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">{aiInsights.length} insight{aiInsights.length !== 1 ? "s" : ""}</span>
                        </div>
                        {aiInsights.length > 0 ? aiInsights.map((insight, idx) => (
                            <div key={idx}>
                                <button
                                    type="button"
                                    onClick={() => setExpandedInsight(expandedInsight === idx ? null : idx)}
                                    className={cn(
                                        "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
                                        insight.type === "alert" && "bg-red-500/8 border border-red-500/15 hover:bg-red-500/12",
                                        insight.type === "bottleneck" && "bg-amber-500/8 border border-amber-500/15 hover:bg-amber-500/12",
                                        insight.type === "info" && "bg-blue-500/8 border border-blue-500/15 hover:bg-blue-500/12",
                                    )}
                                >
                                    {/* Ícone tipo */}
                                    <span className="mt-0.5 shrink-0">
                                        {insight.type === "alert" && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                                        {insight.type === "bottleneck" && <Users className="h-3.5 w-3.5 text-amber-400" />}
                                        {insight.type === "info" && <TrendingUp className="h-3.5 w-3.5 text-blue-400" />}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <span className={cn(
                                            "text-[10px] font-black uppercase tracking-wider",
                                            insight.type === "alert" && "text-red-400",
                                            insight.type === "bottleneck" && "text-amber-400",
                                            insight.type === "info" && "text-blue-400",
                                        )}>
                                            {insight.type === "alert" ? "ALERTA" : insight.type === "bottleneck" ? "GARGALO" : "INFO"}
                                        </span>
                                        <p className="text-xs font-medium text-foreground/80 leading-relaxed mt-0.5">{insight.text}</p>
                                    </div>
                                    {insight.tasks.length > 0 && (
                                        expandedInsight === idx
                                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                    )}
                                </button>
                                {/* Detalhes expandidos */}
                                {expandedInsight === idx && insight.tasks.length > 0 && (
                                    <div className="ml-6 mt-1.5 space-y-1 pb-1">
                                        {insight.tasks.map(task => (
                                            <div
                                                key={task.id}
                                                onClick={() => navigate('/tasks')}
                                                className="flex items-center gap-3 px-3 py-1.5 rounded text-xs hover:bg-muted/10 cursor-pointer transition-colors"
                                            >
                                                <span className="font-semibold truncate flex-1">{task.title}</span>
                                                <span className="text-muted-foreground shrink-0">{task.clientName}</span>
                                                <span className="text-muted-foreground shrink-0 tabular-nums">{task.daysOpen}d</span>
                                                <span className="text-muted-foreground shrink-0">{task.memberName.split(' ')[0]}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )) : (
                            <p className="text-xs text-muted-foreground">Nenhum insight relevante — operação dentro da normalidade.</p>
                        )}
                    </div>
                )}

                {/* Tabela detalhada */}
                {sortedActive.length > 0 ? (
                    <div className="overflow-x-auto -mx-6">
                        <table className="w-full min-w-[900px]">
                            <thead>
                                <tr className="border-b border-border/30 bg-muted/10">
                                    {([
                                        ["Demanda", null],
                                        ["Status", "status" as SortField],
                                        ["Prioridade", "priority" as SortField],
                                        ["Área", "area" as SortField],
                                        ["Responsável", "assignee" as SortField],
                                        ["Entrega", "due_date" as SortField],
                                        ["Dias", null],
                                        ["", null],
                                    ] as [string, SortField | null][]).map(([label, field]) => (
                                        <th
                                            key={label || "actions"}
                                            className={cn(
                                                "px-5 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider",
                                                field && "cursor-pointer hover:text-foreground transition-colors select-none"
                                            )}
                                            onClick={() => field && toggleSort(field)}
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {label}
                                                {field && sortField === field && (
                                                    <ArrowUpDown className="h-3 w-3 text-primary" />
                                                )}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedActive.map((t, rowIdx) => (
                                    <tr
                                        key={t.id}
                                        onClick={() => navigate('/tasks')}
                                        className={cn(
                                            "border-b border-border/10 cursor-pointer transition-colors hover:bg-primary/5",
                                            rowIdx % 2 === 1 && "bg-muted/5"
                                        )}
                                    >
                                        {/* Título + Cliente */}
                                        <td className="px-5 py-3 max-w-[260px]">
                                            <p className="text-sm font-semibold truncate hover:underline">{t.title}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{t.clientName}</p>
                                        </td>
                                        {/* Status */}
                                        <td className="px-5 py-3">
                                            <span className={cn("inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-md", statusStyle(t.status))}>
                                                {statusLabel(t.status)}
                                            </span>
                                        </td>
                                        {/* Prioridade com dot */}
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    t.priority === "critical" && "bg-red-500",
                                                    t.priority === "high" && "bg-amber-500",
                                                    t.priority === "medium" && "bg-zinc-400",
                                                    t.priority === "low" && "bg-zinc-600",
                                                )} />
                                                <span className={cn(
                                                    "text-xs font-bold",
                                                    t.priority === "critical" && "text-red-400",
                                                    t.priority === "high" && "text-amber-400",
                                                    t.priority === "medium" && "text-zinc-300",
                                                    t.priority === "low" && "text-zinc-500",
                                                )}>
                                                    {t.priorityLabel}
                                                </span>
                                            </div>
                                        </td>
                                        {/* Área — editável */}
                                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                                            <select
                                                title="Alterar área"
                                                value={t.area || ""}
                                                onChange={(e) => {
                                                    handleInlineUpdate(t.id, { area: e.target.value || undefined });
                                                }}
                                                className="bg-transparent text-xs font-medium text-muted-foreground cursor-pointer focus:outline-none hover:text-foreground transition-colors"
                                            >
                                                <option value="">—</option>
                                                {t.area && !DEMAND_AREAS.some(a => a.value === t.area) && (
                                                    <option value={t.area} disabled>{demandAreaLabel(t.area)}</option>
                                                )}
                                                {DEMAND_AREAS.map(a => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </select>
                                        </td>
                                        {/* Responsável — editável */}
                                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center gap-1.5">
                                                {t.memberAvatar ? (
                                                    <img src={t.memberAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                        <User className="h-3 w-3 text-primary" />
                                                    </div>
                                                )}
                                                <select
                                                    title="Alterar responsável"
                                                    value={t.assigneeId || ""}
                                                    onChange={(e) => {
                                                        handleInlineUpdate(t.id, { assigneeId: e.target.value || 'none' });
                                                    }}
                                                    className="bg-transparent text-xs font-medium cursor-pointer focus:outline-none hover:text-foreground transition-colors max-w-[90px] truncate"
                                                >
                                                    <option value="">Sem resp.</option>
                                                    {analytics.members.map(m => (
                                                        <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                        {/* Data de entrega */}
                                        <td className="px-5 py-3">
                                            {t.dueDate ? (
                                                <span className={cn(
                                                    "text-xs font-bold",
                                                    t.isOverdue ? "text-red-400" : (t.daysUntilDue !== null && t.daysUntilDue <= 3) ? "text-amber-400" : "text-zinc-400"
                                                )}>
                                                    {t.dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                                    {t.isOverdue && <span className="ml-1 text-[10px] text-red-500">({Math.abs(t.daysUntilDue!)}d)</span>}
                                                    {!t.isOverdue && t.daysUntilDue !== null && t.daysUntilDue <= 3 && <span className="ml-1 text-[10px]">({t.daysUntilDue}d)</span>}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-zinc-600">—</span>
                                            )}
                                        </td>
                                        {/* Dias aberta */}
                                        <td className="px-5 py-3">
                                            <span className={cn(
                                                "text-xs font-bold tabular-nums",
                                                t.daysOpen > 14 ? "text-amber-400" : "text-zinc-500"
                                            )}>
                                                {t.daysOpen}d
                                            </span>
                                        </td>
                                        {/* WhatsApp */}
                                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                            {t.memberPhone ? (
                                                <a
                                                    href={`https://wa.me/${t.memberPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                                        `Olá ${t.memberName.split(' ')[0]}! A demanda "${t.title}" do cliente ${t.clientName} está ${statusLabel(t.status).toLowerCase()} no sistema. Prioridade: ${t.priorityLabel}. Pode verificar?`
                                                    )}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-green-500/10 transition-colors"
                                                    title={`Notificar ${t.memberName} via WhatsApp`}
                                                >
                                                    <MessageCircle className="h-4 w-4 text-green-500" />
                                                </a>
                                            ) : (
                                                <div className="inline-flex items-center justify-center w-7 h-7 rounded-md opacity-20" title="Sem telefone cadastrado">
                                                    <MessageCircle className="h-4 w-4 text-zinc-500" />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma demanda ativa no momento.</div>
                )}
            </Card>

            {/* ══════ Setor + Prioridade — side by side, abaixo ══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Sector Distribution — 3 cols */}
                <Card className="lg:col-span-3 p-6 bg-muted/5 border border-border/20">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        <h2 className="text-base font-bold capitalize text-foreground">Demandas por Setor</h2>
                    </div>
                    <div className="space-y-4">
                        {analytics.sectorMetrics.map((sector) => (
                            <div key={sector.sector} className="group">
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
                                        <span className="text-sm font-semibold">{sector.label}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span>{sector.total} total</span>
                                        <span className="text-primary font-bold">{sector.done} feitas</span>
                                        <span className="text-foreground/50">{sector.inProgress} ativas</span>
                                    </div>
                                </div>
                                <div className="h-7 bg-muted/10 rounded-md overflow-hidden relative">
                                    <div
                                        className="absolute inset-y-0 left-0 rounded-md transition-all duration-700 ease-out bg-primary/15"
                                        style={{ width: `${(sector.total / maxSectorTotal) * 100}%` }}
                                    />
                                    <div
                                        className="absolute inset-y-0 left-0 rounded-md transition-all duration-700 ease-out bg-primary/40"
                                        style={{ width: `${(sector.done / maxSectorTotal) * 100}%` }}
                                    />
                                    <div className="absolute inset-0 flex items-center px-3">
                                        <span className="text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                            {sector.total > 0 ? `${Math.round((sector.done / sector.total) * 100)}% concluído` : "Sem demandas"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {analytics.sectorMetrics.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma demanda encontrada.</div>
                        )}
                    </div>
                </Card>

                {/* Priority Breakdown — 2 cols */}
                <Card className="lg:col-span-2 p-6 bg-muted/5 border border-border/20">
                    <div className="flex items-center gap-2 mb-4">
                        <Filter className="h-5 w-5 text-primary" />
                        <h2 className="text-base font-bold capitalize text-foreground">Prioridade</h2>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="shrink-0">
                            <PriorityRing data={analytics.priorityBreakdown} total={analytics.totalTasks} />
                        </div>
                        <div className="flex-1 space-y-3">
                            {analytics.priorityBreakdown.map((p, i) => {
                                const opacityValues = [0.2, 0.4, 0.6, 0.8];
                                return (
                                    <div key={p.priority} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full bg-primary" style={{ opacity: opacityValues[i] ?? 0.6 }} />
                                            <span className="text-sm font-medium">{p.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold">{p.count}</span>
                                            <span className="text-[10px] text-muted-foreground">
                                                {analytics.totalTasks > 0 ? `${Math.round((p.count / analytics.totalTasks) * 100)}%` : "0%"}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Ranking + Total por Responsável */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Ranking — destaque quem mais concluiu */}
                {(() => {
                    const sorted = [...analytics.memberMetrics].sort((a, b) => b.done - a.done);
                    const top = sorted[0];
                    const podium = sorted.slice(0, 3);
                    return (
                        <Card className="p-6 bg-muted/5 border border-border/20">
                            <div className="flex items-center gap-2 mb-6">
                                <TrendingUp className="h-5 w-5 text-primary" />
                                <h2 className="text-base font-bold capitalize text-foreground">
                                    Ranking {period === "today" ? "do Dia" : period === "week" ? "da Semana" : period === "month" ? "do Mês" : period === "30d" ? "dos Últimos 30 Dias" : "do Período"}
                                </h2>
                            </div>
                            {top && top.done > 0 ? (
                                <div className="space-y-6">
                                    {/* Top performer */}
                                    <div className="flex flex-col items-center text-center">
                                        <div className="relative">
                                            {top.member.avatar_url ? (
                                                <img src={top.member.avatar_url} alt={top.member.name} className="w-20 h-20 rounded-full object-cover border-3 border-primary shadow-lg" />
                                            ) : (
                                                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-3 border-primary shadow-lg">
                                                    <User className="h-9 w-9 text-primary" />
                                                </div>
                                            )}
                                            <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-black shadow">1</div>
                                        </div>
                                        <p className="text-lg font-black mt-3">{top.member.name}</p>
                                        <p className="text-3xl font-black text-primary mt-1">{top.done}</p>
                                        <p className="text-xs text-muted-foreground font-semibold">tarefas concluídas</p>
                                    </div>

                                    {/* 2nd and 3rd */}
                                    <div className="space-y-3 pt-4 border-t border-border/30">
                                        {podium.slice(1).map((mm, i) => (
                                            <div key={mm.member.id} className="flex items-center gap-3">
                                                <span className="text-sm font-black text-muted-foreground w-5">{i + 2}º</span>
                                                {mm.member.avatar_url ? (
                                                    <img src={mm.member.avatar_url} alt={mm.member.name} className="w-8 h-8 rounded-full object-cover border border-border" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                        <User className="h-4 w-4 text-primary" />
                                                    </div>
                                                )}
                                                <span className="text-sm font-bold flex-1 truncate">{mm.member.name}</span>
                                                <span className="text-sm font-black text-primary">{mm.done}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground text-sm">Sem dados.</div>
                            )}
                        </Card>
                    );
                })()}

                {/* Total por Responsável — Vertical Bar Chart */}
                <Card className="lg:col-span-3 p-6 pb-4 bg-muted/5 border border-border/20">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-primary" />
                            <h2 className="text-base font-bold capitalize text-foreground">Total de Demandas por Responsável</h2>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-primary/50" /><span>Concluídas</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-primary/15" /><span>Total</span></div>
                        </div>
                    </div>
                    {analytics.memberMetrics.length > 0 ? (() => {
                        const BAR_AREA = 440;
                        const AVATAR_SPACE = 68; // avatar (48) + number (20)
                        const NAME_SPACE = 24;
                        const TOTAL_HEIGHT = BAR_AREA + AVATAR_SPACE + NAME_SPACE;
                        const sorted = [...analytics.memberMetrics].sort((a, b) => a.total - b.total);
                        const maxTotal = Math.max(...sorted.map(m => m.total), 1);
                        const gridLines = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(maxTotal * p));
                        return (
                            <div className="relative" style={{ height: TOTAL_HEIGHT }}>
                                {/* Y-axis labels — aligned to bar area only */}
                                {[...gridLines].reverse().map((v, i) => (
                                    <span key={i} className="absolute left-0 text-[10px] text-muted-foreground/40 font-medium" style={{ top: AVATAR_SPACE + (i / (gridLines.length - 1)) * BAR_AREA, transform: 'translateY(-50%)' }}>{v}</span>
                                ))}
                                {/* Grid lines — aligned to bar area */}
                                {gridLines.map((_, i) => (
                                    <div key={i} className="absolute left-8 right-0 border-t border-border/10" style={{ top: AVATAR_SPACE + (i / (gridLines.length - 1)) * BAR_AREA }} />
                                ))}
                                {/* Bars */}
                                <div className="absolute left-8 right-0 flex gap-1" style={{ top: 0, height: TOTAL_HEIGHT }}>
                                    {sorted.map((mm) => {
                                        const totalPx = Math.max(Math.round((mm.total / maxTotal) * BAR_AREA), 2);
                                        const donePx = mm.total > 0 ? Math.round((mm.done / maxTotal) * BAR_AREA) : 0;
                                        const barTop = AVATAR_SPACE + (BAR_AREA - totalPx);
                                        return (
                                            <div key={mm.member.id} className="flex-1 relative min-w-0">
                                                {/* Avatar — positioned just above bar */}
                                                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: barTop - AVATAR_SPACE }}>
                                                    {mm.member.avatar_url ? (
                                                        <img src={mm.member.avatar_url} alt={mm.member.name} className="w-12 h-12 rounded-full object-cover border-2 border-border/40" style={{ imageRendering: 'high-quality' }} />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                                                            <User className="h-5 w-5 text-primary" />
                                                        </div>
                                                    )}
                                                    <span className="text-xs font-black mt-0.5">{mm.total}</span>
                                                </div>
                                                {/* Bar — starts at barTop, ends at bottom of bar area */}
                                                <div className="absolute left-1/2 -translate-x-1/2 w-[75%] max-w-[52px] rounded-t-md overflow-hidden" style={{ top: barTop, height: totalPx }}>
                                                    <div className="absolute inset-0 bg-primary/15" />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-primary/50 rounded-t-md transition-all duration-700" style={{ height: donePx }} />
                                                </div>
                                                {/* Name — at bottom */}
                                                <span className="absolute bottom-0 left-0 right-0 text-[10px] font-semibold text-muted-foreground truncate text-center px-0.5">{mm.member.name.split(' ')[0]}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })() : (
                        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum membro encontrado.</div>
                    )}
                </Card>
            </div>

            {/* Team Members Section */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-bold capitalize text-foreground">Desempenho por Responsável</h2>
                </div>

                {/* Legenda de Status */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 px-1">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-foreground" />
                        <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Total</span> — Todas as demandas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        <span className="text-xs text-muted-foreground"><span className="font-semibold text-primary">Feitas</span> — Concluídas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-foreground/60" />
                        <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground/60">Fazendo</span> — Em andamento</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-foreground/40" />
                        <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground/40">Pendente</span> — Aguardando</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
                        <span className="text-xs text-muted-foreground"><span className="font-semibold text-primary/60">Bloqueada</span> — Não desbloqueada</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-foreground/30" />
                        <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground/30">Backlog</span> — Não priorizada</span>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {analytics.memberMetrics.map((mm) => (
                        <Card key={mm.member.id} className="p-0 bg-muted/5 border border-border/20 hover:border-primary/30 transition-all group overflow-hidden">
                            {/* Avatar destaque */}
                            <div className="flex flex-col items-center pt-6 pb-4 px-5 border-b border-border/30">
                                {mm.member.avatar_url ? (
                                    <img src={mm.member.avatar_url} alt={mm.member.name} className="w-16 h-16 rounded-full object-cover border-2 border-border shadow-lg mb-3" />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20 shadow-lg mb-3">
                                        <User className="h-7 w-7 text-primary" />
                                    </div>
                                )}
                                <p className="text-base font-bold truncate text-center">{mm.member.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{mm.member.role}</p>
                                {mm.overdue > 0 && (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] font-bold mt-2">
                                        {mm.overdue} atrasada{mm.overdue > 1 ? "s" : ""}
                                    </Badge>
                                )}
                            </div>

                            <div className="p-5 space-y-4">
                                {/* Stats Grid */}
                                <div className="grid grid-cols-3 gap-2">
                                    <MiniStat label="Total" value={mm.total} />
                                    <MiniStat label="Feitas" value={mm.done} color="text-primary" />
                                    <MiniStat label="Fazendo" value={mm.inProgress} color="text-foreground/60" />
                                    <MiniStat label="Pendente" value={mm.pending} color="text-foreground/40" />
                                    <MiniStat label="Bloqueada" value={mm.blocked} color="text-primary/60" />
                                    <MiniStat label="Backlog" value={mm.other} color="text-foreground/30" />
                                </div>

                                {/* Progress Bar */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Conclusão</span>
                                        <span className="text-xs font-bold text-primary">{mm.total > 0 ? Math.round((mm.done / mm.total) * 100) : 0}%</span>
                                    </div>
                                    <div className="h-2 bg-muted/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary/70 rounded-full transition-all duration-500"
                                            style={{ width: `${mm.total > 0 ? (mm.done / mm.total) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Delivery Speed */}
                                <div className="flex items-center justify-between pt-3 border-t border-border/30">
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                        <Timer className="h-3.5 w-3.5" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Vel. Média</span>
                                    </div>
                                    <span className={cn(
                                        "text-sm font-bold",
                                        mm.avgDeliveryDays !== null ? "text-foreground" : "text-muted-foreground"
                                    )}>
                                        {mm.avgDeliveryDays !== null ? `${mm.avgDeliveryDays} dias` : "—"}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    ))}

                    {analytics.memberMetrics.length === 0 && (
                        <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                            Nenhum membro encontrado.
                        </div>
                    )}
                </div>
            </div>

            {/* ══════ Tempo Gasto em Demandas (com análise por IA) ══════ */}
            <div className="pt-8 border-t border-border/30">
                <TimeAnalyticsSection dateRange={dateRangeForHook} />
            </div>
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
    label,
    value,
    icon: Icon,
    suffix,
    alert,
    isString,
}: {
    label: string;
    value: number | string;
    icon: React.ComponentType<any>;
    suffix?: string;
    alert?: boolean;
    isString?: boolean;
}) {
    return (
        <Card className={cn("p-4 bg-muted/5 border border-border/20 transition-colors", alert && "border-primary/30")}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
                <Icon className="h-3.5 w-3.5 text-primary/50" />
            </div>
            <div className="flex items-end gap-1.5">
                <span className="text-2xl font-black tracking-tight">{value}</span>
                {suffix && <span className="text-xs font-bold mb-0.5 text-primary">{suffix}</span>}
            </div>
        </Card>
    );
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
    return (
        <div className="text-center">
            <p className={cn("text-lg font-bold", color || "text-foreground")}>{value}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
        </div>
    );
}

function PriorityRing({ data, total, size = 140 }: { data: { priority: string; label: string; count: number; color: string }[]; total: number; size?: number }) {
    const strokeWidth = 14;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    // Monochromatic primary shades
    const primaryShades = ['hsl(0, 72%, 85%)', 'hsl(0, 72%, 65%)', 'hsl(0, 72%, 51%)', 'hsl(0, 72%, 38%)'];

    let accumulatedOffset = 0;

    return (
        <div className="relative">
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/10" />
                {data.map((segment, i) => {
                    const pct = total > 0 ? segment.count / total : 0;
                    const dashLength = pct * circumference;
                    const offset = accumulatedOffset;
                    accumulatedOffset += dashLength;

                    if (segment.count === 0) return null;

                    return (
                        <circle
                            key={segment.priority}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            fill="none"
                            stroke={primaryShades[i] || primaryShades[2]}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                            strokeDashoffset={-offset}
                            strokeLinecap="round"
                            className="transition-all duration-700"
                        />
                    );
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black">{total}</span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Demandas</span>
            </div>
        </div>
    );
}
