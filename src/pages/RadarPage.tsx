// Radar de lojas: acompanhamento diário de lojas do mercado (catálogo, home e
// anúncios). Uso interno dos sócios; os dados vêm do coletor NODE-Radar.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRadarAccess } from "@/hooks/useRadarAccess";
import { listarLojas, type RadarStore } from "@/components/radar/radarApi";
import { RadarFeed } from "@/components/radar/RadarFeed";
import { RadarStoresTable } from "@/components/radar/RadarStoresTable";
import { RadarSearchPanel } from "@/components/radar/RadarSearchPanel";
import { RadarStoreSheet } from "@/components/radar/RadarStoreSheet";

export default function RadarPage() {
    const { canViewRadar, denied, isLoading: carregandoAcesso, error: erroAcesso, retry } = useRadarAccess();
    const [nicho, setNicho] = useState("all");
    const [aberta, setAberta] = useState<RadarStore | null>(null);

    const lojas = useQuery({ queryKey: ["radar_stores"], queryFn: listarLojas, enabled: canViewRadar });
    const nichos = useMemo(() => [...new Set((lojas.data ?? []).map((s) => s.niche))].sort(), [lojas.data]);
    const ativas = (lojas.data ?? []).filter((s) => s.active).length;

    if (carregandoAcesso) {
        return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }
    if (erroAcesso && !canViewRadar) {
        return (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">Não consegui confirmar seu acesso ao Radar ({erroAcesso.message}).</p>
                <Button variant="outline" onClick={() => retry()}>Tentar de novo</Button>
            </div>
        );
    }
    if (denied || !canViewRadar) return <Navigate to="/home" replace />;

    return (
        <div className="min-h-screen space-y-6 bg-background/30 p-4 sm:p-6 lg:p-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground">Radar de lojas</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        {ativas} lojas acompanhadas todo dia: catálogo, home e anúncios ativos. Cada mudança vira um registro com data.
                    </p>
                </div>
                <Select value={nicho} onValueChange={setNicho}>
                    <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filtrar por nicho"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os nichos</SelectItem>
                        {nichos.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>

            {lojas.error && <p className="text-sm text-destructive">{(lojas.error as Error).message}</p>}

            <Tabs defaultValue="feed" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="feed">O que mudou</TabsTrigger>
                    <TabsTrigger value="lojas">Lojas</TabsTrigger>
                    <TabsTrigger value="busca">Buscar lojas</TabsTrigger>
                </TabsList>
                <TabsContent value="feed">
                    <RadarFeed stores={lojas.data ?? []} niche={nicho} onOpenStore={setAberta} />
                </TabsContent>
                <TabsContent value="lojas">
                    <RadarStoresTable stores={lojas.data ?? []} niches={nichos} niche={nicho} onOpenStore={setAberta} />
                </TabsContent>
                <TabsContent value="busca">
                    <RadarSearchPanel niches={nichos} />
                </TabsContent>
            </Tabs>

            <RadarStoreSheet store={aberta} onClose={() => setAberta(null)} />
        </div>
    );
}
