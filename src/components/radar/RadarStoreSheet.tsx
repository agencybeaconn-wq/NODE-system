import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RadarStore, RadarTag } from "./radarApi";
import { NivelSelo, TagChip } from "./RadarBits";
import { RadarStoreAnuncios } from "./RadarStoreAnuncios";
import { RadarStoreHistorico } from "./RadarStoreHistorico";
import { RadarStoreProdutos } from "./RadarStoreProdutos";
import { RadarStoreResumo } from "./RadarStoreResumo";
import { PLATAFORMAS, nivelDe } from "./radarUtils";

interface RadarStoreSheetProps {
    store: RadarStore | null;
    tags: RadarTag[];
    onClose: () => void;
}

export function RadarStoreSheet({ store, tags, onClose }: RadarStoreSheetProps) {
    // Rascunhos de anotação por loja: trocar de aba ou de loja não perde o texto.
    const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
    const rascunho = store ? rascunhos[store.id] : undefined;
    const sujo = !!store && rascunho !== undefined && rascunho.trim() !== (store.notes ?? "").trim();
    const definirRascunho = (texto: string | undefined) => {
        if (!store) return;
        const id = store.id;
        setRascunhos((atual) => {
            const novo = { ...atual };
            if (texto === undefined) delete novo[id];
            else novo[id] = texto;
            return novo;
        });
    };
    const fechar = () => {
        if (sujo && !window.confirm("A anotação desta loja não foi salva. Fechar e manter o rascunho pra depois?")) return;
        onClose();
    };
    return (
        <Sheet open={!!store} onOpenChange={(open) => !open && fechar()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
                {store && (
                    <>
                        <SheetHeader className="space-y-1.5 pr-6 text-left">
                            <SheetTitle className="text-2xl font-bold tracking-tight">{store.name || store.domain}</SheetTitle>
                            <SheetDescription asChild>
                                <div className="flex flex-wrap items-center gap-2">
                                    <a href={`https://${store.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                        {store.domain} <ExternalLink className="h-3 w-3" />
                                    </a>
                                    <NivelSelo nivel={nivelDe(store.potential_detail)} />
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{store.niche}</span>
                                    <span className="text-[11px]">{PLATAFORMAS[store.platform] ?? store.platform} · {store.country}</span>
                                </div>
                            </SheetDescription>
                            {store.tag_ids.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {tags.filter((t) => store.tag_ids.includes(t.id)).map((t) => <TagChip key={t.id} tag={t} />)}
                                </div>
                            )}
                        </SheetHeader>

                        <Tabs key={store.id} defaultValue="resumo" className="mt-5 space-y-4">
                            <TabsList>
                                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                                <TabsTrigger value="produtos">Produtos</TabsTrigger>
                                <TabsTrigger value="anuncios">Anúncios</TabsTrigger>
                                <TabsTrigger value="historico">Histórico</TabsTrigger>
                            </TabsList>
                            <TabsContent value="resumo"><RadarStoreResumo store={store} tags={tags} rascunho={rascunho} onRascunho={definirRascunho} /></TabsContent>
                            <TabsContent value="produtos"><RadarStoreProdutos store={store} /></TabsContent>
                            <TabsContent value="anuncios"><RadarStoreAnuncios store={store} /></TabsContent>
                            <TabsContent value="historico"><RadarStoreHistorico store={store} /></TabsContent>
                        </Tabs>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
