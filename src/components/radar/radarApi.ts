// Camada de dados do Radar de lojas (tabelas radar_* no Supabase).
// O coletor roda no PC do JV (NODE-Radar) e grava eventos, métricas e execuções;
// o app lê tudo isso e edita só lojas, buscas e candidatas. O acesso é decidido
// no banco por radar_can_view() (dono do workspace + allowlist radar_access).
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// As tabelas radar_* ainda não estão no types.ts gerado; o cast fica só aqui.
// Depois de regenerar os tipos (supabase gen types), trocar por `supabase`.
const db = supabase as any;

export interface RadarStore {
    id: string;
    domain: string;
    name: string | null;
    niche: string;
    country: string;
    platform: string;
    meta_page_id: string | null;
    public_catalog: boolean;
    active: boolean;
    source: "manual" | "search" | "leads";
    created_at: string;
}

export interface RadarEvent {
    id: number;
    store_id: string;
    occurred_on: string;
    kind: string;
    title: string;
    detail: Record<string, unknown> | null;
    importance: 1 | 2 | 3;
}

export interface RadarMetric {
    store_id: string;
    day: string;
    products: number | null;
    products_new: number | null;
    products_removed: number | null;
    sold_out: number | null;
    median_price: number | null;
    ads_active: number | null;
    ads_new: number | null;
    ads_stopped: number | null;
    ads_video: number | null;
    ads_image: number | null;
    oldest_ad_days: number | null;
}

export interface RadarRun {
    store_id: string;
    kind: "catalog" | "home" | "ads";
    started_at: string;
    status: "ok" | "error" | "blocked" | "skipped";
    error: string | null;
}

export interface RadarSearch {
    id: number;
    term: string;
    country: string;
    niche: string;
    status: "pending" | "running" | "done" | "error";
    created_at: string;
    finished_at: string | null;
    result: { anuncios_lidos?: number; dominios?: number; candidatas?: number } | null;
    error: string | null;
}

export interface RadarCandidate {
    id: number;
    search_id: number;
    domain: string;
    name: string | null;
    niche: string;
    country: string;
    platform: string;
    ads_active: number | null;
    ads_video: number | null;
    sample_ad: { texto?: string; link?: string; capa?: string; paginas?: string[] } | null;
    public_catalog: boolean | null;
    status: "new" | "added" | "dismissed";
}

// ─── Validação de entrada (UX; o banco valida de novo com CHECK e RLS) ───

const dominioSchema = z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0])
    .pipe(z.string().regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, "Domínio inválido (ex.: loja.com.br)"));

const nichoSchema = z.string().trim().toLowerCase().min(2, "Nicho muito curto").max(40, "Nicho muito longo");
const paisSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "País em 2 letras (BR, US...)");

export const novaLojaSchema = z.object({ domain: dominioSchema, niche: nichoSchema, country: paisSchema });
export const novaBuscaSchema = z.object({
    term: z.string().trim().min(2, "Digite o que buscar").max(80, "Máximo 80 caracteres"),
    niche: nichoSchema,
    country: paisSchema,
});
export type NovaLoja = z.infer<typeof novaLojaSchema>;
export type NovaBusca = z.infer<typeof novaBuscaSchema>;

const erro = (acao: string, e: { message: string }) => new Error(`${acao}: ${e.message}`);

// O PostgREST devolve no máximo 1000 linhas por resposta. Pagina até acabar ou
// até o teto; `truncado` avisa a tela quando o teto cortou resultado.
// `montar` precisa criar um builder novo a cada chamada (builder é de uso único).
const PAGINA = 1000;
async function paginar<T>(acao: string, montar: () => any, teto: number): Promise<{ linhas: T[]; truncado: boolean }> {
    const linhas: T[] = [];
    for (let de = 0; de < teto; de += PAGINA) {
        const ate = Math.min(de + PAGINA, teto) - 1;
        const { data, error } = await montar().range(de, ate);
        if (error) throw erro(acao, error);
        linhas.push(...((data ?? []) as T[]));
        if ((data ?? []).length < ate - de + 1) return { linhas, truncado: false };
    }
    return { linhas, truncado: true };
}

// ─── Acesso ───

export async function podeVerRadar(): Promise<boolean> {
    const { data, error } = await db.rpc("radar_can_view");
    if (error) {
        // Função ausente (migration não aplicada) = sem acesso; o resto é erro real
        // (rede, 5xx) e a tela mostra "tentar de novo" em vez de expulsar o usuário.
        if (error.code === "PGRST202" || /could not find the function|does not exist/i.test(error.message ?? "")) return false;
        throw erro("verificar acesso ao Radar", error);
    }
    return data === true;
}

// ─── Leitura ───

export async function listarLojas(): Promise<RadarStore[]> {
    const { data, error } = await db.from("radar_stores").select("*").order("niche").order("domain");
    if (error) throw erro("listar lojas", error);
    return data ?? [];
}

export interface FiltroEventos {
    desde: string;
    minImportancia?: number;
    storeIds?: string[]; // filtro de nicho (ids das lojas do nicho)
    storeId?: string;
}

