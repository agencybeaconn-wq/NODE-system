// Recebe o lead da página de oferta da NODE (agencynode.online/oferta), grava no CRM do workspace da
// agência (coluna Lead, 1ª do kanban) e manda o evento Lead pra Meta pela Conversions API, com o mesmo
// event_id que o pixel usou no navegador, pra o Meta contar uma vez só.
//
// Config por env (nada disso é obrigatório pra gravar o lead):
//   CRM_WORKSPACE_ID        sobrepõe o workspace fixo abaixo
//   NODE_LEAD_ORIGINS       origens permitidas, separadas por vírgula (CORS; não é autenticação)
//   NODE_META_PIXEL_ID      sobrepõe o conjunto de dados fixo abaixo
//   NODE_META_CAPI_TOKEN    token da Conversions API; sem ele a CAPI fica desligada
//   NODE_META_CAPI_TEST_CODE  código do "Testar eventos" do Gerenciador de Eventos, só enquanto testa
//   TURNSTILE_SECRET        segredo do Cloudflare Turnstile; com ele, todo envio precisa do token do desafio
//                           (a página liga o widget pelo data-turnstile no <html>; os dois entram juntos)
import { instrument } from "../_shared/logger.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const ORIGENS = (Deno.env.get("NODE_LEAD_ORIGINS") || "https://www.agencynode.online,https://agencynode.online")
    .split(",").map((s) => s.trim()).filter(Boolean);
// Workspace "Agency Beacon" (o único; dono agencybeaconn). Não é segredo, por isso mora no código.
const WORKSPACE_ID = Deno.env.get("CRM_WORKSPACE_ID") || "3cb9ac39-d833-449e-a4ae-77197a5eba3b";
// Conjunto de dados "NODE Agency" criado em 05/11/2026 na BM NODE Agency; id público (vai no código da página).
const PIXEL_ID = Deno.env.get("NODE_META_PIXEL_ID") || "1600687831245451";
const CAPI_TOKEN = Deno.env.get("NODE_META_CAPI_TOKEN") || "";
const CAPI_TEST_CODE = Deno.env.get("NODE_META_CAPI_TEST_CODE") || "";
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") || "";
const TAMANHO_MAX = 8 * 1024;
const LIMITE_POR_IP = 6;
const JANELA_MS = 10 * 60 * 1000;
const JANELA_REENVIO_MS = 30 * 60 * 1000;
const TETO_OBSERVACOES = 6000;
const MARCA_REENVIO = "Novo envio pelo anúncio";

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
// Faixa da página → vocabulário do campo "Faturamento" (revenue) do modal do CRM.
const REVENUE: Record<string, string> = {
    "0": "Ate 50k", "ate-10k": "Ate 50k", "10k-30k": "Ate 50k", "30k-60k": "Ate 50k",
    "60k-100k": "50k-200k", "100k-mais": "50k-200k",
};
const chaves = (o: Record<string, string>) => Object.keys(o) as [string, ...string[]];
const rotulo = (grupo: keyof typeof ROTULOS, valor: string) => (ROTULOS[grupo] as Record<string, string>)[valor];
// Nada de caractere de controle: o texto vai parar nas observações do cartão como se fosse anotação da equipe.
const limpar = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const texto = (max: number) => z.string().max(max).transform(limpar);
const digitos = (s: string) => s.replace(/\D/g, "");

const Lead = z.object({
    area: z.enum(chaves(ROTULOS.area)),
    produtos: z.array(z.enum(chaves(ROTULOS.produtos))).min(1).max(5),
    dificuldade: z.enum(chaves(ROTULOS.dificuldade)),
    faturamento: z.enum(chaves(ROTULOS.faturamento)),
    decisor: z.enum(chaves(ROTULOS.decisor)),
    nome: texto(80).pipe(z.string().min(2)),
    // Aceita o 55 na frente (quem cola o número com DDI) e guarda só DDD + número.
    whatsapp: z.string().regex(/^(55)?\d{10,11}$/).transform((v) => v.replace(/^55(?=\d{10,11}$)/, "")),
    oferta: texto(60).pipe(z.string().min(1)),
    // Só a nossa própria página pode ser a origem; nada de javascript: nem domínio alheio em landing_page.
    pagina: z.string().url().max(300).refine((u) => { try { return ORIGENS.includes(new URL(u).origin); } catch { return false; } }),
    event_id: texto(80).pipe(z.string().min(8)),
    fbp: texto(120).optional(),
    fbc: texto(300).optional(),
    referrer: texto(300).optional(),
    utm_source: texto(120).optional(),
    utm_medium: texto(120).optional(),
    utm_campaign: texto(200).optional(),
    utm_content: texto(200).optional(),
    utm_term: texto(200).optional(),
    fbclid: texto(300).optional(),
    turnstile: z.string().min(20).max(2048).optional(),
    site_empresa: z.string().max(200).optional(), // campo-armadilha da página: preenchido = robô
}).strict();
type DadosLead = z.infer<typeof Lead>;

// Freio por IP dentro deste isolado: segura rajada sem precisar de tabela (cada isolado tem o seu contador).
const envios = new Map<string, number[]>();
function estourou(ip: string): boolean {
    const agora = Date.now();
    const lista = (envios.get(ip) || []).filter((t) => agora - t < JANELA_MS);
    lista.push(agora);
    envios.set(ip, lista);
    return lista.length > LIMITE_POR_IP;
}

// IP de quem chamou: a Cloudflare na frente da função põe o real em cf-connecting-ip; o x-forwarded-for
// que o cliente manda fica no começo da lista, e o anexado pelo gateway no fim.
function ipDe(req: Request): string {
    const cf = (req.headers.get("cf-connecting-ip") || "").trim();
    if (cf) return cf;
    return (req.headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean).pop() || "";
}

