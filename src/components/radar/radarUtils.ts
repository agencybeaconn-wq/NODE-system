import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { RadarMetric, RadarRun } from "./radarApi";

// Nichos com termos sugeridos pra busca na Biblioteca de Anúncios.
// Vários termos separados por ";" somam resultados.
export const NICHOS_SUGERIDOS: Record<string, string> = {
    camisas: "camisa de time; camisa de futebol",
    pet: "caminha pet; cama para cachorro; brinquedo para cachorro",
    modeladores: "cinta modeladora; calcinha modeladora",
    skincare: "sérum facial; protetor solar facial; skincare",
    cabelo: "cronograma capilar; kit capilar; máscara capilar",
    suplementos: "creatina; whey protein",
    "relógios": "relógio masculino; relógio feminino",
    "óculos": "óculos de sol; óculos de grau",
    "moda feminina": "vestido longo; conjunto feminino; moda feminina",
    "calçados": "tênis feminino; tênis masculino; sandália feminina",
    "casa e cozinha": "air fryer; organizador de cozinha; utensílios de cozinha",
    "bebê": "enxoval de bebê; roupinha de bebê",
    semijoias: "semijoias; joias banhadas a ouro; pulseira feminina",
};

export const PAISES = [
    { value: "BR", label: "Brasil" },
    { value: "US", label: "Estados Unidos" },
    { value: "PT", label: "Portugal" },
    { value: "ES", label: "Espanha" },
    { value: "MX", label: "México" },
    { value: "GB", label: "Reino Unido" },
];

export const PLATAFORMAS: Record<string, string> = {
    shopify: "Shopify",
    nuvemshop: "Nuvemshop",
    yampi: "Yampi",
    cartpanda: "CartPanda",
    woocommerce: "WooCommerce",
    vtex: "VTEX",
    tray: "Tray",
    lojaintegrada: "Loja Integrada",
    wix: "Wix",
    magento: "Magento",
    other: "Outra",
    unknown: "A detectar",
};

export const diasAtras = (n: number) => format(subDays(new Date(), n), "yyyy-MM-dd");

export const dataCurta = (iso: string) => format(parseISO(iso), "dd/MM", { locale: ptBR });

export const dataLonga = (iso: string) => format(parseISO(iso), "EEEE, dd 'de' MMMM", { locale: ptBR });

export const dataHora = (iso: string) => format(parseISO(iso), "dd/MM HH:mm", { locale: ptBR });

export interface ResumoLoja {
    products: number | null;
    productsDelta: number | null;
    ads: number | null;
    adsDelta: number | null;
    adsVideo: number | null;
    oldestAdDays: number | null;
}

// Último valor conhecido e a variação contra ~7 dias antes (ou o mais antigo disponível).
function ultimoEDelta(linhas: RadarMetric[], campo: "products" | "ads_active") {
    const com = linhas.filter((m) => m[campo] != null);
    if (!com.length) return { valor: null, delta: null };
    const ultimo = com[com.length - 1];
    const limite = format(subDays(parseISO(ultimo.day), 7), "yyyy-MM-dd");
    const base = com.find((m) => m.day >= limite) ?? com[0];
    const valor = ultimo[campo] as number;
    return { valor, delta: base === ultimo ? null : valor - (base[campo] as number) };
}

export function resumirMetricas(metricas: RadarMetric[]): Map<string, ResumoLoja> {
    const porLoja = new Map<string, RadarMetric[]>();
    for (const m of metricas) {
        const l = porLoja.get(m.store_id) ?? [];
        l.push(m);
        porLoja.set(m.store_id, l);
    }
    const saida = new Map<string, ResumoLoja>();
    for (const [id, linhas] of porLoja) {
        linhas.sort((a, b) => a.day.localeCompare(b.day));
        const p = ultimoEDelta(linhas, "products");
        const a = ultimoEDelta(linhas, "ads_active");
        const ultimoAds = [...linhas].reverse().find((m) => m.ads_active != null);
        saida.set(id, {
            products: p.valor,
            productsDelta: p.delta,
            ads: a.valor,
            adsDelta: a.delta,
            adsVideo: ultimoAds?.ads_video ?? null,
            oldestAdDays: ultimoAds?.oldest_ad_days ?? null,
        });
    }
    return saida;
}

// Pior status entre as últimas execuções da loja (erro > bloqueio > pulado > ok).
export function statusColeta(runs: RadarRun[]): { status: RadarRun["status"] | "never"; quando: string | null; erro: string | null } {
    if (!runs.length) return { status: "never", quando: null, erro: null };
    const ordem: RadarRun["status"][] = ["error", "blocked", "skipped", "ok"];
    const pior = [...runs].sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status))[0];
    const maisRecente = runs.reduce((a, b) => (a.started_at > b.started_at ? a : b));
    return { status: pior.status, quando: maisRecente.started_at, erro: pior.error };
}

export const sinal = (n: number | null) => (n == null ? "" : n > 0 ? `+${n}` : `${n}`);
