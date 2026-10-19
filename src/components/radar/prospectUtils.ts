import type { NivelPotencial } from "./radarApi";

// Mesmo anel do potencial das lojas; faixas da nota do prospect (NODE-Radar/lib/prospect.mjs).
export const nivelProspect = (score: number | null): NivelPotencial =>
    score == null ? "sem_dados" : score >= 70 ? "alto" : score >= 45 ? "medio" : "baixo";

// wa.me precisa do número internacional só com dígitos. No BR o Google devolve
// "(34) 99999-9999": entra o 55 na frente. Fixo (10 dígitos) também vai, o WhatsApp diz se não existir.
export function linkWhatsApp(telefone: string | null, pais: string): string | null {
    if (!telefone) return null;
    let digitos = telefone.replace(/\D/g, "");
    if (telefone.trim().startsWith("+")) return digitos.length >= 10 ? `https://wa.me/${digitos}` : null;
    if (pais === "BR") {
        digitos = digitos.replace(/^0+/, "");
        if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
    }
    return digitos.length >= 10 ? `https://wa.me/${digitos}` : null;
}
