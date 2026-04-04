import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from './contexts/AuthContext'
import { LoginScreen } from './components/LoginScreen'
import { DashboardLayout } from './components/DashboardLayout'
import { PageSkeleton } from './components/ui/PageSkeleton'
import { isSuperAdmin } from './utils/permissions'
import { PWAInstallPrompt } from './components/PWAInstallPrompt'
import { SystemUpdateAlert } from './components/SystemUpdateAlert'
import { EscolaProfileSetupModal } from './components/EscolaProfileSetupModal'

// Lazy load all page components for code splitting
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })))
const ClassesPage = lazy(() => import('./components/ClassesPage').then(m => ({ default: m.ClassesPage })))
const ClassDetailsPage = lazy(() => import('./components/ClassDetailsPage').then(m => ({ default: m.ClassDetailsPage })))
const StudentsPage = lazy(() => import('./components/StudentsPage').then(m => ({ default: m.StudentsPage })))
const GradesPage = lazy(() => import('./components/GradesPage').then(m => ({ default: m.GradesPage })))
const ReportsPage = lazy(() => import('./components/ReportsPage').then(m => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })))
const TeachersPage = lazy(() => import('./components/TeachersPage').then(m => ({ default: m.TeachersPage })))
const StaffPage = lazy(() => import('./components/StaffPage').then(m => ({ default: m.StaffPage })))
const ProfessorRegistration = lazy(() => import('./components/ProfessorRegistration').then(m => ({ default: m.ProfessorRegistration })))
const StudentRegistration = lazy(() => import('./components/StudentRegistration').then(m => ({ default: m.StudentRegistration })))
const GuardianRegistration = lazy(() => import('./components/GuardianRegistration').then(m => ({ default: m.GuardianRegistration })))
const ProfessorDashboard = lazy(() => import('./components/ProfessorDashboard').then(m => ({ default: m.ProfessorDashboard })))
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })))
const EscolaManagement = lazy(() => import('./components/EscolaManagement').then(m => ({ default: m.EscolaManagement })))
const SuperAdminAuditLog = lazy(() => import('./components/SuperAdminAuditLog').then(m => ({ default: m.SuperAdminAuditLog })))
const SystemAccessLog = lazy(() => import('./components/SystemAccessLog').then(m => ({ default: m.SystemAccessLog })))
const LicenseManagement = lazy(() => import('./components/LicenseManagement').then(m => ({ default: m.LicenseManagement })))
const AlunoNotasPage = lazy(() => import('./components/AlunoNotasPage').then(m => ({ default: m.AlunoNotasPage })))
const EncarregadoNotasPage = lazy(() => import('./components/EncarregadoNotasPage').then(m => ({ default: m.EncarregadoNotasPage })))
const SubscriptionPage = lazy(() => import('./components/SubscriptionPage').then(m => ({ default: m.SubscriptionPage })))
const PublicPaymentPage = lazy(() => import('./components/PublicPaymentPage').then(m => ({ default: m.PublicPaymentPage })))
const TuitionPaymentsPage = lazy(() => import('./components/TuitionPaymentsPage').then(m => ({ default: m.TuitionPaymentsPage })))
const SecretariesPage = lazy(() => import('./components/SecretariesPage').then(m => ({ default: m.SecretariesPage })))
const SecretaryRegistration = lazy(() => import('./components/SecretaryRegistration').then(m => ({ default: m.SecretaryRegistration })))
const TutoriaisPublicosPage = lazy(() => import('./components/TutoriaisPublicosPage').then(m => ({ default: m.TutoriaisPublicosPage })))
const TutoriaisManagementPage = lazy(() => import('./components/TutoriaisManagementPage').then(m => ({ default: m.TutoriaisManagementPage })))
const MatriculasPage = lazy(() => import('./components/MatriculasPage').then(m => ({ default: m.MatriculasPage })))
const DirecaoMunicipalDashboard = lazy(() => import('./components/DirecaoMunicipalDashboard'))
const EscolasOverviewPage = lazy(() => import('./components/EscolasOverviewPage'))
const SolicitacoesPage = lazy(() => import('./components/SolicitacoesPage'))
const DirecaoMunicipalRegistration = lazy(() => import('./components/DirecaoMunicipalRegistration').then(m => ({ default: m.DirecaoMunicipalRegistration })))
const DirecoesMunicipaisManagement = lazy(() => import('./components/DirecoesMunicipaisManagement').then(m => ({ default: m.DirecoesMunicipaisManagement })))
const DirecoesProvinciaisManagement = lazy(() => import('./components/DirecoesProvinciaisManagement').then(m => ({ default: m.DirecoesProvinciaisManagement })))
const ProfessorDocumentRequestsPage = lazy(() => import('./components/ProfessorDocumentRequestsPage').then(m => ({ default: m.ProfessorDocumentRequestsPage })))

