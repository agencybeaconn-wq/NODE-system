// Camada de dados do Radar de lojas (tabelas radar_* no Supabase).
// O coletor roda no PC do JV (NODE-Radar) e grava eventos, métricas e execuções;
// o app lê tudo isso e edita só lojas, buscas e candidatas. O acesso é decidido
// no banco por radar_can_view() (só quem está na allowlist radar_access).
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
    notes: string | null;
    rating: number | null;
    potential: number | null;
    potential_detail: PotencialDetalhe | null;
    profile: PerfilLoja | null;
    profile_at: string | null;
    tag_ids: number[];
}

// ─── Perfil montado pelo coletor (NODE-Radar/lib/perfil.mjs) ───

export type NivelPotencial = "alto" | "medio" | "baixo" | "sem_dados";

export interface ComponentePotencial {
    rotulo: string;
    max: number;
    valor: number | null;
    pontos: number | null;
    disponivel: boolean;
}

export interface PotencialDetalhe {
    score: number | null;
    nivel: NivelPotencial;
    parcial: boolean;
    anuncios_capturados_em?: string | null;
    anuncios_desatualizados?: boolean;
    componentes: Record<string, ComponentePotencial>;
}

export interface ProdutoPerfil {
    handle: string | null;
    titulo: string;
    preco: number | null;
    de?: number | null;
    img: string | null;
    url: string | null;
    disponivel?: boolean | null;
    anuncios?: number;
    tipo?: "produto" | "colecao" | "home" | "pagina" | "externo";
}

export interface AnuncioPerfil {
    id: string;
    inicio: string | null;
    dias: number | null;
    midia: "video" | "img" | "?";
    capa: string | null;
    texto: string | null;
    link: string | null;
    variantes?: number;
}

export interface PerfilLoja {
    atualizado_em: string;
    titulo: string | null;
    descricao: string | null;
    avisos: string[];
    destaques_home: string[];
    tema: { nome?: string; schema?: string; versao?: string } | null;
    checkout: string | null;
    moeda?: string | null;
    apps: string[];
    sinais: Record<"pixel_meta" | "checkout_otimizado" | "avaliacoes" | "email_crm" | "whatsapp", boolean>;
    catalogo: {
        total: number | null;
        lidos: number;
        truncado: boolean;
        preco_mediano: number | null;
        preco_min: number | null;
        preco_max: number | null;
        esgotados: number;
        com_desconto: number;
        novos_30d: number | null;
    } | null;
    anuncios: {
        ativos: number;
        criativos?: number;
        video: number;
        imagem: number;
        vencedores: number;
        novos_7d: number | null;
        crescimento_7d: number | null;
        mais_antigo_dias: number | null;
        total_informado: number | null;
        capturado_em?: string | null;
        desatualizado?: boolean;
    } | null;
    mais_vendidos: ProdutoPerfil[] | null;
    mais_vendidos_em?: string | null;
    mais_anunciados: ProdutoPerfil[];
    anuncios_destaque: AnuncioPerfil[];
}

export interface RadarTag {
    id: number;
    name: string;
    color: string;
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
    // Enquanto roda, o coletor grava o progresso aqui (em_andamento, etapa, termo, cartoes).
    result: {
        anuncios_lidos?: number; dominios?: number; candidatas?: number; parcial?: boolean;
        em_andamento?: boolean; etapa?: string; termo?: string; termo_n?: number; termos?: number; cartoes?: number;
    } | null;
    started_at?: string | null;
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
    type Linha = RadarStore & { radar_store_tags?: { tag_id: number }[] };
    const comTags = () => db.from("radar_stores").select("*, radar_store_tags(tag_id)").order("niche").order("domain");
    let linhas: Linha[];
    try {
        linhas = (await paginar<Linha>("listar lojas", comTags, 20000)).linhas;
    } catch (e) {
        // Banco ainda sem a v2 (tags): lista as lojas sem tags em vez de quebrar a tela.
        if (!(e instanceof Error) || !/radar_store_tags|relationship|PGRST200/i.test(e.message)) throw e;
        const semTags = () => db.from("radar_stores").select("*").order("niche").order("domain");
        linhas = (await paginar<Linha>("listar lojas", semTags, 20000)).linhas;
    }
    return linhas.map(({ radar_store_tags, ...s }) => ({
        ...s,
        notes: s.notes ?? null,
        rating: s.rating ?? null,
        potential: s.potential ?? null,
        potential_detail: s.potential_detail ?? null,
        profile: s.profile ?? null,
        profile_at: s.profile_at ?? null,
        tag_ids: (radar_store_tags ?? []).map((t) => t.tag_id),
    }));
}

