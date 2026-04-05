/*
component-meta:
  name: DisciplinesManagement
  description: Component for managing disciplines (subjects) within a class
  tokens: [--color-primary, --fs-md, min-h-touch]
  responsive: true
  tested-on: [360x800, 768x1024, 1440x900]
*/

import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { Card, CardBody, CardHeader } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Icons } from './ui/Icons'
import { ComponenteSelectorModal } from './ComponenteSelectorModal'
import { translateError } from '../utils/translations'
import { validateFormula, parseFormula, formatFormulaForDisplay } from '../utils/formulaUtils'

interface DisciplinesManagementProps {
    turmaId: string
    turmaNome: string
    nivelEnsino?: string
    onClose?: () => void
}

interface Disciplina {
    id: string
    professor_id: string
    turma_id: string
    nome: string
    codigo_disciplina: string
    carga_horaria: number | null
    descricao: string | null
}

interface ComponenteAvaliacao {
    id: string
    disciplina_id: string
    turma_id: string
    nome: string
    codigo_componente: string
    peso_percentual: number
    escala_minima: number
    escala_maxima: number
    obrigatorio: boolean
    ordem: number
    descricao: string | null
    trimestre: number // 1, 2, or 3
    is_calculated?: boolean
    formula_expression?: string | null
    depends_on_components?: string[] | null
    tipo_calculo?: 'trimestral' | 'anual'
}

