import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { AdAccountSelector } from "@/components/AdAccountSelector";
import { useLocation } from "react-router-dom";
import leverLogo from "@/assets/lever-logo.png";
import nodeTile from "@/assets/node-tile.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useMemo, useRef, useEffect } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { useTranslation } from "react-i18next";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { LeverLogoIcon } from "@/components/LeverIcon";
import { useAccountType } from "@/contexts/AccountTypeContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { AccountDetailsPopover } from "@/components/sidebar/AccountDetailsPopover";

// Theme toggle now handled by shared component imported above

import {
  LayoutDashboard,
  Home as HomeIcon,
  Users,
  Folder,
  PieChart,
  BarChart3,
  FileText,
  Link,
  Settings,
  Bell,
  ShieldCheck,
  Briefcase,
  Sliders,
  UserCheck,
  UserCog,
  ChevronRight,
  LucideIcon,
  ClipboardList,
  ClipboardPlus,
  ClipboardCheck,
  Package,
  LogOut,
  MessageSquare,
  DollarSign,
  Truck,
  ShoppingCart,
  FolderOpen,
  History,
  Box,
  LayoutGrid,
  Layers,
  Wallet,
  Sparkles,
  Wrench,
  FileSpreadsheet,
  Calendar,
  GraduationCap,
  Play,
  Settings2,
  Trophy,
  Flag,
} from "lucide-react";
// Ícones do menu principal: Heroicons (desenho arredondado, espírito SF Symbols).
// Lucide continua nos demais pontos do app.
import {
  ClipboardDocumentListIcon,
  FlagIcon,
  DocumentTextIcon,
  UserGroupIcon,
  TrophyIcon,
  ClipboardDocumentCheckIcon,
  FolderOpenIcon,
  CurrencyDollarIcon,
  LinkIcon as LinkIconHero,
  AdjustmentsHorizontalIcon,
  WalletIcon,
  CubeIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  DevicePhoneMobileIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
// Variantes preenchidas pro item ATIVO (padrão iOS: outline em repouso, solid ativo)
import {
  ClipboardDocumentListIcon as ClipboardDocumentListSolid,
  FlagIcon as FlagSolid,
  DocumentTextIcon as DocumentTextSolid,
  UserGroupIcon as UserGroupSolid,
  WalletIcon as WalletSolid,
  CubeIcon as CubeSolid,
  CalendarDaysIcon as CalendarDaysSolid,
  Cog6ToothIcon as Cog6ToothSolid,
  DevicePhoneMobileIcon as DevicePhoneMobileSolid,
  ViewfinderCircleIcon as ViewfinderCircleSolid,
} from "@heroicons/react/24/solid";
import { useRadarAccess } from "@/hooks/useRadarAccess";

type IconComponent = LucideIcon | React.ComponentType<any>;

interface MenuItem {
  title: string;
  transKey: string;
  url?: string;
  icon: IconComponent;
  // Seção do sidebar: 'agency' aparece em cima, 'management' embaixo
  section: 'agency' | 'management';
  submenu?: Array<{
    title: string;
    transKey: string;
    url: string;
    icon: IconComponent;
  }>;
}

// Menu items para o sistema Lever Digital
// A ordem do array determina a ordem visual dentro de cada seção.
// O agrupamento visual é controlado pelo campo `section`, não por slice/index.
const mainMenuItems: MenuItem[] = [
  // ─── Seção: Agência ───
  { section: 'agency', title: "Demandas", transKey: "sidebar.tasks", url: "/tasks", icon: ClipboardDocumentListIcon },
  { section: 'agency', title: "Prioridades", transKey: "sidebar.priorities", url: "/prioridades", icon: FlagIcon },
  { section: 'agency', title: "Comercial", transKey: "sidebar.crm", url: "/comercial", icon: DocumentTextIcon },
  // Radar: só pra quem tem radar_can_view() no banco (filtro abaixo).
  { section: 'agency', title: "Radar", transKey: "sidebar.radar", url: "/radar", icon: ViewfinderCircleIcon },
  // Clientes vira item único (dropdown removido a pedido) — vai pra lista.
  { section: 'agency', title: "Clientes", transKey: "sidebar.clients", url: "/clients", icon: UserGroupIcon },
  { section: 'agency', title: "Aplicativos", transKey: "sidebar.apps", url: "/aplicativos", icon: DevicePhoneMobileIcon },

  // ─── Seção: Gestão e Ajustes ───
  { section: 'management', title: "Financeiro Agência", transKey: "sidebar.financial_agency", url: "/financeiro", icon: WalletIcon },
  { section: 'management', title: "Produtos", transKey: "sidebar.products", url: "/products", icon: CubeIcon },

  {
    section: 'management',
    title: "Briefing",
    transKey: "sidebar.briefing",
    icon: ClipboardDocumentListIcon,
    submenu: [
      { title: "Formulário", transKey: "sidebar.briefing_form", url: "/briefing/formulario", icon: DocumentTextIcon },
      { title: "Arquivos", transKey: "sidebar.briefing_archive", url: "/briefing/arquivos", icon: FolderOpenIcon },
    ]
  },

  { section: 'management', title: "Google Calendar", transKey: "sidebar.google_calendar", url: "/google-calendar", icon: CalendarDaysIcon },
  { section: 'management', title: "Ajustes", transKey: "sidebar.settings", url: "/settings", icon: Cog6ToothIcon },
];

export function AppSidebar() {
  const { state, toggleSidebar, isMobile, setOpenMobile, open, setOpen } = useSidebar();
  const location = useLocation();
  const { t } = useTranslation();
  const { selectedClientId, selectedClientName } = useDashboard();
  const { isOwner, isAgency, setIsAgency } = useAccountType();
  const isCollapsed = state === "collapsed";
  const [openMenus, setOpenMenus] = useState<{ [key: string]: boolean }>({});
  const [initializedMenus, setInitializedMenus] = useState<{ [key: string]: boolean }>({});
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { canView, isAdmin, isClient, isLoading: isLoadingPermissions } = usePermissions();
  const { canViewRadar } = useRadarAccess();

  const isAdminMode = isAgency;

  if (isClient) {
    return null;
  }

  const handleMouseEnter = () => {
    setIsHovering(true);
    if (!isMobile) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (!open) {
        setOpen(true);
      }
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (!isMobile && open && !isPopoverOpen) {
      hoverTimeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 150);
    }
  };

  useEffect(() => {
    if (!isPopoverOpen && open && !isMobile && !isHovering) {
      setOpen(false);
    }
  }, [isPopoverOpen, open, isMobile, setOpen, isHovering]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const getPermissionFeature = (transKey: string): string | null => {
    const map: Record<string, string> = {
      'sidebar.dashboard': 'dashboard',
      'sidebar.general_board': 'demands',
      'sidebar.clients': 'clients',
      'sidebar.apps': 'clients',
      'sidebar.tasks': 'demands',
      'sidebar.tasks_fixo': 'demands',
      'sidebar.tasks_avulso': 'demands',
      'sidebar.forms': 'solicitacoes_forms',
      'sidebar.requests_list': 'solicitacoes_list',
      'sidebar.products': 'products',
      'sidebar.connections': 'connections',
      'sidebar.account_groups': 'account_groups',
      'sidebar.analytics': 'analytics',
      'sidebar.reports': 'reports',
      'sidebar.relatorios': 'reports',
      'sidebar.reports_group': 'reports',
      'sidebar.financial': 'financial',
      'sidebar.financial_agency': 'financial',
      'sidebar.financial_academy': 'financial',
      'settings.tabs.general': 'settings_general',
      'settings.tabs.team': 'team',
      'settings.tabs.notifications': 'notifications',
      'settings.tabs.governance': 'governance',
      'sidebar.finance': 'financial',
      'sidebar.settings': 'settings_general',
      'sidebar.request_demand': 'demands',
      'sidebar.tracking': 'tracking',
      'sidebar.smart_data': 'analytics',
      'sidebar.crm': 'crm',
      'sidebar.timeline': 'demands',
      'sidebar.tools': 'demands',
      'sidebar.google_calendar': 'google_tools',
      'sidebar.training': 'training',
      'sidebar.training_library': 'training',
      'sidebar.training_manage': 'training',
      'sidebar.briefing': 'training',
      'sidebar.briefing_form': 'training',
      'sidebar.briefing_archive': 'training',
      'sidebar.orders': 'clients',
      'sidebar.files': 'clients',
    };
    return map[transKey] || null;
  };

  const filteredMainMenu = useMemo(() => {
    return mainMenuItems.map(item => {
      let filteredSubmenu = item.submenu;
      if (item.submenu) {
        filteredSubmenu = item.submenu.filter(sub => {
          if (sub.transKey === "settings.tabs.team" && !isAgency) return false;
          const subFeature = getPermissionFeature(sub.transKey);
          if (subFeature && !canView(subFeature)) return false;
          return true;
        });
      }
      if (item.transKey === "sidebar.clients" && selectedClientId) {
        // No longer inject hubMenuItems - those are now standalone pages
      }
      return {
        ...item,
        submenu: filteredSubmenu && filteredSubmenu.length > 0 ? filteredSubmenu : undefined
      };
    }).filter(item => {
      const feature = getPermissionFeature(item.transKey);
      if (feature && !canView(feature)) return false;
      if (item.transKey === "sidebar.account_groups") return !isAdminMode;
      if (item.transKey === "sidebar.paineis") return isAdmin;
      if (item.transKey === "sidebar.radar") return canViewRadar && !isClient;
      if (!item.url && (!item.submenu || (Array.isArray(item.submenu) && item.submenu.length === 0))) return false;
      return true;
    });
  }, [isAdminMode, canView, selectedClientId, isAgency, isClient, canViewRadar]);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  // Ativo = variante SOLID (preenchida), repouso = outline — padrão iOS.
  const SOLID_MAP = new Map<IconComponent, IconComponent>([
    [ClipboardDocumentListIcon, ClipboardDocumentListSolid],
    [FlagIcon, FlagSolid],
    [DocumentTextIcon, DocumentTextSolid],
    [UserGroupIcon, UserGroupSolid],
    [WalletIcon, WalletSolid],
    [CubeIcon, CubeSolid],
    [CalendarDaysIcon, CalendarDaysSolid],
    [Cog6ToothIcon, Cog6ToothSolid],
    [DevicePhoneMobileIcon, DevicePhoneMobileSolid],
    [ViewfinderCircleIcon, ViewfinderCircleSolid],
  ]);

  const renderIcon = (Icon: IconComponent, className?: string, active = false) => {
    const Resolved = active ? (SOLID_MAP.get(Icon) ?? Icon) : Icon;
    return <Resolved className={cn("h-[18px] w-[18px] shrink-0", className)} strokeWidth={1.5} />;
  };

  const renderMenuItem = (item: MenuItem) => {
    const translated = t(item.transKey);
    const itemTitle = translated === item.transKey ? item.title : translated;

    if (item.submenu) {
      const isAnySubmenuActive = item.submenu?.some(sub => {
        if (sub.url?.includes('?')) {
          const [path, query] = sub.url.split('?');
          return location.pathname === path && location.search === `?${query}`;
        }
        return sub.url ? location.pathname === sub.url : false;
      });

      const isOpen = initializedMenus[item.title]
        ? !!openMenus[item.title]
        : (openMenus[item.title] ?? isAnySubmenuActive);

      return (
        <Collapsible
          key={item.title}
          open={isOpen}
          onOpenChange={(open) => {
            setInitializedMenus(prev => ({ ...prev, [item.title]: true }));
            setOpenMenus(prev => ({ ...prev, [item.title]: open }));
          }}
          className="group/collapsible"
        >
          <SidebarMenuItem>
            <motion.div
              whileHover={{ scale: 0.98 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={cn(
                "flex items-center w-full transition-all duration-300 ease-out",
                !isCollapsed ? "px-0 py-1.5" : "p-0 justify-center",
                isAnySubmenuActive
                  ? "text-primary font-bold bg-primary/10 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
              <SidebarMenuButton
                asChild
                tooltip={itemTitle}
                className={cn(
                  "h-auto p-0 rounded-none border-none hover:bg-transparent hover:text-inherit flex-1 px-4",
                  !isCollapsed && "gap-3"
                )}
              >
                <NavLink
                  to={item.url || "#"}
                  onClick={(e) => {
                    handleNavClick();
                    if (!item.url) {
                      e.preventDefault();
                      setInitializedMenus(prev => ({ ...prev, [item.title]: true }));
                      setOpenMenus(prev => ({ ...prev, [item.title]: !isOpen }));
                    }
                  }}
                  className="flex items-center gap-3 w-full"
                >
                  {/* Ativo comunica por fill + icone solid — sem barrinha lateral (macOS) */}
                  {renderIcon(item.icon, isAnySubmenuActive ? "text-primary" : "text-muted-foreground group-hover/menu-item:text-primary", isAnySubmenuActive)}
                  {!isCollapsed && (
                    <span className="text-left text-base font-medium tracking-tight truncate">{itemTitle}</span>
                  )}
                </NavLink>
              </SidebarMenuButton>

              {!isCollapsed && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-transparent hover:text-inherit mr-2"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""} ${isAnySubmenuActive ? "text-primary" : ""}`} strokeWidth={1.5} />
                  </Button>
                </CollapsibleTrigger>
              )}
            </motion.div>

            {!isCollapsed && (
              <CollapsibleContent>
                <SidebarMenuSub className="ml-8 pl-0 border-l border-primary/10 space-y-0.5 mt-1 mb-1">
                  {item.submenu?.map((subItem) => {
                    const subFeature = getPermissionFeature(subItem.transKey);
                    if (subFeature && !canView(subFeature)) return null;
                    if (subItem.transKey === "settings.tabs.team" && !isAgency) return null;

                    let isActive = false;
                    if (subItem.url?.includes('?')) {
                      const [path, query] = subItem.url.split('?');
                      isActive = location.pathname === path && location.search === `?${query}`;
                    } else if (subItem.url) {
                      isActive = location.pathname === subItem.url;
                    }

                    const isSubActive = isActive;

                    return (
                      <SidebarMenuSubItem key={subItem.title} className="w-full p-0 m-0 block group/sub-item">
                        <motion.div
                          whileHover={{ scale: 0.98, x: 2 }}
                          whileTap={{ scale: 0.96 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                          <SidebarMenuSubButton asChild className="w-full h-auto p-0 m-0 rounded-none border-none block hover:bg-transparent hover:text-inherit">
                            <NavLink
                              to={subItem.url}
                              onClick={handleNavClick}
                              className={cn(
                                "relative flex items-center gap-2.5 px-3 py-1 transition-all duration-300 ease-out font-medium w-full text-[13px]",
                                isSubActive
                                  ? "text-primary bg-primary/10 font-bold"
                                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              )}
                            >
                              {renderIcon(subItem.icon, cn("h-4 w-4 shrink-0 transition-colors", isSubActive ? "text-primary" : "text-muted-foreground group-hover/sub-item:text-primary"))}
                              <span className="tracking-tight">{subItem.transKey ? (t(subItem.transKey) === subItem.transKey ? subItem.title : t(subItem.transKey)) : subItem.title}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </motion.div>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            )}
          </SidebarMenuItem>
        </Collapsible>
      );
    } else {
      const isActive = item.url?.includes('?')
        ? (() => {
          const [path, query] = item.url.split('?');
          return location.pathname === path && location.search === `?${query}`;
        })()
        : location.pathname === item.url;
      return (
        <SidebarMenuItem key={item.title}>
          <motion.div
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={cn(
              "flex items-center w-full transition-all duration-300 ease-out",
              !isCollapsed ? "px-0 py-1.5" : "p-0 justify-center",
              isActive
                ? "text-primary font-medium bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}>
            <SidebarMenuButton
              asChild
              tooltip={itemTitle}
              className={cn(
                "h-auto p-0 rounded-none border-none hover:bg-transparent hover:text-inherit flex-1 px-4",
                !isCollapsed && "gap-3"
              )}
            >
              <NavLink
                to={item.url || "#"}
                onClick={handleNavClick}
                className="flex items-center gap-3 w-full"
              >
                {renderIcon(item.icon, isActive ? "text-primary" : "text-muted-foreground group-hover/menu-item:text-primary", isActive)}
                {!isCollapsed && (
                  <span className="text-left text-base font-medium tracking-tight truncate">{itemTitle}</span>
                )}
              </NavLink>
            </SidebarMenuButton>
          </motion.div>
        </SidebarMenuItem>
      );
    }
  };

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Sidebar collapsible="icon" variant="floating" className="border-0 bg-transparent">
        <div className={cn(
          "flex flex-col border-b border-border/40 transition-all duration-200 h-16 justify-center",
          isCollapsed ? "items-center px-0" : "px-5"
        )}>
          {/* Logo apenas identitário — não é link/botão (não navega ao clicar). */}
          <div className="select-none">
            {!isCollapsed ? (
              <img src={leverLogo} alt="NODE" className="h-4 w-auto" />
            ) : (
              <img src={nodeTile} alt="NODE" className="h-6 w-6 object-contain rounded" />
            )}
          </div>
        </div>

        <SidebarContent className="p-0">
          <SidebarGroup className="p-0">
            {isAdmin && isAgency && !isClient && (
              <SidebarGroupLabel className="px-5 mt-4 text-[10px] uppercase tracking-widest font-bold opacity-40">Agência</SidebarGroupLabel>
            )}
            <SidebarMenu className="gap-0">
              {filteredMainMenu.filter(i => i.section === 'agency').map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup className="p-0">
            {isAdmin && isAgency && !isClient && (
              <SidebarGroupLabel className="px-5 mt-4 text-[10px] uppercase tracking-widest font-bold opacity-40">Gestão e Ajustes</SidebarGroupLabel>
            )}
            <SidebarMenu className="gap-0">
              {filteredMainMenu.filter(i => i.section === 'management').map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className={cn(
          "p-4 border-t border-border/50 transition-all duration-200 space-y-3",
          isCollapsed && "items-center px-0"
        )}>
          <div className={cn("flex flex-col gap-2 w-full", isCollapsed && "items-center")}>
            <div className={cn("flex items-center justify-between w-full", isCollapsed && "justify-center")}>
              <AccountDetailsPopover collapsed={isCollapsed} onOpenChange={setIsPopoverOpen} />
            </div>
          </div>
        </SidebarFooter>
      </Sidebar >
    </div>
  );
}
