import { ChevronRight } from "lucide-react";
// Ícones do menu: Heroicons outline (repouso) + solid (ativo), igual à admin
import {
    ClipboardDocumentListIcon,
    ClipboardDocumentCheckIcon,
    FlagIcon,
    BriefcaseIcon,
    ArrowTrendingUpIcon,
    UserGroupIcon,
    CalendarDaysIcon,
    ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import {
    ClipboardDocumentListIcon as ClipboardDocumentListSolid,
    FlagIcon as FlagSolid,
    ArrowTrendingUpIcon as ArrowTrendingUpSolid,
    UserGroupIcon as UserGroupSolid,
    CalendarDaysIcon as CalendarDaysSolid,
    ClipboardDocumentCheckIcon as ClipboardDocumentCheckSolid,
    ViewfinderCircleIcon as ViewfinderCircleSolid,
} from "@heroicons/react/24/solid";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { useRadarAccess } from "@/hooks/useRadarAccess";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarMenu,
    SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
    SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AccountDetailsPopover } from "@/components/sidebar/AccountDetailsPopover";
import nodeTile from "@/assets/node-tile.png";
import leverLogo from "@/assets/lever-logo.png";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
interface SubItem { title: string; icon: Icon; url: string; }
interface MenuItem { title: string; icon: Icon; url?: string; submenu?: SubItem[]; }

// Menu do COLABORADOR — mesmo shell/estilo da admin, rotas /agency.
const MENU: MenuItem[] = [
    // Demandas e Clientes viram itens únicos (dropdowns removidos a pedido).
    { title: "Demandas", icon: ClipboardDocumentListIcon, url: "/agency/general-board" },
    { title: "Prioridades", icon: FlagIcon, url: "/agency/prioridades" },
    { title: "Comercial", icon: ArrowTrendingUpIcon, url: "/agency/comercial" },
    { title: "Clientes", icon: UserGroupIcon, url: "/agency/clients" },
    { title: "Google Calendar", icon: CalendarDaysIcon, url: "/agency/google-calendar" },
    {
        title: "Briefing", icon: ClipboardDocumentCheckIcon,
        submenu: [
            { title: "Formulário", icon: ClipboardDocumentListIcon, url: "/agency/briefing/formulario" },
            { title: "Arquivos", icon: BriefcaseIcon, url: "/agency/briefing/arquivos" },
        ],
    },
];

// Só aparece pra quem tem acesso no banco (radar_can_view).
const RADAR_ITEM: MenuItem = { title: "Radar", icon: ViewfinderCircleIcon, url: "/agency/radar" };

// Ativo = ícone preenchido (padrão iOS), repouso = outline.
const SOLID_MAP = new Map<Icon, Icon>([
    [ViewfinderCircleIcon, ViewfinderCircleSolid],
    [ClipboardDocumentListIcon, ClipboardDocumentListSolid],
    [FlagIcon, FlagSolid],
    [ArrowTrendingUpIcon, ArrowTrendingUpSolid],
    [UserGroupIcon, UserGroupSolid],
    [CalendarDaysIcon, CalendarDaysSolid],
    [ClipboardDocumentCheckIcon, ClipboardDocumentCheckSolid],
]);

