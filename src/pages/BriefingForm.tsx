/**
 * BriefingForm — Formulário de Briefing Interno
 */

import { useState, useEffect, useRef } from 'react';
import { useBriefings } from '@/hooks/useBriefings';
import { AiAnalysisService } from '@/services/aiAnalysisService';
import { supabase } from '@/integrations/supabase/client';
import nodeTile from '@/assets/node-tile.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ChevronDown, ChevronUp, Send, Upload, Plus, Trash2, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDashboard } from '@/contexts/DashboardContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Upload Validation Constants ────────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

function validateImageFile(file: File): string | null {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return `Tipo de arquivo não permitido (${file.type}). Use JPG, PNG, WebP ou GIF.`;
    }
    if (file.size > MAX_FILE_SIZE) {
        return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo ${MAX_FILE_SIZE_MB}MB.`;
    }
    return null;
}

function isValidUrl(str: string): boolean {
    try {
        const url = new URL(str);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
}

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ClientOption { id: string; name: string; }

// "Branding Assessoria" removido a pedido — só existe o fluxo de loja.
const FORM_TYPES = [
    { id: 'criacao_loja', label: 'Criação / Reformulação de Loja' },
];

// ─── Checkbox Group ─────────────────────────────────────────────────────────────

function CheckGroup({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
    const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map(opt => (
                <button key={opt} type="button" onClick={() => toggle(opt)} className={cn(
                    "text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200",
                    selected.includes(opt)
                        ? "bg-primary/10 border-primary/40 text-primary ring-1 ring-primary/20"
                        : "bg-card border-border text-muted-foreground hover:bg-muted hover:border-muted-foreground/30"
                )}>
                    {opt}
                </button>
            ))}
        </div>
    );
}

// ─── Radio Group ────────────────────────────────────────────────────────────────

function RadioGroup({ options, value, onChange, disabled = false }: { options: string[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map(opt => (
                <button key={opt} type="button" disabled={disabled} onClick={() => !disabled && onChange(opt)} className={cn(
                    "text-left px-4 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200",
                    disabled && "opacity-50 cursor-not-allowed",
                    value === opt
                        ? "bg-primary/10 border-primary/40 text-primary ring-1 ring-primary/20"
                        : "bg-card border-border text-muted-foreground",
                    !disabled && value !== opt && "hover:bg-muted hover:border-muted-foreground/30"
                )}>
                    {opt}
                </button>
            ))}
        </div>
    );
}

// ─── Section Wrapper ────────────────────────────────────────────────────────────

function Section({ number, title, children, defaultOpen = true }: { number: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Card className="border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
            <button type="button" onClick={() => setOpen(!open)} className="w-full">
                <CardHeader className="flex flex-row items-center justify-between py-4 px-5 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">{number}</div>
                        <CardTitle className="text-base font-semibold text-left">{title}</CardTitle>
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </CardHeader>
            </button>
            {open && <CardContent className="px-5 pb-6 pt-1 space-y-5">{children}</CardContent>}
        </Card>
    );
}

// ─── Field ──────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground/80">{label}</Label>
            {/* Texto de ajuda: deixa o briefing auto-explicável pro cliente leigo */}
            {hint && <p className="text-xs text-muted-foreground -mt-1 leading-snug">{hint}</p>}
            {children}
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function BriefingForm() {
    const { createBriefing, updateBriefingSummary } = useBriefings();
    const { workspaceId } = useDashboard();
    const { linkedClientId, linkedClientName } = usePermissions();
    const navigate = useNavigate();
    const location = useLocation();
    const basePath = location.pathname.startsWith('/agency') ? '/agency/briefing' : '/briefing';
    const isPortalMode = location.pathname.startsWith('/portal');
    const extrasImageRef = useRef<HTMLInputElement>(null);

    // No portal: status do briefing do cliente atual.
    // 'checking' enquanto verifica; 'exists' = briefing concluído (tela bloqueada); 'new' = form disponível.
    const [portalStatus, setPortalStatus] = useState<'checking' | 'exists' | 'new'>(isPortalMode ? 'checking' : 'new');

    const [formType, setFormType] = useState('criacao_loja');
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingBriefingId, setEditingBriefingId] = useState<string | null>(null);

    // Extras attachments
    const [extrasLinks, setExtrasLinks] = useState<string[]>([]);
    const [extrasImages, setExtrasImages] = useState<{ file: File; preview: string }[]>([]);

    // Referência visual de paleta de cores (upload único)
    const [paletaImageFile, setPaletaImageFile] = useState<File | null>(null);
    const [paletaImagePreview, setPaletaImagePreview] = useState<string | null>(null);
    const paletaImageRef = useRef<HTMLInputElement>(null);

    const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));

    // Form state — JSONB answers
    const [a, setA] = useState<Record<string, any>>({
        marca_nome: '', instagram: '', tempo_marca: '', problema_site: '', nicho: '', vende_onde: '',
        produtos: [] as string[], outros_produtos: '',
        // Desnichamento: 'camisas' abre a grade de camisas de time; 'outro' abre
        // o cadastro manual de produtos (nome + valor), persistido no briefing.
        tipo_negocio: '',
        produtos_manuais: [] as { nome: string; valor: string }[],
        preco_torcedor: '', preco_jogador: '', preco_retro: '', preco_infantil: '',
        preco_agasalho_viagem: '', preco_conjunto_treino: '', preco_jaqueta: '', preco_moletom: '', preco_short: '',
        preco_patchs: '', preco_patrocinios: '',
        preco_tamanho_2gg: '', preco_tamanho_3gg: '', preco_tamanho_4gg: '',
        preco_personalizacao: '', preco_manga_longa: '',
        frete_gratis: '', frete_gratis_valor: '', parcelamento: '', parcelas_max: '', parcelas_sem_juros: '',
        moeda: '',
        ofertas: [] as string[], ofertas_descricao: '',
        usar_nossos_produtos: '',
        manter_precos_atuais: '',
        loja_referencia: '', loja_referencia_link: '', sessao_replicar: '',
        paleta_definida: '', paleta_cores: '',
        banners_conceito: '',
        politicas_opcao: '', politicas_adaptar: '',
        usar_automacoes: '', plataforma_automacao: '',
        contato_email: '', contato_telefone: '',
        politica_troca_dias: '', politica_entrega_prazo: '', politica_entrega_info: '',
        politica_reembolso: '', politica_primeira_troca: '',
        marca_cnpj: '', marca_endereco: '',
        loja_myshopify: '', loja_collab_code: '',
        extras: '',
    });

    const MAX_INPUT_LENGTH = 1000;
    const set = (key: string, val: any) => {
        const v = typeof val === 'string' && val.length > MAX_INPUT_LENGTH ? val.slice(0, MAX_INPUT_LENGTH) : val;
        setA(prev => ({ ...prev, [key]: v }));
    };

    // Bloqueia inputs de Preços quando o cliente optou por manter os preços já cadastrados.
    const precosBloqueados = a.usar_nossos_produtos === 'Não' && a.manter_precos_atuais === 'Sim';

    // Paleta image handler
    const handlePaletaImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const validationError = validateImageFile(file);
        if (validationError) { toast.error(validationError); e.target.value = ''; return; }
        setPaletaImageFile(file);
        const reader = new FileReader();
        reader.onload = () => setPaletaImagePreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    // Extras image handler
    const handleExtrasImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const validationError = validateImageFile(file);
        if (validationError) { toast.error(validationError); e.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
            setExtrasImages(prev => [...prev, { file, preview: reader.result as string }]);
        };
        reader.readAsDataURL(file);
    };

    // Portal mode: auto-seleciona o cliente do usuário logado e checa se briefing já existe.
    useEffect(() => {
        if (!isPortalMode || !workspaceId || !linkedClientId) return;
        (async () => {
            // Pre-select client logado
            setSelectedClient(linkedClientId);
            setClientSearch(linkedClientName || '');
            setClients([{ id: linkedClientId, name: linkedClientName || 'Minha Loja' }]);

            try {
                // Checa se já existe briefing concluído pra esse cliente
                const { data: existing } = await (supabase as any)
                    .from('briefings')
                    .select('id, status')
                    .eq('client_group_id', linkedClientId)
                    .eq('status', 'completed')
                    .limit(1)
                    .maybeSingle();

                setPortalStatus(existing ? 'exists' : 'new');
            } catch (e) {
                // Falha explícita: nunca deixar o portal preso em "Verificando briefing..." —
                // libera o form em vez de spinner eterno (regra: nada de erro silencioso).
                console.error('[BriefingForm] erro ao checar briefing existente:', e);
                setPortalStatus('new');
            }
        })();
    }, [isPortalMode, workspaceId, linkedClientId, linkedClientName]);

    // Fetch clients and auto-select from URL param (modo admin/agency)
    useEffect(() => {
        if (isPortalMode) return; // portal usa o effect específico acima
        if (!workspaceId) return;
        (async () => {
            const { data, error } = await (supabase as any)
                .from('agency_clients')
                .select('id, name')
                .eq('workspace_id', workspaceId)
                .order('name');
            if (error) { console.error('Erro ao buscar clientes:', error); return; }
            setClients(data || []);

            // Auto-select client from URL ?client=UUID
            const params = new URLSearchParams(window.location.search);
            const clientParam = params.get('client');
            if (clientParam && data) {
                const found = data.find((c: any) => c.id === clientParam);
                if (found) {
                    setSelectedClient(found.id);
                    setClientSearch(found.name);
                }
            }

            // Load existing briefing for editing ?edit=UUID
            const editParam = params.get('edit');
            if (editParam) {
                setEditingBriefingId(editParam);
                const { data: briefing } = await (supabase as any)
                    .from('briefings')
                    .select('*')
                    .eq('id', editParam)
                    .single();
                if (briefing?.answers) {
                    setA(prev => ({ ...prev, ...briefing.answers }));
                    if (briefing.answers.form_type) setFormType(briefing.answers.form_type);
                    if (briefing.answers.paleta_imagem_url) setPaletaImagePreview(briefing.answers.paleta_imagem_url);
                    toast.info('Briefing carregado para edição');
                }
            }
        })();
    }, [workspaceId]);

    // Submit
    const handleSubmit = async () => {
        if (!selectedClient) { toast.error('Selecione um cliente'); return; }
        const client = clients.find(c => c.id === selectedClient);
        if (!client) return;

        setIsSubmitting(true);
        try {
            // Upload imagem de referência da paleta, se houver
            let paletaImagemUrl = '';
            if (paletaImageFile && paletaImagePreview) {
                const ext = paletaImageFile.name.split('.').pop();
                const path = `briefings/${crypto.randomUUID()}_paleta.${ext}`;
                const { error: upErr } = await supabase.storage.from('briefing-files').upload(path, paletaImageFile);
                if (upErr) {
                    console.error('Erro upload paleta:', upErr);
                    paletaImagemUrl = paletaImagePreview;
                } else {
                    const { data: urlData } = supabase.storage.from('briefing-files').getPublicUrl(path);
                    paletaImagemUrl = urlData.publicUrl;
                }
            }

            // Upload extras images
            const extrasImageUrls: string[] = [];
            for (const img of extrasImages) {
                const ext = img.file.name.split('.').pop();
                const path = `briefings/${crypto.randomUUID()}_extra.${ext}`;
                const { error: upErr } = await supabase.storage.from('briefing-files').upload(path, img.file);
                if (upErr) {
                    console.error('Erro upload extra img:', upErr);
                    // Fallback: save base64 preview
                    extrasImageUrls.push(img.preview);
                } else {
                    const { data: urlData } = supabase.storage.from('briefing-files').getPublicUrl(path);
                    extrasImageUrls.push(urlData.publicUrl);
                }
            }

            const finalAnswers = {
                ...a,
                form_type: formType,
                paleta_imagem_url: paletaImagemUrl || a.paleta_imagem_url || undefined,
                extras_links: extrasLinks.filter(l => l.trim()).filter(l => {
                    if (!isValidUrl(l)) { toast.error(`Link inválido removido: ${l}`); return false; }
                    return true;
                }),
                extras_images: extrasImageUrls,
            };

            let briefing;
            if (editingBriefingId) {
                // Update existing briefing
                const { data: updated, error } = await (supabase as any)
                    .from('briefings')
                    .update({ answers: finalAnswers, status: 'completed', updated_at: new Date().toISOString() })
                    .eq('id', editingBriefingId)
                    .select()
                    .single();
                if (error) throw error;
                briefing = updated;
            } else {
                briefing = await createBriefing(client.name, client.id, finalAnswers);
            }
            if (!briefing) throw new Error('Falha ao salvar');

            // Sync pricing data to client_pricing table.
            // Sync seletivo: só envia linhas com value não-vazio. Isso garante que:
            // - Frete/parcelamento (sempre editáveis) sobrescrevem o que estiver lá.
            // - Preços ficam preservados quando cliente escolheu "manter preços atuais"
            //   (inputs desabilitados permanecem com string vazia → filtrado fora).
            try {
                const moedaMap: Record<string, string> = { 'Real (BRL)': 'BRL', 'Dólar (USD)': 'USD', 'Euro (EUR)': 'EUR', 'Libra (GBP)': 'GBP', 'Peso Argentino (ARS)': 'ARS' };
                const allRows = [
                    // Products
                    { section: 'products', key: 'camisa_torcedor', label: 'Camisa Torcedor', value: a.preco_torcedor || '', sort_order: 0 },
                    { section: 'products', key: 'camisa_jogador', label: 'Camisa Jogador', value: a.preco_jogador || '', sort_order: 1 },
                    { section: 'products', key: 'camisa_retro', label: 'Camisa Retrô', value: a.preco_retro || '', sort_order: 2 },
                    { section: 'products', key: 'conjunto_infantil', label: 'Conjuntos Infantil', value: a.preco_infantil || '', sort_order: 3 },
                    { section: 'products', key: 'agasalho_viagem', label: 'Agasalho de Viagem', value: a.preco_agasalho_viagem || '', sort_order: 4 },
                    { section: 'products', key: 'conjunto_treino', label: 'Conjunto de Treino', value: a.preco_conjunto_treino || '', sort_order: 5 },
                    { section: 'products', key: 'jaqueta', label: 'Jaqueta', value: a.preco_jaqueta || '', sort_order: 6 },
                    { section: 'products', key: 'moletom', label: 'Moletom', value: a.preco_moletom || '', sort_order: 7 },
                    { section: 'products', key: 'short', label: 'Short', value: a.preco_short || '', sort_order: 8 },
                    // Extras
                    { section: 'extras', key: 'patch', label: 'Patch', value: a.preco_patchs || '', sort_order: 0 },
                    { section: 'extras', key: 'patrocinio', label: 'Patrocínio Extra', value: a.preco_patrocinios || '', sort_order: 1 },
                    { section: 'extras', key: 'tamanho_2gg', label: 'Acréscimo 2GG', value: a.preco_tamanho_2gg || '', sort_order: 2 },
                    { section: 'extras', key: 'tamanho_3gg', label: 'Acréscimo 3GG', value: a.preco_tamanho_3gg || '', sort_order: 3 },
                    { section: 'extras', key: 'tamanho_4gg', label: 'Acréscimo 4GG', value: a.preco_tamanho_4gg || '', sort_order: 4 },
                    { section: 'extras', key: 'personalizacao', label: 'Personalização (Nome e Número)', value: a.preco_personalizacao || '', sort_order: 5 },
                    { section: 'extras', key: 'manga_longa', label: 'Manga Longa', value: a.preco_manga_longa || '', sort_order: 6 },
                    // Info (frete/parcelamento sempre sincronizam porque sempre editáveis)
                    { section: 'info', key: 'moeda', label: 'Moeda', value: moedaMap[a.moeda] || '', sort_order: 0 },
                    { section: 'info', key: 'frete_gratis', label: 'Frete Grátis', value: a.frete_gratis || '', sort_order: 1 },
                    { section: 'info', key: 'parcelamento', label: 'Parcelamento sem juros', value: a.parcelamento || '', sort_order: 2 },
                    { section: 'info', key: 'parcelas_max', label: 'Máximo de parcelas', value: a.parcelas_max || '', sort_order: 3 },
                ];
                // Produtos manuais (nicho fora de camisa): cada linha vira um
                // produto no client_pricing, persistido com nome + valor.
                const manualRows = (a.tipo_negocio === 'Outro tipo de produto' ? (a.produtos_manuais || []) : [])
                    .filter((p: { nome: string; valor: string }) => p.nome?.trim() && p.valor?.trim())
                    .map((p: { nome: string; valor: string }, i: number) => ({
                        section: 'products',
                        key: `manual_${i}_${p.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)}`,
                        label: p.nome.trim(),
                        value: p.valor.trim(),
                        sort_order: i,
                    }));

                const pricingRows = [...allRows, ...manualRows]
                    .filter(r => r.value !== '' && r.value !== null && r.value !== undefined)
                    .map(r => ({ ...r, client_id: client.id }));

                if (pricingRows.length > 0) {
                    // supabase-js não lança exceção em erro de banco/RLS: precisa ler { error }.
                    const { error: pricingError } = await (supabase as any)
                        .from('client_pricing')
                        .upsert(pricingRows, { onConflict: 'client_id,section,key' });
                    if (pricingError) throw pricingError;
                }
            } catch (pricingErr: any) {
                console.error('Erro ao sincronizar preços:', pricingErr);
                // Falha SILENCIOSA aqui era a causa de "briefing chegou mas os
                // preços não atualizaram" — agora grita pro usuário e pro time.
                toast.error('Briefing salvo, mas os PREÇOS não sincronizaram: ' + (pricingErr?.message || 'erro desconhecido'));
            }

            // Generate AI summary
            toast.info('Gerando resumo com IA...');
            try {
                const answersText = Object.entries(finalAnswers)
                    .filter(([, v]) => v && (typeof v === 'string' ? v.trim() : (Array.isArray(v) && v.length > 0)))
                    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`)
                    .join('\n');

                const result = await AiAnalysisService.analyze({
                    prompt: `Você é um estrategista sênior de e-commerce e branding na agência NODE. Crie um RESUMO EXECUTIVO profissional deste briefing de cliente.

REGRAS:
- Escreva de forma natural, em parágrafos fluidos. NÃO use marcadores com asteriscos ou bullets em excesso.
- Organize por seções com títulos claros (use ## para seções).
- Cada seção deve ser um texto corrido e analítico, não apenas listar dados.
- Destaque insights estratégicos e pontos de atenção com linguagem profissional.
- Indique oportunidades de melhoria e observações relevantes.
- Tom: executivo, direto, estratégico. Como se fosse um documento para apresentar ao time.
- Escreva em português brasileiro.
- NÃO copie os dados literalmente. Sintetize e interprete.

Cliente: ${client.name}

DADOS DO BRIEFING:
${answersText}`,
                    temperature: 0.4,
                    maxTokens: 4096,
                });
                await updateBriefingSummary(briefing.id, result.text);
                toast.success('Resumo gerado com sucesso!');
            } catch (aiErr) {
                console.error('Erro IA:', aiErr);
                toast.warning('Briefing salvo, mas o resumo IA falhou. Pode ser gerado depois.');
            }

            // Quadro de demandas: só a equipe escreve em client_tasks (RLS).
            // No portal, o banco avisa a equipe (trigger briefings_notify_staff) e as
            // demandas de implementação são geradas em Briefing > Arquivos.
            if (!isPortalMode) {
                // Mark "Call de Briefing" task as completed
                let briefingTaskQuery = (supabase as any).from('client_tasks')
                    .update({ status: 'concluido', completed_at: new Date().toISOString() })
                    .eq('client_id', client.id)
                    .ilike('title', '%Call de Briefing%')
                    .eq('source', 'briefing');
                if (workspaceId) {
                    briefingTaskQuery = briefingTaskQuery.eq('workspace_id', workspaceId);
                }
                const { error: callTaskError } = await briefingTaskQuery;
                if (callTaskError) console.error('Erro ao concluir task de briefing:', callTaskError);

                // Generate implementation tasks from briefing answers.
                // generateTasksFromBriefing devolve { error } ou { skipped } em vez de lançar.
                try {
                    const { BriefingAutomationService } = await import('@/services/automations/BriefingAutomationService');
                    const result: any = await BriefingAutomationService.generateTasksFromBriefing(client.id, briefing.id, workspaceId);
                    if (result?.error) {
                        const msg = typeof result.error === 'string' ? result.error : result.error?.message || 'erro desconhecido';
                        toast.warning('Briefing salvo, mas as demandas automáticas falharam: ' + msg);
                    } else if (result?.skipped) {
                        toast.info('As demandas deste cliente já existiam e foram mantidas.');
                    } else {
                        toast.success(`Demandas de implementação geradas (${result?.data?.length || 0} tarefas).`);
                    }
                } catch (taskErr: any) {
                    console.error('Erro ao gerar demandas:', taskErr);
                    toast.warning('Briefing salvo, mas as demandas automáticas falharam: ' + (taskErr?.message || 'erro desconhecido'));
                }
            }

            if (isPortalMode) {
                // No portal: muda o estado pra mostrar a tela "briefing já recebido"
                toast.success('Briefing enviado! Nosso time já tem as informações da sua loja.');
                setPortalStatus('exists');
            } else {
                navigate(`${basePath}/arquivos`);
            }
        } catch (err: any) {
            toast.error('Erro: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ─── RENDER ─────────────────────────────────────────────────────────────────

    // Portal: enquanto checa se já existe briefing
    if (isPortalMode && portalStatus === 'checking') {
        return (
            <div className="max-w-3xl mx-auto py-16 px-6 flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Verificando briefing...</p>
            </div>
        );
    }

    // Portal: briefing já recebido — tela fixa de status
    if (isPortalMode && portalStatus === 'exists') {
        return (
            <div className="max-w-3xl mx-auto py-16 px-6">
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardContent className="py-12 px-8 text-center space-y-5">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                            <Send className="w-7 h-7 text-emerald-400" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">Seu briefing já foi recebido!</h2>
                            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                                Nosso time já tem as informações da sua loja. O projeto entrou em andamento
                                e você pode acompanhar as etapas pelo quadro de demandas.
                            </p>
                        </div>
                        <Button type="button" onClick={() => navigate('/portal/tasks')} className="font-semibold">
                            Ver quadro de demandas
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-6 px-4 md:px-8 space-y-5">
            {/* Header: versão portal (cliente) vs interno (agência) */}
            {isPortalMode ? (
                <div className="flex items-center gap-4 pb-2">
                    <img src={nodeTile} alt="NODE" className="w-12 h-12 rounded-xl object-contain" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Briefing do Projeto</h1>
                        <p className="text-muted-foreground text-sm">Preencha as informações da sua loja pra começarmos o desenvolvimento.</p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-2">
                    <div className="flex items-center gap-4">
                        <img src={nodeTile} alt="NODE" className="w-12 h-12 rounded-xl object-contain" />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Briefing Interno</h1>
                            <p className="text-muted-foreground text-sm">Preencha todas as informações do cliente.</p>
                        </div>
                    </div>
                    {/* Seletor de tipo escondido: só existe um fluxo (loja).
                        Reaparece automático se um segundo tipo for adicionado. */}
                    {FORM_TYPES.length > 1 && (
                        <div className="flex items-center bg-muted/50 rounded-xl p-1 border border-border/50 shrink-0">
                            {FORM_TYPES.map(ft => (
                                <button key={ft.id} type="button" onClick={() => setFormType(ft.id)} className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                                    formType === ft.id
                                        ? "bg-background text-foreground shadow-sm border border-border/50"
                                        : "text-muted-foreground hover:text-foreground"
                                )}>
                                    {ft.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Client Selector: só admin/agency. Portal tem cliente fixo. */}
            {!isPortalMode && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-5 px-5">
                        <Field label="Selecione o Cliente">
                            <div className="relative">
                                <Input
                                    value={clientSearch}
                                    onChange={e => { setClientSearch(e.target.value); setSelectedClient(''); }}
                                    placeholder="🔍 Buscar cliente..."
                                    className="bg-background"
                                />
                                {clientSearch && !selectedClient && filteredClients.length > 0 && (
                                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                                        {filteredClients.map(c => (
                                            <button key={c.id} type="button" onClick={() => { setSelectedClient(c.id); setClientSearch(c.name); }}
                                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/30 last:border-0">
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {clientSearch && !selectedClient && filteredClients.length === 0 && (
                                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl p-4 text-center text-sm text-muted-foreground">
                                        Nenhum cliente encontrado
                                    </div>
                                )}
                            </div>
                            {selectedClient && (
                                <p className="text-xs text-emerald-500 mt-1.5 font-medium">✓ Cliente selecionado: {clients.find(c => c.id === selectedClient)?.name}</p>
                            )}
                        </Field>
                    </CardContent>
                </Card>
            )}

            {/* ═══ SEÇÕES — Criação/Reformulação de Loja ═══ */}
            {formType === 'criacao_loja' && (
                <>
                    <Section number="1" title="Informações Gerais da Marca">
                        <Field label="Nome da marca" hint="O nome que aparece pro cliente na loja e nas redes."><Input value={a.marca_nome} onChange={e => set('marca_nome', e.target.value)} placeholder="Ex: Minha Loja" /></Field>
                        <Field label="Qual é o nicho principal da sua loja?" hint="O que a loja vende no geral. Ex: camisas de time, cosméticos, suplementos, moda feminina, eletrônicos..."><Input value={a.nicho} onChange={e => set('nicho', e.target.value)} placeholder="Ex: camisas de time, cosméticos, suplementos..." /></Field>
                        <Field label="Mercado de atuação" hint="Em qual público a loja vende. Isso define o idioma e a moeda do site."><RadioGroup options={['Brasil (PT-BR)', 'Internacional (EN)']} value={a.vende_onde} onChange={v => set('vende_onde', v)} /></Field>
                    </Section>

                    <Section number="2" title="Estrutura de Produtos" defaultOpen={false}>
                        <Field label="Que tipo de produto a loja vende?" hint="Isso muda os campos de preço abaixo. Se for camisa de time, usamos a nossa grade pronta. Qualquer outro produto, você cadastra os itens e valores na mão.">
                            <RadioGroup options={['Camisas de time', 'Outro tipo de produto']} value={a.tipo_negocio} onChange={v => set('tipo_negocio', v)} />
                        </Field>

                        {/* CAMISAS DE TIME — fluxo original */}
                        {a.tipo_negocio === 'Camisas de time' && (<>
                            <Field label="Vai utilizar nossos produtos?" hint="Sim = usamos o catálogo pronto da NODE. Não = a loja já tem os produtos dela cadastrados."><RadioGroup options={['Sim', 'Não']} value={a.usar_nossos_produtos} onChange={v => set('usar_nossos_produtos', v)} /></Field>

                            {a.usar_nossos_produtos === 'Sim' && (<>
                                <Field label="Quais produtos a loja vende?">
                                    <CheckGroup options={['Camisas de time', 'Camisas retrô', 'Conjuntos infantil', 'Jaquetas', 'Produtos de treino', 'Acessórios']} selected={a.produtos} onChange={v => set('produtos', v)} />
                                </Field>
                                <Field label="Outros produtos" hint="Algo que a loja vende e não está na lista acima."><Input value={a.outros_produtos} onChange={e => set('outros_produtos', e.target.value)} placeholder="Descreva..." /></Field>
                            </>)}

                            {a.usar_nossos_produtos === 'Não' && (
                                <Field label="Vai manter os preços atuais?" hint="Sim = mantemos os preços que já estão na loja e pulamos a etapa de preços."><RadioGroup options={['Sim', 'Não']} value={a.manter_precos_atuais} onChange={v => set('manter_precos_atuais', v)} /></Field>
                            )}
                        </>)}

                        {/* OUTRO NICHO — cadastro manual de produtos (nome + valor) */}
                        {a.tipo_negocio === 'Outro tipo de produto' && (
                            <div className="space-y-3">
                                <Field label="Produtos e valores" hint="Liste os produtos que a loja vende com o preço de cada um. Adicione quantos precisar — é isso que a gente vai cadastrar na loja.">
                                    <div className="space-y-2">
                                        {(a.produtos_manuais || []).map((p: { nome: string; valor: string }, idx: number) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <Input
                                                    className="flex-1"
                                                    placeholder="Nome do produto (ex: Sérum Facial 30ml)"
                                                    value={p.nome}
                                                    onChange={e => {
                                                        const next = [...a.produtos_manuais];
                                                        next[idx] = { ...next[idx], nome: e.target.value };
                                                        set('produtos_manuais', next);
                                                    }}
                                                />
                                                <div className="relative w-32 shrink-0">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                                                    <Input
                                                        className="pl-9"
                                                        placeholder="0,00"
                                                        value={p.valor}
                                                        onChange={e => {
                                                            const next = [...a.produtos_manuais];
                                                            next[idx] = { ...next[idx], valor: e.target.value };
                                                            set('produtos_manuais', next);
                                                        }}
                                                    />
                                                </div>
                                                <Button
                                                    type="button" variant="ghost" size="icon"
                                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => set('produtos_manuais', a.produtos_manuais.filter((_: any, i: number) => i !== idx))}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            type="button" variant="outline" size="sm"
                                            onClick={() => set('produtos_manuais', [...(a.produtos_manuais || []), { nome: '', valor: '' }])}
                                        >
                                            <Plus className="w-4 h-4 mr-1" /> Adicionar produto
                                        </Button>
                                    </div>
                                </Field>
                            </div>
                        )}
                    </Section>

                    {/* Grade de preços de CAMISA só no fluxo de camisas de time.
                        Outro nicho já lançou nome+valor na seção 2. */}
                    {a.tipo_negocio === 'Camisas de time' && (
                    <Section number="3" title="Preços" defaultOpen={false}>
                        {precosBloqueados && (
                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                                Você optou por <strong>manter os preços atuais</strong>. Esta etapa pode ser pulada — os preços já cadastrados no cliente serão preservados.
                            </div>
                        )}
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2">Preços Base dos Produtos</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Camisa Torcedor"><Input disabled={precosBloqueados} value={a.preco_torcedor} onChange={e => set('preco_torcedor', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Camisa Jogador"><Input disabled={precosBloqueados} value={a.preco_jogador} onChange={e => set('preco_jogador', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Camisa Retrô"><Input disabled={precosBloqueados} value={a.preco_retro} onChange={e => set('preco_retro', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Conjuntos Infantil"><Input disabled={precosBloqueados} value={a.preco_infantil} onChange={e => set('preco_infantil', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Agasalho de Viagem"><Input disabled={precosBloqueados} value={a.preco_agasalho_viagem} onChange={e => set('preco_agasalho_viagem', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Conjunto de Treino"><Input disabled={precosBloqueados} value={a.preco_conjunto_treino} onChange={e => set('preco_conjunto_treino', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Jaqueta"><Input disabled={precosBloqueados} value={a.preco_jaqueta} onChange={e => set('preco_jaqueta', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Moletom"><Input disabled={precosBloqueados} value={a.preco_moletom} onChange={e => set('preco_moletom', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Short"><Input disabled={precosBloqueados} value={a.preco_short} onChange={e => set('preco_short', e.target.value)} placeholder="0,00" /></Field>
                        </div>

                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2">Valores Extras / Acréscimos</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Patch"><Input disabled={precosBloqueados} value={a.preco_patchs} onChange={e => set('preco_patchs', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Patrocínio Extra"><Input disabled={precosBloqueados} value={a.preco_patrocinios} onChange={e => set('preco_patrocinios', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Acréscimo 2GG"><Input disabled={precosBloqueados} value={a.preco_tamanho_2gg} onChange={e => set('preco_tamanho_2gg', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Acréscimo 3GG"><Input disabled={precosBloqueados} value={a.preco_tamanho_3gg} onChange={e => set('preco_tamanho_3gg', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Acréscimo 4GG"><Input disabled={precosBloqueados} value={a.preco_tamanho_4gg} onChange={e => set('preco_tamanho_4gg', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Personalização (Nome e Número)"><Input disabled={precosBloqueados} value={a.preco_personalizacao} onChange={e => set('preco_personalizacao', e.target.value)} placeholder="0,00" /></Field>
                            <Field label="Manga Longa"><Input disabled={precosBloqueados} value={a.preco_manga_longa} onChange={e => set('preco_manga_longa', e.target.value)} placeholder="0,00" /></Field>
                        </div>
                    </Section>
                    )}

                    {/* Frete, Moeda e Parcelamento — vale pra qualquer nicho */}
                    <Section number={a.tipo_negocio === 'Camisas de time' ? '4' : '3'} title="Frete, Moeda e Parcelamento" defaultOpen={false}>
                        <Field label="Moeda utilizada" hint="A moeda que aparece nos preços da loja."><RadioGroup options={['Real (BRL)', 'Dólar (USD)', 'Euro (EUR)', 'Libra (GBP)', 'Peso Argentino (ARS)']} value={a.moeda} onChange={v => set('moeda', v)} /></Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Frete Grátis?" hint="A loja oferece frete grátis acima de um valor de compra?"><RadioGroup options={['Sim', 'Não']} value={a.frete_gratis} onChange={v => set('frete_gratis', v)} /></Field>
                            <Field label="Oferece parcelamento?"><RadioGroup options={['Sim', 'Não']} value={a.parcelamento} onChange={v => set('parcelamento', v)} /></Field>
                        </div>
                        {a.frete_gratis === 'Sim' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Frete grátis a partir de qual valor? (R$)"><Input type="number" value={a.frete_gratis_valor} onChange={e => set('frete_gratis_valor', e.target.value)} placeholder="Ex: 199" /></Field>
                            </div>
                        )}
                        {a.parcelamento === 'Sim' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Até quantas parcelas?"><Input value={a.parcelas_max} onChange={e => set('parcelas_max', e.target.value)} placeholder="Ex: 12" /></Field>
                                <Field label="Até quantas parcelas sem juros?"><Input value={a.parcelas_sem_juros} onChange={e => set('parcelas_sem_juros', e.target.value)} placeholder="Ex: 3" /></Field>
                            </div>
                        )}
                    </Section>

                    <Section number="4" title="Ofertas da Loja" defaultOpen={false}>
                        <Field label="Quais ofertas a loja utiliza?">
                            <CheckGroup options={['Pague 2 leve 3', 'Pague 3 leve 5', 'Pague 4 leve 6']} selected={a.ofertas} onChange={v => set('ofertas', v)} />
                        </Field>
                        <Field label="Outra promoção personalizada"><Input value={a.ofertas_descricao} onChange={e => set('ofertas_descricao', e.target.value)} placeholder="Ex: Compre 7 leve 10, desconto progressivo..." /></Field>
                    </Section>

                    <Section number="5" title="Cores & Identidade Visual" defaultOpen={false}>
                        <Field label="Já possui paleta de cores definida?"><RadioGroup options={['Sim', 'Não']} value={a.paleta_definida} onChange={v => set('paleta_definida', v)} /></Field>
                        {a.paleta_definida === 'Sim' && (
                            <Field label="Quais são as cores da paleta?"><Input value={a.paleta_cores} onChange={e => set('paleta_cores', e.target.value)} placeholder="Ex: preto, laranja vibrante, branco — ou referência tipo 'cores do Instagram da marca'" /></Field>
                        )}
                        <Field label="Imagem de referência da paleta (opcional)">
                            <input ref={paletaImageRef} type="file" accept="image/*" className="hidden" onChange={handlePaletaImage} />
                            <div className="flex items-center gap-3">
                                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => paletaImageRef.current?.click()}>
                                    <Upload className="w-4 h-4" /> Escolher imagem
                                </Button>
                                {paletaImageFile && <span className="text-xs text-muted-foreground">{paletaImageFile.name}</span>}
                            </div>
                            {paletaImagePreview && (
                                <div className="mt-3 relative inline-block">
                                    <img src={paletaImagePreview} alt="Referência de paleta" className="h-24 w-auto rounded-lg border border-border object-contain bg-muted/30 p-1" />
                                    <button type="button" onClick={() => { setPaletaImageFile(null); setPaletaImagePreview(null); set('paleta_imagem_url', ''); }} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs">×</button>
                                </div>
                            )}
                        </Field>
                    </Section>

                    <Section number="6" title="Banners & Comunicação Visual" defaultOpen={false}>
                        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Banners que a NODE vai criar pra sua loja</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                <div>
                                    <p className="font-semibold text-foreground mb-1">Capa de coleção</p>
                                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                        <li>Masculino</li>
                                        <li>Feminino</li>
                                        <li>Infantil</li>
                                        <li>Retrô</li>
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground mb-1">Home</p>
                                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                        <li>Institucional (slogan)</li>
                                        <li>Oferta</li>
                                        <li>Camisas Brasil</li>
                                        <li>Geral Copa</li>
                                        <li>Copy</li>
                                        <li>Rotativo</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <Field label="Qual conceito / modelo visual você imagina para esses banners?">
                            <Textarea value={a.banners_conceito} onChange={e => set('banners_conceito', e.target.value)} placeholder="Descreva o estilo (ex: esportivo agressivo, minimal e clean, com fotos dos jogadores, foco em promoção, estética retrô...). Tem alguma referência? Pode citar marcas/lojas." rows={4} />
                        </Field>
                    </Section>

                    <Section number="7" title="Páginas e Políticas" defaultOpen={false}>
                        <Field label="Páginas de políticas" hint="Páginas obrigatórias de uma loja: Troca e Devolução, Privacidade, Termos de Uso. Podemos criar do zero no nosso padrão ou aproveitar as que a loja já tem."><RadioGroup options={['Criar novas (padrão NODE)', 'Usar as atuais do cliente', 'Adaptar as atuais']} value={a.politicas_opcao} onChange={v => set('politicas_opcao', v)} /></Field>
                        {a.politicas_opcao === 'Adaptar as atuais' && (
                            <Field label="O que precisa ser adaptado?"><Textarea value={a.politicas_adaptar} onChange={e => set('politicas_adaptar', e.target.value)} placeholder="Descreva o que precisa mudar nas políticas atuais..." rows={3} /></Field>
                        )}
                    </Section>

                    {/* Seção Automações removida a pedido (2026-08) */}

                    <Section number="8" title="Dados para Implementação" defaultOpen={false}>
                        <p className="text-xs text-muted-foreground mb-2">Dados utilizados na implementação automática da loja (políticas, tema, contato).</p>

                        {/* Acesso à loja Shopify existente — o time conecta via solicitação de colaborador */}
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2">Acesso à Loja Shopify (se você já tem loja)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Domínio .myshopify da loja">
                                <Input value={a.loja_myshopify} onChange={e => set('loja_myshopify', e.target.value)} placeholder="ex: minhaloja.myshopify.com" />
                            </Field>
                            <Field label="Código de colaborador">
                                <Input value={a.loja_collab_code} onChange={e => set('loja_collab_code', e.target.value)} placeholder="ex: 1460" />
                            </Field>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed mt-1 mb-2">
                            <span className="font-semibold text-foreground">Onde pegar o código de colaborador na sua Shopify</span>
                            <span className="block mt-1">
                                Admin da loja → <span className="font-medium text-foreground">Configurações</span> → <span className="font-medium text-foreground">Usuários e permissões</span> → aba <span className="font-medium text-foreground">Segurança</span> → seção <span className="font-medium text-foreground">Colaboradores</span> → copie o código exibido (ou clique em <span className="font-medium text-foreground">Gerar novo código</span>).
                            </span>
                            <span className="block mt-1 opacity-80">Esse código permite o time da NODE enviar a solicitação de acesso à sua loja. Você ainda aprova a solicitação em Usuários.</span>
                        </div>

                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2">Contato / SAC</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Email de contato"><Input value={a.contato_email} onChange={e => set('contato_email', e.target.value)} placeholder="contato@loja.com" /></Field>
                            <Field label="Telefone / WhatsApp"><Input value={a.contato_telefone} onChange={e => set('contato_telefone', e.target.value)} placeholder="(11) 99999-9999" /></Field>
                            <Field label="Instagram"><Input value={a.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@exemplo" /></Field>
                            <Field label="Facebook"><Input value={a.facebook} onChange={e => set('facebook', e.target.value)} placeholder="facebook.com/loja" /></Field>
                            <Field label="TikTok"><Input value={a.tiktok} onChange={e => set('tiktok', e.target.value)} placeholder="@exemplo" /></Field>
                            <Field label="Horário de atendimento"><Input value={a.horario_atendimento} onChange={e => set('horario_atendimento', e.target.value)} placeholder="Ex: Seg à Sex: 08h às 18h" /></Field>
                        </div>

                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2">Formas de Pagamento</p>
                        <Field label="Quais formas de pagamento aceitas?">
                            <CheckGroup options={['Cartão de Crédito', 'Pix', 'Boleto Bancário', 'PayPal', 'Shop Pay']} selected={a.formas_pagamento || []} onChange={v => set('formas_pagamento', v)} />
                        </Field>

                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2">Políticas da Loja</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Prazo de troca (dias)"><Input value={a.politica_troca_dias} onChange={e => set('politica_troca_dias', e.target.value)} placeholder="Ex: 7" /></Field>
                            <Field label="Prazo de entrega"><Input value={a.politica_entrega_prazo} onChange={e => set('politica_entrega_prazo', e.target.value)} placeholder="Ex: 5 a 15 dias úteis" /></Field>
                        </div>
                        <Field label="Informações extras de envio"><Textarea value={a.politica_entrega_info} onChange={e => set('politica_entrega_info', e.target.value)} placeholder="Ex: Enviamos para todo o Brasil via Correios e transportadora..." rows={2} /></Field>
                        <Field label="Valor mínimo para frete grátis"><Input value={a.frete_gratis_valor} onChange={e => set('frete_gratis_valor', e.target.value)} placeholder="Ex: R$179" /></Field>
                        <Field label="Política de reembolso"><RadioGroup options={['Reembolso integral', 'Apenas troca', 'Reembolso ou troca (cliente escolhe)']} value={a.politica_reembolso} onChange={v => set('politica_reembolso', v)} /></Field>
                        <Field label="Primeira troca gratuita?"><RadioGroup options={['Sim, primeira troca com frete grátis', 'Não, frete por conta do cliente']} value={a.politica_primeira_troca} onChange={v => set('politica_primeira_troca', v)} /></Field>

                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-2">Dados da Empresa</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="CNPJ"><Input value={a.marca_cnpj} onChange={e => set('marca_cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></Field>
                            <Field label="Endereço"><Input value={a.marca_endereco} onChange={e => set('marca_endereco', e.target.value)} placeholder="Rua, Número, Cidade - UF" /></Field>
                        </div>
                    </Section>

                    <Section number="10" title="Informações Extras" defaultOpen={false}>
                        <Field label="Alguma informação adicional?">
                            <Textarea value={a.extras} onChange={e => set('extras', e.target.value)} placeholder="Qualquer informação relevante adicional..." rows={4} />
                        </Field>

                        {/* Links */}
                        <Field label="Links de referência">
                            {extrasLinks.map((link, i) => (
                                <div key={i} className="flex items-center gap-2 mb-2">
                                    <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <Input value={link} onChange={e => { const updated = [...extrasLinks]; updated[i] = e.target.value; setExtrasLinks(updated); }} placeholder="https://..." className="flex-1" />
                                    <button type="button" onClick={() => setExtrasLinks(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => setExtrasLinks(prev => [...prev, ''])}>
                                <Plus className="w-3.5 h-3.5" /> Adicionar link
                            </Button>
                        </Field>

                        {/* Images */}
                        <Field label="Imagens de referência">
                            <input ref={extrasImageRef} type="file" accept="image/*" className="hidden" onChange={handleExtrasImage} />
                            {extrasImages.length > 0 && (
                                <div className="flex flex-wrap gap-3 mb-3">
                                    {extrasImages.map((img, i) => (
                                        <div key={i} className="relative">
                                            <img src={img.preview} alt={`Ref ${i + 1}`} className="h-24 w-auto rounded-lg border border-border object-cover" />
                                            <button type="button" onClick={() => setExtrasImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs">×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => extrasImageRef.current?.click()}>
                                <ImageIcon className="w-3.5 h-3.5" /> Adicionar imagem
                            </Button>
                        </Field>
                    </Section>
                </>
            )}

            {/* Submit */}
            {formType === 'criacao_loja' && (
                <div className="pt-4 pb-8">
                    <Button onClick={handleSubmit} disabled={isSubmitting || !selectedClient} size="lg" className="w-full h-14 text-base font-bold gap-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700">
                        {isSubmitting ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> {editingBriefingId ? 'Atualizando...' : 'Salvando e gerando resumo IA...'}</>
                        ) : (
                            <><Send className="w-5 h-5" /> {editingBriefingId ? 'Atualizar Briefing' : 'Enviar Briefing'}</>
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}
