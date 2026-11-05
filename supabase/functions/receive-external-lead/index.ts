// Recebe o lead da página de oferta da NODE (agencynode.online/oferta), grava no CRM do workspace da
// agência (coluna Lead, 1ª do kanban) e manda o evento Lead pra Meta pela Conversions API, com o mesmo
// event_id que o pixel usou no navegador, pra o Meta contar uma vez só.
//
// Segredos: CRM_WORKSPACE_ID (obrigatório), NODE_LEAD_ORIGINS (origens permitidas, separadas por vírgula),
// NODE_META_PIXEL_ID + NODE_META_CAPI_TOKEN (sem os dois, a CAPI fica desligada e o lead grava do mesmo jeito),
// NODE_META_CAPI_TEST_CODE (só enquanto testa no Gerenciador de Eventos).
import { instrument } from "../_shared/logger.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const ORIGENS = (Deno.env.get("NODE_LEAD_ORIGINS") || "https://www.agencynode.online,https://agencynode.online")
    .split(",").map((s) => s.trim()).filter(Boolean);
// Workspace "Agency Beacon" (o único; dono agencybeaconn). Não é segredo, por isso mora no código; o env sobrepõe se um dia mudar.
const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") || "3cb9ac39-d833-449e-a4ae-77197a5eba3b";
// Conjunto de dados "NODE Agency" criado em 05/11/2026 na BM NODE Agency; id público (vai no código da página).
const PIXEL_ID = Deno.env.get("NODE_META_PIXEL_ID") || "1600687831245451";
const CAPI_TOKEN = Deno.env.get("NODE_META_CAPI_TOKEN") || "";
const CAPI_TEST_CODE = Deno.env.get("NODE_META_CAPI_TEST_CODE") || "";
const TAMANHO_MAX = 8 * 1024;
const LIMITE_POR_IP = 6;
const JANELA_MS = 10 * 60 * 1000;

// Rótulos vivem aqui, não na página: o CRM mostra texto que a NODE controla, mesmo que alguém mande valor inventado.
const ROTULOS = {
    area: {
        "loja-virtual": "Loja virtual",
        "loja-fisica": "Loja física ou atacado",
        "servico": "Clínica, escritório ou estúdio",
        "autonomo": "Profissional autônomo ou criador de conteúdo",
        "outra": "Outra área",
    },
    produtos: {
        "lp": "Página de oferta",
        "site": "Site",
        "loja": "Loja completa",
        "motion": "Vídeos em motion",
        "edicao": "Edição de página ou loja",
    },
    dificuldade: {
        "pagina-nao-vende": "Meu anúncio leva pra uma página que não vende",
        "sem-confianca": "Minha loja ou site não passa confiança",
        "so-indicacao": "Dependo só de indicação e do Instagram",
        "video-nao-chama": "Meus vídeos e anúncios não chamam atenção",
        "outra": "Outra dificuldade",
    },
    faturamento: {
        "0": "Ainda não faturo",
        "ate-10k": "Até R$ 10 mil",
        "10k-30k": "De R$ 10 mil a R$ 30 mil",
        "30k-60k": "De R$ 30 mil a R$ 60 mil",
        "60k-100k": "De R$ 60 mil a R$ 100 mil",
        "100k-mais": "Acima de R$ 100 mil",
    },
    decisor: {
        "sozinho": "Decido tudo sozinho",
        "socio": "Decido com meu sócio",
        "familia": "Decido com meu cônjuge ou família",
        "nao-decido": "Não sou quem decide",
    },
} as const;
const chaves = (o: Record<string, string>) => Object.keys(o) as [string, ...string[]];
const texto = (max: number) => z.string().trim().max(max);