export function AgencySidebar({ onNavigate }: { onNavigate?: () => void }) {
    const { state, isMobile, setOpenMobile, open, setOpen } = useSidebar();
    const location = useLocation();
    const isCollapsed = state === "collapsed";
    const { canViewRadar } = useRadarAccess();
    // Radar entra logo depois de Comercial.
    const menu = useMemo(() => {
        if (!canViewRadar) return MENU;
        const i = MENU.findIndex((m) => m.url === "/agency/comercial");
        return [...MENU.slice(0, i + 1), RADAR_ITEM, ...MENU.slice(i + 1)];
    }, [canViewRadar]);
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
    const [initialized, setInitialized] = useState<Record<string, boolean>>({});
    const [isHovering, setIsHovering] = useState(false);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

    // Recolhe pra ícones ao sair, expande no hover — mesmo comportamento da admin.
    const handleMouseEnter = () => {
        setIsHovering(true);
        if (!isMobile) {
            if (hoverTimeout.current) { clearTimeout(hoverTimeout.current); hoverTimeout.current = null; }
            if (!open) setOpen(true);
        }
    };
    const handleMouseLeave = () => {
        setIsHovering(false);
        if (!isMobile && open && !isPopoverOpen) {
            hoverTimeout.current = setTimeout(() => setOpen(false), 150);
        }
    };
    // CHAVE: recolhe em repouso. Sem isso a sidebar nasce aberta e nunca fecha
    // sozinha (o que fazia o colaborador ficar sempre expandido, ao contrário
    // da admin, que fica em ícones e só abre no hover).
    useEffect(() => {
        if (!isPopoverOpen && open && !isMobile && !isHovering) setOpen(false);
    }, [isPopoverOpen, open, isMobile, setOpen, isHovering]);
    useEffect(() => () => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); }, []);

    const handleNav = () => { if (isMobile) setOpenMobile(false); onNavigate?.(); };

    const matchUrl = (url?: string) => {
        if (!url) return false;
        if (url.includes("?")) {
            const [p, q] = url.split("?");
            return location.pathname === p && location.search === `?${q}`;
        }
        return location.pathname === url;
    };

    const renderIcon = (Icon: Icon, className?: string, active = false) => {
        const Resolved = active ? (SOLID_MAP.get(Icon) ?? Icon) : Icon;
        return <Resolved className={cn("h-[18px] w-[18px] shrink-0", className)} strokeWidth={1.5} />;
    };

    const renderItem = (item: MenuItem) => {
        if (item.submenu) {
            const anyChildActive = item.submenu.some(s => matchUrl(s.url));
            const isOpen = initialized[item.title] ? !!openMenus[item.title] : (openMenus[item.title] ?? anyChildActive);
            return (
                <Collapsible key={item.title} open={isOpen}
                    onOpenChange={(open) => { setInitialized(p => ({ ...p, [item.title]: true })); setOpenMenus(p => ({ ...p, [item.title]: open })); }}
                    className="group/collapsible">
                    <SidebarMenuItem>
                        <motion.div whileHover={{ scale: 0.98 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.2, ease: "easeInOut" }}
                            className={cn("flex items-center w-full transition-all duration-300 ease-out",
                                !isCollapsed ? "px-0 py-1.5" : "p-0 justify-center",
                                anyChildActive ? "text-primary font-bold bg-primary/10 shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                            <SidebarMenuButton asChild tooltip={item.title}
                                className={cn("h-auto p-0 rounded-none border-none hover:bg-transparent hover:text-inherit flex-1 px-4", !isCollapsed && "gap-3")}>
                                <NavLink to={item.url || "#"}
                                    onClick={(e) => { handleNav(); if (!item.url) { e.preventDefault(); setInitialized(p => ({ ...p, [item.title]: true })); setOpenMenus(p => ({ ...p, [item.title]: !isOpen })); } }}
                                    className="flex items-center gap-3 w-full">
                                    {renderIcon(item.icon, anyChildActive ? "text-primary" : "text-muted-foreground", anyChildActive)}
                                    {!isCollapsed && <span className="text-left text-base font-medium tracking-tight truncate">{item.title}</span>}
                                </NavLink>
                            </SidebarMenuButton>
                            {!isCollapsed && (
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-transparent hover:text-inherit mr-2" onClick={(e) => e.stopPropagation()}>
                                        <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-90", anyChildActive && "text-primary")} strokeWidth={1.5} />
                                    </Button>
                                </CollapsibleTrigger>
                            )}
                        </motion.div>
                        {!isCollapsed && (
                            <CollapsibleContent>
                                <SidebarMenuSub className="ml-8 pl-0 border-l border-primary/10 space-y-0.5 mt-1 mb-1">
                                    {item.submenu.map((sub) => {
                                        const active = matchUrl(sub.url);
                                        return (
                                            <SidebarMenuSubItem key={sub.title} className="w-full p-0 m-0 block group/sub-item">
                                                <motion.div whileHover={{ scale: 0.98, x: 2 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
                                                    <SidebarMenuSubButton asChild className="w-full h-auto p-0 m-0 rounded-none border-none block hover:bg-transparent hover:text-inherit">
                                                        <NavLink to={sub.url} onClick={handleNav}
                                                            className={cn("relative flex items-center gap-2.5 px-3 py-1 transition-all duration-300 ease-out font-medium w-full text-[13px]",
                                                                active ? "text-primary bg-primary/10 font-bold" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                                                            {renderIcon(sub.icon, cn("h-4 w-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover/sub-item:text-primary"))}
                                                            <span className="tracking-tight">{sub.title}</span>
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
        }
        const active = matchUrl(item.url);
        return (
            <SidebarMenuItem key={item.title}>
                <motion.div whileHover={{ scale: 0.98 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.2, ease: "easeInOut" }}
                    className={cn("flex items-center w-full transition-all duration-300 ease-out",
                        !isCollapsed ? "px-0 py-1.5" : "p-0 justify-center",
                        active ? "text-primary font-medium bg-primary/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                    <SidebarMenuButton asChild tooltip={item.title}
                        className={cn("h-auto p-0 rounded-none border-none hover:bg-transparent hover:text-inherit flex-1 px-4", !isCollapsed && "gap-3")}>
                        <NavLink to={item.url || "#"} onClick={handleNav} className="flex items-center gap-3 w-full">
                            {renderIcon(item.icon, active ? "text-primary" : "text-muted-foreground", active)}
                            {!isCollapsed && <span className="text-left text-base font-medium tracking-tight truncate">{item.title}</span>}
                        </NavLink>
                    </SidebarMenuButton>
                </motion.div>
            </SidebarMenuItem>
        );
    };

    return (
        <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        <Sidebar collapsible="icon" variant="floating" className="border-0 bg-transparent">
            {/* Logo NODE centralizado, sem "System" */}
            <div className={cn("flex items-center border-b border-border/40 transition-all duration-200 h-16 justify-center", isCollapsed ? "px-0" : "px-5")}>
                <div className="select-none">
                    {!isCollapsed
                        ? <img src={leverLogo} alt="NODE" className="h-5 w-auto" />
                        : <img src={nodeTile} alt="NODE" className="h-6 w-6 object-contain rounded" />}
                </div>
            </div>

            <SidebarContent className="p-0">
                <SidebarGroup className="p-0">
                    <SidebarMenu className="gap-0">
                        {menu.map(renderItem)}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className={cn("p-4 border-t border-border/50 transition-all duration-200 space-y-3", isCollapsed && "items-center px-0")}>
                <div className={cn("flex items-center justify-between w-full", isCollapsed && "justify-center")}>
                    <AccountDetailsPopover collapsed={isCollapsed} onOpenChange={setIsPopoverOpen} />
                </div>
            </SidebarFooter>
        </Sidebar>
        </div>
    );
}
