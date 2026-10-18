// Peças pequenas reaproveitadas nos cards e na ficha da loja.
import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NivelPotencial, RadarTag } from "./radarApi";
import { NIVEL_INFO } from "./radarUtils";

export function PotencialAnel({ score, nivel, tamanho = 52 }: { score: number | null; nivel: NivelPotencial; tamanho?: number }) {
    const raio = 20;
    const volta = 2 * Math.PI * raio;
    const info = NIVEL_INFO[nivel];
    return (
        <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }} title={`Potencial: ${info.rotulo}`}>
            <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
                <circle cx="24" cy="24" r={raio} className="fill-none stroke-muted" strokeWidth="4" />
                {score != null && (
                    <circle
                        cx="24"
                        cy="24"
                        r={raio}
                        className={cn("fill-none transition-[stroke-dashoffset] duration-500", info.anel)}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={volta}
                        strokeDashoffset={volta * (1 - score / 100)}
                    />
                )}
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-foreground">
                {score ?? "–"}
            </span>
        </div>
    );
}

export function NivelSelo({ nivel, className }: { nivel: NivelPotencial; className?: string }) {
    const info = NIVEL_INFO[nivel];
    return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", info.classe, className)}>{info.rotulo}</span>;
}

export function TagChip({ tag, onRemover }: { tag: RadarTag; onRemover?: () => void }) {
    return (
        <span
            className="inline-flex max-w-[140px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
            style={{ borderColor: `${tag.color}55`, backgroundColor: `${tag.color}1a`, color: tag.color }}
        >
            <span className="truncate">{tag.name}</span>
            {onRemover && (
                <button type="button" onClick={onRemover} className="opacity-70 transition-opacity hover:opacity-100" aria-label={`Tirar tag ${tag.name}`}>
                    ×
                </button>
            )}
        </span>
    );
}

// Nota manual de 1 a 5. Clicar na mesma estrela de novo limpa a nota.
export function Estrelas({ valor, onMudar, tamanho = "h-4 w-4" }: { valor: number | null; onMudar?: (v: number | null) => void; tamanho?: string }) {
    const [hover, setHover] = useState<number | null>(null);
    const mostrado = hover ?? valor ?? 0;
    // Só leitura (card): sem botões, pra não engolir o clique que abre a ficha.
    if (!onMudar) {
        return (
            <div className="flex items-center gap-0.5" role="img" aria-label={valor ? `Nota ${valor} de 5` : "Sem nota"}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn(tamanho, n <= (valor ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                ))}
            </div>
        );
    }
    return (
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)}>
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHover(n)}
                    onClick={() => {
                        setHover(null);
                        onMudar(valor === n ? null : n);
                    }}
                    className="transition-transform hover:scale-110 active:scale-95"
                    aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
                    aria-pressed={valor === n}
                >
                    <Star className={cn(tamanho, n <= mostrado ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                </button>
            ))}
        </div>
    );
}

// Imagem externa (CDN da loja ou da Meta): sem referrer e some se o link expirar.
export function ImagemExterna({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
    // Guarda QUAL URL quebrou: URL nova (coleta seguinte) volta a tentar.
    const [quebrada, setQuebrada] = useState<string | null>(null);
    if (!src || quebrada === src) return <div className={cn("bg-muted", className)} aria-hidden />;
    return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setQuebrada(src)} className={cn("bg-muted object-cover", className)} />;
}