// Municipal Education Module - New Features
const SupervisaoPedagogica = lazy(() => import('./modules/municipal_education/components/SupervisaoPedagogica').then(m => ({ default: m.SupervisaoPedagogica })))
const FuncionariosConsulta = lazy(() => import('./modules/municipal_education/components/FuncionariosConsulta').then(m => ({ default: m.FuncionariosConsulta })))
const CircularesPage = lazy(() => import('./modules/municipal_education/components/CircularesPage').then(m => ({ default: m.CircularesPage })))
const RelatoriosMunicipaisPage = lazy(() => import('./modules/municipal_education/components/RelatoriosPage').then(m => ({ default: m.RelatoriosPage })))

// Provincial Education Module
const DirecaoProvincialDashboard = lazy(() => import('./modules/provincial_education/components/DirecaoProvincialDashboard').then(m => ({ default: m.DirecaoProvincialDashboard })))
const DirecoesMunicipaisGestao = lazy(() => import('./modules/provincial_education/components/DirecoesMunicipaisGestao').then(m => ({ default: m.DirecoesMunicipaisGestao })))
const EscolasProvincialOverview = lazy(() => import('./modules/provincial_education/components/EscolasProvincialOverview').then(m => ({ default: m.EscolasProvincialOverview })))
const SupervisaoPedagogicaProvincial = lazy(() => import('./modules/provincial_education/components/SupervisaoPedagogicaProvincial').then(m => ({ default: m.SupervisaoPedagogicaProvincial })))
const CircularesProvinciaisPage = lazy(() => import('./modules/provincial_education/components/CircularesProvinciaisPage').then(m => ({ default: m.CircularesProvinciaisPage })))
const RelatoriosProvinciaisPage = lazy(() => import('./modules/provincial_education/components/RelatoriosProvinciaisPage').then(m => ({ default: m.RelatoriosProvinciaisPage })))
const DirecaoProvincialRegistration = lazy(() => import('./components/DirecaoProvincialRegistration').then(m => ({ default: m.DirecaoProvincialRegistration })))
const ConfiguracaoDocumentos = lazy(() => import('./components/ConfiguracaoDocumentos').then(m => ({ default: m.ConfiguracaoDocumentos })))
const TemplatesManagement = lazy(() => import('./components/TemplatesManagement').then(m => ({ default: m.TemplatesManagement })))

