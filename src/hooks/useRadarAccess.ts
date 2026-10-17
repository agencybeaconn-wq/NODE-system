import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { podeVerRadar } from "@/components/radar/radarApi";

// Quem pode ver o Radar é decidido no banco (radar_can_view). O front só
// esconde o item do menu e redireciona; os dados já vêm filtrados pelo RLS.
// Erro de rede NÃO vira "sem acesso": a página mostra "tentar de novo".
export function useRadarAccess() {
    const { session } = useAuth();
    const userId = session?.user?.id;
    const query = useQuery({
        queryKey: ["radar_access", userId],
        queryFn: podeVerRadar,
        enabled: !!userId,
        staleTime: 10 * 60 * 1000,
        retry: 2,
    });
    return {
        canViewRadar: query.data === true,
        denied: query.data === false,
        isLoading: !!userId && query.isLoading,
        error: query.error as Error | null,
        retry: query.refetch,
    };
}
