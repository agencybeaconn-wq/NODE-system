// Camada de dados do Radar de clientes (possíveis clientes da NODE).
// Tabelas radar_prospects e radar_prospect_searches, mesmo acesso do Radar
// (radar_can_view). A busca no Google Maps é uma fila: o app enfileira e o
// coletor NODE-Radar, no PC, lê o Maps no navegador (sem API paga).
// O acompanhamento de contato vive no kanban do Comercial: "Levar pro Comercial"
// cria o lead lá e marca o prospect.
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { RadarCandidate } from "./radarApi";

// Tabelas novas ainda fora do types.ts gerado (mesmo motivo do radarApi).
const db = supabase as any;

export const SERVICOS = {
    loja: "Loja virtual",
    lp: "Landing page",
    site: "Site",
    criativo: "Criativo",
    motion: "Vídeo motion",
    funil: "Funil de venda",
    trafego: "Tráfego pago",
    ia: "Treinamento de IA",
    app: "App",
    sistema: "Sistema sob medida",
} as const;
export type Servico = keyof typeof SERVICOS;

export const STATUS_PROSPECT = {
    novo: "Novo",
    qualificado: "Qualificado",
    no_comercial: "No Comercial",
    descartado: "Descartado",
} as const;
export type StatusProspect = keyof typeof STATUS_PROSPECT;

export const TIPO_SITE = {
    none: "Sem site",
    social: "Só rede ou plataforma",
    builder: "Site de construtor",
    own: "Site próprio",
    unknown: "A confirmar",
} as const;
export type TipoSite = keyof typeof TIPO_SITE;

// Tipos de negócio com termo pronto pra busca no Google. O termo é editável.
export const SEGMENTOS_SUGERIDOS: Record<string, string> = {
    dentista: "clínica odontológica",
    "estética": "clínica de estética",
    "harmonização": "harmonização facial",
    advogado: "escritório de advocacia",
    contabilidade: "escritório de contabilidade",
    restaurante: "restaurante",
    hamburgueria: "hamburgueria",
    "confeitaria": "confeitaria",
    academia: "academia",
    "salão de beleza": "salão de beleza",
    barbearia: "barbearia",
    "moda feminina": "loja de roupas femininas",
    "calçados": "loja de calçados",
    "ótica": "ótica",
    "pet shop": "pet shop",
    "imobiliária": "imobiliária",
    "oficina": "oficina mecânica",
    "escola": "escola de idiomas",
    "tatuagem": "estúdio de tatuagem",
    "fotografia": "fotógrafo",
};

