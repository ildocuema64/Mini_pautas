/*
component-meta:
  name: DashboardLayout
  description: Layout principal com bottom nav mobile e sidebar desktop
  tokens: [--color-primary, --spacing-4, min-h-touch]
  responsive: true
  tested-on: [360x800, 768x1024, 1440x900]
*/

import { ReactNode, useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { NotificationPanel } from './NotificationPanel'
import { NotificationDetailModal } from './NotificationDetailModal'
import { AppNotification } from '../utils/notificationUtils'
import { fetchNotifications, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications, subscribeToNotifications } from '../utils/notificationApi'
import { isSuperAdmin } from '../utils/permissions'

interface SidebarProps {
    children: ReactNode
    currentPage: string
    onNavigate: (page: string, params?: { filter?: string }) => void
    onSearch?: (query: string) => void
}

interface NavItem {
    name: string
    icon: ReactNode
    path: string
    badge?: number
    showInMobile?: boolean
}

export const DashboardLayout: React.FC<SidebarProps> = ({ children, currentPage, onNavigate, onSearch }) => {
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const { user, isEscola, isProfessor, isAluno: isAlunoRole, isEncarregado: isEncarregadoRole, isSecretario: isSecretarioRole, isDirecaoMunicipal: isDirecaoMunicipalRole, isDirecaoProvincial: isDirecaoProvincialRole, escolaProfile, professorProfile, alunoProfile, encarregadoProfile, secretarioProfile, direcaoMunicipalProfile, direcaoProvincialProfile, profile, signOut } = useAuth()

    const isSuperAdminUser = profile ? isSuperAdmin(profile) : false

    // Notification state
    const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
    const [notifications, setNotifications] = useState<AppNotification[]>([])
    const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null)
    const [loadingNotifications, setLoadingNotifications] = useState(false)

    // Helper to get display name
    const getDisplayName = () => {
        if (isEscola && escolaProfile) {
            return escolaProfile.nome || 'Escola'
        } else if (isProfessor && professorProfile) {
            return professorProfile.nome_completo || 'Professor'
        } else if (isAlunoRole && alunoProfile) {
            return alunoProfile.nome_completo || 'Aluno'
        } else if (isEncarregadoRole && encarregadoProfile) {
            // Get name from first associated student or use email
            const primeiroEducando = encarregadoProfile.alunos_associados?.[0]
            return primeiroEducando?.nome_encarregado || 'Encarregado'
        } else if (isSecretarioRole && secretarioProfile) {
            return secretarioProfile.nome_completo || 'Secretário'
        } else if (isDirecaoMunicipalRole && direcaoMunicipalProfile) {
            return direcaoMunicipalProfile.nome || 'Direção Municipal'
        } else if (isDirecaoProvincialRole && direcaoProvincialProfile) {
            return direcaoProvincialProfile.nome || 'Direção Provincial'
        }
        return user?.email?.split('@')[0] || 'Usuário'
    }

    // Helper to get initials
    const getInitials = () => {
        const name = getDisplayName()
        return name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    }

    // Load notifications on mount and when user changes
    useEffect(() => {
        if (user) {
            loadNotifications()
        }
    }, [user])

    // Listen for navigate CustomEvent from SuperAdminDashboard quick actions
    useEffect(() => {
        const handleNavigateEvent = (event: Event) => {
            const customEvent = event as CustomEvent<{ page: string; filter?: string }>
            if (customEvent.detail?.page) {
                // Pass filter as params if provided
                const params = customEvent.detail.filter ? { filter: customEvent.detail.filter } : undefined
                onNavigate(customEvent.detail.page, params)
            }
        }

        window.addEventListener('navigate', handleNavigateEvent)
        return () => {
            window.removeEventListener('navigate', handleNavigateEvent)
        }
    }, [onNavigate])


    const loadNotifications = async () => {
        if (!user) return

        setLoadingNotifications(true)
        const { data } = await fetchNotifications(user.id)
        setNotifications(data)
        setLoadingNotifications(false)
    }

    // Subscribe to real-time notifications
    useEffect(() => {
        if (!user) return

        const unsubscribe = subscribeToNotifications(user.id, (newNotification) => {
            setNotifications(prev => [newNotification, ...prev])
        })

        return () => {
            unsubscribe()
        }
    }, [user])

    const handleMarkAsRead = async (id: string) => {
        await markAsRead(id)
        setNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, lida: true } : n)
        )
    }

    const handleMarkAllAsRead = async () => {
        if (!user) return

        await markAllAsRead(user.id)
        setNotifications(prev =>
            prev.map(n => ({ ...n, lida: true }))
        )
    }

    const handleDeleteNotification = async (id: string) => {
        await deleteNotification(id)
        setNotifications(prev => prev.filter(n => n.id !== id))
    }

    const handleClearAllNotifications = async () => {
        if (!user) return
        await deleteAllNotifications(user.id)
        setNotifications([])
    }

    const unreadCount = notifications.filter(n => !n.lida).length

    // Helper to get role label
    const getRoleLabel = () => {
        if (isSuperAdminUser) return 'SUPERADMIN'
        if (isDirecaoProvincialRole) return 'Direção Provincial'
        if (isDirecaoMunicipalRole) return 'Direção Municipal'
        if (isEscola) return 'Administrador'
        if (isProfessor) return 'Professor'
        if (isAlunoRole) return 'Aluno'
        if (isEncarregadoRole) return 'Encarregado'
        return 'Usuário'
    }

    // SUPERADMIN navigation items
    const superAdminNavItems: NavItem[] = [
        {
            name: 'Dashboard',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
            path: 'superadmin-dashboard',
            showInMobile: true,
        },
        {
            name: 'Gestão de Escolas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
            path: 'superadmin-escolas',
            showInMobile: true,
        },
        {
            name: 'Licenças',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
            ),
            path: 'superadmin-licencas',
            showInMobile: true,
        },
        {
            name: 'Auditoria',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'superadmin-audit',
            showInMobile: true,
        },
        {
            name: 'Acessos',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            ),
            path: 'superadmin-acessos',
            showInMobile: true,
        },
        {
            name: 'Tutoriais',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            ),
            path: 'superadmin-tutoriais',
            showInMobile: true,
        },
        {
            name: 'Municípios',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                </svg>
            ),
            path: 'superadmin-direcoes-municipais',
            showInMobile: true,
        },
        {
            name: 'Províncias',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
            path: 'superadmin-direcoes-provinciais',
            showInMobile: true,
        },
        {
            name: 'Configurações',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            path: 'settings',
            showInMobile: false,
        },
    ]

    // Determine which navigation items to show
    const navItems: NavItem[] = isSuperAdminUser ? superAdminNavItems : [
        {
            name: 'Dashboard',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
            path: 'dashboard',
            showInMobile: true,
        },
        {
            name: 'Professores',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            ),
            path: 'teachers',
            showInMobile: true,
        },
        {
            name: 'Secretários',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'secretaries',
            showInMobile: false,
        },
        {
            name: 'Funcionários',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            path: 'staff',
            showInMobile: true,
        },
        {
            name: 'Templates',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
            ),
            path: 'templates',
            showInMobile: false,
        },
        {
            name: 'Turmas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            path: 'classes',
            showInMobile: true,
        },
        {
            name: 'Pagamentos',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            path: 'propinas',
            showInMobile: false,
        },
        {
            name: 'Notas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
            ),
            path: 'grades',
            showInMobile: true,
        },
        {
            name: 'Solicitações',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'solicitacoes',
            showInMobile: true,
        },
        {
            name: 'Relatórios',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'reports',
            showInMobile: false,
        },
        {
            name: 'Matrículas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'matriculas',
            showInMobile: false,
        },
        {
            name: 'Subscrição',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
            ),
            path: 'subscription',
            showInMobile: false,
        },
        {
            name: 'Configurações',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            path: 'settings',
            showInMobile: false,
        },
    ].filter(item => {
        if (item.path === 'teachers') return isEscola // Only show teachers menu for School Admins
        if (item.path === 'staff') return isEscola // Only show staff menu for School Admins
        if (item.path === 'secretaries') return isEscola // Only show secretaries menu for School Admins
        if (item.path === 'classes' || item.path === 'propinas') return isEscola // Hide for professors
        if (item.path === 'subscription') return isEscola // Only show subscription menu for School Admins
        if (item.path === 'matriculas') return isEscola // Only show matriculas menu for School Admins
        if (item.path === 'templates') return isEscola // Only show templates menu for School Admins
        if (item.path === 'solicitacoes') return isProfessor // Only show solicitacoes for Professors
        return true
    })

    // ALUNO navigation items
    const alunoNavItems: NavItem[] = [
        {
            name: 'Minhas Notas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
            ),
            path: 'aluno-notas',
            showInMobile: true,
        },
    ]

    // ENCARREGADO navigation items
    const encarregadoNavItems: NavItem[] = [
        {
            name: 'Notas dos Educandos',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
            ),
            path: 'encarregado-notas',
            showInMobile: true,
        },
    ]

    // SECRETARIO navigation items - limited to students and payments
    const secretarioNavItems: NavItem[] = [
        {
            name: 'Dashboard',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
            ),
            path: 'dashboard',
            showInMobile: true,
        },
        {
            name: 'Pagamentos',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            path: 'propinas',
            showInMobile: true,
        },
    ]

    // DIREÇÃO MUNICIPAL navigation items
    const direcaoMunicipalNavItems: NavItem[] = [
        {
            name: 'Dashboard',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
            path: 'dashboard',
            showInMobile: true,
        },
        {
            name: 'Escolas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
            path: 'escolas',
            showInMobile: true,
        },
        {
            name: 'Supervisão Pedagógica',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'supervisao-pedagogica',
            showInMobile: true,
        },
        {
            name: 'Funcionários',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
            path: 'funcionarios',
            showInMobile: false,
        },
        {
            name: 'Circulares',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
            ),
            path: 'circulares',
            showInMobile: false,
        },
        {
            name: 'Solicitações',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'solicitacoes',
            showInMobile: true,
        },
        {
            name: 'Relatórios',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'relatorios-municipais',
            showInMobile: true,
        },
        {
            name: 'Configurações',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            path: 'settings',
            showInMobile: false,
        },
    ]

    // DIREÇÃO PROVINCIAL navigation items
    const direcaoProvincialNavItems: NavItem[] = [
        {
            name: 'Dashboard',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            ),
            path: 'dashboard',
            showInMobile: true,
        },
        {
            name: 'Municípios',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
            path: 'provincial-direcoes-municipais',
            showInMobile: true,
        },
        {
            name: 'Escolas',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                </svg>
            ),
            path: 'provincial-escolas',
            showInMobile: true,
        },
        {
            name: 'Supervisão',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
            ),
            path: 'provincial-supervisao',
            showInMobile: true,
        },
        {
            name: 'Circulares',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
            ),
            path: 'provincial-circulares',
            showInMobile: false,
        },
        {
            name: 'Relatórios',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
            path: 'provincial-relatorios',
            showInMobile: false,
        },
        {
            name: 'Configurações',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            path: 'settings',
            showInMobile: false,
        },
    ]

    // Get final nav items based on role
    const getFinalNavItems = (): NavItem[] => {
        if (isSuperAdminUser) return superAdminNavItems
        if (isDirecaoProvincialRole) return direcaoProvincialNavItems
        if (isDirecaoMunicipalRole) return direcaoMunicipalNavItems
        if (isAlunoRole) return alunoNavItems
        if (isEncarregadoRole) return encarregadoNavItems
        if (isSecretarioRole) return secretarioNavItems
        return navItems
    }

    const finalNavItems = getFinalNavItems()

    // Items for mobile bottom nav (max 5)
    const mobileNavItems = finalNavItems.filter(item => item.showInMobile)
    // Add "More" button for mobile
    const moreIcon = (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    )

    const getPageTitle = () => {
        const item = finalNavItems.find(i => i.path === currentPage)
        return item?.name || 'Dashboard'
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (onSearch) {
            onSearch(searchQuery)
        }
    }

    const handleMobileNav = (path: string) => {
        if (path === 'more') {
            setMobileMenuOpen(true)
        } else {
            onNavigate(path)
            setMobileMenuOpen(false)
        }
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-50 relative overflow-hidden">
            {/* Background Pattern - Subtle */}
            <div className="absolute inset-0 opacity-[0.015] pointer-events-none z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
            />

            {/* Desktop Sidebar - Hidden on mobile */}
            <aside
                className={`hidden md:flex ${sidebarOpen ? 'w-72' : 'w-20'
                    } bg-white/90 backdrop-blur-xl border-r border-slate-200/60 transition-all duration-300 ease-in-out flex-col relative z-20 shadow-sm`}
            >
                {/* Logo */}
                <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100">
                    {sidebarOpen ? (
                        <div className="flex items-center gap-3 animate-fade-in">
                            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-xl shadow-lg shadow-primary-500/20 flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-900 leading-tight">EduGest</span>
                                <span className="text-[10px] font-bold tracking-widest text-primary-600 uppercase">Angola</span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-xl shadow-md flex items-center justify-center mx-auto">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
                    {finalNavItems.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => onNavigate(item.path)}
                            className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all duration-200 group ${currentPage === item.path
                                ? 'bg-primary-50/80 text-primary-700 shadow-sm ring-1 ring-primary-100'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <div className={`transition-colors duration-200 ${currentPage === item.path ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                {item.icon}
                            </div>
                            {sidebarOpen && (
                                <>
                                    <span className="flex-1 text-left text-sm font-semibold tracking-wide">{item.name}</span>
                                    {item.badge && (
                                        <span className="bg-primary-100 text-primary-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-primary-200">
                                            {item.badge}
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                    ))}
                </nav>

                {/* User Profile */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                    <div className={`flex items-center gap-3 px-2 py-2 rounded-xl transition-colors cursor-pointer hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100 ${!sidebarOpen && 'justify-center'}`}>
                        <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md ring-2 ring-white">
                            {getInitials()}
                        </div>
                        {sidebarOpen && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">
                                    {getDisplayName()}
                                </p>
                                {isSecretarioRole && secretarioProfile?.escola ? (
                                    <>
                                        <p className="text-xs text-primary-600 truncate font-medium">{secretarioProfile.escola.nome}</p>
                                        <p className="text-[10px] text-slate-400 truncate">{getRoleLabel()}</p>
                                    </>
                                ) : (
                                    <p className="text-xs text-slate-500 truncate font-medium">{getRoleLabel()}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Toggle Button */}
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="absolute -right-3 top-24 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-primary-600 hover:border-primary-100 transition-all shadow-sm z-30 ring-2 ring-slate-50"
                >
                    <svg
                        className={`w-3.5 h-3.5 transition-transform duration-300 ${!sidebarOpen && 'rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden pb-[calc(env(safe-area-inset-bottom)+60px)] md:pb-0 z-10">
                {/* Header - Responsive */}
                <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-4 md:px-8 z-20 sticky top-0 overflow-visible">
                    <div className="flex items-center gap-4">
                        {/* Mobile Logo */}
                        <div className="md:hidden w-9 h-9 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/20">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight">{getPageTitle()}</h1>
                    </div>

                    <div className="flex items-center gap-3 md:gap-6">
                        {/* Search - Hidden on mobile, shown on desktop */}
                        <form onSubmit={handleSearch} className="relative hidden md:block group">
                            <input
                                type="search"
                                placeholder="Buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-64 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white transition-all duration-200"
                            />
                            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2 group-focus-within:text-primary-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </form>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 relative">
                            <button
                                onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
                                className="relative p-2.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all duration-200 active:scale-95"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse" />
                                )}
                            </button>

                            <NotificationPanel
                                isOpen={notificationPanelOpen}
                                onClose={() => setNotificationPanelOpen(false)}
                                notifications={notifications}
                                onMarkAsRead={handleMarkAsRead}
                                onMarkAllAsRead={handleMarkAllAsRead}
                                onSelectNotification={setSelectedNotification}
                                onClearAllNotifications={handleClearAllNotifications}
                                loading={loadingNotifications}
                            />

                            <NotificationDetailModal
                                notification={selectedNotification}
                                isOpen={!!selectedNotification}
                                onClose={() => setSelectedNotification(null)}
                                onDelete={handleDeleteNotification}
                                onNavigate={(link) => {
                                    setSelectedNotification(null)
                                    onNavigate(link)
                                }}
                            />

                            <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block" />

                            <button
                                onClick={() => signOut()}
                                className="hidden md:flex p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 active:scale-95 tooltip-trigger"
                                title="Sair"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Content Area with Page Transition */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 scroll-smooth">
                    <div className="page-enter max-w-7xl mx-auto w-full">
                        {children}
                    </div>
                </div>
            </main>

            {/* Mobile Bottom Navigation - Glassmorphism */}
            <nav className="mobile-bottom-nav md:hidden fixed bottom-4 left-4 right-4 bg-white/90 backdrop-blur-xl border border-white/20 shadow-lg shadow-black/5 rounded-2xl z-40 overflow-hidden isolate"
                style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.05)'
                }}
            >
                {/* Active Indicator Background */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    {/* We could add a sliding pill here if we calculated position, but simpler to style the buttons */}
                </div>

                <div className="grid grid-cols-5 items-center relative z-10">
                    {mobileNavItems.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => handleMobileNav(item.path)}
                            className={`relative flex flex-col items-center justify-center py-3 px-1 transition-all duration-300 ${currentPage === item.path
                                ? 'text-primary-600'
                                : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <span className={`absolute -top-[1px] left-1/2 -translate-x-1/2 w-8 h-1 bg-primary-500 rounded-b-lg transition-transform duration-300 ${currentPage === item.path ? 'translate-y-0' : '-translate-y-full'}`} />

                            <div className={`transition-transform duration-200 ${currentPage === item.path ? 'scale-110 -translate-y-0.5' : ''}`}>
                                {item.icon}
                            </div>
                            <span className={`text-[10px] mt-1 font-medium leading-none transition-all duration-200 ${currentPage === item.path ? 'opacity-100 font-bold' : 'opacity-70'}`}>
                                {item.name}
                            </span>
                        </button>
                    ))}
                    {/* More Button */}
                    <button
                        onClick={() => handleMobileNav('more')}
                        className="relative flex flex-col items-center justify-center py-3 px-1 transition-all duration-200 text-slate-400 active:text-slate-600"
                    >
                        <div className="transition-transform active:scale-95">
                            {moreIcon}
                        </div>
                        <span className="text-[10px] mt-1 font-medium leading-none opacity-70">Mais</span>
                    </button>
                </div>
            </nav>

            {/* Mobile More Menu Overlay */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 z-[60]">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
                        onClick={() => setMobileMenuOpen(false)}
                    />

                    {/* Menu Panel */}
                    <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xl rounded-2xl p-2 pb-6 animate-slide-up shadow-2xl safe-area-inset-bottom ring-1 ring-slate-200">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 mt-2" />

                        <div className="space-y-1">
                            {finalNavItems.filter(item => !item.showInMobile).map((item) => (
                                <button
                                    key={item.path}
                                    onClick={() => handleMobileNav(item.path)}
                                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${currentPage === item.path
                                        ? 'bg-primary-50 text-primary-600 font-semibold'
                                        : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className={currentPage === item.path ? 'text-primary-600' : 'text-slate-400'}>
                                        {item.icon}
                                    </div>
                                    <span className="text-sm">{item.name}</span>
                                </button>
                            ))}

                            <div className="h-px bg-slate-100 my-2 mx-4" />

                            {/* Logout */}
                            <button
                                onClick={() => signOut()}
                                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-red-600 hover:bg-red-50 transition-all active:scale-[0.98]"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span className="font-semibold text-sm">Terminar Sessão</span>
                            </button>
                        </div>

                        {/* User Info */}
                        <div className="mt-4 pt-4 border-t border-slate-100 px-2">
                            <div className="flex items-center gap-3.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white">
                                    {getInitials()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-900 truncate text-sm">
                                        {getDisplayName()}
                                    </p>
                                    <p className="text-xs text-slate-500 font-medium">{getRoleLabel()}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
