import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { NivelPotencial, RadarRun } from "./radarApi";

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

const MOEDA_POR_PAIS: Record<string, string> = { BR: "BRL", US: "USD", ES: "EUR", PT: "EUR", GB: "GBP", MX: "MXN" };

// Moeda da loja: a que a vitrine publica (perfil) ou, sem isso, a do país.
export const moedaDaLoja = (s: { country: string; profile?: { moeda?: string | null } | null }) => s.profile?.moeda || MOEDA_POR_PAIS[s.country] || null;

// Preço na moeda da loja (o catálogo vem na moeda dela). Moeda desconhecida: só o número.
export function fmtMoeda(valor: number | null | undefined, moeda: string | null) {
    if (valor == null) return "–";
    const casas = valor >= 100 ? 0 : 2;
    if (!moeda) return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
    return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda, maximumFractionDigits: casas });
}

export const fmtNumero = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("pt-BR"));

export const NIVEL_INFO: Record<NivelPotencial, { rotulo: string; classe: string; anel: string }> = {
    alto: { rotulo: "Alto", classe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", anel: "stroke-emerald-500" },
    medio: { rotulo: "Médio", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-400", anel: "stroke-amber-500" },
    baixo: { rotulo: "Baixo", classe: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300", anel: "stroke-zinc-400" },
    sem_dados: { rotulo: "Aguardando dados", classe: "bg-muted text-muted-foreground", anel: "stroke-muted-foreground/30" },
};

export const nivelDe = (detalhe: { nivel?: NivelPotencial } | null | undefined): NivelPotencial => detalhe?.nivel ?? "sem_dados";

export const linkBiblioteca = (adId: string) => `https://www.facebook.com/ads/library/?id=${adId}`;

export const diasAtras = (n: number) => format(subDays(new Date(), n), "yyyy-MM-dd");

export const dataCurta = (iso: string) => format(parseISO(iso), "dd/MM", { locale: ptBR });

export const dataLonga = (iso: string) => format(parseISO(iso), "EEEE, dd 'de' MMMM", { locale: ptBR });

export const dataHora = (iso: string) => format(parseISO(iso), "dd/MM HH:mm", { locale: ptBR });

// Pior status entre as últimas execuções da loja (erro > bloqueio > pulado > ok).
export function statusColeta(runs: RadarRun[]): { status: RadarRun["status"] | "never"; quando: string | null; erro: string | null } {
    if (!runs.length) return { status: "never", quando: null, erro: null };
    const ordem: RadarRun["status"][] = ["error", "blocked", "skipped", "ok"];
    const pior = [...runs].sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status))[0];
    const maisRecente = runs.reduce((a, b) => (a.started_at > b.started_at ? a : b));
    return { status: pior.status, quando: maisRecente.started_at, erro: pior.error };
}

export const sinal = (n: number | null) => (n == null ? "" : n > 0 ? `+${n}` : `${n}`);