const Lead = z.object({
    area: z.enum(chaves(ROTULOS.area)),
    produtos: z.array(z.enum(chaves(ROTULOS.produtos))).min(1).max(5),
    dificuldade: z.enum(chaves(ROTULOS.dificuldade)),
    faturamento: z.enum(chaves(ROTULOS.faturamento)),
    decisor: z.enum(chaves(ROTULOS.decisor)),
    nome: z.string().trim().min(2).max(80),
    whatsapp: z.string().regex(/^\d{10,11}$/),
    oferta: z.string().trim().min(1).max(60),
    pagina: z.string().url().max(300),
    event_id: z.string().trim().min(8).max(80),
    fbp: texto(120).optional(),
    fbc: texto(300).optional(),
    referrer: texto(300).optional(),
    utm_source: texto(120).optional(),
    utm_medium: texto(120).optional(),
    utm_campaign: texto(200).optional(),
    utm_content: texto(200).optional(),
    utm_term: texto(200).optional(),
    fbclid: texto(300).optional(),
}).strict();
type DadosLead = z.infer<typeof Lead>;

// Freio por IP dentro deste isolado: segura rajada de robô sem precisar de tabela.
const envios = new Map<string, number[]>();
function estourou(ip: string): boolean {
    const agora = Date.now();
    const lista = (envios.get(ip) || []).filter((t) => agora - t < JANELA_MS);
    lista.push(agora);
    envios.set(ip, lista);
    return lista.length > LIMITE_POR_IP;
}

async function sha256(valor: string): Promise<string> {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Lead pela Conversions API: dados pessoais só em hash, event_id igual ao do navegador.
async function enviarCapi(d: DadosLead, ip: string, agente: string): Promise<string> {
    if (!PIXEL_ID || !CAPI_TOKEN) return "capi desligada";
    const partes = d.nome.toLowerCase().split(/\s+/).filter(Boolean);
    const user_data: Record<string, unknown> = {
        ph: [await sha256(`55${d.whatsapp}`)],
        fn: [await sha256(partes[0])],
        country: [await sha256("br")],
        client_user_agent: agente,
    };
    if (partes.length > 1) user_data.ln = [await sha256(partes[partes.length - 1])];
    if (ip) user_data.client_ip_address = ip;
    if (d.fbp) user_data.fbp = d.fbp;
    if (d.fbc) user_data.fbc = d.fbc;
    const corpo: Record<string, unknown> = {
        data: [{
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            event_id: d.event_id,
            event_source_url: d.pagina,
            action_source: "website",
            user_data,
            custom_data: {
                content_name: d.oferta,
                content_category: d.produtos.join(","),
                lead_area: d.area,
                lead_faturamento: d.faturamento,
                lead_decisor: d.decisor,
            },
        }],
        access_token: CAPI_TOKEN,
    };
    if (CAPI_TEST_CODE) corpo.test_event_code = CAPI_TEST_CODE;
    const resposta = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
    });
    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(`CAPI ${resposta.status}: ${JSON.stringify(json).slice(0, 240)}`);
    return `capi ok (${json.events_received ?? "?"} evento)`;
}