export interface RadarProspect {
    id: string;
    name: string;
    segment: string;
    category: string | null;
    city: string | null;
    address: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    domain: string | null;
    site_kind: TipoSite;
    instagram: string | null;
    google_place_id: string | null;
    maps_url: string | null;
    rating: number | null;
    reviews: number | null;
    ads_active: number | null;
    services: Servico[];
    status: StatusProspect;
    score: number | null;
    notes: string | null;
    source: "google" | "anuncios" | "manual";
    search_id: number | null;
    crm_lead_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface BuscaGoogle {
    id: number;
    query: string;
    city: string;
    segment: string;
    country: string;
    status: "pending" | "running" | "done" | "error";
    max_results: number;
    // Enquanto roda: em_andamento, lidos, total. Pronta: as contagens.
    result: {
        encontrados?: number; novos?: number; ja_existiam?: number; fechados?: number; sem_site?: number; so_rede?: number;
        construtor?: number; falhas?: number; parcial?: boolean; em_andamento?: boolean; lidos?: number; total?: number;
    } | null;
    error: string | null;
    created_at: string;
}

// ─── Validação (UX; o banco valida de novo com CHECK e RLS, a edge function com Zod) ───

const segmentoSchema = z.string().trim().toLowerCase().min(2, "Nicho muito curto").max(40, "Nicho muito longo");
const servicosSchema = z.array(z.enum(Object.keys(SERVICOS) as [Servico, ...Servico[]]));

export const buscaGoogleSchema = z.object({
    query: z.string().trim().min(2, "Digite o tipo de negócio").max(80, "Máximo 80 caracteres"),
    city: z.string().trim().min(2, "Digite a cidade").max(80, "Máximo 80 caracteres"),
    segment: segmentoSchema,
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    max_results: z.number().int().min(5).max(120),
});
export type NovaBuscaGoogle = z.infer<typeof buscaGoogleSchema>;

export const edicaoProspectSchema = z.object({
    services: servicosSchema.optional(),
    status: z.enum(Object.keys(STATUS_PROSPECT) as [StatusProspect, ...StatusProspect[]]).optional(),
    notes: z.string().max(5000, "Anotação muito longa").nullable().optional(),
    segment: segmentoSchema.optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    instagram: z.string().trim().max(80).nullable().optional(),
});

export const novoProspectSchema = z.object({
    name: z.string().trim().min(1, "Dê um nome").max(200),
    segment: segmentoSchema,
    city: z.string().trim().max(80).optional().transform((v) => v || null),
    phone: z.string().trim().max(40).optional().transform((v) => v || null),
    website: z.string().trim().max(300).optional().transform((v) => v || null),
    instagram: z.string().trim().max(80).optional().transform((v) => v || null),
    services: servicosSchema,
});
export type NovoProspect = z.input<typeof novoProspectSchema>;

const erro = (acao: string, e: { message: string }) => new Error(`${acao}: ${e.message}`);

// ─── Leitura ───

const PAGINA = 1000;
export async function listarProspects(): Promise<RadarProspect[]> {
    const linhas: RadarProspect[] = [];
    for (let de = 0; de < 20000; de += PAGINA) {
        const { data, error } = await db
            .from("radar_prospects")
            .select("*")
            .order("score", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .range(de, de + PAGINA - 1);
        if (error) {
            if (/radar_prospects|does not exist|PGRST205/i.test(error.message ?? "")) return []; // banco ainda sem a v3
            throw erro("listar possíveis clientes", error);
        }
        linhas.push(...(data ?? []));
        if ((data ?? []).length < PAGINA) break;
    }
    return linhas.map((p) => ({ ...p, rating: p.rating == null ? null : Number(p.rating), services: p.services ?? [] }));
}

export async function listarBuscasGoogle(): Promise<BuscaGoogle[]> {
    const { data, error } = await db
        .from("radar_prospect_searches")
        .select("id, query, city, segment, country, status, max_results, result, error, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
    if (error) {
        if (/radar_prospect_searches|does not exist|PGRST205/i.test(error.message ?? "")) return [];
        throw erro("listar buscas no Google", error);
    }
    return data ?? [];
}

// ─── Escrita ───

// Enfileira; o coletor pega em até 10 minutos (o PC precisa estar ligado).
export async function enfileirarBuscaMaps(entrada: NovaBuscaGoogle) {
    const busca = buscaGoogleSchema.parse(entrada);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await db.from("radar_prospect_searches").insert({ ...busca, requested_by: auth.user?.id ?? null });
    if (error) throw erro("enfileirar busca no Maps", error);
}

export async function editarProspect(id: string, patch: z.input<typeof edicaoProspectSchema>) {
    const dados = edicaoProspectSchema.parse(patch);
    const { error } = await db.from("radar_prospects").update(dados).eq("id", id);
    if (error) throw erro("salvar possível cliente", error);
}

const dominioDe = (url: string | null) => {
    if (!url) return null;
    const host = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
    return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host) ? host : null;
};

const duplicado = (e: { code?: string }, nome: string) => (e.code === "23505" ? new Error(`${nome} já está na lista`) : null);

export async function criarProspect(entrada: NovoProspect) {
    const p = novoProspectSchema.parse(entrada);
    const instagram = p.instagram ? `@${p.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "")}` : null;
    const dominio = dominioDe(p.website);
    const { error } = await db.from("radar_prospects").insert({
        ...p,
        instagram,
        domain: dominio,
        site_kind: p.website ? "own" : instagram ? "social" : "none",
        source: "manual",
    });
    if (error) throw duplicado(error, p.name) ?? erro("adicionar possível cliente", error);
}

// Loja achada na Biblioteca de Anúncios vira possível cliente (já anuncia: criativo, funil, tráfego).
export async function prospectDeCandidata(c: RadarCandidate) {
    const { error } = await db.from("radar_prospects").insert({
        name: (c.name || c.domain).slice(0, 200),
        segment: c.niche,
        country: c.country,
        website: `https://${c.domain}`,
        domain: c.domain,
        site_kind: "own",
        ads_active: c.ads_active,
        services: ["criativo", "motion", "funil"],
        source: "anuncios",
    });
    if (error) throw duplicado(error, c.domain) ?? erro("virar possível cliente", error);
}

// Cria o lead no kanban do Comercial (primeira coluna do workspace) e marca o prospect.
export async function levarProComercial(p: RadarProspect, workspaceId: string) {
    const { data: colunas, error: erroCol } = await db
        .from("crm_kanban_columns")
        .select("id, title")
        .eq("workspace_id", workspaceId)
        .order("order_index", { ascending: true })
        .limit(1);
    if (erroCol) throw erro("ler colunas do Comercial", erroCol);
    const coluna = colunas?.[0];
    const servicos = p.services.map((s) => SERVICOS[s]).join(", ");
    const linhas = [
        `Veio do Radar de clientes (${p.segment}${p.city ? `, ${p.city}` : ""}).`,
        `Presença: ${TIPO_SITE[p.site_kind]}${p.website ? ` (${p.website})` : ""}.`,
        p.reviews != null ? `Google: ${p.rating ?? "–"} estrelas, ${p.reviews} avaliações.` : null,
        p.instagram ? `Instagram: ${p.instagram}` : null,
        p.maps_url ? `Maps: ${p.maps_url}` : null,
        p.notes ? `\n${p.notes}` : null,
    ].filter(Boolean);
    const { data: lead, error } = await supabase
        .from("crm_leads")
        .insert({
            workspace_id: workspaceId,
            name: p.name.slice(0, 200),
            store_name: p.name.slice(0, 200),
            phone: p.phone,
            site_url: p.website,
            product_interest: servicos || null,
            lead_score: p.score != null ? String(p.score) : null,
            observations: linhas.join("\n"),
            utm_source: "radar-clientes",
            ...(coluna ? { column_id: coluna.id, lead_status: coluna.title.toLowerCase().replace(/\s+/g, "_") } : {}),
        } as any)
        .select("id")
        .single();
    if (error) throw erro("criar lead no Comercial", error);
    const { error: erroMarca } = await db.from("radar_prospects").update({ status: "no_comercial", crm_lead_id: lead.id }).eq("id", p.id);
    if (erroMarca) throw erro("marcar possível cliente", erroMarca);
}
