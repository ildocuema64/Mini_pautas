/*
component-meta:
  name: ClassesPage
  description: Page for managing classes/turmas
  tokens: [--color-primary, --fs-md, min-h-touch]
  responsive: true
  tested-on: [360x800, 768x1024, 1440x900]
*/

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Card, CardBody, CardHeader } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Icons } from './ui/Icons'
import { translateError } from '../utils/translations'
import { ConfirmModal } from './ui/ConfirmModal'
import { useAuth } from '../contexts/AuthContext'
import type { DisciplinaTemplate } from '../types'

interface Turma {
    id: string
    nome: string
    ano_lectivo: string
    trimestre: number
    total_alunos?: number
}

interface ProfessorOption {
    id: string
    nome_completo: string
    especialidade: string | null
}

interface ClassesPageProps {
    onNavigate?: (page: string, params?: { turmaId?: string }) => void
    searchQuery?: string
}

export const ClassesPage: React.FC<ClassesPageProps> = ({ onNavigate, searchQuery = '' }) => {
    const { isProfessor, isEscola, escolaProfile, professorProfile } = useAuth()
    const [turmas, setTurmas] = useState<Turma[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showConfirmDelete, setShowConfirmDelete] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [selectedTurmaId, setSelectedTurmaId] = useState<string | null>(null)
    const [turmaToDelete, setTurmaToDelete] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        nome: '',
        ano_lectivo: String(new Date().getFullYear()),
        trimestre: 1,
        nivel_ensino: 'Ensino Secundário',
        classe: '',
        professor_id: '',
    })
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [availableTemplates, setAvailableTemplates] = useState<DisciplinaTemplate[]>([])
    const [loadingTemplates, setLoadingTemplates] = useState(false)
    const [applyTemplates, setApplyTemplates] = useState(true)

    // Professors list for school-managed turma creation
    const [professores, setProfessores] = useState<ProfessorOption[]>([])
    const [loadingProfessores, setLoadingProfessores] = useState(false)

    // Classes list based on nivel_ensino
    const getClassesForNivel = (nivel: string): string[] => {
        switch (nivel) {
            case 'Ensino Primário':
                return ['1ª Classe', '2ª Classe', '3ª Classe', '4ª Classe', '5ª Classe', '6ª Classe']
            case 'Ensino Secundário':
                return ['7ª Classe', '8ª Classe', '9ª Classe', '10ª Classe', '11ª Classe', '12ª Classe', '13ª Classe']
            default:
                return []
        }
    }

    /**
     * Determines the docência regime based on nivel_ensino and classe.
     * Angola's education system (Decreto Presidencial 162/23 + Dec. Exec. 169/24):
     * - Ensino Primário 1ª-4ª: monodocência pura (1 teacher for all subjects)
     * - Ensino Primário 5ª-6ª: monodocência coadjuvada (1 main teacher, possible assistants)
     * - Ensino Secundário 7ª-12ª: pluridocência (specialist teacher per subject)
     */
    const getDocenciaRegime = (nivel: string, classe: string): 'monodocencia' | 'monodocencia_coadjuvada' | 'pluridocencia' | null => {
        if (nivel === 'Ensino Primário') {
            const classeNum = parseInt(classe.replace(/\D/g, ''))
            if (classeNum >= 1 && classeNum <= 4) return 'monodocencia'
            if (classeNum >= 5 && classeNum <= 6) return 'monodocencia_coadjuvada'
        }
        if (nivel === 'Ensino Secundário') return 'pluridocencia'
        return null
    }

    const regime = getDocenciaRegime(formData.nivel_ensino, formData.classe)

    useEffect(() => {
        loadTurmas()
    }, [])

    // Load professors when escola opens the creation modal
    useEffect(() => {
        if (showModal && !editMode && isEscola && escolaProfile) {
            loadProfessores()
        }
    }, [showModal, editMode, isEscola, escolaProfile])

    // Load templates when class is selected
    useEffect(() => {
        if (formData.classe && showModal && !editMode) {
            loadTemplatesForClass(formData.classe)
        } else {
            setAvailableTemplates([])
        }
    }, [formData.classe, showModal, editMode])

    const loadProfessores = async () => {
        if (!escolaProfile?.id) return
        try {
            setLoadingProfessores(true)
            const { data, error } = await supabase
                .from('professores')
                .select('id, nome_completo, especialidade')
                .eq('escola_id', escolaProfile.id)
                .eq('ativo', true)
                .order('nome_completo')

            if (error) throw error
            setProfessores(data || [])
        } catch (err) {
            console.error('Erro ao carregar professores:', err)
        } finally {
            setLoadingProfessores(false)
        }
    }

    const loadTemplatesForClass = async (classe: string) => {
        if (!escolaProfile?.id) return

        try {
            setLoadingTemplates(true)
            const { data, error } = await supabase
                .from('disciplinas_template')
                .select('*')
                .eq('escola_id', escolaProfile.id)
                .eq('classe', classe)
                .order('ordem', { ascending: true })

            if (error) throw error
            setAvailableTemplates(data || [])
        } catch (err) {
            console.error('Erro ao carregar templates:', err)
            setAvailableTemplates([])
        } finally {
            setLoadingTemplates(false)
        }
    }

    const loadTurmas = async () => {
        try {
            setLoading(true)
            setError(null) // Clear any previous errors
            const { data, error } = await supabase
                .from('turmas')
                .select(`
          id,
          nome,
          ano_lectivo,
          trimestre,
          alunos(count)
        `)
                .order('created_at', { ascending: false })

            if (error) throw error

            const turmasWithCount = data?.map(turma => ({
                ...turma,
                total_alunos: turma.alunos?.[0]?.count || 0
            })) || []

            setTurmas(turmasWithCount)
            // Successfully loaded - clear any previous errors
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar turmas'
            setError(translateError(errorMessage))
            setTurmas([]) // Clear turmas on error
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)
        setSubmitting(true)
        console.log('🔄 Iniciando criação de turma...', formData)

        try {
            if (editMode && selectedTurmaId) {
                // Update existing turma
                const { error: updateError } = await supabase
                    .from('turmas')
                    .update({
                        nome: formData.nome,
                        ano_lectivo: formData.ano_lectivo,
                        trimestre: formData.trimestre,
                        nivel_ensino: formData.nivel_ensino,
                    })
                    .eq('id', selectedTurmaId)

                if (updateError) throw updateError

                setSuccess('Turma atualizada com sucesso!')
            } else {
                // Get current user
                const { data: { user } } = await supabase.auth.getUser()
                console.log('🔍 DEBUG - User:', user)
                if (!user) throw new Error('Usuário não autenticado')

                // Determine professor_id and escola_id based on user type
                let professorId: string | null = null
                let escolaId: string | null = null

                if (isEscola && escolaProfile) {
                    escolaId = escolaProfile.id
                    console.log('🔍 DEBUG - Escola criando turma, escola_id:', escolaId)

                    if (!formData.professor_id) {
                        throw new Error('É necessário seleccionar um professor responsável pela turma.')
                    }
                    professorId = formData.professor_id
                    console.log('🔍 DEBUG - Professor seleccionado:', professorId)
                } else if (isProfessor && professorProfile) {
                    // Professor creating turma - use their own profile
                    professorId = professorProfile.id
                    escolaId = professorProfile.escola_id
                    console.log('🔍 DEBUG - Professor criando turma:', { professorId, escolaId })
                } else {
                    // Fallback: try to get professor profile from database
                    console.log('🔍 DEBUG - Buscando professor com user_id:', user.id)
                    const { data: professor, error: profError } = await supabase
                        .from('professores')
                        .select('id, escola_id')
                        .eq('user_id', user.id)
                        .maybeSingle()

                    console.log('🔍 DEBUG - Resposta professor:', { professor, profError })

                    if (profError) {
                        console.error('❌ ERRO ao buscar professor:', profError)
                        throw profError
                    }

                    if (!professor) {
                        throw new Error('Perfil não encontrado. Por favor, complete seu perfil nas configurações.')
                    }

                    professorId = professor.id
                    escolaId = professor.escola_id
                }


                // Auto-generate codigo_turma escopado por escola para evitar colisões
                // entre escolas diferentes e entre turmas de nomes similares na mesma escola.
                // Formato: "<4 chars escola>-<nome>-<ano>-T<trimestre>"
                const escolaPrefix = (escolaId ?? '').replace(/-/g, '').substring(0, 4).toUpperCase()
                const nomeSimplificado = formData.nome.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)
                const anoSimplificado = formData.ano_lectivo.replace('/', '-')
                const codigo_turma = `${escolaPrefix}-${nomeSimplificado}-${anoSimplificado}-T${formData.trimestre}`

                // Create turma and get the ID back
                const { data: newTurma, error: insertError } = await supabase
                    .from('turmas')
                    .insert({
                        nome: formData.nome,
                        ano_lectivo: formData.ano_lectivo,
                        trimestre: formData.trimestre,
                        nivel_ensino: formData.nivel_ensino,
                        codigo_turma: codigo_turma,
                        professor_id: professorId,
                        escola_id: escolaId,
                        capacidade_maxima: 40,
                    })
                    .select('id')
                    .single()

                if (insertError) throw insertError

                // Apply templates if enabled and class is selected
                if (applyTemplates && formData.classe && availableTemplates.length > 0 && newTurma?.id) {
                    console.log('📚 Aplicando templates para classe:', formData.classe)

                    // Apply all templates for this class
                    const { error: templateError } = await supabase.rpc('apply_all_class_templates_to_turma', {
                        p_turma_id: newTurma.id,
                        p_classe: formData.classe,
                        p_professor_id: professorId
                    })

                    if (templateError) {
                        console.error('⚠️ Erro ao aplicar templates (turma criada sem templates):', templateError)
                        setSuccess(`Turma criada com sucesso! Aviso: Não foi possível aplicar templates automáticamente. (${templateError.message})`)
                    } else {
                        setSuccess(`Turma criada com sucesso! ${availableTemplates.length} disciplina(s) adicionada(s) automaticamente.`)
                    }
                } else {
                    setSuccess('Turma criada com sucesso!')
                }
            }

            setShowModal(false)
            setEditMode(false)
            setSelectedTurmaId(null)
            setFormData({
                nome: '',
                ano_lectivo: String(new Date().getFullYear()),
                trimestre: 1,
                nivel_ensino: 'Ensino Secundário',
                classe: '',
                professor_id: '',
            })
            setApplyTemplates(true)
            setAvailableTemplates([])
            loadTurmas()
        } catch (err) {
            console.error('❌ Erro ao criar/atualizar turma:', err)

            // Extrair código e mensagem do PostgrestError (Supabase) ou Error genérico
            const pgCode = (err as { code?: string }).code ?? ''
            const pgMessage = (err as { message?: string }).message ?? ''

            let errorMessage: string
            if (pgCode === '23505' || pgMessage.includes('duplicate key') || pgMessage.includes('23505')) {
                if (pgMessage.includes('unique_turma_periodo') || pgMessage.includes('codigo_turma')) {
                    errorMessage = `A sua escola já possui uma turma com o nome "${formData.nome}" para o ${formData.trimestre}º trimestre do ano lectivo ${formData.ano_lectivo}. Por favor, escolha um nome diferente ou altere o período.`
                } else {
                    errorMessage = pgMessage || (editMode ? 'Erro ao atualizar turma' : 'Erro ao criar turma')
                }
            } else {
                errorMessage = pgMessage || (err instanceof Error ? err.message : '') || (editMode ? 'Erro ao atualizar turma' : 'Erro ao criar turma')
            }

            setError(translateError(errorMessage))
            // Keep modal open so user can see the error
            // setShowModal(false) - removed to keep modal open on error
        } finally {
            setSubmitting(false)
        }
    }

    const handleEdit = (turma: Turma) => {
        setEditMode(true)
        setSelectedTurmaId(turma.id)
        setFormData({
            nome: turma.nome,
            ano_lectivo: turma.ano_lectivo,
            trimestre: turma.trimestre,
            nivel_ensino: 'Ensino Secundário',
            classe: '',
            professor_id: '',
        })
        setApplyTemplates(false)
        setShowModal(true)
    }

    const handleDeleteClick = (id: string) => {
        setTurmaToDelete(id)
        setShowConfirmDelete(true)
    }

    const handleConfirmDelete = async () => {
        if (!turmaToDelete) return

        try {
            const { error } = await supabase
                .from('turmas')
                .delete()
                .eq('id', turmaToDelete)

            if (error) throw error

            setSuccess('Turma excluída com sucesso!')
            setShowConfirmDelete(false)
            setTurmaToDelete(null)
            loadTurmas()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir turma'
            setError(translateError(errorMessage))
            setShowConfirmDelete(false)
            setTurmaToDelete(null)
        }
    }

    const handleViewDetails = (turmaId: string) => {
        if (onNavigate) {
            onNavigate('class-details', { turmaId })
        }
    }

    const handleNewTurma = () => {
        setEditMode(false)
        setSelectedTurmaId(null)
        setFormData({
            nome: '',
            ano_lectivo: String(new Date().getFullYear()),
            trimestre: 1,
            nivel_ensino: 'Ensino Secundário',
            classe: '',
            professor_id: '',
        })
        setApplyTemplates(true)
        setAvailableTemplates([])
        setShowModal(true)
    }

    // Filter turmas based on search query
    const filteredTurmas = turmas.filter(turma =>
        turma.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
        turma.ano_lectivo.toString().includes(searchQuery) ||
        `${turma.trimestre}º trim`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `trimestre ${turma.trimestre}`.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (loading) {
        return (
            <div className="space-y-8 animate-fade-in">
                {/* Header Skeleton */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="skeleton h-8 w-40 mb-2 rounded-lg"></div>
                        <div className="skeleton h-4 w-56 rounded"></div>
                    </div>
                    <div className="skeleton h-10 w-32 rounded-xl"></div>
                </div>
                {/* Grid Skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="card p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div className="skeleton w-12 h-12 rounded-xl"></div>
                                <div className="skeleton h-6 w-20 rounded-lg"></div>
                            </div>
                            <div className="mb-6">
                                <div className="skeleton h-6 w-32 mb-2 rounded"></div>
                                <div className="skeleton h-4 w-24 rounded"></div>
                            </div>
                            <div className="skeleton h-10 w-full rounded-lg mb-4"></div>
                            <div className="flex gap-2">
                                <div className="skeleton h-10 flex-1 rounded-lg"></div>
                                <div className="skeleton h-10 w-10 rounded-lg"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-8 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Minhas Turmas</h2>
                    <p className="text-slate-500 mt-1">Gerencie suas turmas, alunos e pautas.</p>
                </div>
                <Button
                    variant="primary"
                    icon={<Icons.UserPlus />}
                    onClick={handleNewTurma}
                    className="w-full sm:w-auto btn-premium shadow-lg shadow-primary-500/20"
                >
                    Nova Turma
                </Button>
            </div>

            {/* Messages */}
            {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center shadow-sm animate-slide-down">
                    <Icons.Check />
                    <span className="ml-2 font-medium">{success}</span>
                </div>
            )}

            {/* Turmas Grid */}
            {error ? (
                <Card className="border-red-100 shadow-red-100/50">
                    <CardBody className="text-center py-12">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Erro ao carregar turmas</h3>
                        <p className="text-slate-500 mb-6 max-w-md mx-auto">{error}</p>
                        <Button variant="primary" onClick={loadTurmas} className="w-full sm:w-auto">
                            Tentar Novamente
                        </Button>
                    </CardBody>
                </Card>
            ) : filteredTurmas.length === 0 ? (
                <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
                    <CardBody className="text-center py-16 px-6">
                        <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6 relative">
                            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-50 to-purple-50 rounded-2xl opacity-50"></div>
                            <svg className="w-10 h-10 text-indigo-300 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">
                            {searchQuery ? 'Nenhuma turma encontrada' : 'Nenhuma turma criada'}
                        </h3>
                        <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                            {searchQuery ? 'Tente ajustar seus termos de pesquisa para encontrar o que procura.' : 'Comece criando sua primeira turma para gerenciar alunos e lançar notas.'}
                        </p>
                        {!searchQuery && (
                            <Button
                                variant="primary"
                                onClick={handleNewTurma}
                                className="btn-premium shadow-lg shadow-primary-500/20"
                            >
                                <Icons.UserPlus className="mr-2" />
                                Criar Primeira Turma
                            </Button>
                        )}
                    </CardBody>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-slide-up">
                    {filteredTurmas.map((turma, index) => (
                        <Card
                            key={turma.id}
                            className="group hover:shadow-xl hover:shadow-slate-300/30 transition-all duration-300 border-0 shadow-md shadow-slate-200/50 overflow-hidden relative"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            {/* Decorative Gradient Background */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-bl-[100px] -mr-8 -mt-8 transition-transform duration-500 group-hover:scale-110 opacity-60" />

                            <CardBody className="p-6 relative z-10">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-primary-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
                                        {turma.nome.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-white shadow-sm text-slate-600 border border-slate-100">
                                        {turma.trimestre}º Trimestre
                                    </span>
                                </div>

                                <div className="mb-6">
                                    <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-primary-600 transition-colors truncate" title={turma.nome}>
                                        {turma.nome}
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium">Ano Lectivo: {turma.ano_lectivo}</p>
                                </div>

                                <div className="flex items-center gap-4 text-sm text-slate-600 mb-6 bg-slate-50/80 p-3 rounded-lg border border-slate-100/50">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                        <span className="font-semibold">{turma.total_alunos}</span> <span className="text-slate-400">alunos</span>
                                    </div>
                                    <div className="w-px h-4 bg-slate-200"></div>
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="font-semibold text-slate-400">--</span> <span className="text-slate-400">média</span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        variant="primary"
                                        onClick={() => handleViewDetails(turma.id)}
                                        className="min-h-touch min-w-[44px] sm:flex-1 shadow-md shadow-primary-500/10 group-hover:shadow-primary-500/20 whitespace-nowrap"
                                    >
                                        <span className="hidden sm:inline">Ver Detalhes</span>
                                        <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    </Button>
                                    {!isProfessor && (
                                        <>
                                            <Button
                                                variant="ghost"
                                                onClick={() => handleEdit(turma)}
                                                className="min-h-touch min-w-[44px] px-3 hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                                title="Editar Turma"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onClick={() => handleDeleteClick(turma.id)}
                                                className="min-h-touch min-w-[44px] px-3 hover:bg-red-50 text-slate-400 hover:text-red-500"
                                                title="Excluir Turma"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4 z-50 animate-fade-in">
                    <Card className="w-full md:max-w-md bg-white shadow-2xl ring-1 ring-black/5 rounded-t-2xl md:rounded-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
                        <CardHeader className="border-b border-slate-100 p-5 bg-slate-50/50">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-slate-900">{editMode ? 'Editar Turma' : 'Nova Turma'}</h3>
                                <button
                                    onClick={() => {
                                        setShowModal(false)
                                        setEditMode(false)
                                        setSelectedTurmaId(null)
                                        setError(null)
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </CardHeader>
                        <CardBody className="p-6 space-y-6">
                            {/* Error Message */}
                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4 animate-slide-down">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 w-5 h-5 mt-0.5 text-red-500">
                                            <svg className="w-full h-full" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-sm font-semibold text-red-800 mb-1">Erro ao criar turma</h4>
                                            <p className="text-sm text-red-700">{error}</p>
                                            {error.includes('professor') && (
                                                <div className="mt-3 pt-3 border-t border-red-200">
                                                    <p className="text-sm text-red-600 mb-2">
                                                        <strong>O que fazer:</strong>
                                                    </p>
                                                    <ol className="text-sm text-red-700 space-y-1 ml-4 list-decimal">
                                                        <li>Cadastre pelo menos um professor</li>
                                                        <li>Depois volte aqui para criar a turma</li>
                                                    </ol>
                                                    {onNavigate && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowModal(false)
                                                                setError(null)
                                                                onNavigate('teachers')
                                                            }}
                                                            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800 hover:underline"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                            </svg>
                                                            Ir para Professores agora
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-4">
                                    <div className="input-glow rounded-xl">
                                        <Input
                                            label="Nome da Turma"
                                            type="text"
                                            value={formData.nome}
                                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                            placeholder="Ex: 10ª Classe A"
                                            required
                                        />
                                    </div>

                                    <div className="input-glow rounded-xl">
                                        <Input
                                            label="Ano Lectivo"
                                            type="text"
                                            value={formData.ano_lectivo}
                                            onChange={(e) => setFormData({ ...formData, ano_lectivo: e.target.value })}
                                            placeholder="Ex: 2025 ou 2025/2026"
                                            required
                                            helpText="Ano ou período lectivo (ex: 2025 ou 2025/2026)"
                                        />
                                    </div>

                                    <div>
                                        <label className="form-label block text-sm font-medium text-slate-700 mb-1.5">Nível de Ensino</label>
                                        <div className="relative">
                                            <select
                                                value={formData.nivel_ensino}
                                                onChange={(e) => setFormData({ ...formData, nivel_ensino: e.target.value, classe: '' })}
                                                className="w-full appearance-none bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3 pr-10 shadow-sm transition-all hover:border-slate-400"
                                                required
                                            >
                                                <option value="Ensino Primário">Ensino Primário</option>
                                                <option value="Ensino Secundário">Ensino Secundário</option>
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Class Selection - Only show when creating new turma */}
                                    {!editMode && isEscola && (
                                        <div>
                                            <label className="form-label block text-sm font-medium text-slate-700 mb-1.5">
                                                Classe
                                                <span className="text-slate-400 font-normal ml-1">(opcional)</span>
                                            </label>
                                            <div className="relative">
                                                <select
                                                    value={formData.classe}
                                                    onChange={(e) => setFormData({ ...formData, classe: e.target.value })}
                                                    className="w-full appearance-none bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3 pr-10 shadow-sm transition-all hover:border-slate-400"
                                                >
                                                    <option value="">Seleccionar classe...</option>
                                                    {getClassesForNivel(formData.nivel_ensino).map(classe => (
                                                        <option key={classe} value={classe}>{classe}</option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1.5">
                                                Seleccione a classe para aplicar disciplinas automaticamente
                                            </p>
                                        </div>
                                    )}

                                    {/* Docência Regime Badge */}
                                    {!editMode && isEscola && formData.classe && regime && (
                                        <div className={`rounded-xl p-3 border flex items-start gap-3 ${
                                            regime === 'monodocencia'
                                                ? 'bg-blue-50 border-blue-200'
                                                : regime === 'monodocencia_coadjuvada'
                                                ? 'bg-amber-50 border-amber-200'
                                                : 'bg-violet-50 border-violet-200'
                                        }`}>
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                                regime === 'monodocencia'
                                                    ? 'bg-blue-100 text-blue-600'
                                                    : regime === 'monodocencia_coadjuvada'
                                                    ? 'bg-amber-100 text-amber-600'
                                                    : 'bg-violet-100 text-violet-600'
                                            }`}>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className={`text-xs font-bold uppercase tracking-wide ${
                                                    regime === 'monodocencia' ? 'text-blue-700'
                                                    : regime === 'monodocencia_coadjuvada' ? 'text-amber-700'
                                                    : 'text-violet-700'
                                                }`}>
                                                    {regime === 'monodocencia' && 'Monodocência — Dec. Pres. 162/23'}
                                                    {regime === 'monodocencia_coadjuvada' && 'Monodocência Coadjuvada — Dec. Exec. 169/24'}
                                                    {regime === 'pluridocencia' && 'Pluridocência — Dec. Pres. 162/23'}
                                                </p>
                                                <p className={`text-xs mt-0.5 ${
                                                    regime === 'monodocencia' ? 'text-blue-600'
                                                    : regime === 'monodocencia_coadjuvada' ? 'text-amber-600'
                                                    : 'text-violet-600'
                                                }`}>
                                                    {regime === 'monodocencia' && 'Um professor lecciona todas as disciplinas desta turma.'}
                                                    {regime === 'monodocencia_coadjuvada' && 'Um professor titular com possibilidade de coadjuvante por disciplina (atribuição posterior).'}
                                                    {regime === 'pluridocencia' && 'Cada disciplina terá um professor especialista. Atribua-os após criar a turma.'}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Professor Selection - Only for escola creating new turma */}
                                    {!editMode && isEscola && (
                                        <div>
                                            <label className="form-label block text-sm font-medium text-slate-700 mb-1.5">
                                                {regime === 'pluridocencia'
                                                    ? 'Director de Turma'
                                                    : 'Professor de Classe'}
                                                <span className="text-red-500 ml-1">*</span>
                                            </label>
                                            <div className="relative">
                                                {loadingProfessores ? (
                                                    <div className="w-full border border-slate-300 rounded-xl p-3 text-sm text-slate-400 bg-slate-50 flex items-center gap-2">
                                                        <svg className="animate-spin h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        A carregar professores...
                                                    </div>
                                                ) : professores.length === 0 ? (
                                                    <div className="w-full border border-red-200 bg-red-50 rounded-xl p-3 text-sm text-red-600 flex items-center gap-2">
                                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Nenhum professor activo. Cadastre um professor primeiro.
                                                    </div>
                                                ) : (
                                                    <select
                                                        value={formData.professor_id}
                                                        onChange={(e) => setFormData({ ...formData, professor_id: e.target.value })}
                                                        className="w-full appearance-none bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3 pr-10 shadow-sm transition-all hover:border-slate-400"
                                                        required
                                                    >
                                                        <option value="">Seleccionar professor...</option>
                                                        {professores.map(prof => (
                                                            <option key={prof.id} value={prof.id}>
                                                                {prof.nome_completo}
                                                                {prof.especialidade ? ` — ${prof.especialidade}` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                                {professores.length > 0 && (
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1.5">
                                                {regime === 'pluridocencia'
                                                    ? 'O director de turma é o professor responsável administrativo. As disciplinas serão atribuídas individualmente após a criação.'
                                                    : 'Este professor leccionará todas as disciplinas desta turma.'}
                                            </p>
                                        </div>
                                    )}

                                    {/* Templates Preview - Show when class is selected */}
                                    {!editMode && isEscola && formData.classe && (
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
                                                    </svg>
                                                    <span className="text-sm font-semibold text-slate-700">Templates de Disciplinas</span>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={applyTemplates}
                                                        onChange={(e) => setApplyTemplates(e.target.checked)}
                                                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                                    />
                                                    <span className="text-xs font-medium text-slate-600">Aplicar</span>
                                                </label>
                                            </div>

                                            {loadingTemplates ? (
                                                <div className="flex items-center justify-center py-4">
                                                    <svg className="animate-spin h-5 w-5 text-primary-500" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span className="ml-2 text-sm text-slate-500">Carregando templates...</span>
                                                </div>
                                            ) : availableTemplates.length > 0 ? (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-slate-500 mb-2">
                                                        {availableTemplates.length} disciplina(s) serão adicionadas automaticamente:
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {availableTemplates.slice(0, 8).map(t => (
                                                            <span
                                                                key={t.id}
                                                                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-600"
                                                            >
                                                                {t.nome}
                                                            </span>
                                                        ))}
                                                        {availableTemplates.length > 8 && (
                                                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-500">
                                                                +{availableTemplates.length - 8} mais
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center py-3">
                                                    <p className="text-sm text-slate-500">
                                                        Nenhum template configurado para {formData.classe}
                                                    </p>
                                                    {onNavigate && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowModal(false)
                                                                onNavigate('templates')
                                                            }}
                                                            className="text-xs text-primary-600 hover:text-primary-700 font-medium mt-1 hover:underline"
                                                        >
                                                            Configurar templates agora →
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="lg"
                                        onClick={() => {
                                            setShowModal(false)
                                            setEditMode(false)
                                            setSelectedTurmaId(null)
                                            setError(null)
                                        }}
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        size="lg"
                                        loading={submitting}
                                        className="flex-1 btn-premium shadow-lg shadow-primary-500/20"
                                    >
                                        {editMode ? 'Salvar Alterações' : 'Criar Turma'}
                                    </Button>
                                </div>
                            </form>
                        </CardBody>
                    </Card>
                </div>
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={showConfirmDelete}
                onClose={() => {
                    setShowConfirmDelete(false)
                    setTurmaToDelete(null)
                }}
                onConfirm={handleConfirmDelete}
                title="Excluir Turma"
                message="Tem certeza que deseja excluir esta turma? Todos os alunos, notas e dados associados serão removidos permanentemente."
                confirmText="Sim, Excluir Turma"
                cancelText="Cancelar"
                variant="danger"
            />
        </div>
    )
}