// @ts-ignore: Deno global do runtime de Edge Functions
Deno.serve(instrument("receive-external-lead", async (req: Request) => {
    const origem = req.headers.get("origin") || "";
    const permitida = ORIGENS.includes(origem);
    const cabecalhos = {
        "Access-Control-Allow-Origin": permitida ? origem : ORIGENS[0],
        "Vary": "Origin",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
    };
    const responder = (status: number, corpo: Record<string, unknown>) =>
        new Response(JSON.stringify(corpo), { status, headers: cabecalhos });

    if (req.method === "OPTIONS") return new Response(null, { status: permitida ? 204 : 403, headers: cabecalhos });
    if (req.method !== "POST") return responder(405, { erro: "metodo" });
    if (!permitida) return responder(403, { erro: "origem" });
    if (Number(req.headers.get("content-length") || 0) > TAMANHO_MAX) return responder(413, { erro: "tamanho" });

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (estourou(ip || "sem-ip")) return responder(429, { erro: "muitos-envios" });

    let bruto: unknown;
    try { bruto = await req.json(); } catch { return responder(400, { erro: "json" }); }
    const lido = Lead.safeParse(bruto);
    if (!lido.success) return responder(400, { erro: "dados" });
    const d = lido.data;

    if (!WORKSPACE_ID) {
        console.error("receive-external-lead: CRM_WORKSPACE_ID não configurado");
        return responder(500, { erro: "configuracao" });
    }
    const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });

    // Coluna Lead = a primeira do kanban (regra do CRM v2: é a fila de todos).
    const { data: colunas } = await db.from("crm_kanban_columns").select("id, title")
        .eq("workspace_id", WORKSPACE_ID).order("order_index", { ascending: true }).limit(1);
    const coluna = colunas?.[0];
    // Mesma regra do Radar (radar_levar_pro_comercial): status = título da coluna em minúsculas com "_".
    const statusColuna = coluna?.title ? coluna.title.trim().toLowerCase().replace(/\s+/g, "_") : "contato";

    const produtos =d.produtos.map((p) => ROTULOS.produtos[p as keyof typeof ROTULOS.produtos]).join(", ");
    const observacoes = [
        `Veio do anúncio: ${d.oferta} (${new URL(d.pagina).pathname}).`,
        `Área: ${ROTULOS.area[d.area as keyof typeof ROTULOS.area]}`,
        `Quer: ${produtos}`,
        `Maior dificuldade: ${ROTULOS.dificuldade[d.dificuldade as keyof typeof ROTULOS.dificuldade]}`,
        `Faturamento: ${ROTULOS.faturamento[d.faturamento as keyof typeof ROTULOS.faturamento]}`,
        `Quem decide: ${ROTULOS.decisor[d.decisor as keyof typeof ROTULOS.decisor]}`,
        d.utm_campaign ? `Campanha: ${d.utm_campaign}${d.utm_content ? ` / ${d.utm_content}` : ""}` : "",
    ].filter(Boolean).join("\n");

    // Mesmo WhatsApp já no CRM (não arquivado): não duplica o cartão, anota o novo envio e volta pra fila de hoje.
    const { data: existentes } = await db.from("crm_leads").select("id, observations")
        .eq("workspace_id", WORKSPACE_ID).eq("phone", d.whatsapp).is("archived_at", null)
        .order("created_at", { ascending: false }).limit(1);
    const existente = existentes?.[0];
    if (existente) {
        const carimbo = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const { error } = await db.from("crm_leads").update({
            observations: `${existente.observations || ""}\n\nNovo envio pelo anúncio em ${carimbo}:\n${observacoes}`.trim(),
            next_contact_at: new Date().toISOString(),
        }).eq("id", existente.id);
        if (error) { console.error("receive-external-lead: update", error.code); return responder(500, { erro: "gravar" }); }
    } else {
        const { error } = await db.from("crm_leads").insert({
            workspace_id: WORKSPACE_ID,
            name: d.nome,
            phone: d.whatsapp,
            lead_status: statusColuna,
            column_id: coluna?.id ?? null,
            product_interest: produtos,
            offer_detail: d.oferta,
            budget_range: d.faturamento,
            project_type: ROTULOS.area[d.area as keyof typeof ROTULOS.area],
            observations: observacoes,
            landing_page: d.pagina,
            referrer: d.referrer ?? null,
            // Sem UTM no anúncio, a origem fica marcada do mesmo jeito (o Comercial filtra por isso e pela landing_page).
            utm_source: d.utm_source ?? "anuncio-oferta",
            utm_medium: d.utm_medium ?? null,
            utm_campaign: d.utm_campaign ?? null,
            utm_content: d.utm_content ?? null,
            utm_term: d.utm_term ?? null,
        });
        if (error) { console.error("receive-external-lead: insert", error.code); return responder(500, { erro: "gravar" }); }
    }

    // A CAPI nunca derruba o lead: falhou, fica no log e o cartão já está no CRM.
    try {
        console.info("receive-external-lead:", await enviarCapi(d, ip, req.headers.get("user-agent") || ""));
    } catch (erro) {
        console.error("receive-external-lead: capi", (erro as Error).message);
    }
    return responder(200, { ok: true });
}));
