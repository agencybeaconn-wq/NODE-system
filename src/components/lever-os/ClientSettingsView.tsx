import { useState, useEffect } from "react";
import { Client } from "@/types/lever-os";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ProductSelectorModal } from "@/components/clients/ProductSelector";
import { InlineEditableValue, EditableAvatar } from "@/components/clients/InlineEditing";
import { ConnectionsHub } from "@/components/lever-os/ConnectionsHub";
import { ImageIcon, Tag, Archive, Trash2, MoreVertical, Loader2, Pencil, Check, X, MessageCircle } from "lucide-react";
import {
    PieChart,
    Coins,
    Settings2,
    Package,
    Sparkles,
    CreditCard,
    DollarSign,
    Calendar,
    UserPlus,
    Mail,
    ShieldCheck,
    Smartphone
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAgencyProducts } from "@/hooks/useAgencyProducts";
import { useSelectedClient } from "@/contexts/DashboardContext";
import { useDashboard } from "@/contexts/DashboardContext";
import { useNavigate } from "react-router-dom";
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

interface ClientSettingsViewProps {
    client: Client;
    clientId: string;
    onClientUpdate?: () => void;
}

function ClientNameEditor({ clientId, currentName, onNameUpdated }: { clientId: string; currentName: string; onNameUpdated: () => void }) {
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(currentName);
    const [isSaving, setIsSaving] = useState(false);
    const toastResult = useToast();
    const toast = toastResult?.toast;

    useEffect(() => { setName(currentName); }, [currentName]);

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === currentName) {
            setIsEditing(false);
            setName(currentName);
            return;
        }
        setIsSaving(true);
        try {
            const { error } = await (supabase as any)
                .from('agency_clients')
                .update({ name: trimmed })
                .eq('id', clientId);
            if (error) throw error;
            toast?.({ title: "Nome atualizado!" });
            onNameUpdated();
        } catch (error) {
            console.error("Erro ao atualizar nome:", error);
            toast?.({ title: "Erro ao atualizar nome", variant: "destructive" });
            setName(currentName);
        } finally {
            setIsSaving(false);
            setIsEditing(false);
        }
    };

    return (
        <div className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
            <div className="space-y-1">
                <Label className="text-base font-bold flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-muted-foreground" />
                    Nome do Cliente
                </Label>
                <p className="text-sm text-muted-foreground">Altere o nome de exibição deste cliente.</p>
            </div>
            {isEditing ? (
                <div className="flex items-center gap-2">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setIsEditing(false); setName(currentName); } }}
                        className="h-9 w-56 text-sm font-semibold"
                        autoFocus
                        disabled={isSaving}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:text-emerald-600" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => { setIsEditing(false); setName(currentName); }} disabled={isSaving}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{currentName}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setIsEditing(true)}>
                        <Pencil className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}

const CALCULATION_BASE = {
    REVENUE: "revenue",
    SPEND: "spend",
} as const;

