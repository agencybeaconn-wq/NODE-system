// wa.me precisa do número internacional só com dígitos. No BR o telefone costuma
// vir "(34) 99999-9999": entra o 55 na frente. Fixo (10 dígitos) também vai; o
// próprio WhatsApp avisa se o número não tiver conta.
export function linkWhatsApp(telefone: string | null | undefined, { pais = "BR", texto }: { pais?: string; texto?: string } = {}): string | null {
    if (!telefone) return null;
    let digitos = telefone.replace(/\D/g, "");
    if (!telefone.trim().startsWith("+") && pais === "BR") {
        digitos = digitos.replace(/^0+/, "");
        if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
    }
    if (digitos.length < 10) return null;
    return `https://wa.me/${digitos}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
