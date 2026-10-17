// Casca do SISTEMA (SaaS) — carregada sob demanda pela rota "/*" do App.tsx.
// A landing pública NÃO baixa nada deste arquivo: providers (react-query, tooltip,
// theme), i18n e as rotas do app inteiro chegam só quando alguém sai da landing.
// Extraído do App.tsx em 2026-08-12 (corte de peso do pacote inicial da home).
import './i18n';
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, useEffect } from "react";
import { iniciarSentry } from "@/lib/observabilidade";

const TrainingLibraryManager = lazy(() => import("./components/training/TrainingLibraryManager"));
const Login = lazy(() => import("./pages/Login"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const LandingRedirect = lazy(() => import("./components/LandingRedirect").then(m => ({ default: m.LandingRedirect })));
const AcademyProvider = lazy(() => import("./contexts/AcademyContext").then(m => ({ default: m.AcademyProvider })));
const ProtectedRoute = lazy(() => import("./components/ProtectedRoute").then(m => ({ default: m.ProtectedRoute })));
const AbacRoute = lazy(() => import("./components/AbacRoute").then(m => ({ default: m.AbacRoute })));
const NotFound = lazy(() => import("./pages/NotFound"));
const AppShell = lazy(() => import("./AppShell"));
const DashboardLayout = lazy(() => import("./components/DashboardLayout").then(m => ({ default: m.DashboardLayout })));
const PortalLayout = lazy(() => import("./components/portal/PortalLayout").then(m => ({ default: m.PortalLayout })));
const Overview = lazy(() => import("./pages/Overview"));
const OverviewClone = lazy(() => import("./pages/OverviewClone"));
const AdminDashboard = lazy(() => import("./dashboard/pages/AdminDashboard"));
const AgencyDashboardKpi = lazy(() => import("./dashboard/pages/AgencyDashboardKpi"));
const PortalDashboardKpi = lazy(() => import("./dashboard/pages/PortalDashboardKpi"));
const Connections = lazy(() => import("./pages/Connections"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const FinanceiroAcademy = lazy(() => import("./pages/FinanceiroAcademy"));
const Comercial = lazy(() => import("./pages/Comercial"));
const RadarPage = lazy(() => import("./pages/RadarPage"));
const RankingClientes = lazy(() => import("./pages/RankingClientes"));
const Clients = lazy(() => import("./pages/Clients"));
const ClientDetails = lazy(() => import("./pages/ClientDetails"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const PrioridadesPage = lazy(() => import("./pages/PrioridadesPage"));
const Solicitacoes = lazy(() => import("./pages/Solicitacoes"));
const Assets = lazy(() => import("./pages/Assets"));
const Products = lazy(() => import("./pages/Products"));
const AccountGroups = lazy(() => import("./pages/AccountGroups"));
const TeamConnections = lazy(() => import("./pages/TeamConnections"));
const OnboardingWizard = lazy(() => import("./pages/OnboardingWizard"));
const WhatsApp = lazy(() => import("./pages/WhatsApp"));
const TrackingDashboard = lazy(() => import("./pages/TrackingDashboard"));
const PortalVisaoGeral = lazy(() => import("./pages/portal/PortalVisaoGeral"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalNewDemand = lazy(() => import("./pages/portal/PortalNewDemand"));
const PortalTasks = lazy(() => import("./pages/portal/PortalTasks"));
const PortalEntregas = lazy(() => import("./pages/portal/PortalEntregas"));
const PortalGeneralBoard = lazy(() => import("./pages/portal/PortalGeneralBoard"));
const PortalClients = lazy(() => import("./pages/portal/PortalClients"));
const PortalClientTasks = lazy(() => import("./pages/portal/PortalClientTasks"));
const PortalMyTasks = lazy(() => import("./pages/portal/PortalMyTasks"));
const PortalResources = lazy(() => import("./pages/portal/PortalResources"));
const PortalBiblioteca = lazy(() => import("./pages/portal/PortalBiblioteca"));
const AcademyAuth = lazy(() => import("./pages/academy/AcademyAuth"));
const AulaVibeCodingShopify = lazy(() => import("./pages/landing/aula-vibe-coding-shopify/page"));
const AcademyHome = lazy(() => import("./pages/academy/AcademyHome"));
const AcademyModulePage = lazy(() => import("./pages/academy/AcademyModule"));
const AcademyLessonPage = lazy(() => import("./pages/academy/AcademyLesson"));
const AcademyAdmin = lazy(() => import("./pages/academy/AcademyAdmin"));
const AcademyAdminLesson = lazy(() => import("./pages/academy/AcademyAdminLesson"));
const AcademyPreviewLesson = lazy(() => import("./pages/academy/AcademyPreviewLesson"));
const AcademyForgotPassword = lazy(() => import("./pages/academy/AcademyForgotPassword"));
const AcademyResetPassword = lazy(() => import("./pages/academy/AcademyResetPassword"));
const AcademyInviteRedeem = lazy(() => import("./pages/academy/AcademyInviteRedeem"));
const AcademyPrivateLesson = lazy(() => import("./pages/academy/AcademyPrivateLesson"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const MetaCallback = lazy(() => import("./pages/MetaCallback"));
const Home = lazy(() => import("./pages/Home"));
const FinancialDashboard = lazy(() => import("./pages/financial/Dashboard"));
const FinancialCosts = lazy(() => import("./pages/financial/Costs"));
const SmartDataViz = lazy(() => import("./pages/SmartDataViz"));
const TimelinePage = lazy(() => import("./pages/TimelinePage"));
const ProjetosAtivos = lazy(() => import("./pages/ProjetosAtivos"));
const ClientConnectionsPage = lazy(() => import("./pages/ClientConnectionsPage"));
const AppMobilePage = lazy(() => import("./pages/AppMobilePage"));
const AppsOverviewPage = lazy(() => import("./pages/AppsOverviewPage"));
const ClientTimelinePage = lazy(() => import("./pages/ClientTimelinePage"));
const ClientOnboardingPage = lazy(() => import("./pages/ClientOnboardingPage"));
const ClientBriefingPage = lazy(() => import("./pages/ClientBriefingPage"));
const PedidosPage = lazy(() => import("./pages/PedidosPage"));
const DocumentosPage = lazy(() => import("./pages/DocumentosPage"));
const ClientConfigPage = lazy(() => import("./pages/ClientConfigPage"));
const ClientPricingPage = lazy(() => import("./pages/ClientPricingPage"));
const ShopifyManagerPage = lazy(() => import("./pages/ShopifyManagerPage"));
const StoreDeploymentPage = lazy(() => import("./pages/StoreDeploymentPage"));
const EstudioIAPage = lazy(() => import("./pages/EstudioIAPage"));
const SkillsPage = lazy(() => import("./pages/SkillsPage"));
const GeneralBoard = lazy(() => import("./pages/GeneralBoard"));
const Paineis = lazy(() => import("./pages/Paineis"));
const BulkEditorPage = lazy(() => import("./pages/BulkEditorPage"));
const GoogleCalendarPage = lazy(() => import("./pages/GoogleCalendarPage"));
const SystemLogs = lazy(() => import("./pages/SystemLogs"));
const GoogleDrivePage = lazy(() => import("./pages/GoogleDrivePage"));
const TrainingLibrary = lazy(() => import("./pages/TrainingLibrary"));
const BriefingForm = lazy(() => import("./pages/BriefingForm"));
const BriefingArchive = lazy(() => import("./pages/BriefingArchive"));
const AgencyLayout = lazy(() => import("./components/agency/AgencyLayout").then(m => ({ default: m.AgencyLayout })));
const AgencyDashboard = lazy(() => import("./pages/agency/AgencyDashboard"));
const AgencyGeneralBoard = lazy(() => import("./pages/agency/AgencyGeneralBoard"));
const AgencyClients = lazy(() => import("./pages/agency/AgencyClients"));
const AgencyNewDemand = lazy(() => import("./pages/agency/AgencyNewDemand"));
const AgencySmartData = lazy(() => import("./pages/agency/AgencySmartData"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function AppSistema() {
  // Sentry só no sistema — a landing não paga esse peso.
  // Sem VITE_SENTRY_DSN a chamada é inerte. (PostHog inicia no PostHogProvider
  // do AppShell e no rastreio da landing — casa própria, @/lib/posthog.)
  useEffect(() => {
    iniciarSentry();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      {/* forcedTheme removido: volta a opção claro/escuro. defaultTheme dark,
          enableSystem pra respeitar a preferência do SO na 1ª visita. */}
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <TooltipProvider>
          <Routes>
            <Route element={<AppShell />}>
                              {/* AULA VIBE CODING — standalone, sem auth (apresentação ao vivo) */}
                              <Route path="/aula/vibe-coding-shopify" element={<AulaVibeCodingShopify />} />

                              {/* LEVER ACADEMY ROUTES (standalone, own auth/context) */}
                              <Route path="/academy/login" element={<AcademyProvider><AcademyAuth /></AcademyProvider>} />
                              <Route path="/academy/esqueci-senha" element={<AcademyForgotPassword />} />
                              <Route path="/academy/redefinir-senha" element={<AcademyResetPassword />} />
                              <Route path="/academy" element={<AcademyProvider><AcademyHome /></AcademyProvider>} />
                              <Route path="/academy/meus-cursos" element={<AcademyProvider><AcademyHome /></AcademyProvider>} />
                              <Route path="/academy/curso/:slug" element={<AcademyProvider><AcademyModulePage /></AcademyProvider>} />
                              <Route path="/academy/curso/:slug/aula/:lessonId" element={<AcademyProvider><AcademyLessonPage /></AcademyProvider>} />
                              <Route path="/academy/admin" element={<AcademyProvider><AcademyAdmin /></AcademyProvider>} />
                              <Route path="/academy/admin/modulos" element={<AcademyProvider><AcademyAdmin /></AcademyProvider>} />
                              <Route path="/academy/admin/aulas" element={<AcademyProvider><AcademyAdmin /></AcademyProvider>} />
                              <Route path="/academy/admin/convites" element={<AcademyProvider><AcademyAdmin /></AcademyProvider>} />
                              <Route path="/academy/admin/alunos" element={<AcademyProvider><AcademyAdmin /></AcademyProvider>} />
                              <Route path="/academy/admin/moderacao" element={<AcademyProvider><AcademyAdmin /></AcademyProvider>} />
                              <Route path="/academy/admin/aula/:lessonId" element={<AcademyProvider><AcademyAdminLesson /></AcademyProvider>} />
                              <Route path="/academy/preview/:slug/:idx" element={<AcademyProvider><AcademyPreviewLesson /></AcademyProvider>} />
                              <Route path="/academy/convite/:token" element={<AcademyProvider><AcademyInviteRedeem /></AcademyProvider>} />
                              <Route path="/academy/minhas-aulas" element={<AcademyProvider><AcademyPrivateLesson /></AcademyProvider>} />
                              <Route path="/academy/minhas-aulas/:lessonId" element={<AcademyProvider><AcademyPrivateLesson /></AcademyProvider>} />

                              {/* PORTAL ROUTES (Client Facing) */}
                              {/* Página inicial do portal → redireciona direto para Briefing */}
                              <Route path="/portal" element={<Navigate to="/portal/briefing" replace />} />
                              <Route path="/portal/briefing" element={<ProtectedRoute><PortalLayout><BriefingForm /></PortalLayout></ProtectedRoute>} />
                              <Route path="/portal/new-demand" element={<ProtectedRoute><PortalLayout><PortalNewDemand /></PortalLayout></ProtectedRoute>} />
                              <Route path="/portal/tasks" element={<ProtectedRoute><PortalLayout><PortalTasks /></PortalLayout></ProtectedRoute>} />
                              <Route path="/portal/entregas" element={<ProtectedRoute><PortalLayout><PortalEntregas /></PortalLayout></ProtectedRoute>} />
                              {/* Rotas legadas mantidas para não quebrar links existentes */}
                              <Route path="/portal/visao-geral" element={<Navigate to="/portal/briefing" replace />} />
                              <Route path="/portal/general-board" element={<Navigate to="/portal/tasks" replace />} />
                              <Route path="/portal/clients" element={<Navigate to="/portal/briefing" replace />} />
                              <Route path="/portal/client-tasks" element={<Navigate to="/portal/tasks" replace />} />
                              <Route path="/portal/my-tasks" element={<Navigate to="/portal/tasks" replace />} />
                              <Route path="/portal/resources" element={<Navigate to="/portal/briefing" replace />} />
                              <Route path="/portal/biblioteca" element={<Navigate to="/portal/briefing" replace />} />


                              {/* PUBLIC ROUTE - Legacy Share Portal */}
                              <Route path="/shared/portal/:shareToken" element={<ClientPortal />} />
                              <Route path="/auth/meta/callback" element={<ProtectedRoute><MetaCallback /></ProtectedRoute>} />
                              <Route path="/auth/accept-invite" element={<AcceptInvite />} />

                              <Route path="/login" element={<Login />} />
                              <Route
                                path="/onboarding"
                                element={
                                  <ProtectedRoute>
                                    <OnboardingWizard />
                                  </ProtectedRoute>
                                }
                              />
                              {/* Home pública — landing NODE (botão Entrar leva ao /login) */}
                              {/* PROTÓTIPO v2 — "Rede viva + HUD". Rota paralela para avaliação;
                                  não substitui a home até aprovação. */}
                              {/* Páginas públicas por serviço: existem por SEO, uma para cada
                                  frente. O HTML delas é pré-renderizado no build. */}
                              <Route
                                path="/app"
                                element={
                                  <ProtectedRoute>
                                    <LandingRedirect />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/home"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <Home />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/dashboard"
                                element={
                                  <ProtectedRoute requiredFeature="dashboard">
                                    <DashboardLayout>
                                      <AdminDashboard />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/overview-old"
                                element={
                                  <ProtectedRoute requiredFeature="dashboard">
                                    <DashboardLayout>
                                      <Overview />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/clients"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <TimelinePage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/clients/:id"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <ClientDetails />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/clients/:id/aplicativo"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <AppMobilePage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/aplicativos"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <AppsOverviewPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/tasks"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <TasksPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/prioridades"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <div className="px-4 md:px-8 py-6 md:py-8 w-full">
                                        <PrioridadesPage />
                                      </div>
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/general-board"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <GeneralBoard />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/solicitacoes"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <Solicitacoes />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/graficos"
                                element={
                                  <ProtectedRoute requiredFeature="analytics">
                                    <DashboardLayout>
                                      <AnalyticsPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />

                              {/* ------------ NOVO PORTAL DO FUNCIONARIO (ABAC) ------------ */}
                              <Route path="/agency">
                                <Route index element={<Navigate to="/agency/general-board" replace />} />
                                <Route path="dashboard" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><AgencyDashboardKpi /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="general-board" element={
                                  <AbacRoute resource="quadro_geral" action="read">
                                    <AgencyLayout><AgencyGeneralBoard /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="prioridades" element={
                                  <AbacRoute resource="quadro_geral" action="read">
                                    <AgencyLayout><PrioridadesPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="solicitacoes" element={
                                  <AbacRoute resource="solicitacoes" action="read">
                                    <AgencyLayout><Solicitacoes /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="comercial" element={
                                  <AbacRoute resource="crm" action="read">
                                    <AgencyLayout><Comercial /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                {/* Radar: o acesso real é radar_can_view() no banco; a página redireciona quem não tem */}
                                <Route path="radar" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><RadarPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="timeline" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><TimelinePage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="active-projects" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><ProjetosAtivos /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="connections" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><ClientConnectionsPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="clients" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><TimelinePage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="clients/:id" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><ClientDetails /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="clients/:id/aplicativo" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><AppMobilePage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="pedidos" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><PedidosPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="documentos" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><DocumentosPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="precos" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><ClientPricingPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="client-config" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><ClientConfigPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="client-briefing" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><ClientBriefingPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="editor-massa" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><BulkEditorPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="google-calendar" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><GoogleCalendarPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="logs" element={
                                  <AbacRoute resource="system_logs" action="read">
                                    <AgencyLayout><SystemLogs /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="shopify-manager" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><ShopifyManagerPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="estudio-ia" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><EstudioIAPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="skills" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><SkillsPage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="google-drive" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><GoogleDrivePage /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="treinamentos" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><TrainingLibrary /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="treinamentos/gerenciar" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><TrainingLibraryManager /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="briefing/formulario" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><BriefingForm /></AgencyLayout>
                                  </AbacRoute>
                                } />
                                <Route path="briefing/arquivos" element={
                                  <AbacRoute resource="visao_geral" action="read">
                                    <AgencyLayout><BriefingArchive /></AgencyLayout>
                                  </AbacRoute>
                                } />
                              </Route>
                              {/* --------------------------------------------------------- */}
                              <Route
                                path="/financeiro"
                                element={
                                  <ProtectedRoute requiredFeature="financial">
                                    <DashboardLayout>
                                      <Financeiro />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/financeiro-academy"
                                element={
                                  <ProtectedRoute requiredFeature="financial">
                                    <DashboardLayout>
                                      <FinanceiroAcademy />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/paineis"
                                element={
                                  <ProtectedRoute requiredFeature="analytics">
                                    <DashboardLayout>
                                      <Paineis />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/comercial"
                                element={
                                  <ProtectedRoute requiredFeature="crm">
                                    <DashboardLayout>
                                      <Comercial />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/radar"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <RadarPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/ranking-clientes"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <RankingClientes />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/settings"
                                element={
                                  <ProtectedRoute requiredFeature="settings_general">
                                    <DashboardLayout>
                                      <SettingsPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/team"
                                element={
                                  <ProtectedRoute requiredFeature="team">
                                    <DashboardLayout>
                                      <TeamConnections />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/connections"
                                element={
                                  <ProtectedRoute requiredFeature="connections">
                                    <DashboardLayout>
                                      <Connections />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/whatsapp"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <WhatsApp />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/assets"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <Assets />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/account-groups"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <AccountGroups />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/products"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <Products />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/dashboard/rastreamento"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <TrackingDashboard />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/finance/dashboard"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <FinancialDashboard />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/finance/costs"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <FinancialCosts />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/smart-data"
                                element={
                                  <ProtectedRoute>
                                    <SmartDataViz />
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/timeline"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <TimelinePage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/active-projects"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <ProjetosAtivos />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/client-connections"
                                element={
                                  <ProtectedRoute requiredFeature="connections">
                                    <DashboardLayout>
                                      <ClientConnectionsPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/client-onboarding"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <ClientOnboardingPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/client-briefing"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <ClientBriefingPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/pedidos"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <PedidosPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/documentos"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <DocumentosPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/client-config"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <ClientConfigPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/precos"
                                element={
                                  <ProtectedRoute requiredFeature="clients">
                                    <DashboardLayout>
                                      <ClientPricingPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/editor-massa"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <BulkEditorPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/shopify-manager"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <ShopifyManagerPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/store-deployment"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <StoreDeploymentPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/estudio-ia"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <EstudioIAPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/skills"
                                element={
                                  <ProtectedRoute requiredFeature="demands">
                                    <DashboardLayout>
                                      <SkillsPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/google-calendar"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <GoogleCalendarPage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/google-drive"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <GoogleDrivePage />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/treinamentos"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <TrainingLibrary />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/treinamentos/gerenciar"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <TrainingLibraryManager />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/briefing/formulario"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <BriefingForm />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              <Route
                                path="/briefing/arquivos"
                                element={
                                  <ProtectedRoute>
                                    <DashboardLayout>
                                      <BriefingArchive />
                                    </DashboardLayout>
                                  </ProtectedRoute>
                                }
                              />
                              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                              <Route path="*" element={<NotFound />} />
                            </Route>
          </Routes>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
