/*
component-meta:
  name: ReportsPage
  description: Page for generating reports and exporting data
  tokens: [--color-primary, --fs-md, min-h-touch]
  responsive: true
  tested-on: [360x800, 768x1024, 1440x900]
*/

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Card, CardHeader, CardBody } from './ui/Card'
import { Button } from './ui/Button'
import { translateError } from '../utils/translations'
import { MiniPautaPreview } from './MiniPautaPreview'
import { OrdenarDisciplinasModal } from './OrdenarDisciplinasModal'
import { TurmaStatistics } from './TurmaStatistics'
import { generateMiniPautaPDF } from '../utils/pdfGenerator'
import { generateMiniPautaExcel, generateCSV } from '../utils/excelGenerator'
import { calculateNotaFinal, calculateStatistics } from '../utils/gradeCalculations'
import { evaluateFormula, parseFormula } from '../utils/formulaUtils'
import { FormulaConfig, loadFormulaConfig } from '../utils/formulaConfigUtils'
import { ConfiguracaoFormulasModal } from './ConfiguracaoFormulasModal'
import { HeaderConfig, loadHeaderConfig } from '../utils/headerConfigUtils'
import { ConfiguracaoCabecalhoModal } from './ConfiguracaoCabecalhoModal'
import { GradeColorConfig, loadGradeColorConfig } from '../utils/gradeColorConfigUtils'
import { ConfiguracaoCoresModal } from './ConfiguracaoCoresModal'
import { PautaGeralPage } from './PautaGeralPage'
import { useAuth } from '../contexts/AuthContext'
import { TermoFrequenciaPreview } from './TermoFrequenciaPreview'
import { generateTermoFrequenciaPDF, generateBatchTermosFrequenciaZip } from '../utils/pdfGenerator'

interface Turma {
    id: string
    nome: string
    ano_lectivo: number
    codigo_turma: string
    nivel_ensino: string
}

interface Disciplina {
    id: string
    nome: string
    codigo_disciplina: string
    ordem?: number
}

interface ComponenteAvaliacao {
    id: string
    codigo_componente: string
    nome: string
    peso_percentual: number
    is_calculated?: boolean
    formula_expression?: string
    depends_on_components?: string[]
    disciplina_nome?: string  // For grouping in Primary Education format
    disciplina_ordem?: number  // For ordering disciplines in Primary Education format
}

interface TrimestreData {
    notas: Record<string, number>
    nota_final: number
    classificacao: string
    aprovado: boolean
}

interface MiniPautaData {
    turma: Turma
    disciplina: Disciplina
    trimestre: number | 'all'
    nivel_ensino?: string  // Educational level for color grading
    classe?: string  // Class level for color grading
    alunos: Array<{
        numero_processo: string
        nome_completo: string
        genero?: 'M' | 'F'
        notas: Record<string, number>
        nota_final?: number  // Optional - only present if MF component is configured
        media_trimestral?: number | null
        classificacao: string
        aprovado: boolean
        // For all-trimester mode
        trimestres?: {
            1?: TrimestreData
            2?: TrimestreData
            3?: TrimestreData
        }
    }>
    componentes: ComponenteAvaliacao[]
    estatisticas: {
        total_alunos: number
        aprovados: number
        reprovados: number
        taxa_aprovacao: number
        media_turma: number
        nota_minima: number
        nota_maxima: number
        distribuicao: Record<string, number>
    }
    showMT?: boolean
    escola?: {
        nome: string
        provincia: string
        municipio: string
    }
}