export function ClientSettingsView({ client, clientId, onClientUpdate }: ClientSettingsViewProps) {
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const agencyProductsResult = useAgencyProducts();
    const dynamicProducts = agencyProductsResult?.products || [];
    const navigate = useNavigate();
    const { refreshClients } = useDashboard();

    // Archive/Delete state
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Safe access to financials — garante que valores internos nunca sejam undefined
    const rawFinancials = client?.financials || {};
    const safeFinancials = {
        variableFeePercentage: rawFinancials.variableFeePercentage ?? 0,
        fixedFee: rawFinancials.fixedFee ?? 0,
    };

    const [calculationBase, setCalculationBase] = useState<string>(
        (client as any)?.calculation_base || (safeFinancials as any).calculationBase || CALCULATION_BASE.REVENUE
    );
    const hasPerformance = (safeFinancials?.variableFeePercentage || 0) > 0;
    const toastResult = useToast();
    const toast = toastResult?.toast;

    // Portal Info State
    const [responsibleEmail, setResponsibleEmail] = useState<string | null>(null);
    const [responsibleStatus, setResponsibleStatus] = useState<string | null>(null);
    const [isInviting, setIsInviting] = useState(false);
    const [inputEmail, setInputEmail] = useState("");

    // Local state for editable fields to ensure re-render on update
    const [localPaymentDueDay, setLocalPaymentDueDay] = useState(client?.payment_due_day || 5);
    const [localFixedFee, setLocalFixedFee] = useState(safeFinancials?.fixedFee || 0);
    const [isLoadingEmail, setIsLoadingEmail] = useState(false);
    const { refreshClientData } = useSelectedClient();

    // Client type state
    const [clientType, setClientType] = useState<string>((client as any)?.client_type || 'avulso');

    // Prazo do Projeto e WhatsApp removidos da pagina (2026-08) — estados e
    // handlers deles sairam junto; as colunas continuam no banco, intactas.

    const handleClientTypeChange = async (newType: string) => {
        setClientType(newType);
        try {
            const { error } = await (supabase as any)
                .from('agency_clients')
                .update({ client_type: newType })
                .eq('id', clientId);
            if (error) throw error;
            toast?.({
                title: "Tipo atualizado!",
                description: newType === 'fixo' ? 'Cliente marcado como Fixo (MRR)' : 'Cliente marcado como Avulso',
            });
            await refreshClientData();
            onClientUpdate?.();
        } catch (error) {
            console.error("Erro ao atualizar tipo:", error);
        }
    };

    // Sync state with props when client data changes
    useEffect(() => {
        if (client?.payment_due_day !== undefined) {
            setLocalPaymentDueDay(client.payment_due_day || 5);
        }
        if (client?.financials?.fixedFee !== undefined) {
            setLocalFixedFee(client.financials.fixedFee);
        }
    }, [client]);

    const fetchResponsibleEmail = async () => {
        setIsLoadingEmail(true);
        try {
            console.log("[PortalAccess] Fetching email for clientId:", clientId);

            // Strategy 1: Find user in team_members with linked_client_id matching this client
            // Strategy: Find user in team_members with linked_client_id matching this client 
            // OR where this email is associated with a client user type in this workspace
            const { data: teamData, error: teamError } = await (supabase as any)
                .from('team_members')
                .select('email, status, linked_client_id, user_type')
                .eq('workspace_id', client.workspace_id)
                .eq('linked_client_id', clientId)
                .maybeSingle();

            console.log("[PortalAccess] team_members result:", teamData, teamError);

            if (teamData) {
                console.log("[PortalAccess] Found match:", teamData);
                setResponsibleEmail(teamData.email);
                setResponsibleStatus(teamData.status);
                return;
            }

            // No email found
            console.log("[PortalAccess] No linked email found.");
            setResponsibleEmail(null);
            setResponsibleStatus(null);
        } catch (error) {
            console.error("[PortalAccess] Error:", error);
            setResponsibleEmail(null);
            setResponsibleStatus(null);
        } finally {
            setIsLoadingEmail(false);
        }
    };

    useEffect(() => {
        fetchResponsibleEmail();
    }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTogglePerformance = async () => {
        const newValue = hasPerformance ? 0 : 5;
        try {
            const { error } = await (supabase as any)
                .from('agency_clients')
                .update({ commission_rate: newValue })
                .eq('id', clientId);

            if (error) throw error;

            toast?.({
                title: hasPerformance ? "Performance desabilitada" : "Performance habilitada",
                description: hasPerformance ? "Comissão removida deste cliente." : "Comissão de performance habilitada (padrão 5%).",
            });
            onClientUpdate?.();
        } catch (error: any) {
            console.error("Erro ao toggle performance:", error);
        }
    };

    const handleCalculationBaseChange = async (newBase: string) => {
        try {
            setCalculationBase(newBase);
            const { error } = await (supabase as any)
                .from('agency_clients')
                .update({ calculation_base: newBase })
                .eq('id', clientId);

            if (error) throw error;
            toast?.({
                title: "Base de cálculo atualizada",
                description: newBase === CALCULATION_BASE.SPEND ? "Comissão sobre investimento" : "Comissão sobre faturamento",
            });
            onClientUpdate?.();
        } catch (error: any) {
            console.error("Erro ao atualizar base:", error);
        }
    };

    const handleInviteResponsible = async () => {
        const emailToInvite = inputEmail || prompt("Digite o e-mail do responsável pelo portal:");
        if (!emailToInvite || !emailToInvite.includes('@')) {
            toast?.({
                variant: "destructive",
                title: "E-mail inválido",
                description: "Por favor, insira um e-mail válido.",
            });
            return;
        }

        const normalizedEmail = emailToInvite.toLowerCase().trim();
        setIsInviting(true);

        try {
            console.log("[PortalAccess] Starting direct invite for:", normalizedEmail, "Client ID:", clientId);

            // STEP 1: Check if email already exists in team_members for this workspace
            const { data: existingMember, error: searchError } = await (supabase as any)
                .from('team_members')
                .select('id, email, linked_client_id')
                .eq('workspace_id', client.workspace_id)
                .ilike('email', normalizedEmail)
                .maybeSingle();

            if (searchError) {
                console.error("[PortalAccess] Search error:", searchError);
            }

            let memberId;

            if (existingMember) {
                // UPDATE existing record with client link
                console.log("[PortalAccess] Updating existing member:", existingMember.id);
                const { data: updated, error: updateErr } = await (supabase as any)
                    .from('team_members')
                    .update({
                        linked_client_id: clientId,
                        user_type: 'client',
                        role: 'client',
                        status: 'invited',
                        invited_at: new Date().toISOString()
                    })
                    .eq('id', existingMember.id)
                    .select('id')
                    .single();

                if (updateErr) {
                    console.error("[PortalAccess] Update error:", updateErr);
                    throw new Error("Erro ao atualizar vínculo: " + updateErr.message);
                }
                memberId = updated.id;
            } else {
                // INSERT new record
                console.log("[PortalAccess] Creating new team_member record");
                const { data: inserted, error: insertErr } = await (supabase as any)
                    .from('team_members')
                    .insert({
                        workspace_id: client.workspace_id,
                        email: normalizedEmail,
                        linked_client_id: clientId,
                        user_type: 'client',
                        role: 'client',
                        status: 'invited',
                        invited_at: new Date().toISOString()
                    })
                    .select('id')
                    .single();

                if (insertErr) {
                    console.error("[PortalAccess] Insert error:", insertErr);
                    throw new Error("Erro ao criar vínculo: " + insertErr.message);
                }
                memberId = inserted.id;
            }

            console.log("[PortalAccess] Team member record created/updated:", memberId);

            // Garante que o access_token esteja fresco antes de chamar a edge function.
            // Sem isso, o SDK pode enviar um JWT expirado e a função retorna 401.
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData?.session) {
                throw new Error("Sessão expirada. Faça login novamente para enviar convites.");
            }

            // STEP 2: Send branded email via Edge Function (uses Resend)
            const { data: inviteData, error: inviteError } = await supabase.functions.invoke('invite-team-member', {
                body: {
                    email: normalizedEmail,
                    workspace_id: client.workspace_id,
                    role: 'client',
                    linked_client_id: clientId,
                    user_type: 'client',
                    site_url: window.location.origin
                },
                headers: {
                    Authorization: `Bearer ${sessionData.session.access_token}`,
                }
            });

            if (inviteError || inviteData?.error) {
                console.warn("[PortalAccess] Edge function error:", inviteError || inviteData?.error);
                // Em status não-2xx o motivo real vem no corpo da Response (error.context).
                let detailedError = inviteData?.error || inviteError?.message;
                const ctx = (inviteError as any)?.context;
                if (ctx && typeof ctx.json === 'function') {
                    try {
                        const body = await ctx.json();
                        if (body?.error) detailedError = body.error;
                    } catch { /* corpo não-JSON: fica a mensagem do SDK */ }
                }
                throw new Error(detailedError || "Erro ao conectar com serviço de envio de e-mails.");
            } else {
                console.log("[PortalAccess] Branded email sent via Resend");
            }

            toast({
                title: "✅ Convite enviado!",
                description: `${normalizedEmail} foi vinculado ao portal. Um email de acesso foi enviado.`,
            });

            setInputEmail("");
            fetchResponsibleEmail();

        } catch (error: any) {
            console.error("[PortalAccess] Invite error:", error);
            toast?.({
                variant: "destructive",
                title: "Erro ao convidar",
                description: error.message || "Não foi possível enviar o convite.",
            });
        } finally {
            setIsInviting(false);
        }
    };


    const handleRemoveLink = async () => {
        if (!responsibleEmail) return;
        if (!confirm(`Deseja remover o vínculo de ${responsibleEmail}? O usuário perderá acesso ao portal.`)) return;

        try {
            const { error } = await (supabase as any)
                .from('team_members')
                .update({
                    linked_client_id: null,
                    user_type: 'agency',
                    role: 'operator',
                    status: 'invited'
                })
                .eq('email', responsibleEmail)
                .eq('linked_client_id', clientId);

            if (error) throw error;

            toast?.({
                title: "Vínculo removido",
                description: "O e-mail não está mais associado a este portal.",
            });
            fetchResponsibleEmail();
        } catch (error: any) {
            console.error("Erro ao remover vínculo:", error);
        }
    };

    // Debug log for email
    console.log("[ClientSettings] responsibleEmail:", responsibleEmail, "isLoadingEmail:", isLoadingEmail);

    const handleArchiveClient = async () => {
        setIsArchiving(true);
        try {
            const { error } = await (supabase as any)
                .from('agency_clients')
                .update({ is_archived: true })
                .eq('id', clientId);
            if (error) throw error;
            toast({ title: "Cliente arquivado", description: `${client.name} foi movido para os arquivos.` });
            await refreshClients();
            navigate('/clients');
        } catch (error: any) {
            console.error("Erro ao arquivar:", error);
        } finally {
            setIsArchiving(false);
        }
    };

    const handleDeleteClient = async () => {
        setIsDeleting(true);
        try {
            const { error } = await (supabase as any)
                .from('agency_clients')
                .delete()
                .eq('id', clientId);
            if (error) throw error;
            toast({ title: "Cliente excluído", description: `${client.name} foi removido permanentemente.` });
            await refreshClients();
            navigate('/clients');
        } catch (error: any) {
            console.error("Erro ao excluir:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            {/* Header Actions */}
            <div className="flex justify-end items-center">
                <div className="flex gap-2 items-center">
                    {/* Visual Email Indicator */}
                    {isLoadingEmail ? (
                        <Badge variant="outline" className="gap-1.5 text-xs bg-muted/50 border-border/50 text-muted-foreground font-medium px-2.5 py-1">
                            Carregando...
                        </Badge>
                    ) : responsibleEmail ? (
                        <Badge variant="outline" className="gap-1.5 text-xs bg-blue-500/10 border-blue-500/30 text-blue-400 font-medium px-2.5 py-1">
                            <Mail className="w-3 h-3" />
                            {responsibleEmail}
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="gap-1.5 text-xs bg-amber-500/10 border-amber-500/30 text-amber-400 font-medium px-2.5 py-1">
                            Sem email vinculado
                        </Badge>
                    )}

                    {/* 3-dot Actions Menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setIsArchiveDialogOpen(true)} className="text-orange-600 focus:text-orange-600 bg-orange-500/5 focus:bg-orange-500/10 cursor-pointer">
                                <Archive className="w-4 h-4 mr-2" />
                                Arquivar Projeto
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)} className="text-destructive focus:text-destructive bg-destructive/5 focus:bg-destructive/10 cursor-pointer">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remover Dados
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Archive Dialog */}
            <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
                <AlertDialogContent className="bg-card border-orange-500/20 shadow-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold text-orange-600 flex items-center gap-2">
                            <Archive className="w-6 h-6" />
                            Confirmar Arquivamento?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="pt-2 text-base">
                            O squad <strong>{client.name}</strong> será movido para os históricos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-6">
                        <AlertDialogCancel className="font-bold border-border/50">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleArchiveClient} disabled={isArchiving} className="bg-orange-500 hover:bg-orange-600 font-bold h-11 px-8 shadow-none">
                            {isArchiving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
                            Arquivar Agora
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-card border-red-500/30 shadow-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
                            <Trash2 className="w-6 h-6" />
                            Remoção Irreversível
                        </AlertDialogTitle>
                        <AlertDialogDescription className="pt-2 text-base">
                            Você tem certeza? Todos os dados de <strong>{client.name}</strong> serão apagados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="pt-6">
                        <AlertDialogCancel className="font-bold border-border/50">Abortar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteClient} disabled={isDeleting} className="bg-red-500 hover:bg-red-600 font-bold h-11 px-8 shadow-none">
                            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Excluir Tudo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-stretch">
                {/* 0. Identity Card - Logo & Type */}
                <Card className="overflow-hidden border-border/40 bg-card text-card-foreground shadow-none">
                    <CardHeader className="border-b border-border/40 bg-muted/30 pb-6">
                        <CardTitle className="text-xl flex items-center gap-2 font-bold">
                            <ImageIcon className="w-5 h-5 text-primary" />
                            Identidade do Cliente
                        </CardTitle>
                        <CardDescription>Logo e classificação do cliente.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border/40">
                            {/* Client Name Edit */}
                            <ClientNameEditor
                                clientId={clientId}
                                currentName={client.name}
                                onNameUpdated={async () => {
                                    await refreshClientData();
                                    onClientUpdate?.();
                                }}
                            />
                            {/* Logo Upload */}
                            <div className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                <div className="space-y-1">
                                    <Label className="text-base font-bold flex items-center gap-2">
                                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                        Logo do Cliente
                                    </Label>
                                    <p className="text-sm text-muted-foreground">Clique no avatar para alterar a foto/logo.</p>
                                </div>
                                <EditableAvatar
                                    clientId={clientId}
                                    clientName={client.name}
                                    currentLogoUrl={(client as any).logo_url}
                                    primaryColor={client.primaryColor}
                                    onAvatarChange={() => {
                                        refreshClientData();
                                        onClientUpdate?.();
                                    }}
                                />
                            </div>

                            {/* Client Type Selector */}
                            <div className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                <div className="space-y-1">
                                    <Label className="text-base font-bold flex items-center gap-2">
                                        <Tag className="w-4 h-4 text-muted-foreground" />
                                        Tipo de Cliente
                                    </Label>
                                    <p className="text-sm text-muted-foreground">Classifique entre Avulso ou Fixo (MRR).</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant={clientType === 'avulso' ? 'default' : 'outline'}
                                        size="sm"
                                        className={cn(
                                            "font-bold text-xs rounded-full h-9 px-4",
                                            clientType === 'avulso' && "bg-orange-600 hover:bg-orange-700"
                                        )}
                                        onClick={() => handleClientTypeChange('avulso')}
                                    >
                                        Avulso
                                    </Button>
                                    <Button
                                        variant={clientType === 'fixo' ? 'default' : 'outline'}
                                        size="sm"
                                        className={cn(
                                            "font-bold text-xs rounded-full h-9 px-4",
                                            clientType === 'fixo' && "bg-emerald-600 hover:bg-emerald-700"
                                        )}
                                        onClick={() => handleClientTypeChange('fixo')}
                                    >
                                        Fixo (MRR)
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 0.5 Aplicativo Mobile Card — módulo apps white-label */}
                <Card className="overflow-hidden border-border/40 bg-card text-card-foreground shadow-none">
                    <CardHeader className="border-b border-border/40 bg-muted/30 pb-6">
                        <CardTitle className="text-xl flex items-center gap-2 font-bold">
                            <Smartphone className="w-5 h-5 text-primary" />
                            Aplicativo Mobile
                        </CardTitle>
                        <CardDescription>App white-label da loja: push, automações, rastreio e cashback.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 flex items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground">
                            Vincule a loja, gerencie campanhas de push e acompanhe pedidos vindos do app.
                        </p>
                        <Button variant="outline" className="shrink-0" onClick={() => navigate(`/clients/${clientId}/aplicativo`)}>
                            Abrir módulo
                        </Button>
                    </CardContent>
                </Card>

                {/* 1. Financial Rules Card */}
                <Card className="overflow-hidden border-border/40 bg-card text-card-foreground shadow-none">
                    <CardHeader className="border-b border-border/40 bg-muted/30 pb-6">
                        <CardTitle className="text-xl flex items-center gap-2 font-bold">
                            <CreditCard className="w-5 h-5 text-emerald-500" />
                            Regras Financeiras
                        </CardTitle>
                        <CardDescription>Configure como a performance e o fee são calculados para o squad.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-border/40">
                            {/* Fixed Fee Input */}
                            <div className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                <div className="space-y-1">
                                    <Label className="text-base font-bold flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                                        Fixo
                                    </Label>
                                    <p className="text-sm text-muted-foreground">Valor fixo mensal.</p>
                                </div>
                                <InlineEditableValue
                                    clientId={clientId}
                                    fieldName="fee_fixed"
                                    initialValue={safeFinancials.fixedFee}
                                    type="currency"
                                    onValueChange={() => onClientUpdate?.()}
                                    className="text-2xl font-black text-foreground"
                                />
                            </div>

                            {/* Payment Due Day */}
                            <div className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                <div className="space-y-1">
                                    <Label className="text-base font-bold flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-muted-foreground" />
                                        Dia de Vencimento
                                    </Label>
                                    <p className="text-sm text-muted-foreground">Dia do mês para vencimento da fatura.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={31}
                                        value={localPaymentDueDay}
                                        onChange={(e) => setLocalPaymentDueDay(parseInt(e.target.value) || 5)}
                                        onBlur={async (e) => {
                                            const newValue = parseInt(e.target.value) || 5;
                                            try {
                                                await (supabase as any)
                                                    .from('agency_clients')
                                                    .update({ payment_due_day: newValue })
                                                    .eq('id', clientId);
                                                toast?.({
                                                    title: "Dia atualizado!",
                                                    description: `Novo dia de vencimento: ${newValue}`,
                                                });
                                                // Refresh global state
                                                await refreshClientData();
                                                onClientUpdate?.();
                                            } catch (error) {
                                                console.error("Erro ao salvar:", error);
                                            }
                                        }}
                                        className="w-20 text-2xl font-black text-center bg-transparent border-0 border-b-2 border-dashed border-muted-foreground/30 focus:border-primary rounded-none"
                                    />
                                </div>
                            </div>

                            {/* Performance Toggle */}
                            <div className="p-6 flex items-center justify-between hover:bg-muted/10 transition-colors">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-base font-bold">Comissão de Performance</Label>
                                        {hasPerformance && (
                                            <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-[9px] font-black uppercase tracking-widest px-2 py-0">Ativo</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">Habilitar taxa variável com base em resultados.</p>
                                </div>
                                <Switch
                                    checked={hasPerformance}
                                    onCheckedChange={handleTogglePerformance}
                                    className="data-[state=checked]:bg-emerald-500 shadow-none border-border/50"
                                />
                            </div>

                            {/* Commission Rate & Calculation Base */}
                            {hasPerformance && (
                                <div className="p-6 space-y-6 bg-emerald-500/[0.02] animate-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-base font-bold">Porcentagem de Comissão</Label>
                                            <p className="text-sm text-muted-foreground">Taxa variável aplicada sobre a base de cálculo.</p>
                                        </div>
                                        <InlineEditableValue
                                            clientId={clientId}
                                            fieldName="commission_rate"
                                            initialValue={safeFinancials.variableFeePercentage}
                                            type="percentage"
                                            onValueChange={() => onClientUpdate?.()}
                                            className="text-2xl font-black text-emerald-600"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-emerald-500/10">
                                        <div className="space-y-1">
                                            <Label className="text-base font-bold">Base de Cálculo</Label>
                                            <p className="text-sm text-muted-foreground">Qual métrica servirá como base para a performance?</p>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" className="gap-3 min-w-[160px] h-11 border-emerald-500/20 bg-background hover:bg-emerald-500/5 hover:border-emerald-500/40 transition-all font-bold shadow-none">
                                                    {calculationBase === CALCULATION_BASE.REVENUE ? (
                                                        <><PieChart className="w-4 h-4 text-emerald-500" /> Faturamento</>
                                                    ) : (
                                                        <><Coins className="w-4 h-4 text-emerald-500" /> Investimento</>
                                                    )}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56 p-2 shadow-none border-border/50">
                                                <DropdownMenuRadioGroup value={calculationBase} onValueChange={handleCalculationBaseChange}>
                                                    <DropdownMenuRadioItem value={CALCULATION_BASE.REVENUE} className="cursor-pointer py-3 rounded-lg focus:bg-emerald-500/10">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold">Faturamento</span>
                                                            <span className="text-[10px] text-muted-foreground italic">Comissão sobre vendas brutas</span>
                                                        </div>
                                                    </DropdownMenuRadioItem>
                                                    <DropdownMenuRadioItem value={CALCULATION_BASE.SPEND} className="cursor-pointer py-3 rounded-lg focus:bg-emerald-500/10">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold">Investimento</span>
                                                            <span className="text-[10px] text-muted-foreground italic">Comissão sobre gasto em Ads</span>
                                                        </div>
                                                    </DropdownMenuRadioItem>
                                                </DropdownMenuRadioGroup>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Prazo do Projeto removido a pedido — prazos vivem na aba Prioridades */}

                {/* 2. Portal Access Card */}
                <Card className="overflow-hidden border-border/40 bg-card text-card-foreground shadow-none">
                    <CardHeader className="border-b border-border/40 bg-muted/30 pb-6">
                        <CardTitle className="text-xl flex items-center gap-2 font-bold">
                            <ShieldCheck className="w-5 h-5 text-blue-500" />
                            Acesso ao Portal do Cliente
                        </CardTitle>
                        <CardDescription>Gerencie quem tem acesso à visualização isolada deste projeto.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="p-6 space-y-4">
                            {!responsibleEmail ? (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-bold flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-muted-foreground" />
                                            Vincular Novo Responsável
                                        </Label>
                                        <div className="flex gap-2">
                                            <input
                                                type="email"
                                                placeholder="exemplo@email.com"
                                                value={inputEmail}
                                                onChange={(e) => setInputEmail(e.target.value)}
                                                className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            />
                                            <Button
                                                onClick={handleInviteResponsible}
                                                disabled={isInviting || !inputEmail}
                                                className="gap-2 font-bold shadow-none whitespace-nowrap"
                                            >
                                                {isInviting ? "Enviando..." : "Enviar Convite"}
                                            </Button>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground italic">
                                        Isso enviará um e-mail de convite e criará o vínculo automático com este cliente.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/40 group hover:border-primary/20 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Mail className="w-5 h-5 text-primary" />
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm">{responsibleEmail}</span>
                                                <Badge
                                                    variant="secondary"
                                                    className={cn(
                                                        "text-[9px] uppercase font-black px-1.5 py-0",
                                                        responsibleStatus === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600"
                                                    )}
                                                >
                                                    {responsibleStatus === "active" ? "Ativo" : "Convidado"}
                                                </Badge>
                                            </div>
                                            <span className="text-xs text-muted-foreground">Responsável pelo Portal</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleInviteResponsible}
                                            className="h-8 text-[11px] font-bold text-muted-foreground hover:text-primary"
                                        >
                                            Reconvidar
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleRemoveLink}
                                            className="h-8 text-[11px] font-bold text-destructive hover:bg-destructive/10"
                                        >
                                            Remover
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Products Card */}
                <Card className="overflow-hidden border-border/40 bg-gradient-to-b from-card to-muted/20 shadow-none">
                    <CardHeader className="pb-4">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <CardTitle className="text-xl flex items-center gap-2 font-bold">
                                    <Package className="w-5 h-5 text-primary" />
                                    Produtos Contratados
                                </CardTitle>
                                <CardDescription>Produtos e serviços ativos neste contrato.</CardDescription>
                            </div>
                            <Button
                                onClick={() => setIsProductModalOpen(true)}
                                className="gap-2 hover:scale-105 transition-transform shadow-none"
                            >
                                <Sparkles className="w-4 h-4" />
                                Gerenciar Produtos
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {client.assignedProductIds && client.assignedProductIds.length > 0 ? (
                                client.assignedProductIds.map((pid) => {
                                    const product = dynamicProducts.find(p => p.id === pid);
                                    const Icon = Package;

                                    return (
                                        <div
                                            key={pid}
                                            className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border/50 hover:border-primary/30 transition-colors group"
                                        >
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center group-hover:bg-primary/10 transition-colors"
                                                style={{ backgroundColor: product?.color ? `${product.color}20` : undefined }}
                                            >
                                                <Icon
                                                    className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors"
                                                    style={{ color: product?.color }}
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold uppercase tracking-widest opacity-40">Produto</span>
                                                <span className="text-sm font-bold truncate max-w-[150px]">
                                                    {product?.name || pid}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="col-span-full py-8 text-center bg-muted/30 rounded-2xl border border-dashed border-border/60">
                                    <p className="text-sm font-medium text-muted-foreground italic">Nenhum serviço atribuído ao escopo.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Comunicacao/WhatsApp removido a pedido */}

                {/* Conexao Shopify — unica integracao que vive na pagina do cliente */}
                <div className="space-y-2">
                    <ConnectionsHub onlyShopify />
                </div>
            </div>

            {/* Modals */}
            <ProductSelectorModal
                clientId={clientId}
                clientName={client.name}
                isOpen={isProductModalOpen}
                onOpenChange={setIsProductModalOpen}
                onProductsAssigned={(products) => {
                    onClientUpdate?.();
                }}
                trigger={<></>}
            />
        </div>
    );
}