async function verificarDesafio(token: string | undefined, ip: string): Promise<boolean> {
    if (!TURNSTILE_SECRET) return true;
    if (!token) return false;
    const corpo = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
    if (ip) corpo.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: corpo });
    const j = await r.json().catch(() => ({}));
    return j.success === true;
}

async function sha256(valor: string): Promise<string> {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Lead pela Conversions API: dados pessoais só em hash, event_id igual ao do navegador.
async function enviarCapi(d: DadosLead, ip: string, agente: string): Promise<string> {
    if (!PIXEL_ID || !CAPI_TOKEN) return "capi desligada";
    // Meta pede nome em minúsculas, sem pontuação (acento pode); "Dr." e afins não são nome.
    const partes = d.nome.toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, "").split(/\s+/)
        .filter((p) => p && !["dr", "dra", "sr", "sra", "prof", "profa"].includes(p));
    const user_data: Record<string, unknown> = {
        ph: [await sha256(`55${d.whatsapp}`)],
        country: [await sha256("br")],
        client_user_agent: agente,
    };
    if (partes[0]) user_data.fn = [await sha256(partes[0])];
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

    const ip = ipDe(req);
    if (estourou(ip || "sem-ip")) return responder(429, { erro: "muitos-envios" });

    let bruto: unknown;
    try { bruto = await req.json(); } catch { return responder(400, { erro: "json" }); }
    const lido = Lead.safeParse(bruto);
    if (!lido.success) return responder(400, { erro: "dados" });
    const d = lido.data;

    // Robô que preencheu o campo escondido recebe "ok" e nada é gravado.
    if (d.site_empresa) return responder(200, { ok: true });
    if (!(await verificarDesafio(d.turnstile, ip))) return responder(403, { erro: "desafio" });

    const db = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });

    // Coluna Lead = a primeira do kanban (regra do CRM v2: é a fila de todos).
    const { data: colunas } = await db.from("crm_kanban_columns").select("id, title")
        .eq("workspace_id", WORKSPACE_ID).order("order_index", { ascending: true }).limit(1);
    const coluna = colunas?.[0];
    // Mesma regra do Radar (radar_levar_pro_comercial): status = título da coluna em minúsculas com "_".
    const statusColuna = coluna?.title ? coluna.title.trim().toLowerCase().replace(/\s+/g, "_") : "contato";

    const url = new URL(d.pagina);
    const produtos = d.produtos.map((p) => rotulo("produtos", p)).join(", ");
    const observacoes = [
        `Veio do anúncio: ${d.oferta} (${url.pathname}).`,
        `Área: ${rotulo("area", d.area)}`,
        `Quer: ${produtos}`,
        `Maior dificuldade: ${rotulo("dificuldade", d.dificuldade)}`,
        `Faturamento: ${rotulo("faturamento", d.faturamento)}`,
        `Quem decide: ${rotulo("decisor", d.decisor)}`,
        d.utm_campaign ? `Campanha: ${d.utm_campaign}${d.utm_content ? ` / ${d.utm_content}` : ""}` : "",
    ].filter(Boolean).join("\n");
    // "radar-clientes" é marca interna do Radar: não pode vir do cliente.
    const utmSource = d.utm_source && d.utm_source !== "radar-clientes" ? d.utm_source : "anuncio-oferta";

    // Mesmo WhatsApp já no CRM (não arquivado)? O telefone lá é texto livre ("(31) 99519-4872"), então o
    // banco filtra pelos 4 últimos dígitos e a comparação de verdade é por dígitos aqui.
    const { data: candidatos } = await db.from("crm_leads").select("id, phone, observations, next_contact_at")
        .eq("workspace_id", WORKSPACE_ID).is("archived_at", null).like("phone", `%${d.whatsapp.slice(-4)}%`)
        .order("created_at", { ascending: false }).limit(20);
    const existente = (candidatos || []).find((c) => digitos(c.phone || "").endsWith(d.whatsapp));

    if (existente) {
        const agora = new Date();
        const anterior = existente.observations || "";
        // Reenvio em menos de 30 min não escreve de novo (segura script batendo no mesmo número).
        const ultimo = [...anterior.matchAll(new RegExp(`${MARCA_REENVIO} \\((\\d{4}-\\d{2}-\\d{2}T[^)]+)\\)`, "g"))].pop();
        if (ultimo && agora.getTime() - Date.parse(ultimo[1]) < JANELA_REENVIO_MS) return responder(200, { ok: true });
        const patch: Record<string, unknown> = {};
        if (anterior.length <= TETO_OBSERVACOES) {
            const legivel = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
            patch.observations = `${anterior}\n\n${MARCA_REENVIO} (${agora.toISOString()}) em ${legivel}:\n${observacoes}`.trim();
        }
        // Volta pra fila de hoje só se o cartão não estava já vencido na fila (não fura a ordem de quem espera).
        if (!existente.next_contact_at || Date.parse(existente.next_contact_at) > agora.getTime()) patch.next_contact_at = agora.toISOString();
        if (Object.keys(patch).length) {
            const { error } = await db.from("crm_leads").update(patch).eq("id", existente.id);
            if (error) { console.error("receive-external-lead: update", error.code); return responder(500, { erro: "gravar" }); }
        }
    } else {
        const { error } = await db.from("crm_leads").insert({
            workspace_id: WORKSPACE_ID,
            name: d.nome,
            phone: d.whatsapp,
            lead_status: statusColuna,
            column_id: coluna?.id ?? null,
            product_interest: produtos,
            project_type: d.area,
            revenue: REVENUE[d.faturamento] ?? null,
            observations: observacoes,
            landing_page: `${url.origin}${url.pathname}`,
            referrer: d.referrer ?? null,
            utm_source: utmSource,
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