export const DisciplinesManagement: React.FC<DisciplinesManagementProps> = ({ turmaId, turmaNome, nivelEnsino, onClose }) => {
    const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Discipline modal states
    const [showAddModal, setShowAddModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [selectedDisciplina, setSelectedDisciplina] = useState<Disciplina | null>(null)

    // Component states
    const [expandedDisciplina, setExpandedDisciplina] = useState<string | null>(null)
    const [componentes, setComponentes] = useState<Record<string, ComponenteAvaliacao[]>>({})
    const [loadingComponentes, setLoadingComponentes] = useState<Record<string, boolean>>({})
    const [showAddComponenteModal, setShowAddComponenteModal] = useState(false)
    const [showEditComponenteModal, setShowEditComponenteModal] = useState(false)
    const [showDeleteComponenteModal, setShowDeleteComponenteModal] = useState(false)
    const [selectedComponente, setSelectedComponente] = useState<ComponenteAvaliacao | null>(null)

    // Disciplinas obrigatórias state
    const [disciplinasObrigatorias, setDisciplinasObrigatorias] = useState<Set<string>>(new Set())
    const [loadingObrigatorias, setLoadingObrigatorias] = useState(false)

    // Discipline form state
    const [formData, setFormData] = useState({
        nome: '',
        codigo_disciplina: '',
        carga_horaria: '',
        descricao: '',
        professor_id: ''
    })

    // Professors state
    const [professores, setProfessores] = useState<{ id: string, nome_completo: string, especialidade: string | null }[]>([])

    // Auth context
    const { escolaProfile } = useAuth()

    useEffect(() => {
        loadDisciplinas()
        loadDisciplinasObrigatorias()
        if (escolaProfile) {
            loadProfessores()
        }
    }, [turmaId, escolaProfile])

    const loadProfessores = async () => {
        try {
            const { data, error } = await supabase
                .from('professores')
                .select('id, nome_completo, especialidade')
                .eq('escola_id', escolaProfile?.id)
                .eq('ativo', true)
                .order('nome_completo')

            if (error) throw error
            setProfessores(data || [])
        } catch (err) {
            console.error('Erro ao carregar professores:', err)
        }
    }

    const isPluridocencia = nivelEnsino === 'Ensino Secundário'
    const [componenteFormData, setComponenteFormData] = useState({
        nome: '',
        codigo_componente: '',
        peso_percentual: '',
        escala_minima: '0',
        escala_maxima: '20',
        obrigatorio: true,
        ordem: '1',
        descricao: '',
        trimestre: '1', // Default to 1st trimester
        is_calculated: false,
        formula_expression: '',
        depends_on_components: [] as string[],
        tipo_calculo: 'trimestral' as 'trimestral' | 'anual'
    })

    useEffect(() => {
        loadDisciplinas()
        loadDisciplinasObrigatorias()
    }, [turmaId])

    const loadDisciplinas = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('disciplinas')
                .select('*')
                .eq('turma_id', turmaId)
                .order('nome')

            if (error) throw error
            setDisciplinas(data || [])
        } catch (err: any) {
            const errorMessage = err?.message || err?.error_description || 'Erro ao carregar disciplinas'
            setError(translateError(errorMessage))
        } finally {
            setLoading(false)
        }
    }

    const loadDisciplinasObrigatorias = async () => {
        try {
            setLoadingObrigatorias(true)
            const { data, error } = await supabase
                .from('disciplinas_obrigatorias')
                .select('disciplina_id')
                .eq('turma_id', turmaId)
                .eq('is_obrigatoria', true)

            if (error) throw error

            const ids = new Set((data || []).map(d => d.disciplina_id))
            setDisciplinasObrigatorias(ids)
        } catch (err: any) {
            console.error('Erro ao carregar disciplinas obrigatórias:', err)
            setDisciplinasObrigatorias(new Set())
        } finally {
            setLoadingObrigatorias(false)
        }
    }

    const toggleDisciplinaObrigatoria = async (disciplinaId: string) => {
        const isCurrentlyObrigatoria = disciplinasObrigatorias.has(disciplinaId)
        const newSet = new Set(disciplinasObrigatorias)

        // Validação: 3-4 disciplinas obrigatórias
        if (!isCurrentlyObrigatoria && newSet.size >= 4) {
            setError('Máximo de 4 disciplinas obrigatórias permitido')
            setTimeout(() => setError(null), 3000)
            return
        }

        if (isCurrentlyObrigatoria && newSet.size <= 3) {
            setError('Mínimo de 3 disciplinas obrigatórias necessário')
            setTimeout(() => setError(null), 3000)
            return
        }

        try {
            if (isCurrentlyObrigatoria) {
                // Remove
                const { error } = await supabase
                    .from('disciplinas_obrigatorias')
                    .delete()
                    .eq('turma_id', turmaId)
                    .eq('disciplina_id', disciplinaId)

                if (error) throw error
                newSet.delete(disciplinaId)
            } else {
                // Add
                const { error } = await supabase
                    .from('disciplinas_obrigatorias')
                    .insert({
                        turma_id: turmaId,
                        disciplina_id: disciplinaId,
                        is_obrigatoria: true
                    })

                if (error) throw error
                newSet.add(disciplinaId)
            }

            setDisciplinasObrigatorias(newSet)
            setSuccess(isCurrentlyObrigatoria ? 'Disciplina desmarcada como obrigatória' : 'Disciplina marcada como obrigatória')
            setTimeout(() => setSuccess(null), 2000)
        } catch (err: any) {
            const errorMessage = err?.message || 'Erro ao atualizar disciplina obrigatória'
            setError(translateError(errorMessage))
        }
    }

    const handleAddDisciplina = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        try {
            let professorIdToUse = formData.professor_id

            // If no professor selected (maybe not admin?), try to get current user as professor
            if (!professorIdToUse) {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: professor } = await supabase
                        .from('professores')
                        .select('id')
                        .eq('user_id', user.id)
                        .single()

                    if (professor) {
                        professorIdToUse = professor.id
                    }
                }
            }

            if (!professorIdToUse) {
                throw new Error('É necessário selecionar um professor ou estar logado como professor.')
            }

            const { error: insertError } = await supabase
                .from('disciplinas')
                .insert({
                    professor_id: professorIdToUse,
                    turma_id: turmaId,
                    nome: formData.nome,
                    codigo_disciplina: formData.codigo_disciplina,
                    carga_horaria: formData.carga_horaria ? parseInt(formData.carga_horaria) : null,
                    descricao: formData.descricao || null
                })

            if (insertError) throw insertError

            setSuccess('Disciplina adicionada com sucesso!')
            setShowAddModal(false)
            setFormData({ nome: '', codigo_disciplina: '', carga_horaria: '', descricao: '', professor_id: '' })
            loadDisciplinas()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            const errorMessage = err?.message || err?.error_description || 'Erro ao adicionar disciplina'
            setError(translateError(errorMessage))
        }
    }

    const handleEditDisciplina = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedDisciplina) return

        setError(null)
        setSuccess(null)

        try {
            const updatePayload: any = {
                nome: formData.nome,
                codigo_disciplina: formData.codigo_disciplina,
                carga_horaria: formData.carga_horaria ? parseInt(formData.carga_horaria) : null,
                descricao: formData.descricao || null
            }

            if (formData.professor_id) {
                updatePayload.professor_id = formData.professor_id
            }

            const { error: updateError } = await supabase
                .from('disciplinas')
                .update(updatePayload)
                .eq('id', selectedDisciplina.id)

            if (updateError) throw updateError

            setSuccess('Disciplina atualizada com sucesso!')
            setShowEditModal(false)
            setSelectedDisciplina(null)
            setFormData({ nome: '', codigo_disciplina: '', carga_horaria: '', descricao: '', professor_id: '' })
            loadDisciplinas()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            const errorMessage = err?.message || err?.error_description || 'Erro ao atualizar disciplina'
            setError(translateError(errorMessage))
        }
    }

    const handleDeleteDisciplina = async () => {
        if (!selectedDisciplina) return

        setError(null)
        setSuccess(null)

        try {
            const { error: deleteError } = await supabase
                .from('disciplinas')
                .delete()
                .eq('id', selectedDisciplina.id)

            if (deleteError) throw deleteError

            setSuccess('Disciplina removida com sucesso!')
            setShowDeleteModal(false)
            setSelectedDisciplina(null)
            loadDisciplinas()
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            const errorMessage = err?.message || err?.error_description || 'Erro ao remover disciplina'
            setError(translateError(errorMessage))
        }
    }

    const openEditModal = (disciplina: Disciplina) => {
        setSelectedDisciplina(disciplina)
        setFormData({
            nome: disciplina.nome,
            codigo_disciplina: disciplina.codigo_disciplina,
            carga_horaria: disciplina.carga_horaria?.toString() || '',
            descricao: disciplina.descricao || '',
            professor_id: disciplina.professor_id
        })
        setShowEditModal(true)
    }

    const openDeleteModal = (disciplina: Disciplina) => {
        setSelectedDisciplina(disciplina)
        setShowDeleteModal(true)
    }

    const closeModals = () => {
        setShowAddModal(false)
        setShowEditModal(false)
        setShowDeleteModal(false)
        setSelectedDisciplina(null)
        setFormData({ nome: '', codigo_disciplina: '', carga_horaria: '', descricao: '', professor_id: '' })
    }

    // ============================================
    // COMPONENT MANAGEMENT FUNCTIONS
    // ============================================

    const loadComponentes = async (disciplinaId: string) => {
        try {
            setLoadingComponentes({ ...loadingComponentes, [disciplinaId]: true })
            const { data, error } = await supabase
                .from('componentes_avaliacao')
                .select('*')
                .eq('disciplina_id', disciplinaId)
                .order('ordem')

            if (error) throw error
            setComponentes({ ...componentes, [disciplinaId]: data || [] })
        } catch (err: any) {
            const errorMessage = err?.message || err?.error_description || 'Erro ao carregar componentes'
            setError(translateError(errorMessage))
        } finally {
            setLoadingComponentes({ ...loadingComponentes, [disciplinaId]: false })
        }
    }

    const toggleDisciplina = (disciplinaId: string) => {
        if (expandedDisciplina === disciplinaId) {
            setExpandedDisciplina(null)
        } else {
            setExpandedDisciplina(disciplinaId)
            if (!componentes[disciplinaId]) {
                loadComponentes(disciplinaId)
            }
        }
    }

    const calculateTotalWeight = (disciplinaId: string, excludeId?: string): number => {
        const disciplinaComponentes = componentes[disciplinaId] || []
        return disciplinaComponentes
            .filter(c => c.id !== excludeId)
            .reduce((sum, c) => sum + c.peso_percentual, 0)
    }

    const handleAddComponente = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedDisciplina) return

        setError(null)
        setSuccess(null)

        try {
            const pesoPercentual = parseFloat(componenteFormData.peso_percentual)
            const totalWeight = calculateTotalWeight(selectedDisciplina.id)

            if (pesoPercentual <= 0) {
                setError('O peso deve ser maior que 0%.')
                return
            }

            if (pesoPercentual > 100) {
                setError('O peso não pode ser maior que 100%.')
                return
            }

            if (totalWeight + pesoPercentual > 100) {
                setError(`A soma dos pesos não pode ultrapassar 100%. Peso atual: ${totalWeight}%, tentando adicionar: ${pesoPercentual}%`)
                return
            }

            const { error: insertError } = await supabase
                .from('componentes_avaliacao')
                .insert({
                    disciplina_id: selectedDisciplina.id,
                    turma_id: turmaId,
                    nome: componenteFormData.nome,
                    codigo_componente: componenteFormData.codigo_componente,
                    peso_percentual: pesoPercentual,
                    escala_minima: parseFloat(componenteFormData.escala_minima),
                    escala_maxima: parseFloat(componenteFormData.escala_maxima),
                    obrigatorio: componenteFormData.obrigatorio,
                    ordem: parseInt(componenteFormData.ordem),
                    descricao: componenteFormData.descricao || null,
                    trimestre: parseInt(componenteFormData.trimestre),
                    is_calculated: componenteFormData.is_calculated || false,
                    formula_expression: componenteFormData.is_calculated ? componenteFormData.formula_expression : null,
                    depends_on_components: componenteFormData.is_calculated ? componenteFormData.depends_on_components : [],
                    tipo_calculo: componenteFormData.is_calculated ? componenteFormData.tipo_calculo : 'trimestral'
                })

            if (insertError) throw insertError

            setSuccess('Componente adicionado com sucesso!')
            setShowAddComponenteModal(false)
            resetComponenteForm()
            loadComponentes(selectedDisciplina.id)
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            console.error('Erro ao adicionar componente:', err)
            const errorMessage = err?.message || err?.error_description || 'Erro ao adicionar componente'
            setError(translateError(errorMessage))
        }
    }

    const handleEditComponente = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedComponente || !selectedDisciplina) return

        setError(null)
        setSuccess(null)

        try {
            const pesoPercentual = parseFloat(componenteFormData.peso_percentual)
            const totalWeight = calculateTotalWeight(selectedDisciplina.id, selectedComponente.id)

            if (pesoPercentual <= 0) {
                setError('O peso deve ser maior que 0%.')
                return
            }

            if (pesoPercentual > 100) {
                setError('O peso não pode ser maior que 100%.')
                return
            }

            if (totalWeight + pesoPercentual > 100) {
                setError(`A soma dos pesos não pode ultrapassar 100%. Peso atual: ${totalWeight}%, tentando adicionar: ${pesoPercentual}%`)
                return
            }

            const { error: updateError } = await supabase
                .from('componentes_avaliacao')
                .update({
                    nome: componenteFormData.nome,
                    codigo_componente: componenteFormData.codigo_componente,
                    peso_percentual: pesoPercentual,
                    escala_minima: parseFloat(componenteFormData.escala_minima),
                    escala_maxima: parseFloat(componenteFormData.escala_maxima),
                    obrigatorio: componenteFormData.obrigatorio,
                    ordem: parseInt(componenteFormData.ordem),
                    descricao: componenteFormData.descricao || null,
                    trimestre: parseInt(componenteFormData.trimestre),
                    is_calculated: componenteFormData.is_calculated || false,
                    formula_expression: componenteFormData.is_calculated ? componenteFormData.formula_expression : null,
                    depends_on_components: componenteFormData.is_calculated ? componenteFormData.depends_on_components : [],
                    tipo_calculo: componenteFormData.is_calculated ? componenteFormData.tipo_calculo : 'trimestral'
                })
                .eq('id', selectedComponente.id)

            if (updateError) throw updateError

            setSuccess('Componente atualizado com sucesso!')
            setShowEditComponenteModal(false)
            setSelectedComponente(null)
            resetComponenteForm()
            loadComponentes(selectedDisciplina.id)
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            console.error('Erro ao atualizar componente:', err)
            const errorMessage = err?.message || err?.error_description || 'Erro ao atualizar componente'
            setError(translateError(errorMessage))
        }
    }

    const handleDeleteComponente = async () => {
        if (!selectedComponente || !selectedDisciplina) return

        setError(null)
        setSuccess(null)

        try {
            const { error: deleteError } = await supabase
                .from('componentes_avaliacao')
                .delete()
                .eq('id', selectedComponente.id)

            if (deleteError) throw deleteError

            setSuccess('Componente removido com sucesso!')
            setShowDeleteComponenteModal(false)
            setSelectedComponente(null)
            loadComponentes(selectedDisciplina.id)
            setTimeout(() => setSuccess(null), 3000)
        } catch (err: any) {
            console.error('Erro ao remover componente:', err)
            const errorMessage = err?.message || err?.error_description || 'Erro ao remover componente'
            setError(translateError(errorMessage))
        }
    }

    const openAddComponenteModal = (disciplina: Disciplina) => {
        setSelectedDisciplina(disciplina)
        resetComponenteForm()
        setShowAddComponenteModal(true)
    }

    const openEditComponenteModal = (componente: ComponenteAvaliacao, disciplina: Disciplina) => {
        setSelectedDisciplina(disciplina)
        setSelectedComponente(componente)
        setComponenteFormData({
            nome: componente.nome,
            codigo_componente: componente.codigo_componente,
            peso_percentual: componente.peso_percentual.toString(),
            escala_minima: componente.escala_minima.toString(),
            escala_maxima: componente.escala_maxima.toString(),
            obrigatorio: componente.obrigatorio,
            ordem: componente.ordem.toString(),
            descricao: componente.descricao || '',
            trimestre: componente.trimestre.toString(),
            is_calculated: componente.is_calculated || false,
            formula_expression: componente.formula_expression || '',
            depends_on_components: componente.depends_on_components || [],
            tipo_calculo: componente.tipo_calculo || 'trimestral'
        })
        setShowEditComponenteModal(true)
    }

    const openDeleteComponenteModal = (componente: ComponenteAvaliacao, disciplina: Disciplina) => {
        setSelectedDisciplina(disciplina)
        setSelectedComponente(componente)
        setShowDeleteComponenteModal(true)
    }

    const handleMoveComponenteUp = async (componente: ComponenteAvaliacao, disciplina: Disciplina) => {
        try {
            // Get all components for this discipline and trimestre from database
            const { data: allComps, error: fetchError } = await supabase
                .from('componentes_avaliacao')
                .select('*')
                .eq('disciplina_id', disciplina.id)
                .eq('trimestre', componente.trimestre)
                .order('ordem')

            if (fetchError) throw fetchError
            if (!allComps) return

            const currentIndex = allComps.findIndex(c => c.id === componente.id)

            if (currentIndex <= 0) return // Already at top

            const previousComponente = allComps[currentIndex - 1]

            // Swap ordem values
            const { error: error1 } = await supabase
                .from('componentes_avaliacao')
                .update({ ordem: componente.ordem })
                .eq('id', previousComponente.id)

            const { error: error2 } = await supabase
                .from('componentes_avaliacao')
                .update({ ordem: previousComponente.ordem })
                .eq('id', componente.id)

            if (error1 || error2) throw error1 || error2

            setSuccess('Ordem atualizada com sucesso!')
            loadComponentes(disciplina.id)
            setTimeout(() => setSuccess(null), 2000)
        } catch (err: any) {
            console.error('Erro ao reordenar componente:', err)
            setError(translateError(err?.message || 'Erro ao reordenar componente'))
        }
    }

    const handleMoveComponenteDown = async (componente: ComponenteAvaliacao, disciplina: Disciplina) => {
        try {
            // Get all components for this discipline and trimestre from database
            const { data: allComps, error: fetchError } = await supabase
                .from('componentes_avaliacao')
                .select('*')
                .eq('disciplina_id', disciplina.id)
                .eq('trimestre', componente.trimestre)
                .order('ordem')

            if (fetchError) throw fetchError
            if (!allComps) return

            const currentIndex = allComps.findIndex(c => c.id === componente.id)

            if (currentIndex >= allComps.length - 1) return // Already at bottom

            const nextComponente = allComps[currentIndex + 1]

            // Swap ordem values
            const { error: error1 } = await supabase
                .from('componentes_avaliacao')
                .update({ ordem: componente.ordem })
                .eq('id', nextComponente.id)

            const { error: error2 } = await supabase
                .from('componentes_avaliacao')
                .update({ ordem: nextComponente.ordem })
                .eq('id', componente.id)

            if (error1 || error2) throw error1 || error2

            setSuccess('Ordem atualizada com sucesso!')
            loadComponentes(disciplina.id)
            setTimeout(() => setSuccess(null), 2000)
        } catch (err: any) {
            console.error('Erro ao reordenar componente:', err)
            setError(translateError(err?.message || 'Erro ao reordenar componente'))
        }
    }

    // Função para gerar código automático da disciplina
    const generateDisciplinaCode = (nome: string): string => {
        if (!nome || nome.trim().length === 0) return ''

        // Pegar as primeiras 3 letras significativas do nome (removendo espaços e acentos)
        const cleanName = nome
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^a-zA-Z\s]/g, '') // Remove caracteres especiais
            .trim()

        // Pegar as primeiras 3 letras maiúsculas
        const prefix = cleanName.substring(0, 3).toUpperCase()

        if (prefix.length < 2) return ''

        // Contar disciplinas existentes com mesmo prefixo para gerar número sequencial
        const existingWithPrefix = disciplinas.filter(d =>
            d.codigo_disciplina.toUpperCase().startsWith(prefix)
        ).length

        // Gerar número sequencial (001, 002, etc.)
        const sequentialNumber = String(existingWithPrefix + 1).padStart(3, '0')

        return `${prefix}${sequentialNumber}`
    }

    // Handler para atualização do nome com geração automática do código
    const handleNomeChange = (nome: string) => {
        const newFormData = { ...formData, nome }

        // Só gera código automático se o campo código estiver vazio ou foi gerado automaticamente
        const currentCode = formData.codigo_disciplina
        const wasAutoGenerated = currentCode === '' ||
            (currentCode.length >= 5 && /^[A-Z]{2,3}\d{3}$/.test(currentCode))

        if (wasAutoGenerated) {
            newFormData.codigo_disciplina = generateDisciplinaCode(nome)
        }

        setFormData(newFormData)
    }

    const resetComponenteForm = () => {
        setComponenteFormData({
            nome: '',
            codigo_componente: '',
            peso_percentual: '',
            escala_minima: '0',
            escala_maxima: '20',
            obrigatorio: true,
            ordem: '1',
            descricao: '',
            trimestre: '1',
            is_calculated: false,
            formula_expression: '',
            depends_on_components: [],
            tipo_calculo: 'trimestral' as 'trimestral' | 'anual'
        })
    }

    const closeComponenteModals = () => {
        setShowAddComponenteModal(false)
        setShowEditComponenteModal(false)
        setShowDeleteComponenteModal(false)
        setSelectedComponente(null)
        resetComponenteForm()
    }


    return (
        <div className="space-y-5 md:space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl md:text-2xl font-bold text-slate-900">Gestão de Disciplinas</h3>
                        <p className="text-sm text-slate-500">{turmaNome}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Docência regime badge */}
                    {nivelEnsino && (
                        <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                            isPluridocencia
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-blue-100 text-blue-700'
                        }`}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {isPluridocencia ? 'Pluridocência' : 'Monodocência'}
                        </span>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="min-h-touch min-w-touch flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center shadow-sm animate-slide-down">
                    <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="flex-1 font-medium">{error}</span>
                    <button onClick={() => setError(null)} className="ml-2 p-1 hover:bg-red-100 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}
            {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center shadow-sm animate-slide-down">
                    <Icons.Check />
                    <span className="ml-2 font-medium">{success}</span>
                </div>
            )}

            {/* Pluridocência informational banner for secondary school */}
            {isPluridocencia && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-violet-800">Pluridocência — Ensino Secundário (Dec. Pres. 162/23)</p>
                        <p className="text-xs text-violet-600 mt-0.5">
                            Cada disciplina deve ter um professor especialista atribuído. Utilize o campo "Professor" para definir o docente de cada disciplina individualmente.
                        </p>
                    </div>
                </div>
            )}

            {/* Monodocência informational banner for primary school */}
            {nivelEnsino && !isPluridocencia && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-blue-800">Monodocência — Ensino Primário (Dec. Pres. 162/23)</p>
                        <p className="text-xs text-blue-600 mt-0.5">
                            O professor de classe leciona todas as disciplinas. As disciplinas já devem estar atribuídas ao professor responsável definido na criação da turma.
                        </p>
                    </div>
                </div>
            )}

            {/* Add Button */}
            <button
                onClick={() => setShowAddModal(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-all hover:-translate-y-0.5"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adicionar Disciplina
            </button>

            {/* Disciplines List */}
            <Card className="border-0 shadow-md shadow-slate-200/50 overflow-hidden">
                <CardBody className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="text-center">
                                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-primary-600"></div>
                                <p className="mt-4 text-slate-500 font-medium">Carregando disciplinas...</p>
                            </div>
                        </div>
                    ) : disciplinas.length === 0 ? (
                        <div className="text-center py-16 px-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-3xl flex items-center justify-center mx-auto mb-5">
                                <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            </div>
                            <h4 className="text-xl font-bold text-slate-800 mb-2">Nenhuma disciplina cadastrada</h4>
                            <p className="text-slate-500 mb-6 max-w-sm mx-auto">Adicione disciplinas para começar a configurar os componentes de avaliação</p>
                            <Button variant="primary" onClick={() => setShowAddModal(true)}>
                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Adicionar Primeira Disciplina
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-200">
                            {disciplinas.map((disciplina) => {
                                const isExpanded = expandedDisciplina === disciplina.id
                                const disciplinaComponentes = componentes[disciplina.id] || []
                                const totalWeight = calculateTotalWeight(disciplina.id)
                                const isLoadingComps = loadingComponentes[disciplina.id]

                                return (
                                    <div
                                        key={disciplina.id}
                                        className="transition-colors duration-200"
                                    >
                                        <div className="p-4 md:p-5 hover:bg-slate-50">
                                            {/* Mobile-first stacked layout */}
                                            <div className="flex flex-col gap-3">
                                                {/* Header row: Badge + Name + Expand/Edit/Delete */}
                                                <div className="flex items-start gap-3">
                                                    <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                                        {disciplina.nome.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-slate-900 text-base leading-tight">
                                                            {disciplina.nome}
                                                        </h4>
                                                        <p className="text-sm text-slate-500 mt-0.5">
                                                            {disciplina.codigo_disciplina}
                                                        </p>
                                                        {disciplina.professor_id && (
                                                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 truncate">
                                                                <Icons.User className="w-3 h-3 flex-shrink-0" />
                                                                <span className="truncate">{professores.find(p => p.id === disciplina.professor_id)?.nome_completo || 'Professor não encontrado'}</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                    {/* Action buttons - always visible */}
                                                    <div className="flex-shrink-0 flex items-center gap-1">
                                                        <button
                                                            onClick={() => toggleDisciplina(disciplina.id)}
                                                            className={`p-2.5 rounded-xl transition-all min-h-touch min-w-[44px] flex items-center justify-center ${isExpanded ? 'bg-primary-100 text-primary-600' : 'text-slate-400 hover:text-primary-600 hover:bg-primary-50'}`}
                                                            title={isExpanded ? "Ocultar" : "Ver componentes"}
                                                        >
                                                            <svg className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => openEditModal(disciplina)}
                                                            className="p-2.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all min-h-touch min-w-[44px] flex items-center justify-center"
                                                            title="Editar"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => openDeleteModal(disciplina)}
                                                            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all min-h-touch min-w-[44px] flex items-center justify-center"
                                                            title="Excluir"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Badges row */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {disciplinasObrigatorias.has(disciplina.id) && (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-700">
                                                            <svg className="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                            </svg>
                                                            Obrigatória
                                                        </span>
                                                    )}
                                                    {disciplina.carga_horaria && (
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                                                            {disciplina.carga_horaria}h
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Checkbox for obrigatória - simplified mobile layout */}
                                                <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        id={`obrigatoria-${disciplina.id}`}
                                                        checked={disciplinasObrigatorias.has(disciplina.id)}
                                                        onChange={() => toggleDisciplinaObrigatoria(disciplina.id)}
                                                        disabled={loadingObrigatorias}
                                                        className="w-5 h-5 mt-0.5 text-amber-600 bg-white border-slate-300 rounded-md focus:ring-amber-500 focus:ring-2 cursor-pointer disabled:opacity-50 flex-shrink-0"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-medium text-slate-700 block">
                                                            Disciplina obrigatória
                                                        </span>
                                                        <span className="text-xs text-slate-500">
                                                            Para transição de classe ({disciplinasObrigatorias.size}/3-4)
                                                        </span>
                                                    </div>
                                                </label>

                                                {/* Description if exists */}
                                                {disciplina.descricao && (
                                                    <p className="text-sm text-slate-600 line-clamp-2 pl-1">
                                                        {disciplina.descricao}
                                                    </p>
                                                )}
                                            </div>


                                            {/* Expandable Components Section */}
                                            {isExpanded && (
                                                <div className="mt-5 pt-5 border-t border-slate-200">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                                </svg>
                                                            </div>
                                                            <h5 className="font-bold text-slate-800">Componentes de Avaliação</h5>
                                                        </div>
                                                        <button
                                                            onClick={() => openAddComponenteModal(disciplina)}
                                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 transition-all"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                            Adicionar Componente
                                                        </button>
                                                    </div>

                                                    {isLoadingComps ? (
                                                        <div className="text-center py-6">
                                                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600"></div>
                                                            <p className="mt-3 text-sm text-slate-500 font-medium">Carregando componentes...</p>
                                                        </div>
                                                    ) : disciplinaComponentes.length === 0 ? (
                                                        <div className="text-center py-8 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                                                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
                                                                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                                </svg>
                                                            </div>
                                                            <p className="text-sm font-medium text-slate-600 mb-4">Nenhum componente configurado</p>
                                                            <Button
                                                                variant="primary"
                                                                size="sm"
                                                                onClick={() => openAddComponenteModal(disciplina)}
                                                            >
                                                                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                                </svg>
                                                                Adicionar Componente
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="space-y-3 mb-4">
                                                                {disciplinaComponentes.map((comp) => (
                                                                    <div
                                                                        key={comp.id}
                                                                        className="p-4 bg-white border border-slate-200 rounded-xl hover:border-primary-300 hover:shadow-sm transition-all"
                                                                    >
                                                                        {/* Mobile: Stack layout */}
                                                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center flex-wrap gap-2 mb-2">
                                                                                    <span className="font-bold text-slate-900">{comp.nome}</span>
                                                                                    <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg font-medium">
                                                                                        {comp.codigo_componente}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-2 mb-2">
                                                                                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-lg font-medium">
                                                                                        {comp.trimestre}º Trim
                                                                                    </span>
                                                                                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium">
                                                                                        Peso: {comp.peso_percentual}%
                                                                                    </span>
                                                                                    {comp.obrigatorio && (
                                                                                        <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-lg font-medium">
                                                                                            Obrigatório
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="text-xs text-slate-500">
                                                                                    Escala: {comp.escala_minima}-{comp.escala_maxima} • Ordem: {comp.ordem}
                                                                                </div>
                                                                            </div>

                                                                            {/* Action buttons */}
                                                                            <div className="flex items-center justify-end gap-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                                                                                {/* Reorder buttons */}
                                                                                {(() => {
                                                                                    const componentesTrimestre = disciplinaComponentes
                                                                                        .filter(c => c.trimestre === comp.trimestre)
                                                                                        .sort((a, b) => a.ordem - b.ordem)
                                                                                    const currentIndex = componentesTrimestre.findIndex(c => c.id === comp.id)
                                                                                    const isFirst = currentIndex === 0
                                                                                    const isLast = currentIndex === componentesTrimestre.length - 1

                                                                                    return (
                                                                                        <>
                                                                                            <button
                                                                                                onClick={() => handleMoveComponenteUp(comp, disciplina)}
                                                                                                disabled={isFirst}
                                                                                                className={`p-2 rounded-lg transition-all min-h-touch min-w-[40px] flex items-center justify-center ${isFirst
                                                                                                    ? 'text-slate-300 cursor-not-allowed'
                                                                                                    : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                                                                                                    }`}
                                                                                                title="Mover para cima"
                                                                                            >
                                                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                                                                </svg>
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleMoveComponenteDown(comp, disciplina)}
                                                                                                disabled={isLast}
                                                                                                className={`p-2 rounded-lg transition-all min-h-touch min-w-[40px] flex items-center justify-center ${isLast
                                                                                                    ? 'text-slate-300 cursor-not-allowed'
                                                                                                    : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                                                                                                    }`}
                                                                                                title="Mover para baixo"
                                                                                            >
                                                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                                                </svg>
                                                                                            </button>
                                                                                        </>
                                                                                    )
                                                                                })()}

                                                                                <button
                                                                                    onClick={() => openEditComponenteModal(comp, disciplina)}
                                                                                    className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all min-h-touch min-w-[40px] flex items-center justify-center"
                                                                                    title="Editar componente"
                                                                                >
                                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                                    </svg>
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => openDeleteComponenteModal(comp, disciplina)}
                                                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all min-h-touch min-w-[40px] flex items-center justify-center"
                                                                                    title="Remover componente"
                                                                                >
                                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {/* Weight Summary */}
                                                            <div className={`p-3 rounded-xl text-sm font-medium flex items-center justify-between ${totalWeight === 100 ? 'bg-green-50 text-green-800 border border-green-200' : totalWeight > 100 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                                                                <div className="flex items-center gap-2">
                                                                    {totalWeight === 100 ? (
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                                        </svg>
                                                                    )}
                                                                    <span>Peso Total: <strong>{totalWeight}%</strong></span>
                                                                </div>
                                                                {totalWeight !== 100 && (
                                                                    <span className="text-xs">
                                                                        {totalWeight > 100 ? 'Ultrapassou 100%' : `Faltam ${100 - totalWeight}%`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardBody>
            </Card>

            {/* Add Modal */}
            {
                showAddModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                        <Card className="w-full md:max-w-lg md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[90vh] overflow-y-auto">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-slate-900">Adicionar Disciplina</h3>
                                    <button
                                        onClick={closeModals}
                                        className="text-slate-400 hover:text-slate-600 min-h-touch min-w-touch flex items-center justify-center -mr-2"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </CardHeader>
                            <CardBody>
                                <form onSubmit={handleAddDisciplina} className="space-y-4">
                                    <Input
                                        label="Nome da Disciplina"
                                        type="text"
                                        value={formData.nome}
                                        onChange={(e) => handleNomeChange(e.target.value)}
                                        placeholder="Ex: Matemática"
                                        required
                                    />

                                    {/* Professor Selection */}
                                    <div className="w-full">
                                        <label className="form-label mb-2 block text-sm font-medium text-slate-700">
                                            Professor <span className="text-error ml-1">*</span>
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={formData.professor_id}
                                                onChange={(e) => setFormData({ ...formData, professor_id: e.target.value })}
                                                className="
                                                    w-full px-4 min-h-[48px] text-base py-3
                                                    border border-neutral-300 rounded-xl
                                                    focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
                                                    transition-all duration-200 ease-out
                                                    disabled:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60
                                                    appearance-none bg-white cursor-pointer
                                                    text-slate-900
                                                "
                                                required
                                            >
                                                <option value="" className="text-neutral-400">Selecione um professor</option>
                                                {professores.map((prof) => (
                                                    <option key={prof.id} value={prof.id}>
                                                        {prof.nome_completo}{prof.especialidade ? ` — ${prof.especialidade}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            {/* Custom dropdown arrow */}
                                            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-neutral-400">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <Input
                                            label="Código da Disciplina"
                                            type="text"
                                            value={formData.codigo_disciplina}
                                            onChange={(e) => setFormData({ ...formData, codigo_disciplina: e.target.value.toUpperCase() })}
                                            placeholder="Ex: MAT001"
                                            required
                                            disabled={formData.codigo_disciplina.length > 0}
                                            className={formData.codigo_disciplina.length > 0 ? 'bg-slate-100 cursor-not-allowed' : ''}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                            Gerado automaticamente com base no nome da disciplina.
                                        </p>
                                    </div>

                                    <Input
                                        label="Carga Horária (opcional)"
                                        type="number"
                                        value={formData.carga_horaria}
                                        onChange={(e) => setFormData({ ...formData, carga_horaria: e.target.value })}
                                        placeholder="Ex: 120"
                                        min="0"
                                    />

                                    <div>
                                        <label className="form-label">Descrição (opcional)</label>
                                        <textarea
                                            value={formData.descricao}
                                            onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                                            placeholder="Breve descrição da disciplina..."
                                            className="form-input min-h-[80px] resize-none"
                                            rows={3}
                                        />
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={closeModals}
                                            className="flex-1"
                                        >
                                            Cancelar
                                        </Button>
                                        <Button type="submit" variant="primary" className="flex-1">
                                            Adicionar
                                        </Button>
                                    </div>
                                </form>
                            </CardBody>
                        </Card>
                    </div>
                )
            }

            {/* Edit Modal */}
            {
                showEditModal && selectedDisciplina && (
                    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                        <Card className="w-full md:max-w-lg md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[90vh] overflow-y-auto">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-slate-900">Editar Disciplina</h3>
                                    <button
                                        onClick={closeModals}
                                        className="text-slate-400 hover:text-slate-600 min-h-touch min-w-touch flex items-center justify-center -mr-2"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </CardHeader>
                            <CardBody>
                                <form onSubmit={handleEditDisciplina} className="space-y-4">
                                    <Input
                                        label="Nome da Disciplina"
                                        type="text"
                                        value={formData.nome}
                                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                        placeholder="Ex: Matemática"
                                        required
                                    />

                                    {/* Professor Selection */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Professor
                                        </label>
                                        <select
                                            value={formData.professor_id}
                                            onChange={(e) => setFormData({ ...formData, professor_id: e.target.value })}
                                            className="w-full rounded-lg border-slate-300 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                                            required
                                        >
                                            <option value="">Selecione um professor</option>
                                            {professores.map((prof) => (
                                                <option key={prof.id} value={prof.id}>
                                                    {prof.nome_completo}{prof.especialidade ? ` — ${prof.especialidade}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <Input
                                        label="Código da Disciplina"
                                        type="text"
                                        value={formData.codigo_disciplina}
                                        onChange={(e) => setFormData({ ...formData, codigo_disciplina: e.target.value })}
                                        placeholder="Ex: MAT001"
                                        required
                                    />

                                    <Input
                                        label="Carga Horária (opcional)"
                                        type="number"
                                        value={formData.carga_horaria}
                                        onChange={(e) => setFormData({ ...formData, carga_horaria: e.target.value })}
                                        placeholder="Ex: 120"
                                        min="0"
                                    />

                                    <div>
                                        <label className="form-label">Descrição (opcional)</label>
                                        <textarea
                                            value={formData.descricao}
                                            onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                                            placeholder="Breve descrição da disciplina..."
                                            className="form-input min-h-[80px] resize-none"
                                            rows={3}
                                        />
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={closeModals}
                                            className="flex-1"
                                        >
                                            Cancelar
                                        </Button>
                                        <Button type="submit" variant="primary" className="flex-1">
                                            Salvar Alterações
                                        </Button>
                                    </div>
                                </form>
                            </CardBody>
                        </Card>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteModal && selectedDisciplina && (
                    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                        <Card className="w-full md:max-w-md md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[90vh] overflow-y-auto">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-slate-900">Remover Disciplina</h3>
                                        <p className="text-sm text-slate-600 mt-0.5">Esta ação não pode ser desfeita</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardBody>
                                <div className="space-y-4">
                                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                        <p className="text-sm text-slate-600 mb-2">Você está prestes a remover:</p>
                                        <p className="font-semibold text-slate-900">{selectedDisciplina.nome}</p>
                                        <p className="text-sm text-slate-600 mt-1">Código: {selectedDisciplina.codigo_disciplina}</p>
                                    </div>

                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                        <div className="flex gap-2">
                                            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <p className="text-sm text-amber-800">
                                                Todos os componentes de avaliação, notas e dados relacionados a esta disciplina serão permanentemente removidos.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={closeModals}
                                            className="flex-1"
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="danger"
                                            onClick={handleDeleteDisciplina}
                                            className="flex-1"
                                        >
                                            Remover Disciplina
                                        </Button>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    </div>
                )
            }



            {/* Add Component Modal - Using Catalog */}
            {showAddComponenteModal && selectedDisciplina && (
                <ComponenteSelectorModal
                    escolaId={escolaProfile?.id || ''}
                    disciplinaId={selectedDisciplina.id}
                    turmaId={turmaId}
                    trimestre={parseInt(componenteFormData.trimestre)}
                    onTrimestreChange={(t) => setComponenteFormData({ ...componenteFormData, trimestre: t.toString() })}
                    existingCodes={componentes[selectedDisciplina.id]
                        ?.filter(c => c.trimestre === parseInt(componenteFormData.trimestre))
                        .map(c => c.codigo_componente) || []}
                    onSelect={(data) => {
                        setSuccess('Componente adicionado com sucesso!')
                        setShowAddComponenteModal(false)
                        resetComponenteForm()
                        loadComponentes(selectedDisciplina.id)
                        setTimeout(() => setSuccess(null), 3000)
                    }}
                    onClose={closeComponenteModals}
                />
            )}

            {/* Edit Component Modal */}
            {showEditComponenteModal && selectedComponente && selectedDisciplina && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                    <Card className="w-full md:max-w-lg md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[90vh] overflow-y-auto">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">Editar Componente</h3>
                                    <p className="text-sm text-slate-600 mt-0.5">{selectedDisciplina.nome}</p>
                                </div>
                                <button
                                    onClick={closeComponenteModals}
                                    className="text-slate-400 hover:text-slate-600 min-h-touch min-w-touch flex items-center justify-center -mr-2"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </CardHeader>
                        <CardBody>
                            <form onSubmit={handleEditComponente} className="space-y-4">
                                <Input
                                    label="Nome do Componente"
                                    type="text"
                                    value={componenteFormData.nome}
                                    onChange={(e) => setComponenteFormData({ ...componenteFormData, nome: e.target.value })}
                                    placeholder="Ex: MAC - Média das Avaliações Contínuas"
                                    required
                                />

                                <Input
                                    label="Código do Componente"
                                    type="text"
                                    value={componenteFormData.codigo_componente}
                                    onChange={(e) => setComponenteFormData({ ...componenteFormData, codigo_componente: e.target.value })}
                                    placeholder="Ex: MAC"
                                    required
                                />

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        Trimestre <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={componenteFormData.trimestre}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, trimestre: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        required
                                    >
                                        <option value="1">1º Trimestre</option>
                                        <option value="2">2º Trimestre</option>
                                        <option value="3">3º Trimestre</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="Peso Percentual (%)"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        value={componenteFormData.peso_percentual}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, peso_percentual: e.target.value })}
                                        placeholder="Ex: 30"
                                        required
                                    />

                                    <Input
                                        label="Ordem"
                                        type="number"
                                        min="1"
                                        value={componenteFormData.ordem}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, ordem: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="Escala Mínima"
                                        type="number"
                                        step="0.01"
                                        value={componenteFormData.escala_minima}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, escala_minima: e.target.value })}
                                        required
                                    />

                                    <Input
                                        label="Escala Máxima"
                                        type="number"
                                        step="0.01"
                                        value={componenteFormData.escala_maxima}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, escala_maxima: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="obrigatorio-edit"
                                        checked={componenteFormData.obrigatorio}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, obrigatorio: e.target.checked })}
                                        className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                                    />
                                    <label htmlFor="obrigatorio-edit" className="text-sm text-slate-700">
                                        Componente obrigatório
                                    </label>
                                </div>

                                {/* Calculated Field Toggle */}
                                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <input
                                        type="checkbox"
                                        id="is_calculated_edit"
                                        checked={componenteFormData.is_calculated}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, is_calculated: e.target.checked, formula_expression: '', depends_on_components: [] })}
                                        className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                                    />
                                    <label htmlFor="is_calculated_edit" className="text-sm text-slate-700 flex-1">
                                        <strong>Campo Calculável</strong>
                                        <span className="block text-xs text-slate-600 mt-0.5">
                                            Este componente será calculado automaticamente usando uma fórmula
                                        </span>
                                    </label>
                                </div>

                                {/* Formula Builder - Only show when calculated is enabled */}
                                {componenteFormData.is_calculated && (
                                    <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                                        {/* Calculation Type */}
                                        <div className="space-y-2">
                                            <label className="form-label text-sm">Tipo de Cálculo</label>
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        value="trimestral"
                                                        checked={componenteFormData.tipo_calculo === 'trimestral'}
                                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, tipo_calculo: e.target.value as 'trimestral' | 'anual' })}
                                                        className="w-4 h-4 text-primary-600"
                                                    />
                                                    <span className="text-sm text-slate-700">Trimestral (MT)</span>
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        value="anual"
                                                        checked={componenteFormData.tipo_calculo === 'anual'}
                                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, tipo_calculo: e.target.value as 'trimestral' | 'anual' })}
                                                        className="w-4 h-4 text-primary-600"
                                                    />
                                                    <span className="text-sm text-slate-700">Anual (MF)</span>
                                                </label>
                                            </div>
                                            <p className="text-xs text-slate-600">
                                                {componenteFormData.tipo_calculo === 'trimestral'
                                                    ? 'Calcula usando componentes do mesmo trimestre (ex: MAC * 0.4 + EXAME * 0.6)'
                                                    : 'Calcula usando médias dos 3 trimestres (ex: (T1 + T2 + T3) / 3)'}
                                            </p>
                                        </div>

                                        {/* Available Components - Filter based on calculation type */}
                                        <div>
                                            <label className="form-label text-sm">
                                                Componentes para usar na fórmula
                                            </label>
                                            {(() => {
                                                // For trimestral: show only non-calculated components
                                                // For anual: show calculated components (like MT) + manual components from 3rd trimester
                                                const availableComponents = selectedDisciplina && componentes[selectedDisciplina.id]
                                                    ? componentes[selectedDisciplina.id].filter(c =>
                                                        c.id !== selectedComponente?.id && (
                                                            componenteFormData.tipo_calculo === 'trimestral'
                                                                ? !c.is_calculated  // Trimestral: only manual components
                                                                : c.is_calculated || (!c.is_calculated && c.trimestre === 3)   // Anual: calculated components + 3rd trimester manual components
                                                        )
                                                    )
                                                    : [];

                                                return availableComponents.length > 0 ? (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {availableComponents.map((comp) => (
                                                            <label
                                                                key={comp.id}
                                                                className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${componenteFormData.depends_on_components.includes(comp.id)
                                                                    ? 'border-primary-500 bg-primary-50'
                                                                    : 'border-slate-200 bg-white hover:border-primary-300'
                                                                    }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={componenteFormData.depends_on_components.includes(comp.id)}
                                                                    onChange={(e) => {
                                                                        const newDeps = e.target.checked
                                                                            ? [...componenteFormData.depends_on_components, comp.id]
                                                                            : componenteFormData.depends_on_components.filter(id => id !== comp.id)
                                                                        setComponenteFormData({ ...componenteFormData, depends_on_components: newDeps })
                                                                    }}
                                                                    className="w-3 h-3 text-primary-600 border-slate-300 rounded"
                                                                />
                                                                <div className="flex-1 flex items-center justify-between gap-1">
                                                                    <span className="text-xs font-mono font-semibold text-primary-700">{comp.codigo_componente}</span>
                                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${comp.trimestre === 1 ? 'bg-blue-100 text-blue-700' :
                                                                        comp.trimestre === 2 ? 'bg-green-100 text-green-700' :
                                                                            'bg-orange-100 text-orange-700'
                                                                        }`}>
                                                                        T{comp.trimestre}
                                                                    </span>
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-slate-500 bg-white p-2 rounded border border-slate-200">
                                                        {componenteFormData.tipo_calculo === 'trimestral'
                                                            ? 'Nenhum componente manual disponível.'
                                                            : 'Nenhum componente disponível. Crie componentes calculáveis (ex: MT) ou componentes do 3º trimestre.'}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Formula Input */}
                                        <div>
                                            <label className="form-label text-sm">Fórmula de Cálculo</label>
                                            <input
                                                type="text"
                                                value={componenteFormData.formula_expression}
                                                onChange={(e) => setComponenteFormData({ ...componenteFormData, formula_expression: e.target.value })}
                                                placeholder="Ex: MAC * 0.4 + EXAME * 0.6"
                                                className="form-input text-sm font-mono"
                                                disabled={componenteFormData.depends_on_components.length === 0}
                                            />
                                            <p className="text-xs text-slate-500 mt-1">
                                                Use os códigos dos componentes selecionados e operadores: + - * / ( )
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="form-label">Descrição (opcional)</label>
                                    <textarea
                                        value={componenteFormData.descricao}
                                        onChange={(e) => setComponenteFormData({ ...componenteFormData, descricao: e.target.value })}
                                        placeholder="Breve descrição do componente..."
                                        className="form-input min-h-[60px] resize-none"
                                        rows={2}
                                    />
                                </div>

                                <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-600">
                                    <p><strong>Peso atual da disciplina:</strong> {calculateTotalWeight(selectedDisciplina.id, selectedComponente.id)}%</p>
                                    {componenteFormData.peso_percentual && (
                                        <p className="mt-1">
                                            <strong>Peso após editar:</strong> {calculateTotalWeight(selectedDisciplina.id, selectedComponente.id) + parseFloat(componenteFormData.peso_percentual || '0')}%
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={closeComponenteModals}
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={handleEditComponente}
                                        className="flex-1"
                                    >
                                        Salvar Alterações
                                    </Button>
                                </div>
                            </form>
                        </CardBody>
                    </Card>
                </div>
            )}

            {/* Delete Component Confirmation Modal */}
            {showDeleteComponenteModal && selectedComponente && selectedDisciplina && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                    <Card className="w-full md:max-w-md md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[90vh] overflow-y-auto">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-slate-900">Remover Componente</h3>
                                    <p className="text-sm text-slate-600 mt-0.5">Esta ação não pode ser desfeita</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardBody>
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <p className="text-sm text-slate-600 mb-2">Você está prestes a remover:</p>
                                    <p className="font-semibold text-slate-900">{selectedComponente.nome}</p>
                                    <p className="text-sm text-slate-600 mt-1">Código: {selectedComponente.codigo_componente}</p>
                                    <p className="text-sm text-slate-600">Peso: {selectedComponente.peso_percentual}%</p>
                                </div>

                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex gap-2">
                                        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p className="text-sm text-amber-800">
                                            Todas as notas associadas a este componente serão permanentemente removidas.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={closeComponenteModals}
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={handleDeleteComponente}
                                        className="flex-1"
                                    >
                                        Remover Componente
                                    </Button>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            )}
        </div >
    )
}