// Filtra importância e nicho no servidor (antes do teto), então "30 dias" é 30 dias de verdade.
export async function listarEventos(f: FiltroEventos): Promise<{ eventos: RadarEvent[]; truncado: boolean }> {
    if (f.storeIds && f.storeIds.length === 0) return { eventos: [], truncado: false };
    const montar = () => {
        let q = db
            .from("radar_events")
            .select("id, store_id, occurred_on, kind, title, detail, importance")
            .gte("occurred_on", f.desde)
            .order("occurred_on", { ascending: false })
            .order("importance", { ascending: false })
            .order("id", { ascending: false });
        if (f.minImportancia && f.minImportancia > 1) q = q.gte("importance", f.minImportancia);
        if (f.storeId) q = q.eq("store_id", f.storeId);
        else if (f.storeIds) q = q.in("store_id", f.storeIds);
        return q;
    };
    const { linhas, truncado } = await paginar<RadarEvent>("listar mudanças", montar, f.storeId ? 1000 : 3000);
    return { eventos: linhas, truncado };
}

// Mais recente primeiro: se algum teto cortar, corta o mais antigo, nunca o dia de hoje.
export async function listarMetricas(desde: string, storeId?: string): Promise<RadarMetric[]> {
    const montar = () => {
        let q = db.from("radar_daily_metrics").select("*").gte("day", desde).order("day", { ascending: false }).order("store_id");
        if (storeId) q = q.eq("store_id", storeId);
        return q;
    };
    const { linhas } = await paginar<RadarMetric>("listar métricas", montar, 20000);
    return linhas.sort((a, b) => a.day.localeCompare(b.day));
}

// Última execução de cada loja por tipo (pra mostrar "rodou hoje?" e o motivo da falha).
export async function listarUltimasExecucoes(desde: string): Promise<RadarRun[]> {
    const montar = () =>
        db
            .from("radar_runs")
            .select("store_id, kind, started_at, status, error")
            .gte("started_at", desde)
            .order("started_at", { ascending: false });
    const { linhas } = await paginar<RadarRun>("listar execuções", montar, 10000);
    const vistos = new Set<string>();
    return linhas.filter((r: RadarRun) => {
        const k = `${r.store_id}:${r.kind}`;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
    });
}

export async function listarBuscas(): Promise<RadarSearch[]> {
    const { data, error } = await db
        .from("radar_searches")
        .select("id, term, country, niche, status, created_at, finished_at, result, error")
        .order("created_at", { ascending: false })
        .limit(30);
    if (error) throw erro("listar buscas", error);
    return data ?? [];
}

export async function listarCandidatas(searchId: number): Promise<RadarCandidate[]> {
    const { data, error } = await db
        .from("radar_candidates")
        .select("*")
        .eq("search_id", searchId)
        .order("ads_active", { ascending: false, nullsFirst: false });
    if (error) throw erro("listar candidatas", error);
    return data ?? [];
}

// ─── Escrita ───

export async function adicionarLoja(entrada: NovaLoja, origem: RadarStore["source"] = "manual", nome?: string | null) {
    const loja = novaLojaSchema.parse(entrada);
    const { error } = await db.from("radar_stores").insert({ ...loja, name: nome ?? null, source: origem });
    if (error) {
        if (error.code === "23505") throw new Error(`${loja.domain} já está no Radar`);
        throw erro("adicionar loja", error);
    }
    return loja.domain;
}

export async function alternarLoja(id: string, active: boolean) {
    const { error } = await db.from("radar_stores").update({ active }).eq("id", id);
    if (error) throw erro(active ? "reativar loja" : "pausar loja", error);
}

export async function criarBusca(entrada: NovaBusca) {
    const busca = novaBuscaSchema.parse(entrada);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await db.from("radar_searches").insert({ ...busca, requested_by: auth.user?.id ?? null });
    if (error) throw erro("criar busca", error);
}

// Devolve o que aconteceu, pra tela avisar certo.
export async function acompanharCandidata(c: RadarCandidate): Promise<"adicionada" | "reativada" | "ja_acompanhada"> {
    let resultado: "adicionada" | "reativada" | "ja_acompanhada" = "adicionada";
    try {
        await adicionarLoja({ domain: c.domain, niche: c.niche, country: c.country }, "search", c.name);
    } catch (e) {
        if (!(e instanceof Error) || !/já está no Radar/.test(e.message)) throw e;
        // Já existe: se estava pausada, volta a ser coletada.
        const dominio = novaLojaSchema.shape.domain.parse(c.domain);
        const { data, error } = await db.from("radar_stores").update({ active: true }).eq("domain", dominio).eq("active", false).select("id");
        if (error) throw erro("reativar loja", error);
        resultado = (data ?? []).length ? "reativada" : "ja_acompanhada";
    }
    await marcarCandidata(c.id, "added");
    return resultado;
}

export async function marcarCandidata(id: number, status: RadarCandidate["status"]) {
    const { error } = await db.from("radar_candidates").update({ status }).eq("id", id);
    if (error) throw erro("atualizar candidata", error);
}
