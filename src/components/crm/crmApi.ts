// Camada de dados do modo ligação do CRM: histórico de contato, placar do dia e
// edição de nicho/responsável. A regra de agenda ("quando chamar de novo") vive
// no banco (gatilho crm_atividade_aplicar); a tela só registra o resultado.
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { TeamMember } from "@/hooks/useAgencyTeam";

// crm_lead_activities e as colunas novas de crm_leads ainda não estão no types.ts gerado.
const db = supabase as any;

export const RESULTADOS = {
    nao_atendeu: { rotulo: "Não atendeu", canal: "ligacao", agenda: "tenta de novo amanhã" },
    caixa_postal: { rotulo: "Caixa postal", canal: "ligacao", agenda: "tenta de novo amanhã" },
    pediu_retorno: { rotulo: "Pediu retorno", canal: "ligacao", agenda: "na data que você marcar" },
    interessado: { rotulo: "Interessado", canal: "ligacao", agenda: "vai pra Follow-up, chama amanhã" },
    mensagem_enviada: { rotulo: "Mandei WhatsApp", canal: "whatsapp", agenda: "cobra em 2 dias" },
    respondeu: { rotulo: "Respondeu no WhatsApp", canal: "whatsapp", agenda: "vai pra Contato, chama amanhã" },
    sem_interesse: { rotulo: "Sem interesse", canal: "ligacao", agenda: "vai pro arquivo" },
    numero_errado: { rotulo: "Número errado", canal: "ligacao", agenda: "vai pro arquivo" },
} as const;
export type Resultado = keyof typeof RESULTADOS;

export interface Atividade {
    id: number;
    lead_id: string;
    user_id: string | null;
    channel: "ligacao" | "whatsapp";
    outcome: Resultado;
    note: string | null;
    next_contact_at: string | null;
    created_at: string;
}

const erro = (acao: string, e: { message: string }) => new Error(`${acao}: ${e.message}`);

export const registroSchema = z.object({
    lead_id: z.string().uuid(),
    outcome: z.enum(Object.keys(RESULTADOS) as [Resultado, ...Resultado[]]),
    note: z.string().trim().max(2000, "Anotação muito longa").optional().transform((v) => v || null),
    next_contact_at: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((r) => r.outcome !== "pediu_retorno" || !!r.next_contact_at, { message: "Marque a data do retorno", path: ["next_contact_at"] });

export async function registrarContato(entrada: z.input<typeof registroSchema>) {
    const r = registroSchema.parse(entrada);
    // workspace e autor são definidos no banco (crm_atividade_preparar).
    const { error } = await db.from("crm_lead_activities").insert({
        lead_id: r.lead_id,
        channel: RESULTADOS[r.outcome].canal,
        outcome: r.outcome,
        note: r.note,
        next_contact_at: r.next_contact_at ?? null,
    });
    if (error) throw erro("registrar contato", error);
}

export async function listarAtividades(leadId: string): Promise<Atividade[]> {
    const { data, error } = await db
        .from("crm_lead_activities")
        .select("id, lead_id, user_id, channel, outcome, note, next_contact_at, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(50);
    if (error) throw erro("ler histórico", error);
    return data ?? [];
}

// Contatos registrados hoje (fuso do navegador) no workspace, pro placar.
export async function atividadesDeHoje(workspaceId: string): Promise<Pick<Atividade, "user_id" | "outcome">[]> {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const { data, error } = await db
        .from("crm_lead_activities")
        .select("user_id, outcome")
        .eq("workspace_id", workspaceId)
        .gte("created_at", inicio.toISOString())
        .limit(5000);
    if (error) throw erro("ler placar do dia", error);
    return data ?? [];
}

export const edicaoLeadSchema = z.object({
    segment: z.string().trim().toLowerCase().min(2, "Nicho muito curto").max(40, "Nicho muito longo").nullable().optional(),
    owner_id: z.string().uuid().nullable().optional(),
});

export async function editarLead(id: string, patch: z.input<typeof edicaoLeadSchema>) {
    const dados = edicaoLeadSchema.parse(patch);
    const { error } = await db.from("crm_leads").update(dados).eq("id", id);
    if (error) throw erro("salvar lead", error);
}

export const primeiroNome = (m: TeamMember | undefined) => (m?.profile?.full_name || m?.email || "").trim().split(/[\s@]/)[0] ?? "";

// Mensagem de abertura (o JV aprovou o formato "Aqui é o ____, sócio da NODE", sem travessão).
// Editável na tela antes de abrir o WhatsApp.
export function mensagemInicial({ remetente, negocio, nicho }: { remetente: string; negocio: string; nicho: string | null }) {
    const quem = remetente ? `Aqui é o ${remetente}, sócio da NODE.` : "Aqui é da NODE.";
    if (nicho === "camisas") {
        return `Oi, tudo bem? ${quem} Dei uma olhada na ${negocio} e separei umas ideias pra vender mais camisa pela loja. Posso te mandar?`;
    }
    return `Oi, tudo bem? ${quem} Encontrei a ${negocio} no Google e queria te mostrar como a gente ajuda ${nicho ?? "negócios como o seu"} a trazer mais cliente pela internet. Posso te mandar um exemplo?`;
}