export async function listarTags(): Promise<RadarTag[]> {
    const { data, error } = await db.from("radar_tags").select("id, name, color").order("name");
    if (error) {
        if (/radar_tags|does not exist|PGRST205/i.test(error.message ?? "")) return []; // banco ainda sem a v2
        throw erro("listar tags", error);
    }
    return data ?? [];
}

// Todos os anúncios ativos da loja (último snapshot), pra galeria da ficha.
export async function listarAnunciosDaLoja(storeId: string): Promise<AnuncioPerfil[]> {
    const { data, error } = await db.from("radar_snapshots").select("data, captured_at").eq("store_id", storeId).eq("kind", "ads").maybeSingle();
    if (error) throw erro("ler anúncios da loja", error);
    const anuncios = (data?.data?.anuncios ?? {}) as Record<string, { s: string | null; m: AnuncioPerfil["midia"]; l: string; b: string; n: number; c: string }>;
    // Dias contados na data da coleta, com a mesma conta do coletor: bate com "Rodando 30+ dias".
    const hoje = data?.captured_at ? new Date(data.captured_at).getTime() : Date.now();
    return Object.entries(anuncios)
        .map(([id, a]) => ({
            id,
            inicio: a.s,
            dias: a.s ? Math.floor((hoje - new Date(a.s).getTime()) / 864e5) : null,
            midia: a.m,
            capa: a.c || null,
            texto: a.b || null,
            link: a.l || null,
            variantes: a.n,
        }))
        .sort((x, y) => (y.dias ?? -1) - (x.dias ?? -1));
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
        .select("id, term, country, niche, status, created_at, started_at, finished_at, result, error")
        .order("created_at", { ascending: false })
        .limit(30);
    if (error) throw erro("listar buscas", error);
    return data ?? [];
}

// Sem teto: a busca traz todas as lojas que apareceram.
export async function listarCandidatas(searchId: number): Promise<RadarCandidate[]> {
    const montar = () =>
        db.from("radar_candidates").select("*").eq("search_id", searchId).order("ads_active", { ascending: false, nullsFirst: false }).order("id");
    const { linhas } = await paginar<RadarCandidate>("listar candidatas", montar, 50000);
    return linhas;
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

// Edição manual da loja pelos sócios (nota, anotação, nicho).
export const edicaoLojaSchema = z.object({
    rating: z.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(5000, "Anotação muito longa").nullable().optional(),
    niche: nichoSchema.optional(),
});
export async function editarLoja(id: string, patch: z.infer<typeof edicaoLojaSchema>) {
    const dados = edicaoLojaSchema.parse(patch);
    const { error } = await db.from("radar_stores").update(dados).eq("id", id);
    if (error) throw erro("salvar loja", error);
}

// ─── Tags ───

export const CORES_TAG = ["#71717a", "#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#db2777", "#0891b2"];

export const tagSchema = z.object({
    name: z.string().trim().min(1, "Dê um nome à tag").max(40, "Máximo 40 caracteres"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function criarTag(entrada: z.infer<typeof tagSchema>): Promise<RadarTag> {
    const tag = tagSchema.parse(entrada);
    const { data, error } = await db.from("radar_tags").insert(tag).select("id, name, color").single();
    if (error) {
        if (error.code === "23505") throw new Error(`Já existe a tag "${tag.name}"`);
        throw erro("criar tag", error);
    }
    return data;
}

export async function editarTag(id: number, entrada: z.infer<typeof tagSchema>) {
    const tag = tagSchema.parse(entrada);
    const { error } = await db.from("radar_tags").update(tag).eq("id", id);
    if (error) {
        if (error.code === "23505") throw new Error(`Já existe a tag "${tag.name}"`);
        throw erro("editar tag", error);
    }
}

export async function apagarTag(id: number) {
    const { error } = await db.from("radar_tags").delete().eq("id", id);
    if (error) throw erro("apagar tag", error);
}

export async function alternarTagDaLoja(storeId: string, tagId: number, ligar: boolean) {
    const q = ligar
        ? db.from("radar_store_tags").upsert({ store_id: storeId, tag_id: tagId }, { onConflict: "store_id,tag_id", ignoreDuplicates: true })
        : db.from("radar_store_tags").delete().eq("store_id", storeId).eq("tag_id", tagId);
    const { error } = await q;
    if (error) throw erro(ligar ? "colocar tag" : "tirar tag", error);
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