interface ReportsPageProps {
    searchQuery?: string
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ searchQuery = '' }) => {
    const { isProfessor, professorProfile, escolaProfile, secretarioProfile, isDirecaoMunicipal, direcaoMunicipalProfile } = useAuth()
    const [turmas, setTurmas] = useState<Turma[]>([])
    const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
    const [selectedTurma, setSelectedTurma] = useState<string>('')
    const [selectedTurmaData, setSelectedTurmaData] = useState<Turma | null>(null)
    const [selectedDisciplina, setSelectedDisciplina] = useState<string>('')
    const [trimestre, setTrimestre] = useState<1 | 2 | 3 | 'all'>(1)
    const [loadingData, setLoadingData] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [miniPautaData, setMiniPautaData] = useState<MiniPautaData | null>(null)
    const [mtConfig, setMtConfig] = useState<FormulaConfig | null>(null)
    const [showConfigModal, setShowConfigModal] = useState(false)
    const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null)
    const [showHeaderConfigModal, setShowHeaderConfigModal] = useState(false)
    const [showOrdenarDisciplinasModal, setShowOrdenarDisciplinasModal] = useState(false)
    const [colorConfig, setColorConfig] = useState<GradeColorConfig | null>(null)
    const [showColorConfigModal, setShowColorConfigModal] = useState(false)

    // Tab state
    const [activeTab, setActiveTab] = useState<'mini-pauta' | 'pauta-geral' | 'termo-frequencia'>('mini-pauta')

    // Termo de Frequência state
    const [alunos, setAlunos] = useState<Array<{ id: string, numero_processo: string, nome_completo: string }>>([])
    const [selectedAluno, setSelectedAluno] = useState<string>('')
    const [termoFrequenciaData, setTermoFrequenciaData] = useState<any>(null)
    const [loadingTermo, setLoadingTermo] = useState(false)
    const [availableComponents, setAvailableComponents] = useState<Array<{ codigo: string, nome: string }>>([])
    const [selectedComponents, setSelectedComponents] = useState<string[]>([])
    const [componentAlignment, setComponentAlignment] = useState<'left' | 'center' | 'right'>('center')

    // Batch generation state
    const [selectedAlunosIds, setSelectedAlunosIds] = useState<string[]>([])
    const [batchProgress, setBatchProgress] = useState<{
        current: number
        total: number
        currentAluno: string
    } | null>(null)
    const [batchGenerating, setBatchGenerating] = useState(false)
    const [isBatchGenerationExpanded, setIsBatchGenerationExpanded] = useState(false)
    const [isComponentsExpanded, setIsComponentsExpanded] = useState(false)

    // Direção Municipal - escola filter state
    const [escolas, setEscolas] = useState<Array<{ id: string, nome: string, codigo_escola: string }>>([])
    const [selectedEscola, setSelectedEscola] = useState<string>('')

    // Detect if selected turma is Primary Education
    const isPrimaryEducation = selectedTurmaData?.nivel_ensino?.toLowerCase().includes('primário') ||
        selectedTurmaData?.nivel_ensino?.toLowerCase().includes('primario') ||
        false

    // Define functions before useEffects
    const loadAlunos = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('alunos')
                .select('id, numero_processo, nome_completo')
                .eq('turma_id', selectedTurma)
                .eq('ativo', true)
                .order('nome_completo')

            if (error) throw error
            setAlunos(data || [])

            // Auto-select first student
            if (data && data.length > 0 && !selectedAluno) {
                setSelectedAluno(data[0].id)
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar alunos'
            setError(translateError(errorMessage))
        }
    }, [selectedTurma, selectedAluno])

    const loadTermoFrequenciaData = useCallback(async () => {
        // Early return if no student selected
        if (!selectedAluno || !selectedTurma) {
            return
        }

        try {
            setLoadingTermo(true)
            setError(null)

            console.log('Loading termo data for student:', selectedAluno, 'turma:', selectedTurma)

            // Load student details with all expanded fields
            const { data: alunoData, error: alunoError } = await supabase
                .from('alunos')
                .select(`
                    id, numero_processo, nome_completo, data_nascimento, genero,
                    nacionalidade, naturalidade, tipo_documento, numero_documento,
                    nome_pai, nome_mae, nome_encarregado, parentesco_encarregado,
                    telefone_encarregado, email_encarregado, profissao_encarregado,
                    provincia, municipio, bairro, rua, endereco,
                    ano_ingresso, escola_anterior, classe_anterior, observacoes_academicas,
                    frequencia_anual, tipo_exame, observacao_transicao, motivo_retencao, matricula_condicional
                `)
                .eq('id', selectedAluno)
                .single()

            if (alunoError) {
                console.error('Error loading student:', alunoError)
                throw alunoError
            }

            // Load turma details
            const { data: turmaData, error: turmaError } = await supabase
                .from('turmas')
                .select('id, nome, ano_lectivo, codigo_turma, nivel_ensino')
                .eq('id', selectedTurma)
                .single()

            if (turmaError) {
                console.error('Error loading turma:', turmaError)
                throw turmaError
            }

            // Load all disciplines for this turma
            const { data: disciplinasData, error: disciplinasError } = await supabase
                .from('disciplinas')
                .select('id, nome, codigo_disciplina')
                .eq('turma_id', selectedTurma)
                .order('ordem')

            if (disciplinasError) {
                console.error('Error loading disciplines:', disciplinasError)
                throw disciplinasError
            }

            if (!disciplinasData || disciplinasData.length === 0) {
                setError('Nenhuma disciplina encontrada para esta turma')
                setTermoFrequenciaData(null)
                return
            }

            // Load all components for all disciplines (including calculated ones that are registered)
            const { data: componentesData, error: componentesError } = await supabase
                .from('componentes_avaliacao')
                .select('id, codigo_componente, nome, peso_percentual, trimestre, disciplina_id, is_calculated, formula_expression, depends_on_components, tipo_calculo')
                .eq('turma_id', selectedTurma)
                .in('disciplina_id', disciplinasData.map(d => d.id))

            if (componentesError) {
                console.error('Error loading components:', componentesError)
                throw componentesError
            }

            // Load all grades for this student across all trimesters
            const { data: notasData, error: notasError } = await supabase
                .from('notas')
                .select('componente_id, valor, trimestre')
                .eq('aluno_id', selectedAluno)
                .eq('turma_id', selectedTurma)

            if (notasError) {
                console.error('Error loading grades:', notasError)
                throw notasError
            }

            console.log('Loaded data:', { aluno: alunoData, turma: turmaData, disciplinas: disciplinasData?.length, componentes: componentesData?.length, notas: notasData?.length })

            // Extract unique components for selection (all registered components)
            const uniqueComponents = Array.from(
                new Map(componentesData?.map(c => [c.codigo_componente, { codigo: c.codigo_componente, nome: c.nome }]) || []).values()
            )
            setAvailableComponents(uniqueComponents)

            // Auto-select all components if none selected yet
            if (selectedComponents.length === 0 && uniqueComponents.length > 0) {
                setSelectedComponents(uniqueComponents.map(c => c.codigo))
            }

            // Process each discipline
            const disciplinasProcessadas = disciplinasData.map(disciplina => {
                const componentesDisciplina = componentesData?.filter(c => c.disciplina_id === disciplina.id) || []
                const notasTrimestrais: { 1: number | null, 2: number | null, 3: number | null } = {
                    1: null,
                    2: null,
                    3: null
                }

                // Process components BY TRIMESTRE - each trimester has its own components
                const componentesPorTrimestre: {
                    1: Array<{ codigo: string, nome: string, nota: number | null, is_calculated?: boolean }>,
                    2: Array<{ codigo: string, nome: string, nota: number | null, is_calculated?: boolean }>,
                    3: Array<{ codigo: string, nome: string, nota: number | null, is_calculated?: boolean }>
                } = { 1: [], 2: [], 3: [] }

                // Build a map of all grades for this discipline (by component ID)
                const notasMapByComponentId: Record<string, number> = {}
                notasData?.filter(n => componentesDisciplina.some(c => c.id === n.componente_id))
                    .forEach(n => {
                        notasMapByComponentId[n.componente_id] = n.valor
                    })

                // Process each trimester separately
                for (let t = 1; t <= 3; t++) {
                    const componentesDoTrimestre = componentesDisciplina
                        .filter(comp => comp.trimestre === t)
                        .filter(comp => selectedComponents.length === 0 || selectedComponents.includes(comp.codigo_componente))

                    // Build notas map for this trimester (by component code)
                    const notasMapTrimestre: Record<string, number> = {}
                    componentesDoTrimestre.forEach(comp => {
                        const nota = notasMapByComponentId[comp.id]
                        if (nota !== undefined) {
                            notasMapTrimestre[comp.codigo_componente] = nota
                        }
                    })

                    // STEP 1: Calculate TRIMESTRAL calculated components (like MT)
                    componentesDoTrimestre.forEach(comp => {
                        if (comp.is_calculated && comp.formula_expression && comp.depends_on_components) {
                            if (comp.tipo_calculo === 'trimestral' || !comp.tipo_calculo) {
                                const dependencyValues: Record<string, number> = {}

                                comp.depends_on_components.forEach((depId: string) => {
                                    const depComponent = componentesDisciplina.find(c => c.id === depId && c.trimestre === t)
                                    if (depComponent) {
                                        const value = notasMapTrimestre[depComponent.codigo_componente]
                                        if (value !== undefined) {
                                            dependencyValues[depComponent.codigo_componente] = value
                                        } else {
                                            dependencyValues[depComponent.codigo_componente] = 0
                                        }
                                    }
                                })

                                if (Object.keys(dependencyValues).length > 0) {
                                    try {
                                        const calculatedValue = evaluateFormula(comp.formula_expression, dependencyValues)
                                        notasMapTrimestre[comp.codigo_componente] = Math.round(calculatedValue * 100) / 100
                                    } catch (error) {
                                        console.error(`Error calculating trimestral component ${comp.codigo_componente}:`, error)
                                    }
                                }
                            }
                        }
                    })

                    // Add components to the trimester array
                    // IMPORTANT: Skip annual calculated components here - they will be added later after calculation
                    componentesDoTrimestre.forEach(comp => {
                        // Skip annual calculated components (like MFD, MF) - they'll be added in the annual calculation block
                        if (comp.is_calculated && comp.tipo_calculo === 'anual') {
                            console.log(`[TERMO DEBUG] Skipping annual component ${comp.codigo_componente} in initial loop - will be added after calculation`)
                            return
                        }

                        const nota = notasMapTrimestre[comp.codigo_componente] ?? null
                        componentesPorTrimestre[t as 1 | 2 | 3].push({
                            codigo: comp.codigo_componente,
                            nome: comp.nome,
                            nota: nota,
                            is_calculated: comp.is_calculated || false
                        })
                    })
                }

                // STEP 2: Calculate ANNUAL calculated components (like MFD, MF)
                // These need values from all trimesters
                const annualComponents = componentesDisciplina.filter(c =>
                    c.is_calculated && c.tipo_calculo === 'anual'
                )

                console.log(`[TERMO DEBUG] Disciplina: ${disciplina.nome}`)
                console.log(`[TERMO DEBUG] Total components:`, componentesDisciplina.length)
                console.log(`[TERMO DEBUG] Annual components found:`, annualComponents.length, annualComponents.map(c => c.codigo_componente))
                console.log(`[TERMO DEBUG] All components:`, componentesDisciplina.map(c => ({
                    codigo: c.codigo_componente,
                    is_calculated: c.is_calculated,
                    tipo_calculo: c.tipo_calculo
                })))

                if (annualComponents.length > 0) {
                    // Build a complete map of all component values across all trimesters
                    const allNotasMap: Record<string, number> = {}

                    // First, add all raw grades
                    notasData?.filter(n => componentesDisciplina.some(c => c.id === n.componente_id))
                        .forEach(n => {
                            const comp = componentesDisciplina.find(c => c.id === n.componente_id)
                            if (comp) {
                                allNotasMap[comp.codigo_componente] = n.valor
                            }
                        })

                    // Then, add all calculated trimestral values
                    for (let t = 1; t <= 3; t++) {
                        componentesPorTrimestre[t as 1 | 2 | 3].forEach(comp => {
                            if (comp.nota !== null && comp.is_calculated) {
                                allNotasMap[comp.codigo] = comp.nota
                            }
                        })
                    }

                    console.log(`[TERMO DEBUG] All notas map before annual calculation:`, allNotasMap)

                    // Now calculate annual components
                    annualComponents.forEach(comp => {
                        console.log(`[TERMO DEBUG] ===== Processing ${comp.codigo_componente} =====`)
                        console.log(`[TERMO DEBUG] Current allNotasMap:`, { ...allNotasMap })

                        if (comp.formula_expression && comp.depends_on_components) {
                            const dependencyValues: Record<string, number> = {}

                            comp.depends_on_components.forEach((depId: string) => {
                                const depComponent = componentesDisciplina.find(c => c.id === depId)
                                if (depComponent) {
                                    const value = allNotasMap[depComponent.codigo_componente]
                                    if (value !== undefined) {
                                        dependencyValues[depComponent.codigo_componente] = value
                                    } else {
                                        dependencyValues[depComponent.codigo_componente] = 0
                                    }
                                }
                            })

                            if (Object.keys(dependencyValues).length > 0) {
                                try {
                                    console.log(`[TERMO] Calculating annual component ${comp.codigo_componente}:`, dependencyValues)
                                    const calculatedValue = evaluateFormula(comp.formula_expression, dependencyValues)
                                    const roundedValue = Math.round(calculatedValue * 100) / 100
                                    console.log(`[TERMO] Calculated ${comp.codigo_componente}:`, roundedValue)

                                    // CRITICAL: Add to allNotasMap immediately so other annual components can use it
                                    allNotasMap[comp.codigo_componente] = roundedValue
                                    console.log(`[TERMO DEBUG] Added ${comp.codigo_componente}=${roundedValue} to allNotasMap. Map now has:`, Object.keys(allNotasMap))

                                    // Add to the trimester where this component belongs
                                    console.log(`[TERMO DEBUG] Adding ${comp.codigo_componente} to display. selectedComponents:`, selectedComponents.length === 0 ? 'ALL' : selectedComponents)
                                    const shouldDisplay = selectedComponents.length === 0 || selectedComponents.includes(comp.codigo_componente)
                                    console.log(`[TERMO DEBUG] Should display ${comp.codigo_componente}:`, shouldDisplay)

                                    if (shouldDisplay) {
                                        componentesPorTrimestre[comp.trimestre as 1 | 2 | 3].push({
                                            codigo: comp.codigo_componente,
                                            nome: comp.nome,
                                            nota: roundedValue,
                                            is_calculated: true
                                        })
                                        console.log(`[TERMO DEBUG] Added ${comp.codigo_componente} to trimestre ${comp.trimestre}`)
                                    } else {
                                        console.log(`[TERMO DEBUG] FILTERED OUT ${comp.codigo_componente} - not in selectedComponents`)
                                    }
                                } catch (error) {
                                    console.error(`Error calculating annual component ${comp.codigo_componente}:`, error)
                                }
                            }
                        }
                    })
                }

                // Calculate grade for each trimestre
                for (let t = 1; t <= 3; t++) {
                    const componentesTrimestre = componentesDisciplina.filter(c => c.trimestre === t)
                    const notasTrimestre = notasData?.filter(n =>
                        n.trimestre === t &&
                        componentesTrimestre.some(c => c.id === n.componente_id)
                    ) || []

                    if (notasTrimestre.length > 0 && componentesTrimestre.length > 0) {
                        const resultado = calculateNotaFinal(notasTrimestre, componentesTrimestre)
                        notasTrimestrais[t as 1 | 2 | 3] = resultado.nota_final
                    }
                }

                // Calculate final grade: prefer MFD/MF value if available, otherwise average of trimesters
                let notaFinal: number | null = null

                // Look for MFD or MF in the 3rd trimester components
                const mfdComponent = componentesPorTrimestre[3].find(c => c.codigo === 'MFD' || c.codigo === 'MF')
                if (mfdComponent && mfdComponent.nota !== null) {
                    notaFinal = mfdComponent.nota
                } else {
                    // Fallback to average of available trimester grades
                    const notasValidas = Object.values(notasTrimestrais).filter(n => n !== null) as number[]
                    notaFinal = notasValidas.length > 0
                        ? notasValidas.reduce((sum, n) => sum + n, 0) / notasValidas.length
                        : null
                }

                // Determine pass/fail based on education level
                // Ensino Primário: MF >= 5 transita, Ensino Secundário: MF >= 10 transita
                const isPrimary = turmaData.nivel_ensino?.toLowerCase().includes('primário') ||
                    turmaData.nivel_ensino?.toLowerCase().includes('primario')
                const limiarTransicao = isPrimary ? 5 : 10
                const transita = notaFinal !== null && notaFinal >= limiarTransicao

                console.log(`[TERMO DEBUG] Final componentesPorTrimestre[3] for ${disciplina.nome}:`, componentesPorTrimestre[3].map(c => `${c.codigo}=${c.nota}`))

                return {
                    id: disciplina.id,
                    nome: disciplina.nome,
                    codigo_disciplina: disciplina.codigo_disciplina,
                    notas_trimestrais: notasTrimestrais,
                    componentesPorTrimestre: componentesPorTrimestre,
                    nota_final: notaFinal,
                    classificacao: notaFinal !== null ? (notaFinal >= limiarTransicao ? 'Aprovado' : 'Reprovado') : 'N/A',
                    transita
                }
            })

            // Determine overall education level for threshold
            const isPrimaryEducation = turmaData.nivel_ensino?.toLowerCase().includes('primário') ||
                turmaData.nivel_ensino?.toLowerCase().includes('primario')
            const limiarGeralTransicao = isPrimaryEducation ? 5 : 10

            // Calculate overall statistics
            const notasFinaisValidas = disciplinasProcessadas
                .map(d => d.nota_final)
                .filter(n => n !== null) as number[]

            const mediaGeral = notasFinaisValidas.length > 0
                ? notasFinaisValidas.reduce((sum, n) => sum + n, 0) / notasFinaisValidas.length
                : 0

            const disciplinasAprovadas = disciplinasProcessadas.filter(d => d.transita).length
            const disciplinasReprovadas = disciplinasProcessadas.filter(d => !d.transita).length

            // Student passes if all disciplines are passed and average meets threshold
            const transitaGeral = disciplinasProcessadas.every(d => d.transita) && mediaGeral >= limiarGeralTransicao

            // Load escola info (optional)
            const { data: escolaData } = await supabase
                .from('escolas')
                .select('nome, provincia, municipio')
                .limit(1)
                .single()

            setTermoFrequenciaData({
                aluno: {
                    numero_processo: alunoData.numero_processo,
                    nome_completo: alunoData.nome_completo,
                    data_nascimento: alunoData.data_nascimento,
                    genero: alunoData.genero,
                    nacionalidade: alunoData.nacionalidade,
                    naturalidade: alunoData.naturalidade,
                    tipo_documento: alunoData.tipo_documento,
                    numero_documento: alunoData.numero_documento,
                    nome_pai: alunoData.nome_pai,
                    nome_mae: alunoData.nome_mae,
                    nome_encarregado: alunoData.nome_encarregado,
                    parentesco_encarregado: alunoData.parentesco_encarregado,
                    telefone_encarregado: alunoData.telefone_encarregado,
                    email_encarregado: alunoData.email_encarregado,
                    profissao_encarregado: alunoData.profissao_encarregado,
                    provincia: alunoData.provincia,
                    municipio: alunoData.municipio,
                    bairro: alunoData.bairro,
                    rua: alunoData.rua,
                    endereco: alunoData.endereco,
                    ano_ingresso: alunoData.ano_ingresso,
                    escola_anterior: alunoData.escola_anterior,
                    classe_anterior: alunoData.classe_anterior,
                    observacoes_academicas: alunoData.observacoes_academicas,
                    frequencia_anual: alunoData.frequencia_anual,
                    tipo_exame: alunoData.tipo_exame,
                },
                turma: turmaData,
                disciplinas: disciplinasProcessadas,
                estatisticas: {
                    media_geral: mediaGeral,
                    total_disciplinas: disciplinasProcessadas.length,
                    disciplinas_aprovadas: disciplinasAprovadas,
                    disciplinas_reprovadas: disciplinasReprovadas,
                    transita: transitaGeral,
                    observacao_padronizada: alunoData.observacao_transicao,
                    motivo_retencao: alunoData.motivo_retencao,
                    matricula_condicional: alunoData.matricula_condicional
                },
                escola: escolaData || undefined
            })

            console.log('Termo data loaded successfully')

        } catch (err) {
            console.error('Error in loadTermoFrequenciaData:', err)
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados do termo de frequência'
            setError(translateError(errorMessage))
            setTermoFrequenciaData(null)
        } finally {
            setLoadingTermo(false)
        }
    }, [selectedAluno, selectedTurma, selectedComponents])

    useEffect(() => {
        loadTurmas()
    }, [selectedEscola]) // Re-run when escola changes (for Direção Municipal)

    // Reset turma when escola changes
    useEffect(() => {
        if (isDirecaoMunicipal) {
            setSelectedTurma('')
            setSelectedTurmaData(null)
            setDisciplinas([])
            setSelectedDisciplina('')
        }
    }, [selectedEscola, isDirecaoMunicipal])

    useEffect(() => {
        if (selectedTurma) {
            loadTurmaDetails()
            loadDisciplinas()
        } else {
            setSelectedTurmaData(null)
            setDisciplinas([])
            setSelectedDisciplina('')
        }
    }, [selectedTurma])

    // Reset selections when switching between Primary/Secondary education
    useEffect(() => {
        if (isPrimaryEducation) {
            // For Primary Education, default to trimestre 1 (no 'all' option)
            if (trimestre === 'all') {
                setTrimestre(1)
            }
        } else {
            // For Secondary Education, reset discipline if 'all' was selected (not valid for Secondary)
            if (selectedDisciplina === 'all') {
                setSelectedDisciplina('')
            }
        }
    }, [isPrimaryEducation])

    useEffect(() => {
        if (selectedTurma && selectedDisciplina) {
            loadMiniPautaData()
        } else {
            setMiniPautaData(null)
        }
    }, [selectedTurma, selectedDisciplina, trimestre])

    useEffect(() => {
        loadHeaderConfiguration()
        loadColorConfiguration()
    }, [selectedTurma])

    useEffect(() => {
        if (selectedTurma && activeTab === 'termo-frequencia') {
            loadAlunos()
        } else {
            setAlunos([])
            setSelectedAluno('')
            setTermoFrequenciaData(null)
        }
    }, [selectedTurma, activeTab, loadAlunos])

    useEffect(() => {
        if (selectedTurma && selectedAluno && activeTab === 'termo-frequencia') {
            loadTermoFrequenciaData()
        } else {
            setTermoFrequenciaData(null)
        }
    }, [selectedTurma, selectedAluno, activeTab, loadTermoFrequenciaData])



    const loadTurmas = async () => {
        try {
            if (isProfessor && professorProfile) {
                console.log('📊 ReportsPage: Loading turmas for professor:', professorProfile.id)

                // Try NEW MODEL first: Get turmas via turma_professores
                const { data: turmaProfsData, error: turmaProfsError } = await supabase
                    .from('turma_professores')
                    .select(`
                        turma_id,
                        turmas!inner (
                            id,
                            nome,
                            ano_lectivo,
                            codigo_turma,
                            nivel_ensino
                        )
                    `)
                    .eq('professor_id', professorProfile.id)

                console.log('📊 ReportsPage: Turma_professores query result:', {
                    count: turmaProfsData?.length || 0,
                    error: turmaProfsError
                })

                let turmasData: any[] = []

                if (!turmaProfsError && turmaProfsData && turmaProfsData.length > 0) {
                    // NEW MODEL: Extract unique turmas from turma_professores
                    console.log('✅ ReportsPage: Using NEW model (turma_professores)')
                    const turmasMap = new Map()
                    turmaProfsData.forEach(tp => {
                        const turma = tp.turmas as any
                        if (!turmasMap.has(turma.id)) {
                            turmasMap.set(turma.id, {
                                id: turma.id,
                                nome: turma.nome,
                                ano_lectivo: turma.ano_lectivo,
                                codigo_turma: turma.codigo_turma,
                                nivel_ensino: turma.nivel_ensino
                            })
                        }
                    })
                    turmasData = Array.from(turmasMap.values())
                } else {
                    // OLD MODEL fallback: Get turmas via disciplinas
                    console.log('⚠️ ReportsPage: Falling back to OLD model (disciplinas.professor_id)')

                    const { data, error } = await supabase
                        .from('disciplinas')
                        .select(`
                            turma_id,
                            turmas!inner (
                                id,
                                nome,
                                ano_lectivo,
                                codigo_turma,
                                nivel_ensino
                            )
                        `)
                        .eq('professor_id', professorProfile.id)

                    if (error) throw error

                    // Extract unique turmas
                    const turmasMap = new Map()
                    data?.forEach(disc => {
                        const turma = disc.turmas as any
                        if (!turmasMap.has(turma.id)) {
                            turmasMap.set(turma.id, {
                                id: turma.id,
                                nome: turma.nome,
                                ano_lectivo: turma.ano_lectivo,
                                codigo_turma: turma.codigo_turma,
                                nivel_ensino: turma.nivel_ensino
                            })
                        }
                    })

                    turmasData = Array.from(turmasMap.values())

                    console.log('📊 ReportsPage: Old model query result:', {
                        count: turmasData.length
                    })
                }

                setTurmas(turmasData)
                console.log('✅ ReportsPage: Loaded', turmasData.length, 'turmas')
            } else if (escolaProfile || secretarioProfile) {
                // For escola or secretario: load all turmas for this escola
                console.log('📊 ReportsPage: Loading turmas for escola/secretario')

                const escolaId = escolaProfile?.id || secretarioProfile?.escola_id

                const { data, error } = await supabase
                    .from('turmas')
                    .select('id, nome, ano_lectivo, codigo_turma, nivel_ensino')
                    .eq('escola_id', escolaId)
                    .order('nome')

                if (error) throw error
                setTurmas(data || [])
                console.log('✅ ReportsPage: Loaded', data?.length || 0, 'turmas for escola')
            } else if (isDirecaoMunicipal && direcaoMunicipalProfile) {
                // For Direção Municipal: load escolas from municipio, then turmas from selected escola
                console.log('📊 ReportsPage: Loading data for Direção Municipal:', direcaoMunicipalProfile.municipio)

                // First, load escolas from this municipio
                const { data: escolasData, error: escolasError } = await supabase
                    .from('escolas')
                    .select('id, nome, codigo_escola')
                    .eq('municipio', direcaoMunicipalProfile.municipio)
                    .eq('ativo', true)
                    .order('nome')

                if (escolasError) throw escolasError
                setEscolas(escolasData || [])
                console.log('✅ ReportsPage: Loaded', escolasData?.length || 0, 'escolas for municipio')

                // If an escola is selected, load its turmas
                if (selectedEscola) {
                    const { data: turmasData, error: turmasError } = await supabase
                        .from('turmas')
                        .select('id, nome, ano_lectivo, codigo_turma, nivel_ensino')
                        .eq('escola_id', selectedEscola)
                        .order('nome')

                    if (turmasError) throw turmasError
                    setTurmas(turmasData || [])
                    console.log('✅ ReportsPage: Loaded', turmasData?.length || 0, 'turmas for selected escola')
                } else {
                    // No escola selected yet - clear turmas
                    setTurmas([])
                }
            } else {
                console.error('❌ ReportsPage: No profile found')
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar turmas'
            console.error('❌ ReportsPage: Error loading turmas:', err)
            setError(translateError(errorMessage))
        }
    }

    const loadTurmaDetails = async () => {
        try {
            const { data, error } = await supabase
                .from('turmas')
                .select('id, nome, ano_lectivo, codigo_turma, nivel_ensino')
                .eq('id', selectedTurma)
                .single()

            if (error) throw error
            setSelectedTurmaData(data)
        } catch (err) {
            console.error('Error loading turma details:', err)
        }
    }

    const loadDisciplinas = async () => {
        try {
            let disciplinasData: any[] = []

            if (isProfessor && professorProfile) {
                console.log('📊 ReportsPage: Loading disciplinas for professor:', professorProfile.id, 'turma:', selectedTurma)

                // Try NEW MODEL first: Get disciplinas via turma_professores
                const { data: turmaProfsData, error: turmaProfsError } = await supabase
                    .from('turma_professores')
                    .select(`
                        disciplina_id,
                        disciplinas!inner (
                            id,
                            nome,
                            codigo_disciplina,
                            ordem
                        )
                    `)
                    .eq('professor_id', professorProfile.id)
                    .eq('turma_id', selectedTurma)

                console.log('📊 ReportsPage: Turma_professores disciplinas query result:', {
                    count: turmaProfsData?.length || 0,
                    error: turmaProfsError
                })

                if (!turmaProfsError && turmaProfsData && turmaProfsData.length > 0) {
                    // NEW MODEL: Extract disciplinas from turma_professores
                    console.log('✅ ReportsPage: Using NEW model (turma_professores)')
                    disciplinasData = turmaProfsData.map(tp => tp.disciplinas)
                } else {
                    // OLD MODEL fallback: Query disciplinas directly
                    console.log('⚠️ ReportsPage: Falling back to OLD model (disciplinas.professor_id)')

                    const { data, error } = await supabase
                        .from('disciplinas')
                        .select('id, nome, codigo_disciplina, ordem')
                        .eq('turma_id', selectedTurma)
                        .eq('professor_id', professorProfile.id)
                        .order('ordem')

                    if (error) throw error
                    disciplinasData = data || []

                    console.log('📊 ReportsPage: Old model disciplinas query result:', {
                        count: disciplinasData.length
                    })
                }

                setDisciplinas(disciplinasData)
                console.log('✅ ReportsPage: Loaded', disciplinasData.length, 'disciplinas')
            } else {
                // For escola: load all disciplinas for the turma
                let query = supabase
                    .from('disciplinas')
                    .select('id, nome, codigo_disciplina, ordem')
                    .eq('turma_id', selectedTurma)

                const { data, error } = await query.order('ordem')

                if (error) throw error
                disciplinasData = data || []
                setDisciplinas(disciplinasData)
            }

            // Auto-select first discipline
            if (disciplinasData && disciplinasData.length > 0 && !selectedDisciplina) {
                setSelectedDisciplina(disciplinasData[0].id)
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar disciplinas'
            console.error('❌ ReportsPage: Error loading disciplinas:', err)
            setError(translateError(errorMessage))
        }
    }

    const loadMiniPautaData = async () => {
        try {
            setLoadingData(true)
            setError(null)

            // Load turma details
            const { data: turmaData, error: turmaError } = await supabase
                .from('turmas')
                .select('id, nome, ano_lectivo, codigo_turma, nivel_ensino')
                .eq('id', selectedTurma)
                .single()

            if (turmaError) throw turmaError

            // Extract classe from turma name (e.g., "10ª Classe A" -> "10ª Classe")
            const extractClasse = (turmaName: string): string | undefined => {
                const match = turmaName.match(/(\d+[ªº]\s*Classe)/i)
                return match ? match[1] : undefined
            }
            const classe = extractClasse(turmaData.nome)

            // Check if this is "All Disciplines" mode for Primary Education
            const isAllDisciplines = selectedDisciplina === 'all'
            const isPrimary = turmaData.nivel_ensino?.toLowerCase().includes('primário') ||
                turmaData.nivel_ensino?.toLowerCase().includes('primario')

            // Load disciplina details (skip if all disciplines mode)
            let disciplinaData: any = null
            if (!isAllDisciplines) {
                const { data, error: disciplinaError } = await supabase
                    .from('disciplinas')
                    .select('id, nome, codigo_disciplina')
                    .eq('id', selectedDisciplina)
                    .single()

                if (disciplinaError) throw disciplinaError
                disciplinaData = data
            } else {
                // For "all disciplines" mode, create a placeholder
                disciplinaData = {
                    id: 'all',
                    nome: 'Todas as Disciplinas',
                    codigo_disciplina: 'ALL'
                }
            }

            // Load componentes based on mode
            let componentesData: any[]

            if (isAllDisciplines && isPrimary) {
                // PRIMARY EDUCATION - ALL DISCIPLINES MODE
                // Load components from ALL disciplines for the selected trimestre
                const { data, error: componentesError } = await supabase
                    .from('componentes_avaliacao')
                    .select(`
                        id, 
                        codigo_componente,
                        disciplina_id,
                        nome, 
                        peso_percentual, 
                        trimestre, 
                        is_calculated, 
                        formula_expression, 
                        depends_on_components,
                        disciplinas!inner(nome, ordem)
                    `)
                    .eq('turma_id', selectedTurma)
                    .eq('trimestre', trimestre)
                    .order('disciplinas(ordem)')
                    .order('ordem')

                if (componentesError) throw componentesError

                console.log('🔍 Dados RAW do Supabase:', data?.slice(0, 2).map(c => ({
                    codigo: c.codigo_componente,
                    disciplinas_obj: c.disciplinas
                })))

                // Map the nested disciplina name and ordem to flat properties
                componentesData = (data || []).map((comp: any) => ({
                    ...comp,
                    disciplina_nome: comp.disciplinas?.nome,
                    disciplina_ordem: comp.disciplinas?.ordem
                }))
                console.log('📊 ReportsPage (All Disciplines): Componentes carregados:', componentesData.map(c => ({ nome: c.disciplina_nome, ordem: c.disciplina_ordem, codigo: c.codigo_componente })))
            } else if (trimestre === 'all') {
                // Load ALL components from all trimesters (including calculated components for display in reports)
                const { data, error: componentesError } = await supabase
                    .from('componentes_avaliacao')
                    .select(`
                        id, 
                        codigo_componente, 
                        nome, 
                        peso_percentual, 
                        trimestre, 
                        is_calculated, 
                        formula_expression, 
                        depends_on_components,
                        tipo_calculo,
                        disciplinas!inner(nome, ordem)
                    `)
                    .eq('disciplina_id', selectedDisciplina)
                    .eq('turma_id', selectedTurma)
                    .order('trimestre')
                    .order('ordem')

                if (componentesError) throw componentesError
                // Map the nested disciplina name and ordem to flat properties
                componentesData = (data || []).map((comp: any) => ({
                    ...comp,
                    disciplina_nome: comp.disciplinas?.nome,
                    disciplina_ordem: comp.disciplinas?.ordem
                }))
                console.log('📊 ReportsPage (trimestre=all): Componentes carregados:', componentesData.map(c => ({ nome: c.disciplina_nome, ordem: c.disciplina_ordem, codigo: c.codigo_componente })))
            } else {
                // Load components for specific trimestre (including calculated components for display in reports)
                const { data, error: componentesError } = await supabase
                    .from('componentes_avaliacao')
                    .select(`
                        id, 
                        codigo_componente, 
                        nome, 
                        peso_percentual, 
                        trimestre, 
                        is_calculated, 
                        formula_expression, 
                        depends_on_components,
                        tipo_calculo,
                        disciplinas!inner(nome, ordem)
                    `)
                    .eq('disciplina_id', selectedDisciplina)
                    .eq('turma_id', selectedTurma)
                    .eq('trimestre', trimestre)
                    .order('ordem')

                if (componentesError) throw componentesError
                // Map the nested disciplina name and ordem to flat properties
                componentesData = (data || []).map((comp: any) => ({
                    ...comp,
                    disciplina_nome: comp.disciplinas?.nome,
                    disciplina_ordem: comp.disciplinas?.ordem
                }))
                console.log('📊 ReportsPage (trimestre específico): Componentes carregados:', componentesData.map(c => ({ nome: c.disciplina_nome, ordem: c.disciplina_ordem, codigo: c.codigo_componente })))
            }

            if (!componentesData || componentesData.length === 0) {
                setError('Nenhum componente de avaliação configurado para esta disciplina')
                setMiniPautaData(null)
                return
            }


            // Load alunos
            const { data: alunosData, error: alunosError } = await supabase
                .from('alunos')
                .select('id, numero_processo, nome_completo, genero')
                .eq('turma_id', selectedTurma)
                .eq('ativo', true)
                .order('nome_completo')

            if (alunosError) throw alunosError

            if (!alunosData || alunosData.length === 0) {
                setError('Nenhum aluno encontrado nesta turma')
                setMiniPautaData(null)
                return
            }

            // Load MT configuration (skip if "all disciplines" mode)
            if (selectedDisciplina !== 'all') {
                const config = await loadFormulaConfig(selectedDisciplina, selectedTurma, 'MT')
                setMtConfig(config)
            } else {
                setMtConfig(null)
            }


            // Handle ALL DISCIPLINES mode (Primary Education)
            if (isAllDisciplines && isPrimary) {
                // Load notas for all components in the selected trimestre
                const { data: notasData, error: notasError } = await supabase
                    .from('notas')
                    .select('aluno_id, componente_id, valor')
                    .eq('turma_id', selectedTurma)
                    .eq('trimestre', trimestre)
                    .in('componente_id', componentesData.map(c => c.id))

                if (notasError) throw notasError

                // Process data: organize by student with all disciplines
                const alunosComNotas = alunosData.map(aluno => {
                    const notasAluno = notasData?.filter(n => n.aluno_id === aluno.id) || []

                    // Build notas map by component ID (not code, since codes can repeat across disciplines)
                    const notasMap: Record<string, number> = {}
                    notasAluno.forEach(nota => {
                        const componente = componentesData.find(c => c.id === nota.componente_id)
                        if (componente) {
                            // Use component ID as key to avoid conflicts
                            notasMap[componente.id] = nota.valor
                        }
                    })

                    // Calculate values for calculated components
                    // Sort components: non-calculated first, then calculated (to ensure dependencies are available)
                    const sortedComponentes = [...componentesData].sort((a, b) => {
                        if (a.is_calculated && !b.is_calculated) return 1
                        if (!a.is_calculated && b.is_calculated) return -1
                        return 0
                    })

                    sortedComponentes.forEach(componente => {
                        if (componente.is_calculated && componente.formula_expression) {
                            const dependencyValues: Record<string, number> = {}

                            try {
                                // Extract variables from formula
                                const variables = parseFormula(componente.formula_expression)

                                variables.forEach(variable => {
                                    // Robust dependency resolution:
                                    // Find component with the same Code within the same Discipline
                                    // This is more reliable than depends_on_components IDs which might be inconsistent
                                    const sourceComponent = componentesData.find(c =>
                                        c.disciplina_id === componente.disciplina_id &&
                                        c.codigo_componente?.trim().toUpperCase() === variable.trim().toUpperCase()
                                    )

                                    if (sourceComponent) {
                                        const value = notasMap[sourceComponent.id]
                                        dependencyValues[variable] = value !== undefined ? value : 0
                                    } else {
                                        // Variable needed but not found in the same discipline -> assume 0
                                        dependencyValues[variable] = 0
                                    }
                                })

                                // Calculate
                                if (Object.keys(dependencyValues).length > 0) {
                                    const calculatedValue = evaluateFormula(componente.formula_expression, dependencyValues)
                                    notasMap[componente.id] = Math.round(calculatedValue * 100) / 100

                                    // Optional: Log for debugging if needed
                                    // console.log(`[Calc] ${componente.codigo_componente}:`, dependencyValues, '=>', notasMap[componente.id])
                                }
                            } catch (error) {
                                console.error(`Error calculating component ${componente.codigo_componente}:`, error)
                                notasMap[componente.id] = 0
                            }
                        }
                    })

                    return {
                        numero_processo: aluno.numero_processo,
                        nome_completo: aluno.nome_completo,
                        genero: aluno.genero as 'M' | 'F' | undefined,
                        notas: notasMap,
                        nota_final: undefined,
                        classificacao: 'N/A',
                        aprovado: false
                    }
                })

                // Calculate statistics (using average of all component grades)
                const notasFinais = alunosComNotas.map(a => {
                    const notas = Object.values(a.notas).filter(n => n > 0)
                    return notas.length > 0 ? notas.reduce((sum, n) => sum + n, 0) / notas.length : 0
                }).filter(n => n > 0)
                const estatisticas = calculateStatistics(notasFinais)

                // Load escola info (optional)
                const { data: escolaData } = await supabase
                    .from('escolas')
                    .select('nome, provincia, municipio')
                    .limit(1)
                    .single()

                setMiniPautaData({
                    turma: turmaData,
                    disciplina: disciplinaData,
                    trimestre,
                    nivel_ensino: turmaData.nivel_ensino,
                    classe,
                    alunos: alunosComNotas,
                    componentes: componentesData,
                    estatisticas,
                    escola: escolaData || undefined
                })

            } else if (trimestre === 'all') {
                // Load notas from all trimestres
                const { data: allNotasData, error: notasError } = await supabase
                    .from('notas')
                    .select('aluno_id, componente_id, valor, trimestre')
                    .eq('turma_id', selectedTurma)
                    .in('componente_id', componentesData.map(c => c.id))
                    .in('trimestre', [1, 2, 3])

                if (notasError) throw notasError

                // Process data: organize by trimestre with component grades
                const alunosComNotas = alunosData.map(aluno => {
                    const trimestres: any = {}
                    const nfPorTrimestre: Record<number, number> = {}

                    // Process each trimestre
                    for (let t = 1; t <= 3; t++) {
                        // Get components for this specific trimestre
                        const componentesTrimestre = componentesData.filter(c => c.trimestre === t)

                        const notasTrimestre = allNotasData?.filter(
                            n => n.aluno_id === aluno.id && n.trimestre === t
                        ) || []

                        // Build notas map by component code for this trimestre
                        const notasMap: Record<string, number> = {}
                        notasTrimestre.forEach(nota => {
                            const componente = componentesTrimestre.find(c => c.id === nota.componente_id)
                            if (componente) {
                                notasMap[componente.codigo_componente] = nota.valor
                            }
                        })

                        // Calculate values for TRIMESTRAL calculated components in this trimestre
                        componentesTrimestre.forEach(componente => {
                            if (componente.is_calculated && componente.formula_expression) {
                                // Only process trimestral calculated components here
                                if (componente.tipo_calculo === 'trimestral' || !componente.tipo_calculo) {
                                    console.log(`[DEBUG T${t}] Processing TRIMESTRAL calculated component: ${componente.codigo_componente}`, {
                                        formula: componente.formula_expression,
                                        dependencies: componente.depends_on_components
                                    })
                                    console.log(`[DEBUG T${t}] Available components in trimester:`, componentesTrimestre.map(c => `${c.codigo_componente} (${c.id})`))
                                    console.log(`[DEBUG T${t}] Current notasMap:`, notasMap)

                                    const dependencyValues: Record<string, number> = {}

                                    if (!componente.depends_on_components || componente.depends_on_components.length === 0) {
                                        // Fallback: extract variable names directly from the formula expression
                                        const formulaCodes = parseFormula(componente.formula_expression)
                                        console.log(`[DEBUG T${t}] depends_on_components vazio — extraindo da fórmula:`, formulaCodes)
                                        formulaCodes.forEach(code => {
                                            const depComponent = componentesData.find(c =>
                                                c.codigo_componente?.trim().toUpperCase() === code.trim().toUpperCase() &&
                                                c.trimestre === t
                                            )
                                            if (depComponent) {
                                                dependencyValues[code] = notasMap[depComponent.codigo_componente] ?? 0
                                            } else {
                                                dependencyValues[code] = 0
                                            }
                                        })
                                    } else {
                                        // Use stored depends_on_components IDs
                                        componente.depends_on_components.forEach((depId: string) => {
                                            // Search in components from this trimester only
                                            let depComponent = componentesData.find(c => c.id === depId && c.trimestre === t)
                                            // Fallback: match by code if ID not found
                                            if (!depComponent) {
                                                depComponent = componentesData.find(c =>
                                                    c.codigo_componente === depId && c.trimestre === t
                                                )
                                            }
                                            console.log(`[DEBUG T${t}] Looking for dependency ${depId}:`, depComponent?.codigo_componente)
                                            if (depComponent) {
                                                const value = notasMap[depComponent.codigo_componente]
                                                dependencyValues[depComponent.codigo_componente] = value !== undefined ? value : 0
                                                console.log(`[DEBUG T${t}] Found value for ${depComponent.codigo_componente}:`, dependencyValues[depComponent.codigo_componente])
                                            }
                                        })
                                    }

                                    // Calculate if we have any dependencies resolved
                                    if (Object.keys(dependencyValues).length > 0) {
                                        try {
                                            console.log(`[DEBUG T${t}] Calculating ${componente.codigo_componente} with values:`, dependencyValues)
                                            const calculatedValue = evaluateFormula(componente.formula_expression, dependencyValues)
                                            notasMap[componente.codigo_componente] = Math.round(calculatedValue * 100) / 100
                                            console.log(`[DEBUG T${t}] Calculated value for ${componente.codigo_componente}:`, notasMap[componente.codigo_componente])
                                        } catch (error) {
                                            console.error(`Error calculating component ${componente.codigo_componente} in trimestre ${t}:`, error)
                                        }
                                    } else {
                                        console.log(`[DEBUG T${t}] Skipping calculation for ${componente.codigo_componente} - no dependency components found`)
                                    }
                                }
                            }
                        })

                        // Calculate NF for this trimestre using only its components
                        let nf = 0
                        if (notasTrimestre.length > 0 && componentesTrimestre.length > 0) {
                            const resultado = calculateNotaFinal(notasTrimestre, componentesTrimestre)
                            nf = resultado.nota_final
                        }

                        console.log(`[DEBUG T${t}] Final notasMap before assignment:`, notasMap)
                        trimestres[t] = {
                            notas: notasMap,
                            nota_final: nf
                        }

                        nfPorTrimestre[t] = nf
                    }

                    // Now process ANNUAL calculated components (like MFD)
                    // These can access components from all trimesters
                    const componentesAnuais = componentesData.filter(c =>
                        c.is_calculated && c.tipo_calculo === 'anual'
                    )

                    componentesAnuais.forEach(componente => {
                        console.log(`[DEBUG ANNUAL] Processing annual calculated component: ${componente.codigo_componente}`, {
                            formula: componente.formula_expression,
                            dependencies: componente.depends_on_components
                        })

                        if (componente.formula_expression) {
                            const dependencyValues: Record<string, number> = {}

                            const resolveDepByCode = (code: string) => {
                                // Search across all trimesters for the best match
                                for (let tr = 1; tr <= 3; tr++) {
                                    const trData = trimestres[tr]
                                    if (trData && trData.notas[code] !== undefined) {
                                        return trData.notas[code]
                                    }
                                }
                                return undefined
                            }

                            if (!componente.depends_on_components || componente.depends_on_components.length === 0) {
                                // Fallback: extract variable names directly from the formula expression
                                const formulaCodes = parseFormula(componente.formula_expression)
                                console.log(`[DEBUG ANNUAL] depends_on_components vazio — extraindo da fórmula:`, formulaCodes)
                                formulaCodes.forEach(code => {
                                    const value = resolveDepByCode(code)
                                    dependencyValues[code] = value !== undefined ? value : 0
                                })
                            } else {
                                componente.depends_on_components.forEach((depId: string) => {
                                    let depComponent = componentesData.find(c => c.id === depId)
                                    // Fallback: match by code if ID not found
                                    if (!depComponent) {
                                        depComponent = componentesData.find(c => c.codigo_componente === depId)
                                    }
                                    console.log(`[DEBUG ANNUAL] Looking for dependency ${depId}:`, depComponent ? {
                                        code: depComponent.codigo_componente,
                                        trimestre: depComponent.trimestre
                                    } : 'NOT FOUND')

                                    if (depComponent) {
                                        const trimestreData = trimestres[depComponent.trimestre]
                                        if (trimestreData) {
                                            const value = trimestreData.notas[depComponent.codigo_componente]
                                            dependencyValues[depComponent.codigo_componente] = value !== undefined ? value : 0
                                            console.log(`[DEBUG ANNUAL] Found value for ${depComponent.codigo_componente} from T${depComponent.trimestre}:`, dependencyValues[depComponent.codigo_componente])
                                        }
                                    }
                                })
                            }

                            if (Object.keys(dependencyValues).length > 0) {
                                try {
                                    console.log(`[DEBUG ANNUAL] Calculating ${componente.codigo_componente} with values:`, dependencyValues)
                                    const calculatedValue = evaluateFormula(componente.formula_expression, dependencyValues)
                                    const roundedValue = Math.round(calculatedValue * 100) / 100
                                    console.log(`[DEBUG ANNUAL] Calculated value for ${componente.codigo_componente}:`, roundedValue)

                                    // Store the annual component value in the trimestre it belongs to
                                    if (trimestres[componente.trimestre]) {
                                        trimestres[componente.trimestre].notas[componente.codigo_componente] = roundedValue
                                    }
                                } catch (error) {
                                    console.error(`Error calculating annual component ${componente.codigo_componente}:`, error)
                                }
                            } else {
                                console.log(`[DEBUG ANNUAL] Skipping calculation for ${componente.codigo_componente} - no dependency components found`)
                            }
                        }
                    })

                    // MF is no longer calculated automatically
                    // It should be configured as a calculated component if needed

                    return {
                        numero_processo: aluno.numero_processo,
                        nome_completo: aluno.nome_completo,
                        genero: aluno.genero as 'M' | 'F' | undefined,
                        notas: {}, // Not used in all-trimester mode
                        nota_final: undefined, // Will be calculated if MF component exists
                        media_trimestral: null,
                        classificacao: 'N/A', // Will be determined by MF component if configured
                        aprovado: false, // Will be determined by MF component if configured
                        trimestres // Contains data for each trimestre
                    }
                })

                // Calculate statistics based on MF if available, otherwise use average of trimester NFs
                const notasFinais = alunosComNotas.map(a => {
                    if (a.nota_final !== undefined && a.nota_final !== null) {
                        return a.nota_final
                    }
                    // Fallback: calculate average of available trimester NFs
                    const nfs: number[] = []
                    if (a.trimestres) {
                        for (let t = 1; t <= 3; t++) {
                            const trimestre = a.trimestres[t as 1 | 2 | 3]
                            if (trimestre && trimestre.nota_final > 0) {
                                nfs.push(trimestre.nota_final)
                            }
                        }
                    }
                    return nfs.length > 0 ? nfs.reduce((sum, n) => sum + n, 0) / nfs.length : 0
                }).filter(n => n > 0)
                const estatisticas = calculateStatistics(notasFinais)

                // Load escola info (optional)
                const { data: escolaData } = await supabase
                    .from('escolas')
                    .select('nome, provincia, municipio')
                    .limit(1)
                    .single()

                setMiniPautaData({
                    turma: turmaData,
                    disciplina: disciplinaData,
                    trimestre: 'all',
                    nivel_ensino: turmaData.nivel_ensino,
                    classe,
                    alunos: alunosComNotas,
                    componentes: componentesData,
                    estatisticas,
                    showMT: false,
                    escola: escolaData || undefined
                })

            } else {
                // Handle SINGLE TRIMESTRE mode (existing logic)

                // Check if we have any ANNUAL calculated components that need dependencies from other trimesters
                const annualComponents = componentesData.filter(c =>
                    c.is_calculated && c.tipo_calculo === 'anual'
                )

                // If we have annual components, we need to load their dependencies from ALL trimesters
                let allDependencyComponents: any[] = []
                let allDependencyNotas: any[] = []

                if (annualComponents.length > 0) {
                    console.log('[DEBUG] Found annual components:', annualComponents.map(c => c.codigo_componente))

                    // Get all dependency IDs from annual components
                    const allDependencyIds = new Set<string>()
                    annualComponents.forEach(comp => {
                        if (comp.depends_on_components) {
                            comp.depends_on_components.forEach((depId: string) => {
                                allDependencyIds.add(depId)
                            })
                        }
                    })

                    if (allDependencyIds.size > 0) {
                        console.log('[DEBUG] Loading dependency components:', Array.from(allDependencyIds))

                        // Load all dependency components (from any trimester)
                        const { data: depComponentsData, error: depError } = await supabase
                            .from('componentes_avaliacao')
                            .select(`
                                id, 
                                codigo_componente, 
                                nome, 
                                peso_percentual, 
                                trimestre, 
                                is_calculated, 
                                formula_expression, 
                                depends_on_components,
                                tipo_calculo
                            `)
                            .in('id', Array.from(allDependencyIds))

                        if (!depError && depComponentsData) {
                            allDependencyComponents = depComponentsData
                            console.log('[DEBUG] Loaded dependency components:', depComponentsData.map(c => ({
                                code: c.codigo_componente,
                                trimestre: c.trimestre
                            })))

                            // Load grades for these dependency components
                            const { data: depNotasData, error: depNotasError } = await supabase
                                .from('notas')
                                .select('aluno_id, componente_id, valor, trimestre')
                                .eq('turma_id', selectedTurma)
                                .in('componente_id', depComponentsData.map(c => c.id))

                            if (!depNotasError && depNotasData) {
                                allDependencyNotas = depNotasData
                                console.log('[DEBUG] Loaded dependency grades count:', depNotasData.length)
                            }
                        }
                    }
                }

                // Load grades for the current trimester's components
                const { data: notasData, error: notasError } = await supabase
                    .from('notas')
                    .select('aluno_id, componente_id, valor')
                    .eq('turma_id', selectedTurma)
                    .eq('trimestre', trimestre)
                    .in('componente_id', componentesData.map(c => c.id))

                if (notasError) throw notasError

                // Process data
                const alunosComNotas = alunosData.map(aluno => {
                    const notasAluno = notasData?.filter(n => n.aluno_id === aluno.id) || []

                    // Build notas map by component code
                    const notasMap: Record<string, number> = {}
                    notasAluno.forEach(nota => {
                        const componente = componentesData.find(c => c.id === nota.componente_id)
                        if (componente) {
                            notasMap[componente.codigo_componente] = nota.valor
                        }
                    })

                    // STEP 1: Calculate TRIMESTRAL calculated components first
                    componentesData.forEach(componente => {
                        if (componente.is_calculated && componente.formula_expression) {
                            // Only process trimestral components (or components without tipo_calculo)
                            if (componente.tipo_calculo === 'trimestral' || !componente.tipo_calculo) {
                                console.log(`[DEBUG] Processing TRIMESTRAL calculated component: ${componente.codigo_componente}`)
                                console.log(`[DEBUG] Formula: ${componente.formula_expression}`)
                                console.log(`[DEBUG] Dependencies IDs from DB: ${JSON.stringify(componente.depends_on_components)}`)

                                // Build dependency values from current trimester
                                const dependencyValues: Record<string, number> = {}

                                // If depends_on_components is empty or missing, extract codes from formula
                                if (!componente.depends_on_components || componente.depends_on_components.length === 0) {
                                    console.log(`[DEBUG] depends_on_components is empty, extracting from formula...`)
                                    const formulaCodes = parseFormula(componente.formula_expression)
                                    console.log(`[DEBUG] Extracted formula codes: ${JSON.stringify(formulaCodes)}`)

                                    // Find components by their codes and build dependency values
                                    formulaCodes.forEach(code => {
                                        const depComponent = componentesData.find(c => c.codigo_componente === code)
                                        if (depComponent) {
                                            const value = notasMap[code]
                                            dependencyValues[code] = value ?? 0
                                            console.log(`[DEBUG] Found ${code} by formula parsing: value = ${value ?? 0}`)
                                        } else {
                                            // Use 0 for missing components
                                            dependencyValues[code] = 0
                                            console.log(`[DEBUG] Component ${code} not found, using 0`)
                                        }
                                    })
                                } else {
                                    // Use stored depends_on_components IDs
                                    componente.depends_on_components.forEach((depId: string) => {
                                        // First try to find by ID
                                        let depComponent = componentesData.find(c => c.id === depId)

                                        // If not found by ID, try to find by codigo_componente (fallback)
                                        if (!depComponent) {
                                            depComponent = componentesData.find(c => c.codigo_componente === depId)
                                            if (depComponent) {
                                                console.log(`[DEBUG] Found dependency by code fallback: ${depId}`)
                                            }
                                        }

                                        if (depComponent) {
                                            const value = notasMap[depComponent.codigo_componente]
                                            dependencyValues[depComponent.codigo_componente] = value ?? 0
                                            console.log(`[DEBUG] Dependency ${depComponent.codigo_componente}: value = ${value ?? 0}`)
                                        } else {
                                            console.warn(`[DEBUG] Dependency component not found - ID: ${depId}`)
                                        }
                                    })
                                }

                                console.log(`[DEBUG] Final dependencyValues: ${JSON.stringify(dependencyValues)}`)

                                // Calculate if we have any dependencies
                                if (Object.keys(dependencyValues).length > 0) {
                                    try {
                                        const calculatedValue = evaluateFormula(componente.formula_expression, dependencyValues)
                                        notasMap[componente.codigo_componente] = Math.round(calculatedValue * 100) / 100
                                        console.log(`[DEBUG] ✅ Calculated ${componente.codigo_componente}: ${notasMap[componente.codigo_componente]}`)
                                    } catch (error) {
                                        console.error(`Error calculating component ${componente.codigo_componente}:`, error)
                                    }
                                } else {
                                    console.warn(`[DEBUG] No dependencies found for ${componente.codigo_componente}, skipping calculation`)
                                }
                            }
                        }
                    })



                    // STEP 2: Calculate ANNUAL calculated components (MFD, MF, etc.)
                    // These need dependencies from other trimesters
                    if (annualComponents.length > 0 && allDependencyComponents.length > 0) {
                        // Build a map of dependency component grades (from all trimesters)
                        const depNotasAluno = allDependencyNotas.filter(n => n.aluno_id === aluno.id)
                        const depNotasMap: Record<string, number> = {}

                        // First, add raw grades from dependency components
                        depNotasAluno.forEach(nota => {
                            const depComponent = allDependencyComponents.find(c => c.id === nota.componente_id)
                            if (depComponent) {
                                depNotasMap[depComponent.codigo_componente] = nota.valor
                            }
                        })

                        // Calculate any trimestral calculated dependencies (like MT)
                        allDependencyComponents.forEach(depComp => {
                            if (depComp.is_calculated && depComp.formula_expression && depComp.depends_on_components) {
                                if (depComp.tipo_calculo === 'trimestral' || !depComp.tipo_calculo) {
                                    const depValues: Record<string, number> = {}

                                    depComp.depends_on_components.forEach((subDepId: string) => {
                                        const subDepComponent = allDependencyComponents.find(c => c.id === subDepId)
                                        if (subDepComponent) {
                                            const value = depNotasMap[subDepComponent.codigo_componente]
                                            if (value !== undefined) {
                                                depValues[subDepComponent.codigo_componente] = value
                                            } else {
                                                depValues[subDepComponent.codigo_componente] = 0
                                            }
                                        }
                                    })

                                    if (Object.keys(depValues).length > 0) {
                                        try {
                                            const calculatedValue = evaluateFormula(depComp.formula_expression, depValues)
                                            depNotasMap[depComp.codigo_componente] = Math.round(calculatedValue * 100) / 100
                                        } catch (error) {
                                            console.error(`Error calculating dependency ${depComp.codigo_componente}:`, error)
                                        }
                                    }
                                }
                            }
                        })

                        // Now calculate annual components
                        annualComponents.forEach(componente => {
                            console.log(`[DEBUG] Processing ANNUAL calculated component: ${componente.codigo_componente}`)

                            const dependencyValues: Record<string, number> = {}

                            componente.depends_on_components.forEach((depId: string) => {
                                const depComponent = allDependencyComponents.find(c => c.id === depId)
                                if (depComponent) {
                                    const value = depNotasMap[depComponent.codigo_componente]
                                    if (value !== undefined) {
                                        dependencyValues[depComponent.codigo_componente] = value
                                        console.log(`[DEBUG] Found dependency ${depComponent.codigo_componente}:`, value)
                                    } else {
                                        dependencyValues[depComponent.codigo_componente] = 0
                                        console.log(`[DEBUG] Using 0 for missing dependency ${depComponent.codigo_componente}`)
                                    }
                                }
                            })

                            if (Object.keys(dependencyValues).length > 0) {
                                try {
                                    console.log(`[DEBUG] Calculating ${componente.codigo_componente} with values:`, dependencyValues)
                                    const calculatedValue = evaluateFormula(componente.formula_expression, dependencyValues)
                                    const roundedValue = Math.round(calculatedValue * 100) / 100

                                    // CRITICAL: Add to both maps immediately so other annual components can use it
                                    notasMap[componente.codigo_componente] = roundedValue
                                    depNotasMap[componente.codigo_componente] = roundedValue

                                    console.log(`[DEBUG] Calculated ${componente.codigo_componente}:`, roundedValue)
                                } catch (error) {
                                    console.error(`Error calculating annual component ${componente.codigo_componente}:`, error)
                                }
                            } else {
                                console.log(`[DEBUG] Skipping ${componente.codigo_componente} - no dependencies found`)
                            }
                        })
                    }

                    // Calculate final grade
                    const resultado = calculateNotaFinal(notasAluno, componentesData)

                    return {
                        numero_processo: aluno.numero_processo,
                        nome_completo: aluno.nome_completo,
                        genero: aluno.genero as 'M' | 'F' | undefined,
                        notas: notasMap,
                        nota_final: resultado.nota_final,
                        classificacao: resultado.classificacao,
                        aprovado: resultado.aprovado,
                        media_trimestral: null
                    }
                })

                // Calculate statistics
                const notasFinais = alunosComNotas.map(a => a.nota_final)
                const estatisticas = calculateStatistics(notasFinais)

                // MT is no longer calculated automatically
                // It should be configured as a calculated component if needed

                // Load escola info (optional)
                const { data: escolaData } = await supabase
                    .from('escolas')
                    .select('nome, provincia, municipio')
                    .limit(1)
                    .single()

                setMiniPautaData({
                    turma: turmaData,
                    disciplina: disciplinaData,
                    trimestre,
                    nivel_ensino: turmaData.nivel_ensino,
                    classe,
                    alunos: alunosComNotas,
                    componentes: componentesData,
                    estatisticas,
                    escola: escolaData || undefined
                })
            }

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados'
            setError(translateError(errorMessage))
            setMiniPautaData(null)
        } finally {
            setLoadingData(false)
        }
    }

    const loadHeaderConfiguration = async () => {
        try {
            // Get escola_id from auth context
            let escola_id: string | undefined

            if (escolaProfile) {
                // For school admins, use their escola_id
                escola_id = escolaProfile.id
            } else if (professorProfile) {
                // For professors, use their escola_id
                escola_id = professorProfile.escola_id
            } else if (secretarioProfile) {
                // For secretaries, use their escola_id
                escola_id = secretarioProfile.escola_id
            }

            if (!escola_id) {
                console.error('No escola_id found in auth context')
                return
            }

            const config = await loadHeaderConfig(escola_id)
            setHeaderConfig(config)
        } catch (err) {
            console.error('Error loading header config:', err)
        }
    }

    const loadColorConfiguration = async () => {
        try {
            console.log('Loading color configuration for turma:', selectedTurma)
            const config = await loadGradeColorConfig(selectedTurma || undefined)
            console.log('Loaded color config:', config)
            setColorConfig(config)
        } catch (err) {
            console.error('Error loading color config:', err)
        }
    }




    const handleGeneratePDF = async () => {
        if (!miniPautaData) {
            setError('Carregue os dados primeiro')
            return
        }

        try {
            await generateMiniPautaPDF(miniPautaData, headerConfig, colorConfig)
            setSuccess('PDF gerado com sucesso!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar PDF'
            setError(translateError(errorMessage))
        }
    }

    const handleGenerateExcel = () => {
        if (!miniPautaData) {
            setError('Carregue os dados primeiro')
            return
        }

        try {
            generateMiniPautaExcel(miniPautaData)
            setSuccess('Excel gerado com sucesso!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar Excel'
            setError(translateError(errorMessage))
        }
    }

    const handleExportCSV = () => {
        if (!miniPautaData) {
            setError('Carregue os dados primeiro')
            return
        }

        try {
            generateCSV(miniPautaData)
            setSuccess('CSV exportado com sucesso!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao exportar CSV'
            setError(translateError(errorMessage))
        }
    }

    const handleGenerateTermoFrequenciaPDF = async () => {
        if (!termoFrequenciaData) {
            setError('Carregue os dados do aluno primeiro')
            return
        }

        try {
            await generateTermoFrequenciaPDF(termoFrequenciaData, headerConfig, colorConfig)
            setSuccess('Termo de Frequência gerado com sucesso!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar Termo de Frequência'
            setError(translateError(errorMessage))
        }
    }

    const handleSelectAllAlunos = () => {
        if (selectedAlunosIds.length === alunos.length) {
            // Deselect all
            setSelectedAlunosIds([])
        } else {
            // Select all
            setSelectedAlunosIds(alunos.map(a => a.id))
        }
    }

    const handleToggleAluno = (alunoId: string) => {
        if (selectedAlunosIds.includes(alunoId)) {
            setSelectedAlunosIds(selectedAlunosIds.filter(id => id !== alunoId))
        } else {
            setSelectedAlunosIds([...selectedAlunosIds, alunoId])
        }
    }

    // Component selection handlers
    const handleToggleComponent = (componentCode: string) => {
        if (selectedComponents.includes(componentCode)) {
            setSelectedComponents(selectedComponents.filter(c => c !== componentCode))
        } else {
            setSelectedComponents([...selectedComponents, componentCode])
        }
    }

    const handleSelectAllComponents = () => {
        if (selectedComponents.length === availableComponents.length) {
            setSelectedComponents([])
        } else {
            setSelectedComponents(availableComponents.map(c => c.codigo))
        }
    }

    // Component reordering handlers
    const moveComponentUp = (index: number) => {
        if (index === 0) return
        const newComponents = [...availableComponents]
        const temp = newComponents[index]
        newComponents[index] = newComponents[index - 1]
        newComponents[index - 1] = temp
        setAvailableComponents(newComponents)
    }

    const moveComponentDown = (index: number) => {
        if (index === availableComponents.length - 1) return
        const newComponents = [...availableComponents]
        const temp = newComponents[index]
        newComponents[index] = newComponents[index + 1]
        newComponents[index + 1] = temp
        setAvailableComponents(newComponents)
    }

    const handleGenerateBatchPDFs = async () => {
        if (selectedAlunosIds.length === 0) {
            setError('Selecione pelo menos um aluno')
            return
        }

        if (!selectedTurmaData) {
            setError('Dados da turma não encontrados')
            return
        }

        try {
            setBatchGenerating(true)
            setError(null)
            setBatchProgress({ current: 0, total: selectedAlunosIds.length, currentAluno: '' })

            // Load data for all selected students
            const termosDataPromises = selectedAlunosIds.map(async (alunoId) => {
                // Load student details with all expanded fields
                const { data: alunoData, error: alunoError } = await supabase
                    .from('alunos')
                    .select(`
                        id, numero_processo, nome_completo, data_nascimento, genero,
                        nacionalidade, naturalidade, tipo_documento, numero_documento,
                        nome_pai, nome_mae, nome_encarregado, parentesco_encarregado,
                        telefone_encarregado, email_encarregado, profissao_encarregado,
                        provincia, municipio, bairro, rua, endereco,
                        ano_ingresso, escola_anterior, classe_anterior, observacoes_academicas
                    `)
                    .eq('id', alunoId)
                    .single()

                if (alunoError) throw alunoError

                // Load all disciplines for this turma
                const { data: disciplinasData, error: disciplinasError } = await supabase
                    .from('disciplinas')
                    .select('id, nome, codigo_disciplina')
                    .eq('turma_id', selectedTurma)
                    .order('ordem')

                if (disciplinasError) throw disciplinasError

                // Load all components (including calculated ones that are registered)
                const { data: componentesData, error: componentesError } = await supabase
                    .from('componentes_avaliacao')
                    .select('id, codigo_componente, nome, peso_percentual, trimestre, disciplina_id, is_calculated, formula_expression, depends_on_components')
                    .eq('turma_id', selectedTurma)
                    .in('disciplina_id', disciplinasData.map(d => d.id))

                if (componentesError) throw componentesError

                // Load all grades
                const { data: notasData, error: notasError } = await supabase
                    .from('notas')
                    .select('componente_id, valor, trimestre')
                    .eq('aluno_id', alunoId)
                    .eq('turma_id', selectedTurma)

                if (notasError) throw notasError

                // Process disciplines (same logic as loadTermoFrequenciaData)
                const disciplinasProcessadas = disciplinasData.map(disciplina => {
                    const componentesDisciplina = componentesData?.filter(c => c.disciplina_id === disciplina.id) || []
                    const notasTrimestrais: { 1: number | null, 2: number | null, 3: number | null } = {
                        1: null,
                        2: null,
                        3: null
                    }

                    // Process components BY TRIMESTRE - each trimester has its own components
                    const componentesPorTrimestre: {
                        1: Array<{ codigo: string, nome: string, nota: number | null, is_calculated?: boolean }>,
                        2: Array<{ codigo: string, nome: string, nota: number | null, is_calculated?: boolean }>,
                        3: Array<{ codigo: string, nome: string, nota: number | null, is_calculated?: boolean }>
                    } = { 1: [], 2: [], 3: [] }

                    for (let t = 1; t <= 3; t++) {
                        const componentesTrimestre = componentesDisciplina.filter(c => c.trimestre === t)
                        const notasTrimestre = notasData?.filter(n =>
                            n.trimestre === t &&
                            componentesTrimestre.some(c => c.id === n.componente_id)
                        ) || []

                        if (notasTrimestre.length > 0 && componentesTrimestre.length > 0) {
                            const resultado = calculateNotaFinal(notasTrimestre, componentesTrimestre)
                            notasTrimestrais[t as 1 | 2 | 3] = resultado.nota_final
                        }

                        // Add components for this trimester
                        componentesTrimestre.forEach(comp => {
                            const nota = notasData?.find(n => n.componente_id === comp.id && n.trimestre === t)?.valor ?? null
                            componentesPorTrimestre[t as 1 | 2 | 3].push({
                                codigo: comp.codigo_componente,
                                nome: comp.nome,
                                nota: nota,
                                is_calculated: comp.is_calculated || false
                            })
                        })
                    }

                    const notasValidas = Object.values(notasTrimestrais).filter(n => n !== null) as number[]
                    const notaFinal = notasValidas.length > 0
                        ? notasValidas.reduce((sum, n) => sum + n, 0) / notasValidas.length
                        : null

                    // Determine pass/fail based on education level
                    const isPrimary = selectedTurmaData.nivel_ensino?.toLowerCase().includes('primário') ||
                        selectedTurmaData.nivel_ensino?.toLowerCase().includes('primario')
                    const limiarTransicao = isPrimary ? 5 : 10
                    const transita = notaFinal !== null && notaFinal >= limiarTransicao

                    return {
                        id: disciplina.id,
                        nome: disciplina.nome,
                        codigo_disciplina: disciplina.codigo_disciplina,
                        notas_trimestrais: notasTrimestrais,
                        componentesPorTrimestre: componentesPorTrimestre,
                        nota_final: notaFinal,
                        classificacao: notaFinal !== null ? (notaFinal >= limiarTransicao ? 'Aprovado' : 'Reprovado') : 'N/A',
                        transita
                    }
                })

                // Determine overall education level for threshold
                const isPrimaryEducation = selectedTurmaData.nivel_ensino?.toLowerCase().includes('primário') ||
                    selectedTurmaData.nivel_ensino?.toLowerCase().includes('primario')
                const limiarGeralTransicao = isPrimaryEducation ? 5 : 10

                const notasFinaisValidas = disciplinasProcessadas
                    .map(d => d.nota_final)
                    .filter(n => n !== null) as number[]

                const mediaGeral = notasFinaisValidas.length > 0
                    ? notasFinaisValidas.reduce((sum, n) => sum + n, 0) / notasFinaisValidas.length
                    : 0

                const disciplinasAprovadas = disciplinasProcessadas.filter(d => d.transita).length
                const disciplinasReprovadas = disciplinasProcessadas.filter(d => !d.transita).length
                const transitaGeral = disciplinasProcessadas.every(d => d.transita) && mediaGeral >= limiarGeralTransicao

                const { data: escolaData } = await supabase
                    .from('escolas')
                    .select('nome, provincia, municipio')
                    .limit(1)
                    .single()

                return {
                    aluno: {
                        numero_processo: alunoData.numero_processo,
                        nome_completo: alunoData.nome_completo,
                        data_nascimento: alunoData.data_nascimento,
                        genero: alunoData.genero,
                        nacionalidade: alunoData.nacionalidade,
                        naturalidade: alunoData.naturalidade,
                        tipo_documento: alunoData.tipo_documento,
                        numero_documento: alunoData.numero_documento,
                        nome_pai: alunoData.nome_pai,
                        nome_mae: alunoData.nome_mae,
                        nome_encarregado: alunoData.nome_encarregado,
                        parentesco_encarregado: alunoData.parentesco_encarregado,
                        telefone_encarregado: alunoData.telefone_encarregado,
                        email_encarregado: alunoData.email_encarregado,
                        profissao_encarregado: alunoData.profissao_encarregado,
                        provincia: alunoData.provincia,
                        municipio: alunoData.municipio,
                        bairro: alunoData.bairro,
                        rua: alunoData.rua,
                        endereco: alunoData.endereco,
                        ano_ingresso: alunoData.ano_ingresso,
                        escola_anterior: alunoData.escola_anterior,
                        classe_anterior: alunoData.classe_anterior,
                        observacoes_academicas: alunoData.observacoes_academicas,
                    },
                    turma: selectedTurmaData,
                    disciplinas: disciplinasProcessadas,
                    estatisticas: {
                        media_geral: mediaGeral,
                        total_disciplinas: disciplinasProcessadas.length,
                        disciplinas_aprovadas: disciplinasAprovadas,
                        disciplinas_reprovadas: disciplinasReprovadas,
                        transita: transitaGeral
                    },
                    escola: escolaData || undefined
                }
            })

            const termosData = await Promise.all(termosDataPromises)

            // Generate ZIP
            const result = await generateBatchTermosFrequenciaZip(
                termosData,
                { codigo: selectedTurmaData.codigo_turma, ano: selectedTurmaData.ano_lectivo },
                headerConfig,
                colorConfig,
                (current, total, alunoNome) => {
                    setBatchProgress({ current, total, currentAluno: alunoNome })
                }
            )

            // Download ZIP
            const url = URL.createObjectURL(result.blob)
            const link = document.createElement('a')
            link.href = url
            link.download = result.filename
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)

            // Show success message
            if (result.errors.length === 0) {
                setSuccess(`✅ ${selectedAlunosIds.length} Termos de Frequência gerados com sucesso!`)
            } else {
                setSuccess(`⚠️ ${selectedAlunosIds.length - result.errors.length} de ${selectedAlunosIds.length} termos gerados com sucesso`)
                setError(`Falhas: ${result.errors.map(e => e.aluno).join(', ')}`)
            }

            setTimeout(() => {
                setSuccess(null)
                setError(null)
            }, 5000)

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao gerar termos em lote'
            setError(translateError(errorMessage))
        } finally {
            setBatchGenerating(false)
            setBatchProgress(null)
        }
    }


    return (
        <div className="space-y-4 md:space-y-6 pb-24 md:pb-6">
            {/* Header with Tabs */}
            <div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">Relatórios e Pautas</h2>
                <p className="text-sm md:text-base text-slate-600 mt-1">Gere relatórios e exporte dados das turmas</p>

                {/* Tab Navigation - Modern Pill Style */}
                <div className="mt-4">
                    <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
                        <button
                            onClick={() => setActiveTab('mini-pauta')}
                            className={`
                                flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 whitespace-nowrap touch-feedback min-h-touch
                                ${activeTab === 'mini-pauta'
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'
                                }
                            `}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Mini-Pauta
                        </button>
                        {!isProfessor && (
                            <>
                                <button
                                    onClick={() => setActiveTab('pauta-geral')}
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 whitespace-nowrap touch-feedback min-h-touch
                                        ${activeTab === 'pauta-geral'
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'
                                        }
                                    `}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Pauta-Geral
                                </button>
                                <button
                                    onClick={() => setActiveTab('termo-frequencia')}
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 whitespace-nowrap touch-feedback min-h-touch
                                        ${activeTab === 'termo-frequencia'
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'
                                        }
                                    `}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    Termo de Frequência
                                </button>
                            </>
                        )}
                    </nav>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'mini-pauta' ? (
                <div className="space-y-4 md:space-y-6">{/* Mini-Pauta Content */}

                    {/* Messages */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                            <span className="text-sm">{success}</span>
                        </div>
                    )}

                    {/* Filters */}
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-base md:text-lg font-semibold text-slate-900">Filtros</h3>
                                </div>
                                {selectedTurma && !isProfessor && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            onClick={() => setShowOrdenarDisciplinasModal(true)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-all duration-200 touch-feedback"
                                        >
                                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                            </svg>
                                            <span className="hidden sm:inline">Ordenar</span>
                                        </button>
                                        <button
                                            onClick={() => setShowColorConfigModal(true)}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-all duration-200 touch-feedback"
                                        >
                                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                            </svg>
                                            <span className="hidden sm:inline">Cores</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardBody className="p-3 md:p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                                {/* Escola filter - only for Direção Municipal */}
                                {isDirecaoMunicipal && (
                                    <div>
                                        <label className="form-label">Escola</label>
                                        <select
                                            value={selectedEscola}
                                            onChange={(e) => setSelectedEscola(e.target.value)}
                                            className="form-input min-h-touch"
                                        >
                                            <option value="">Seleccione uma escola</option>
                                            {escolas.map((escola) => (
                                                <option key={escola.id} value={escola.id}>
                                                    {escola.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className="form-label">Turma</label>
                                    <select
                                        value={selectedTurma}
                                        onChange={(e) => setSelectedTurma(e.target.value)}
                                        className="form-input min-h-touch"
                                        disabled={isDirecaoMunicipal && !selectedEscola}
                                    >
                                        <option value="">{isDirecaoMunicipal && !selectedEscola ? 'Seleccione primeiro uma escola' : 'Seleccione uma turma'}</option>
                                        {turmas.map((turma) => (
                                            <option key={turma.id} value={turma.id}>
                                                {turma.nome} - {turma.ano_lectivo}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label">Disciplina</label>
                                    <select
                                        value={selectedDisciplina}
                                        onChange={(e) => setSelectedDisciplina(e.target.value)}
                                        className="form-input min-h-touch"
                                        disabled={!selectedTurma || disciplinas.length === 0}
                                    >
                                        <option value="">Selecione uma disciplina</option>
                                        {/* For Primary Education, show "All Disciplines" option */}
                                        {isPrimaryEducation && (
                                            <option value="all">Todas as Disciplinas</option>
                                        )}
                                        {disciplinas.map((disciplina) => (
                                            <option key={disciplina.id} value={disciplina.id}>
                                                {disciplina.nome}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="form-label">Trimestre</label>
                                    <select
                                        value={trimestre}
                                        onChange={(e) => {
                                            const value = e.target.value
                                            setTrimestre(value === 'all' ? 'all' : parseInt(value) as 1 | 2 | 3)
                                        }}
                                        className="form-input min-h-touch"
                                    >
                                        <option value={1}>1º Trimestre</option>
                                        <option value={2}>2º Trimestre</option>
                                        <option value={3}>3º Trimestre</option>
                                        {/* For Secondary Education, show "All Trimesters" option */}
                                        {!isPrimaryEducation && (
                                            <option value="all">Todos os Trimestres</option>
                                        )}
                                    </select>
                                </div>

                                <div className="flex items-end">
                                    <button
                                        onClick={loadMiniPautaData}
                                        disabled={!selectedTurma || !selectedDisciplina || loadingData}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-xl transition-all duration-200 shadow-md shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none min-h-touch touch-feedback"
                                    >
                                        {loadingData ? (
                                            <>
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Carregando...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                                Carregar Dados
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    {/* Statistics */}
                    {miniPautaData && (
                        <TurmaStatistics statistics={miniPautaData.estatisticas} />
                    )}

                    {/* Preview */}
                    {miniPautaData && (
                        <Card>
                            <CardHeader>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-base md:text-lg font-semibold text-slate-900">Preview da Mini-Pauta</h3>
                                            <p className="text-xs md:text-sm text-slate-500 hidden sm:block">
                                                {miniPautaData.disciplina.nome} • {miniPautaData.trimestre === 'all' ? 'Todos os Trimestres' : `${miniPautaData.trimestre}º Trimestre`}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Action Buttons - Responsive */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* PDF - Primary Action */}
                                        <button
                                            onClick={handleGeneratePDF}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-md shadow-red-500/25 touch-feedback min-h-touch"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                            </svg>
                                            <span className="hidden sm:inline">PDF</span>
                                        </button>
                                        {!isProfessor && (
                                            <>
                                                {/* Excel */}
                                                <button
                                                    onClick={handleGenerateExcel}
                                                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-md shadow-green-500/25 touch-feedback min-h-touch"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <span className="hidden sm:inline">Excel</span>
                                                </button>
                                                {/* CSV */}
                                                <button
                                                    onClick={handleExportCSV}
                                                    className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all duration-200 touch-feedback min-h-touch"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <span className="hidden md:inline">CSV</span>
                                                </button>
                                                {/* Header Config */}
                                                <button
                                                    onClick={() => setShowHeaderConfigModal(true)}
                                                    className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all duration-200 touch-feedback min-h-touch"
                                                >
                                                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                    <span className="hidden md:inline">Cabeçalho</span>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardBody className="p-0 md:p-4">
                                <MiniPautaPreview data={miniPautaData} loading={loadingData} colorConfig={colorConfig} />
                            </CardBody>
                        </Card>
                    )}

                    {!miniPautaData && !loadingData && selectedTurma && selectedDisciplina && (
                        <Card>
                            <CardBody className="p-8 md:p-12">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h4 className="text-base font-semibold text-slate-700 mb-2">Pronto para carregar</h4>
                                    <p className="text-sm text-slate-500 mb-4">Clique em "Carregar Dados" para visualizar a mini-pauta</p>
                                    <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>Os dados serão carregados com base nos filtros selecionados</span>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>
                    )}

                    {/* Configuration Modal */}
                    <ConfiguracaoFormulasModal
                        isOpen={showConfigModal}
                        onClose={() => setShowConfigModal(false)}
                        disciplinaId={selectedDisciplina}
                        turmaId={selectedTurma}
                        currentConfig={mtConfig}
                        onSave={() => {
                            setShowConfigModal(false)
                            loadMiniPautaData()
                        }}
                    />

                    {/* Header Configuration Modal */}
                    <ConfiguracaoCabecalhoModal
                        isOpen={showHeaderConfigModal}
                        onClose={() => setShowHeaderConfigModal(false)}
                        onSave={() => {
                            setShowHeaderConfigModal(false)
                            loadHeaderConfiguration()
                        }}
                        escolaId={escolaProfile?.id || professorProfile?.escola_id || secretarioProfile?.escola_id || ''}
                    />

                    {/* Ordenar Disciplinas Modal */}
                    {showOrdenarDisciplinasModal && (
                        <OrdenarDisciplinasModal
                            turmaId={selectedTurma}
                            onClose={() => setShowOrdenarDisciplinasModal(false)}
                            onSave={() => {
                                console.log('💾 onSave callback: Recarregando dados após salvar ordenação')
                                console.log('   selectedDisciplina:', selectedDisciplina, 'miniPautaData:', !!miniPautaData)
                                setShowOrdenarDisciplinasModal(false)
                                loadDisciplinas()
                                // Recarregar mini-pauta se estiver sendo exibida
                                if (miniPautaData) {
                                    console.log('🔄 Chamando loadMiniPautaData()...')
                                    loadMiniPautaData()
                                } else {
                                    console.log('⚠️ miniPautaData não existe, não recarregando')
                                }
                            }}
                        />
                    )}

                    {/* Color Configuration Modal */}
                    <ConfiguracaoCoresModal
                        isOpen={showColorConfigModal}
                        onClose={() => setShowColorConfigModal(false)}
                        onSave={async () => {
                            console.log('Color config saved, reloading...')
                            await loadColorConfiguration()
                            setShowColorConfigModal(false)
                        }}
                        currentConfig={colorConfig}
                        nivelEnsino={selectedTurmaData?.nivel_ensino}
                        turmaId={selectedTurma}
                    />
                </div>
            ) : activeTab === 'pauta-geral' ? (
                <PautaGeralPage />
            ) : (
                // Termo de Frequência Tab
                <div className="space-y-4 md:space-y-6">
                    {/* Messages */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
                            <span className="text-sm">{success}</span>
                        </div>
                    )}

                    {/* Filters */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <h3 className="text-base md:text-lg font-semibold text-slate-900">Selecionar Aluno</h3>
                            </div>
                        </CardHeader>
                        <CardBody className="p-3 md:p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                                {/* Escola filter - only for Direção Municipal */}
                                {isDirecaoMunicipal && (
                                    <div>
                                        <label className="form-label">Escola</label>
                                        <select
                                            value={selectedEscola}
                                            onChange={(e) => setSelectedEscola(e.target.value)}
                                            className="form-input min-h-touch"
                                        >
                                            <option value="">Seleccione uma escola</option>
                                            {escolas.map((escola) => (
                                                <option key={escola.id} value={escola.id}>
                                                    {escola.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {/* Turma Selection */}
                                <div>
                                    <label className="form-label">Turma</label>
                                    <select
                                        value={selectedTurma}
                                        onChange={(e) => {
                                            setSelectedTurma(e.target.value)
                                            setSelectedAluno('')
                                            setTermoFrequenciaData(null)
                                        }}
                                        className="form-input min-h-touch"
                                        disabled={isDirecaoMunicipal && !selectedEscola}
                                    >
                                        <option value="">{isDirecaoMunicipal && !selectedEscola ? 'Seleccione primeiro uma escola' : 'Seleccione uma turma'}</option>
                                        {turmas.map((turma) => (
                                            <option key={turma.id} value={turma.id}>
                                                {turma.nome} - {turma.ano_lectivo}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Student Selection */}
                                <div>
                                    <label className="form-label">Aluno</label>
                                    <select
                                        value={selectedAluno}
                                        onChange={(e) => setSelectedAluno(e.target.value)}
                                        disabled={!selectedTurma || alunos.length === 0}
                                        className="form-input min-h-touch"
                                    >
                                        <option value="">Selecione um aluno</option>
                                        {alunos.map((aluno) => (
                                            <option key={aluno.id} value={aluno.id}>
                                                {aluno.nome_completo} ({aluno.numero_processo})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </CardBody>
                    </Card>

                    {/* Component Selection Section */}
                    {selectedTurma && availableComponents.length > 0 && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-base md:text-lg font-semibold text-slate-900">Componentes a Exibir</h3>
                                            <p className="text-xs md:text-sm text-slate-500">Selecione quais componentes mostrar no termo</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedComponents.length > 0 && (
                                            <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">
                                                {selectedComponents.length}/{availableComponents.length}
                                            </span>
                                        )}
                                        <button
                                            onClick={() => setIsComponentsExpanded(!isComponentsExpanded)}
                                            className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
                                        >
                                            <svg
                                                className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${isComponentsExpanded ? 'rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </CardHeader>
                            {isComponentsExpanded && (
                                <CardBody className="p-3 md:p-4">
                                    {/* Select All Components */}
                                    <div className="mb-4 pb-4 border-b border-slate-200">
                                        <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-100 p-3 rounded-xl transition-all duration-200 touch-feedback min-h-touch">
                                            <input
                                                type="checkbox"
                                                checked={selectedComponents.length === availableComponents.length}
                                                onChange={handleSelectAllComponents}
                                                className="w-5 h-5 text-purple-600 border-2 border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 cursor-pointer"
                                            />
                                            <div className="flex-1">
                                                <span className="font-semibold text-slate-900">
                                                    {selectedComponents.length === availableComponents.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                                                </span>
                                                <span className="ml-2 text-sm text-slate-500">
                                                    ({selectedComponents.length} de {availableComponents.length} selecionados)
                                                </span>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Individual Component Checkboxes - Reorderable List */}
                                    <div className="space-y-2">
                                        {availableComponents.map((component, index) => (
                                            <div
                                                key={component.codigo}
                                                className={`
                                                flex items-center gap-2 p-3 rounded-xl transition-all duration-200
                                                ${selectedComponents.includes(component.codigo)
                                                        ? 'bg-purple-50 border-2 border-purple-300'
                                                        : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                                                    }
                                            `}
                                            >
                                                {/* Reorder Buttons */}
                                                <div className="flex flex-col gap-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); moveComponentUp(index); }}
                                                        disabled={index === 0}
                                                        className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition touch-feedback"
                                                        title="Mover para cima"
                                                    >
                                                        <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.preventDefault(); moveComponentDown(index); }}
                                                        disabled={index === availableComponents.length - 1}
                                                        className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition touch-feedback"
                                                        title="Mover para baixo"
                                                    >
                                                        <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>
                                                </div>

                                                {/* Checkbox */}
                                                <label className="flex items-center gap-2 flex-1 cursor-pointer min-h-touch">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedComponents.includes(component.codigo)}
                                                        onChange={() => handleToggleComponent(component.codigo)}
                                                        className="w-4 h-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500 cursor-pointer"
                                                    />
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className={`text-sm font-bold ${selectedComponents.includes(component.codigo) ? 'text-purple-700' : 'text-slate-900'}`}>
                                                            {component.codigo}
                                                        </span>
                                                        <span className="text-xs text-slate-500 truncate">{component.nome}</span>
                                                    </div>
                                                </label>

                                                {/* Order Indicator */}
                                                <span className="text-sm font-medium text-slate-400 px-2">
                                                    #{index + 1}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Alignment Controls */}
                                    <div className="mt-6 pt-4 border-t border-slate-200">
                                        <label className="form-label mb-3">Alinhamento dos Componentes</label>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setComponentAlignment('left')}
                                                className={`flex-1 flex flex-col items-center gap-1.5 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 touch-feedback min-h-touch ${componentAlignment === 'left'
                                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95'
                                                    }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h7" />
                                                </svg>
                                                <span>Esquerda</span>
                                            </button>
                                            <button
                                                onClick={() => setComponentAlignment('center')}
                                                className={`flex-1 flex flex-col items-center gap-1.5 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 touch-feedback min-h-touch ${componentAlignment === 'center'
                                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95'
                                                    }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M9 18h6" />
                                                </svg>
                                                <span>Centro</span>
                                            </button>
                                            <button
                                                onClick={() => setComponentAlignment('right')}
                                                className={`flex-1 flex flex-col items-center gap-1.5 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 touch-feedback min-h-touch ${componentAlignment === 'right'
                                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95'
                                                    }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M13 18h7" />
                                                </svg>
                                                <span>Direita</span>
                                            </button>
                                        </div>
                                    </div>
                                </CardBody>
                            )}
                        </Card>
                    )}

                    {/* Batch Generation Section */}
                    {selectedTurma && alunos.length > 0 && !batchGenerating && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-base md:text-lg font-semibold text-slate-900">Geração em Lote</h3>
                                            <p className="text-xs md:text-sm text-slate-500">Selecione múltiplos alunos para gerar vários termos</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedAlunosIds.length > 0 && (
                                            <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                                {selectedAlunosIds.length} selecionados
                                            </span>
                                        )}
                                        <button
                                            onClick={() => setIsBatchGenerationExpanded(!isBatchGenerationExpanded)}
                                            className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
                                        >
                                            <svg
                                                className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${isBatchGenerationExpanded ? 'rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </CardHeader>
                            {isBatchGenerationExpanded && (
                                <CardBody className="p-3 md:p-4">
                                    {/* Select All Checkbox */}
                                    <div className="mb-4 pb-4 border-b border-slate-200">
                                        <label className="flex items-center gap-3 cursor-pointer hover:bg-slate-100 p-3 rounded-xl transition-all duration-200 touch-feedback min-h-touch">
                                            <div className="relative flex items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedAlunosIds.length === alunos.length && alunos.length > 0}
                                                    onChange={handleSelectAllAlunos}
                                                    className="w-5 h-5 text-blue-600 border-2 border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <span className="font-semibold text-slate-900">
                                                    {selectedAlunosIds.length === alunos.length && alunos.length > 0 ? 'Desmarcar Todos' : 'Selecionar Todos'}
                                                </span>
                                                <span className="ml-2 text-sm text-slate-500">
                                                    ({alunos.length} alunos na turma)
                                                </span>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Student List with Checkboxes - Mobile Card Style */}
                                    <div className="max-h-72 overflow-y-auto space-y-2 mb-4 -mx-1 px-1">
                                        {alunos.map((aluno, index) => (
                                            <label
                                                key={aluno.id}
                                                className={`
                                                flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all duration-200 touch-feedback min-h-touch
                                                ${selectedAlunosIds.includes(aluno.id)
                                                        ? 'bg-blue-50 border border-blue-200'
                                                        : 'bg-slate-50 hover:bg-slate-100 border border-transparent'
                                                    }
                                            `}
                                            >
                                                <div className="w-7 h-7 bg-slate-200 rounded-lg flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0">
                                                    {index + 1}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedAlunosIds.includes(aluno.id)}
                                                    onChange={() => handleToggleAluno(aluno.id)}
                                                    className="w-5 h-5 text-blue-600 border-2 border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 truncate">
                                                        {aluno.nome_completo}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        Nº {aluno.numero_processo}
                                                    </p>
                                                </div>
                                                {selectedAlunosIds.includes(aluno.id) && (
                                                    <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </label>
                                        ))}
                                    </div>

                                    {/* Counter and Button */}
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-200">
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="font-medium">{selectedAlunosIds.length}</span> de <span className="font-medium">{alunos.length}</span> alunos selecionados
                                        </div>
                                        <button
                                            onClick={handleGenerateBatchPDFs}
                                            disabled={selectedAlunosIds.length === 0}
                                            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-medium rounded-xl transition-all duration-200 shadow-md shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none min-h-touch touch-feedback"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Gerar PDFs em Lote
                                        </button>
                                    </div>
                                </CardBody>
                            )}
                        </Card>
                    )}

                    {/* Batch Progress */}
                    {batchGenerating && batchProgress && (
                        <Card>
                            <CardBody>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-slate-900">Gerando Termos de Frequência...</h3>
                                        <span className="text-sm text-slate-600">
                                            {batchProgress.current} de {batchProgress.total}
                                        </span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                                        <div
                                            className="bg-blue-600 h-full transition-all duration-300 ease-out"
                                            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                        />
                                    </div>

                                    {/* Current Student */}
                                    <p className="text-sm text-slate-600">
                                        Processando: <span className="font-medium text-slate-900">{batchProgress.currentAluno}</span>
                                    </p>

                                    {/* Percentage */}
                                    <p className="text-center text-2xl font-bold text-blue-600">
                                        {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                                    </p>
                                </div>
                            </CardBody>
                        </Card>
                    )}

                    {/* Loading State */}
                    {loadingTermo && (
                        <Card>
                            <CardBody>
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <span className="ml-3 text-slate-600">Carregando dados do aluno...</span>
                                </div>
                            </CardBody>
                        </Card>
                    )}


                    {/* Preview and Actions */}
                    {termoFrequenciaData && !loadingTermo && (
                        <>
                            {/* Preview */}
                            <TermoFrequenciaPreview data={termoFrequenciaData} colorConfig={colorConfig} componentAlignment={componentAlignment} componentOrder={availableComponents.map(c => c.codigo)} />

                            {/* Actions */}
                            <Card>
                                <CardHeader>
                                    <h3 className="text-lg font-semibold text-slate-900">Ações</h3>
                                </CardHeader>
                                <CardBody>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <Button
                                            onClick={handleGenerateTermoFrequenciaPDF}
                                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Gerar PDF
                                        </Button>
                                    </div>
                                </CardBody>
                            </Card>
                        </>
                    )}

                    {/* Empty State */}
                    {!selectedTurma && !loadingTermo && (
                        <Card>
                            <CardBody>
                                <div className="text-center py-12">
                                    <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <h3 className="mt-2 text-sm font-medium text-slate-900">Nenhuma turma selecionada</h3>
                                    <p className="mt-1 text-sm text-slate-500">Selecione uma turma e um aluno para gerar o Termo de Frequência</p>
                                </div>
                            </CardBody>
                        </Card>
                    )}
                </div>
            )}
        </div>
    )
}
