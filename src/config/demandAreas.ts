// Áreas de demanda da NODE. Fonte única para portal, formulários da equipe e quadro.
// O banco (trigger demand_requests_before_insert) aceita só estes valores.
export const DEMAND_AREAS = [
    { value: "social_media", label: "Social Mídia" },
    { value: "manutencao_loja", label: "Manutenção Loja" },
    { value: "midias", label: "Mídias" },
] as const;

export type DemandArea = (typeof DEMAND_AREAS)[number]["value"];

// Cards antigos ainda guardam as áreas anteriores; só exibição, ninguém cria mais.
const LEGACY_AREA_LABELS: Record<string, string> = {
    traffic: "Tráfego",
    design: "Design",
    dev: "Dev",
    copy: "Copy",
    strategy: "Estratégia",
};

export function demandAreaLabel(value?: string | null): string {
    if (!value) return "—";
    const current = DEMAND_AREAS.find((a) => a.value === value);
    return current?.label ?? LEGACY_AREA_LABELS[value] ?? value;
}