function App() {
    const { user, loading, isProfessor, isAluno, isEncarregado, isSecretario, isEscola, isDirecaoMunicipal, isDirecaoProvincial, escolaProfile, profile } = useAuth()
    const [currentPage, setCurrentPage] = useState('dashboard')
    const [navigationParams, setNavigationParams] = useState<{ turmaId?: string; filter?: string }>({})
    const [searchQuery, setSearchQuery] = useState('')
    const [showEscolaSetup, setShowEscolaSetup] = useState(false)

    // Check if escola needs to complete profile setup
    useEffect(() => {
        if (user && isEscola && escolaProfile) {
            const config = escolaProfile.configuracoes as Record<string, any> | null
            if (!config?.perfil_configurado) {
                setShowEscolaSetup(true)
            }
        }
    }, [user, isEscola, escolaProfile])

    const isSuperAdminUser = profile ? isSuperAdmin(profile) : false

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 p-4 md:p-8">
                <PageSkeleton variant="dashboard" />
            </div>
        )
    }

    // Public routes - accessible without authentication
    if (window.location.pathname === '/pagamento-escola') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <PublicPaymentPage />
            </Suspense>
        )
    }

    if (window.location.pathname === '/register-professor') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <ProfessorRegistration />
            </Suspense>
        )
    }

    if (window.location.pathname === '/register-student') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <StudentRegistration />
            </Suspense>
        )
    }

    if (window.location.pathname === '/register-guardian') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <GuardianRegistration />
            </Suspense>
        )
    }

    if (window.location.pathname === '/register-secretary') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <SecretaryRegistration />
            </Suspense>
        )
    }

    if (window.location.pathname === '/register-direcao-municipal') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <DirecaoMunicipalRegistration />
            </Suspense>
        )
    }

    if (window.location.pathname === '/register-direcao-provincial') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <DirecaoProvincialRegistration />
            </Suspense>
        )
    }

    if (window.location.pathname === '/reset-password') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <ResetPasswordPage />
            </Suspense>
        )
    }

    // Public tutorials page - accessible without login
    if (window.location.pathname === '/tutoriais') {
        return (
            <Suspense fallback={<PageSkeleton />}>
                <TutoriaisPublicosPage onBack={() => window.location.href = '/'} />
            </Suspense>
        )
    }

    if (!user) {
        return <LoginScreen />
    }

    const handleNavigate = (page: string, params?: { turmaId?: string; filter?: string }) => {
        setCurrentPage(page)
        setSearchQuery('') // Clear search when navigating
        if (params) {
            setNavigationParams(params)
        } else {
            setNavigationParams({})
        }
    }

    const renderPage = () => {
        // SUPERADMIN routes
        if (isSuperAdminUser) {
            switch (currentPage) {
                case 'dashboard':
                case 'superadmin-dashboard':
                    return <SuperAdminDashboard />
                case 'superadmin-escolas':
                    return <EscolaManagement initialFilter={navigationParams.filter as any} />
                case 'superadmin-licencas':
                    return <LicenseManagement />
                case 'superadmin-audit':
                    return <SuperAdminAuditLog />
                case 'superadmin-tutoriais':
                    return <TutoriaisManagementPage />
                case 'superadmin-direcoes-municipais':
                    return <DirecoesMunicipaisManagement onNavigate={handleNavigate} />
                case 'superadmin-direcoes-provinciais':
                    return <DirecoesProvinciaisManagement onNavigate={handleNavigate} />
                case 'superadmin-acessos':
                    return <SystemAccessLog />
                case 'settings':
                    return <SettingsPage />
                default:
                    return <SuperAdminDashboard />
            }
        }

        // DIREÇÃO MUNICIPAL routes
        if (isDirecaoMunicipal) {
            switch (currentPage) {
                case 'dashboard':
                    return <DirecaoMunicipalDashboard onNavigate={handleNavigate} />
                case 'escolas':
                    return <EscolasOverviewPage onNavigate={handleNavigate} />
                case 'supervisao-pedagogica':
                    return <SupervisaoPedagogica onNavigate={handleNavigate} />
                case 'funcionarios':
                    return <FuncionariosConsulta onNavigate={handleNavigate} />
                case 'circulares':
                    return <CircularesPage onNavigate={handleNavigate} />
                case 'relatorios-municipais':
                    return <RelatoriosMunicipaisPage onNavigate={handleNavigate} />
                case 'solicitacoes':
                    return <SolicitacoesPage onNavigate={handleNavigate} />
                case 'config-documentos':
                    return <ConfiguracaoDocumentos />
                case 'reports':
                    return <ReportsPage searchQuery={searchQuery} />
                case 'settings':
                    return <SettingsPage />
                default:
                    return <DirecaoMunicipalDashboard onNavigate={handleNavigate} />
            }
        }

        // DIREÇÃO PROVINCIAL routes
        if (isDirecaoProvincial) {
            switch (currentPage) {
                case 'dashboard':
                    return <DirecaoProvincialDashboard onNavigate={handleNavigate} />
                case 'provincial-direcoes-municipais':
                    return <DirecoesMunicipaisGestao />
                case 'provincial-escolas':
                    return <EscolasProvincialOverview />
                case 'provincial-supervisao':
                    return <SupervisaoPedagogicaProvincial />
                case 'provincial-circulares':
                    return <CircularesProvinciaisPage />
                case 'provincial-relatorios':
                    return <RelatoriosProvinciaisPage />
                case 'settings':
                    return <SettingsPage />
                default:
                    return <DirecaoProvincialDashboard />
            }
        }

        // ALUNO routes - read-only grade viewing
        if (isAluno) {
            switch (currentPage) {
                case 'aluno-notas':
                case 'dashboard':
                    return <AlunoNotasPage />
                default:
                    return <AlunoNotasPage />
            }
        }

        // ENCARREGADO routes - guardian grade viewing
        if (isEncarregado) {
            switch (currentPage) {
                case 'encarregado-notas':
                case 'dashboard':
                    return <EncarregadoNotasPage />
                default:
                    return <EncarregadoNotasPage />
            }
        }

        // SECRETARIO routes - limited to payments
        if (isSecretario) {
            switch (currentPage) {
                case 'dashboard':
                    return <Dashboard onNavigate={handleNavigate} searchQuery={searchQuery} />
                case 'propinas':
                case 'tuition':
                    return <TuitionPaymentsPage searchQuery={searchQuery} />
                default:
                    return <Dashboard onNavigate={handleNavigate} searchQuery={searchQuery} />
            }
        }

        // Regular user routes
        switch (currentPage) {
            case 'dashboard':
                return isProfessor ? <ProfessorDashboard /> : <Dashboard onNavigate={handleNavigate} searchQuery={searchQuery} />
            case 'solicitacoes':
                return <ProfessorDocumentRequestsPage />
            case 'classes':
                return <ClassesPage onNavigate={handleNavigate} searchQuery={searchQuery} />
            case 'class-details':
                return navigationParams.turmaId ? (
                    <ClassDetailsPage turmaId={navigationParams.turmaId} onNavigate={handleNavigate} />
                ) : (
                    <ClassesPage onNavigate={handleNavigate} searchQuery={searchQuery} />
                )
            case 'grades':
                return <GradesPage searchQuery={searchQuery} />
            case 'reports':
                return <ReportsPage searchQuery={searchQuery} />
            case 'settings':
                return <SettingsPage />
            case 'teachers':
                return <TeachersPage onNavigate={handleNavigate} searchQuery={searchQuery} />
            case 'staff':
                return <StaffPage onNavigate={handleNavigate} searchQuery={searchQuery} />
            case 'subscription':
            case 'escola-subscricao':
                return <SubscriptionPage />
            case 'propinas':
            case 'tuition':
                return <TuitionPaymentsPage searchQuery={searchQuery} />
            case 'secretaries':
                return <SecretariesPage searchQuery={searchQuery} />
            case 'matriculas':
                return <MatriculasPage />
            case 'templates':
                return <TemplatesManagement onClose={() => handleNavigate('settings')} />
            default:
                return <Dashboard onNavigate={handleNavigate} searchQuery={searchQuery} />
        }
    }

    const handleSearch = (query: string) => {
        setSearchQuery(query)
    }

    // Show profile setup modal if escola profile is not configured - blocks access to dashboard
    if (showEscolaSetup) {
        return (
            <EscolaProfileSetupModal
                onComplete={() => setShowEscolaSetup(false)}
            />
        )
    }

    return (
        <>
            <DashboardLayout currentPage={currentPage} onNavigate={handleNavigate} onSearch={handleSearch}>
                <Suspense fallback={<PageSkeleton variant="dashboard" />}>
                    {renderPage()}
                </Suspense>
            </DashboardLayout>
            <PWAInstallPrompt />
            <SystemUpdateAlert />
        </>
    )
}

export default App
