import type { NivelPotencial } from "./radarApi";

// Mesmo anel do potencial das lojas; faixas da nota do prospect (NODE-Radar/lib/prospect.mjs).
export const nivelProspect = (score: number | null): NivelPotencial =>
    score == null ? "sem_dados" : score >= 70 ? "alto" : score >= 45 ? "medio" : "baixo";
