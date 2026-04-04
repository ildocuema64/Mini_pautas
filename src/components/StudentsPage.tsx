/*
component-meta:
  name: StudentsPage
  description: Page for managing students with expanded information tabs
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
import { ConfiguracaoCabecalhoModal } from './ConfiguracaoCabecalhoModal'
import { HeaderConfig, loadHeaderConfig, getOrgaoEducacao } from '../utils/headerConfigUtils'
import { useAuth } from '../contexts/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Aluno {
    id: string
    nome_completo: string
    numero_processo: string
    turma_id: string
    data_nascimento?: string
    genero?: 'M' | 'F'
    nacionalidade?: string
    naturalidade?: string
    tipo_documento?: string
    numero_documento?: string
    nome_pai?: string
    nome_mae?: string
    nome_encarregado?: string
    parentesco_encarregado?: string
    telefone_encarregado?: string
    email_encarregado?: string
    profissao_encarregado?: string
    provincia?: string
    municipio?: string
    bairro?: string
    rua?: string
    endereco?: string
    ano_ingresso?: number
    escola_anterior?: string
    classe_anterior?: string
    observacoes_academicas?: string
    frequencia_anual?: number
    tipo_exame?: 'Nacional' | 'Extraordinário' | 'Recurso'
    turma?: {
        nome: string
    }
}

interface Turma {
    id: string
    nome: string
}

type TabType = 'pessoal' | 'encarregado' | 'endereco' | 'academico' | 'acesso'

const initialFormData = {
    // Dados básicos
    nome_completo: '',
    numero_processo: '',
    turma_id: '',
    // Dados pessoais
    data_nascimento: '',
    genero: '' as '' | 'M' | 'F',
    nacionalidade: 'Angolana',
    naturalidade: '',
    tipo_documento: '',
    numero_documento: '',
    // Encarregado
    nome_pai: '',
    nome_mae: '',
    nome_encarregado: '',
    parentesco_encarregado: '',
    telefone_encarregado: '',
    email_encarregado: '',
    profissao_encarregado: '',
    // Endereço
    provincia: '',
    municipio: '',
    bairro: '',
    rua: '',
    endereco: '',
    // Acadêmico
    ano_ingresso: '',
    escola_anterior: '',
    classe_anterior: '',
    observacoes_academicas: '',
    frequencia_anual: '',
    tipo_exame: '',
    // Conta de Acesso (ALUNO)
    criar_conta_aluno: false,
    email_aluno: '',
    senha_aluno: '',
    // Conta de Acesso (ENCARREGADO)
    criar_conta_encarregado: false,
    email_conta_encarregado: '',
    senha_encarregado: '',
}

interface StudentsPageProps {
    searchQuery?: string
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ searchQuery = '' }) => {
    const { escolaProfile, professorProfile, secretarioProfile } = useAuth()
    const [alunos, setAlunos] = useState<Aluno[]>([])
    const [turmas, setTurmas] = useState<Turma[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showConfirmDelete, setShowConfirmDelete] = useState(false)
    const [selectedTurma, setSelectedTurma] = useState<string>('all')
    const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null)
    const [alunoToDelete, setAlunoToDelete] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<TabType>('pessoal')
    const [formData, setFormData] = useState(initialFormData)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [generatingNumero, setGeneratingNumero] = useState(false)
    const [manualNumero, setManualNumero] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null)
    const [showHeaderConfigModal, setShowHeaderConfigModal] = useState(false)

    useEffect(() => {
        loadTurmas()
        loadAlunos()
    }, [selectedTurma])

    // Auto-generate numero_processo when turma is selected
    useEffect(() => {
        if (formData.turma_id && !manualNumero && !formData.numero_processo) {
            generateNumeroProcesso()
        }
    }, [formData.turma_id, manualNumero])

    // Load header configuration on mount
    useEffect(() => {
        loadHeaderConfiguration()
    }, [escolaProfile, professorProfile, secretarioProfile])

    const loadHeaderConfiguration = async () => {
        try {
            let escola_id: string | undefined

            if (escolaProfile) {
                escola_id = escolaProfile.id
            } else if (professorProfile) {
                escola_id = professorProfile.escola_id
            } else if (secretarioProfile) {
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

    const loadTurmas = async () => {
        try {
            const { data, error } = await supabase
                .from('turmas')
                .select('id, nome')
                .order('nome')

            if (error) throw error
            setTurmas(data || [])
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar turmas'
            setError(translateError(errorMessage))
        }
    }

    const loadAlunos = async () => {
        try {
            setLoading(true)
            let query = supabase
                .from('alunos')
                .select(`
                    id,
                    nome_completo,
                    numero_processo,
                    turma_id,
                    data_nascimento,
                    genero,
                    nacionalidade,
                    naturalidade,
                    tipo_documento,
                    numero_documento,
                    nome_pai,
                    nome_mae,
                    nome_encarregado,
                    parentesco_encarregado,
                    telefone_encarregado,
                    email_encarregado,
                    profissao_encarregado,
                    provincia,
                    municipio,
                    bairro,
                    rua,
                    endereco,
                    ano_ingresso,
                    escola_anterior,
                    classe_anterior,
                    observacoes_academicas,
                    frequencia_anual,
                    tipo_exame,
                    turmas(nome)
                `)
                .order('nome_completo')

            if (selectedTurma !== 'all') {
                query = query.eq('turma_id', selectedTurma)
            }

            const { data, error } = await query

            if (error) throw error
            setAlunos(data || [])
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar alunos'
            setError(translateError(errorMessage))
        } finally {
            setLoading(false)
        }
    }

    const generateNumeroProcesso = async () => {
        if (!formData.turma_id) return
        setGeneratingNumero(true)
        try {
            // 1. Tentar via RPC (mais eficiente e atómica no servidor)
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('generate_numero_processo', { turma_uuid: formData.turma_id })

            if (!rpcError && rpcData) {
                setFormData(prev => ({ ...prev, numero_processo: rpcData }))
                return
            }

            // 2. Fallback local: gerar número de 5 dígitos único
            let novoNumero = ''
            for (let tentativas = 0; tentativas < 50; tentativas++) {
                const candidato = String(Math.floor(Math.random() * 90000) + 10000)
                const { data: existente } = await supabase
                    .from('alunos')
                    .select('id')
                    .eq('numero_processo', candidato)
                    .maybeSingle()
                if (!existente) {
                    novoNumero = candidato
                    break
                }
            }

            // Fallback absoluto: timestamp de 5 dígitos (garante unicidade)
            if (!novoNumero) {
                novoNumero = Date.now().toString().slice(-5)
            }

            setFormData(prev => ({ ...prev, numero_processo: novoNumero }))
        } catch (err) {
            console.error('Erro ao gerar número de processo:', err)
            // Último recurso: timestamp de 5 dígitos (único por definição)
            setFormData(prev => ({ ...prev, numero_processo: Date.now().toString().slice(-5) }))
        } finally {
            setGeneratingNumero(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        // Frontend validation for required fields
        if (!formData.nome_completo.trim()) {
            setError('Por favor, preencha o nome completo do aluno.')
            setActiveTab('pessoal')
            return
        }
        if (!formData.turma_id) {
            setError('Por favor, selecione uma turma para o aluno.')
            setActiveTab('pessoal')
            return
        }
        if (!formData.numero_processo.trim()) {
            setError('O número de processo não foi gerado. Selecione uma turma primeiro.')
            setActiveTab('pessoal')
            return
        }

        try {
            // Prepare data for the alunos table (exclude account-related fields)
            const {
                criar_conta_aluno,
                email_aluno,
                senha_aluno,
                criar_conta_encarregado,
                email_conta_encarregado,
                senha_encarregado,
                ...studentData
            } = formData

            const dataToSubmit = {
                ...studentData,
                // Convert empty strings to null for typed/optional columns
                genero: formData.genero || null,
                data_nascimento: formData.data_nascimento || null,
                tipo_documento: formData.tipo_documento || null,
                numero_documento: formData.numero_documento || null,
                nome_pai: formData.nome_pai || null,
                nome_mae: formData.nome_mae || null,
                nome_encarregado: formData.nome_encarregado || null,
                parentesco_encarregado: formData.parentesco_encarregado || null,
                telefone_encarregado: formData.telefone_encarregado || null,
                email_encarregado: formData.email_encarregado || null,
                profissao_encarregado: formData.profissao_encarregado || null,
                provincia: formData.provincia || null,
                municipio: formData.municipio || null,
                bairro: formData.bairro || null,
                rua: formData.rua || null,
                endereco: formData.endereco || null,
                naturalidade: formData.naturalidade || null,
                nacionalidade: formData.nacionalidade || null,
                escola_anterior: formData.escola_anterior || null,
                classe_anterior: formData.classe_anterior || null,
                observacoes_academicas: formData.observacoes_academicas || null,
                ano_ingresso: formData.ano_ingresso ? parseInt(formData.ano_ingresso) : null,
                frequencia_anual: formData.frequencia_anual ? parseFloat(formData.frequencia_anual) : null,
                tipo_exame: formData.tipo_exame || null,
            }

            // Insert the student record
            const { error: insertError } = await supabase
                .from('alunos')
                .insert(dataToSubmit)

            if (insertError) throw insertError

            // Build success message
            let successMsg = 'Aluno adicionado com sucesso!'
            if (email_aluno || formData.email_encarregado) {
                successMsg += ' Use os botões de convite para gerar links de acesso.'
            }

            setSuccess(successMsg)
            setShowModal(false)
            setFormData(initialFormData)
            setActiveTab('pessoal')
            loadAlunos()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            setError(translateError(errorMessage))
        }
    }

    // Generate and copy student invite link
    const handleCopyStudentInvite = (aluno: Aluno) => {
        // Note: Using email_encarregado as a fallback since email_aluno is not stored in DB
        // In a future update, we could add email_aluno to the alunos table
        if (!aluno.email_encarregado) {
            setError('Aluno não possui email cadastrado. Edite o aluno para adicionar email.')
            setTimeout(() => setError(null), 4000)
            return
        }

        const email = aluno.email_encarregado
        const origin = window.location.origin
        const inviteLink = `${origin}/register-student?email=${encodeURIComponent(email)}&aluno_id=${aluno.id}`

        navigator.clipboard.writeText(inviteLink).then(() => {
            setSuccess('Link de convite do aluno copiado!')
            setTimeout(() => setSuccess(null), 3000)
        }).catch(() => {
            setError('Erro ao copiar link. Tente manualmente.')
        })
    }

    // Generate and copy guardian invite link
    const handleCopyGuardianInvite = (aluno: Aluno) => {
        if (!aluno.email_encarregado) {
            setError('Encarregado não possui email cadastrado. Edite o aluno na aba "Encarregado".')
            setTimeout(() => setError(null), 4000)
            return
        }

        const origin = window.location.origin
        const inviteLink = `${origin}/register-guardian?email=${encodeURIComponent(aluno.email_encarregado)}&aluno_id=${aluno.id}`

        navigator.clipboard.writeText(inviteLink).then(() => {
            setSuccess('Link de convite do encarregado copiado!')
            setTimeout(() => setSuccess(null), 3000)
        }).catch(() => {
            setError('Erro ao copiar link. Tente manualmente.')
        })
    }

    const handleDeleteClick = (id: string) => {
        setAlunoToDelete(id)
        setShowConfirmDelete(true)
    }

    const handleConfirmDelete = async () => {
        if (!alunoToDelete) return

        try {
            const { error } = await supabase
                .from('alunos')
                .delete()
                .eq('id', alunoToDelete)

            if (error) throw error

            setSuccess('Aluno excluído com sucesso!')
            setShowConfirmDelete(false)
            setAlunoToDelete(null)
            loadAlunos()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao excluir aluno'
            setError(translateError(errorMessage))
            setShowConfirmDelete(false)
            setAlunoToDelete(null)
        }
    }

    const handleEditClick = (aluno: Aluno) => {
        setSelectedAluno(aluno)
        setFormData({
            nome_completo: aluno.nome_completo || '',
            numero_processo: aluno.numero_processo || '',
            turma_id: aluno.turma_id || '',
            data_nascimento: aluno.data_nascimento || '',
            genero: (aluno.genero as '' | 'M' | 'F') || '',
            nacionalidade: aluno.nacionalidade || '',
            naturalidade: aluno.naturalidade || '',
            tipo_documento: aluno.tipo_documento || '',
            numero_documento: aluno.numero_documento || '',
            nome_pai: aluno.nome_pai || '',
            nome_mae: aluno.nome_mae || '',
            nome_encarregado: aluno.nome_encarregado || '',
            parentesco_encarregado: aluno.parentesco_encarregado || '',
            telefone_encarregado: aluno.telefone_encarregado || '',
            email_encarregado: aluno.email_encarregado || '',
            profissao_encarregado: aluno.profissao_encarregado || '',
            provincia: aluno.provincia || '',
            municipio: aluno.municipio || '',
            bairro: aluno.bairro || '',
            rua: aluno.rua || '',
            endereco: aluno.endereco || '',
            ano_ingresso: aluno.ano_ingresso?.toString() || '',
            escola_anterior: aluno.escola_anterior || '',
            classe_anterior: aluno.classe_anterior || '',
            observacoes_academicas: aluno.observacoes_academicas || '',
            frequencia_anual: aluno.frequencia_anual?.toString() || '',
            tipo_exame: aluno.tipo_exame || '',
            // Account fields - default to false/empty for editing existing students
            criar_conta_aluno: false,
            email_aluno: '',
            senha_aluno: '',
            criar_conta_encarregado: false,
            email_conta_encarregado: '',
            senha_encarregado: '',
        })
        setActiveTab('pessoal')
        setShowEditModal(true)
    }

    const handleUpdateStudent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAluno) return

        setError(null)
        setSuccess(null)

        try {
            // Exclude account creation fields - they don't exist in the alunos table
            const {
                criar_conta_aluno,
                email_aluno,
                senha_aluno,
                criar_conta_encarregado,
                email_conta_encarregado,
                senha_encarregado,
                ...studentData
            } = formData

            const dataToUpdate = {
                ...studentData,
                genero: formData.genero || null,
                ano_ingresso: formData.ano_ingresso ? parseInt(formData.ano_ingresso) : null,
                frequencia_anual: formData.frequencia_anual ? parseFloat(formData.frequencia_anual) : null,
                tipo_exame: formData.tipo_exame || null,
            }

            const { error: updateError } = await supabase
                .from('alunos')
                .update(dataToUpdate)
                .eq('id', selectedAluno.id)

            if (updateError) throw updateError

            setSuccess('Aluno atualizado com sucesso!')
            setShowEditModal(false)
            setSelectedAluno(null)
            setFormData(initialFormData)
            setActiveTab('pessoal')
            loadAlunos()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar aluno'
            setError(translateError(errorMessage))
        }
    }

    const getStudentInitials = (name: string) => {
        const names = name.trim().split(' ')
        if (names.length === 1) return names[0].substring(0, 2).toUpperCase()
        return (names[0][0] + names[names.length - 1][0]).toUpperCase()
    }

    // Filter students based on search query
    const filteredAlunos = alunos.filter(aluno =>
        aluno.nome_completo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        aluno.numero_processo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        aluno.turma?.nome?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const closeModal = () => {
        setShowModal(false)
        setFormData(initialFormData)
        setActiveTab('pessoal')
        setGeneratingNumero(false)
        setManualNumero(false)
    }

    const closeEditModal = () => {
        setShowEditModal(false)
        setSelectedAluno(null)
        setFormData(initialFormData)
        setActiveTab('pessoal')
        setGeneratingNumero(false)
        setManualNumero(false)
    }

    // Helper function to add a page with student list for a turma
    const addTurmaPageToPDF = (
        doc: jsPDF,
        turmaStudents: Aluno[],
        turmaNome: string,
        logoBase64: string | null,
        isFirstPage: boolean
    ) => {
        const pageWidth = doc.internal.pageSize.getWidth()
        const centerX = pageWidth / 2

        // Add new page if not the first
        if (!isFirstPage) {
            doc.addPage()
        }

        let startY = 15

        // Header with configuration
        if (headerConfig) {
            // Logo (if configured and loaded)
            if (logoBase64) {
                const logoWidth = 18
                const logoHeight = 18
                const logoX = centerX - (logoWidth / 2)
                doc.addImage(logoBase64, 'PNG', logoX, 8, logoWidth, logoHeight)
                startY = 8 + logoHeight + 3
            }

            // República de Angola
            if (headerConfig.mostrar_republica && headerConfig.texto_republica) {
                doc.setFontSize(10)
                doc.setFont('helvetica', 'bold')
                doc.text(headerConfig.texto_republica.toUpperCase(), centerX, startY, { align: 'center' })
                startY += 5
            }

            // Governo Provincial
            if (headerConfig.mostrar_governo_provincial && headerConfig.provincia) {
                doc.setFontSize(9)
                doc.setFont('helvetica', 'normal')
                doc.text(`Governo Provincial da ${headerConfig.provincia}`, centerX, startY, { align: 'center' })
                startY += 5
            }

            // Órgão de Educação
            if (headerConfig.mostrar_orgao_educacao && headerConfig.nivel_ensino) {
                const orgaoTexto = getOrgaoEducacao(
                    headerConfig.nivel_ensino,
                    headerConfig.provincia,
                    headerConfig.municipio
                )
                doc.setFontSize(9)
                doc.text(orgaoTexto, centerX, startY, { align: 'center' })
                startY += 5
            }

            // Nome da Escola
            if (headerConfig.nome_escola) {
                doc.setFontSize(12)
                doc.setFont('helvetica', 'bold')
                doc.text(headerConfig.nome_escola, centerX, startY, { align: 'center' })
                startY += 8
            }

            // Separator line
            doc.setLineWidth(0.3)
            doc.line(14, startY, pageWidth - 14, startY)
            startY += 8
        }

        // Document title
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('LISTA DE ALUNOS', 105, startY, { align: 'center' })
        startY += 8

        // Turma and count info
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text(`Turma: ${turmaNome}`, 14, startY)
        startY += 5
        doc.text(`Total de Alunos: ${turmaStudents.length}`, 14, startY)
        startY += 8

        // Sort students alphabetically
        const sortedStudents = [...turmaStudents].sort((a, b) =>
            a.nome_completo.localeCompare(b.nome_completo, 'pt')
        )

        // Table data
        const tableData = sortedStudents.map((aluno, index) => [
            index + 1,
            aluno.nome_completo,
            aluno.genero || '-'
        ])

        autoTable(doc, {
            startY: startY,
            head: [['Nº', 'Nome do Aluno', 'Género']],
            body: tableData,
            theme: 'plain',
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: [0, 0, 0],
                fontSize: 10,
                fontStyle: 'bold',
                lineWidth: 0.05,
                lineColor: [200, 200, 200]
            },
            styles: {
                fontSize: 9,
                cellPadding: 1,
                lineWidth: 0.05,
                lineColor: [200, 200, 200]
            },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { cellWidth: 'auto', halign: 'left' },
                2: { cellWidth: 20, halign: 'center' }
            },
            tableLineWidth: 0.05,
            tableLineColor: [200, 200, 200],
            didParseCell: (data) => {
                if (data.section === 'head') {
                    if (data.column.index === 0 || data.column.index === 2) {
                        data.cell.styles.halign = 'center'
                    } else {
                        data.cell.styles.halign = 'left'
                    }
                }
            }
        })

        // Get final Y position after table
        const finalY = (doc as any).lastAutoTable.finalY || 150

        // Signature section (only if there's enough space on the page)
        const pageHeight = doc.internal.pageSize.getHeight()
        if (finalY + 45 < pageHeight) {
            const signatureY = finalY + 30
            doc.setFontSize(10)
            doc.setLineWidth(0.3)

            // Left signature
            doc.line(20, signatureY, 90, signatureY)
            doc.text('Assinatura do Director', 55, signatureY + 5, { align: 'center' })

            // Right signature
            doc.line(120, signatureY, 190, signatureY)
            doc.text('Assinatura do Secretário', 155, signatureY + 5, { align: 'center' })
        }
    }

    // Print/Export student list to PDF (supports batch export by turma)
    const handlePrintList = async () => {
        setExporting(true)
        try {
            const doc = new jsPDF()

            // Pre-load logo if configured
            let logoBase64: string | null = null
            if (headerConfig?.logo_url) {
                try {
                    const response = await fetch(headerConfig.logo_url)
                    const blob = await response.blob()
                    logoBase64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader()
                        reader.onloadend = () => resolve(reader.result as string)
                        reader.readAsDataURL(blob)
                    })
                } catch (logoError) {
                    console.error('Error loading logo:', logoError)
                }
            }

            if (selectedTurma === 'all') {
                // Batch export: Create separate pages for each turma
                const turmasWithStudents = turmas.filter(turma =>
                    filteredAlunos.some(aluno => aluno.turma_id === turma.id)
                ).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))

                let isFirstPage = true
                for (const turma of turmasWithStudents) {
                    const turmaStudents = filteredAlunos.filter(aluno => aluno.turma_id === turma.id)
                    if (turmaStudents.length > 0) {
                        addTurmaPageToPDF(doc, turmaStudents, turma.nome, logoBase64, isFirstPage)
                        isFirstPage = false
                    }
                }
            } else {
                // Single turma export
                const turmaNome = turmas.find(t => t.id === selectedTurma)?.nome || 'Turma'
                addTurmaPageToPDF(doc, filteredAlunos, turmaNome, logoBase64, true)
            }

            // Footer with page numbers
            const pageCount = doc.getNumberOfPages()
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i)
                doc.setFontSize(8)
                doc.text(
                    `Página ${i} de ${pageCount}`,
                    105,
                    doc.internal.pageSize.height - 10,
                    { align: 'center' }
                )
                doc.text(
                    `Gerado em: ${new Date().toLocaleString('pt-AO')}`,
                    105,
                    doc.internal.pageSize.height - 5,
                    { align: 'center' }
                )
            }

            // Generate filename
            const date = new Date().toISOString().split('T')[0]
            const filenameSlug = selectedTurma === 'all'
                ? 'todas-turmas'
                : turmas.find(t => t.id === selectedTurma)?.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'turma'
            doc.save(`lista-alunos-${filenameSlug}_${date}.pdf`)

            setSuccess('Lista exportada com sucesso!')
            setTimeout(() => setSuccess(null), 3000)
        } catch (error) {
            console.error('Erro ao exportar PDF:', error)
            setError('Erro ao exportar a lista de alunos')
            setTimeout(() => setError(null), 3000)
        } finally {
            setExporting(false)
        }
    }

    // Tab component with icons
    const TabButton: React.FC<{ tab: TabType; label: string; icon: React.ReactNode }> = ({ tab, label, icon }) => (
        <button
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === tab
                ? 'bg-primary-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
        >
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </button>
    )

    // Form fields for each tab
    const renderTabContent = () => {
        switch (activeTab) {
            case 'pessoal':
                return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Nome Completo *"
                                type="text"
                                value={formData.nome_completo}
                                onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                                placeholder="Nome completo do aluno"
                                required
                                icon={<Icons.User />}
                            />
                            <div className="relative">
                                <Input
                                    label="Nº de Processo"
                                    type="text"
                                    value={formData.numero_processo}
                                    onChange={() => { }}
                                    placeholder={generatingNumero ? "Gerando..." : "Gerado automaticamente"}
                                    disabled={true}
                                    helpText={
                                        formData.turma_id
                                            ? "Gerado automaticamente ao selecionar a turma"
                                            : "Selecione uma turma primeiro"
                                    }
                                />
                                {generatingNumero && (
                                    <div className="absolute right-3 top-9">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Data de Nascimento"
                                type="date"
                                value={formData.data_nascimento}
                                onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                            />
                            <div>
                                <label className="form-label">Género *</label>
                                <select
                                    value={formData.genero}
                                    onChange={(e) => setFormData({ ...formData, genero: e.target.value as '' | 'M' | 'F' })}
                                    className="form-input min-h-touch"
                                    required
                                >
                                    <option value="">Selecione</option>
                                    <option value="M">Masculino</option>
                                    <option value="F">Feminino</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="form-label">Nacionalidade</label>
                                <input
                                    type="text"
                                    list="nacionalidades-list-students"
                                    value={formData.nacionalidade}
                                    onChange={(e) => setFormData({ ...formData, nacionalidade: e.target.value })}
                                    placeholder="Selecione ou digite"
                                    className="form-input min-h-touch"
                                />
                                <datalist id="nacionalidades-list-students">
                                    <option value="Angolana" />
                                    <option value="Angolano" />
                                    <option value="Brasileira" />
                                    <option value="Portuguesa" />
                                    <option value="Moçambicana" />
                                    <option value="Cabo-verdiana" />
                                    <option value="São-tomense" />
                                    <option value="Guineense" />
                                    <option value="Timorense" />
                                    <option value="Congolesa" />
                                    <option value="Sul-africana" />
                                    <option value="Namibiana" />
                                    <option value="Zambiana" />
                                    <option value="Outra" />
                                </datalist>
                            </div>
                            <Input
                                label="Naturalidade"
                                type="text"
                                value={formData.naturalidade}
                                onChange={(e) => setFormData({ ...formData, naturalidade: e.target.value })}
                                placeholder="Luanda"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="form-label">Tipo de Documento</label>
                                <select
                                    value={formData.tipo_documento}
                                    onChange={(e) => setFormData({ ...formData, tipo_documento: e.target.value })}
                                    className="form-input min-h-touch"
                                >
                                    <option value="">Selecione</option>
                                    <option value="BI">Bilhete de Identidade</option>
                                    <option value="Passaporte">Passaporte</option>
                                    <option value="Cédula">Cédula</option>
                                    <option value="Outro">Outro</option>
                                </select>
                            </div>
                            <Input
                                label="Nº do Documento"
                                type="text"
                                value={formData.numero_documento}
                                onChange={(e) => setFormData({ ...formData, numero_documento: e.target.value })}
                                placeholder="000000000LA000"
                            />
                        </div>

                        <div>
                            <label className="form-label">Turma *</label>
                            <select
                                value={formData.turma_id}
                                onChange={(e) => setFormData({ ...formData, turma_id: e.target.value })}
                                className="form-input min-h-touch"
                                required
                            >
                                <option value="">Selecione uma turma</option>
                                {turmas.map((turma) => (
                                    <option key={turma.id} value={turma.id}>
                                        {turma.nome}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )

            case 'encarregado':
                return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Nome do Pai"
                                type="text"
                                value={formData.nome_pai}
                                onChange={(e) => setFormData({ ...formData, nome_pai: e.target.value })}
                                placeholder="Nome completo do pai"
                            />
                            <Input
                                label="Nome da Mãe"
                                type="text"
                                value={formData.nome_mae}
                                onChange={(e) => setFormData({ ...formData, nome_mae: e.target.value })}
                                placeholder="Nome completo da mãe"
                            />
                        </div>

                        <div className="border-t border-slate-200 pt-4 mt-4">
                            <h4 className="text-sm font-semibold text-slate-700 mb-3">Encarregado de Educação</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Input
                                    label="Nome do Encarregado"
                                    type="text"
                                    value={formData.nome_encarregado}
                                    onChange={(e) => setFormData({ ...formData, nome_encarregado: e.target.value })}
                                    placeholder="Nome completo"
                                />
                                <div>
                                    <label className="form-label">Parentesco</label>
                                    <select
                                        value={formData.parentesco_encarregado}
                                        onChange={(e) => setFormData({ ...formData, parentesco_encarregado: e.target.value })}
                                        className="form-input min-h-touch"
                                    >
                                        <option value="">Selecione</option>
                                        <option value="Pai">Pai</option>
                                        <option value="Mãe">Mãe</option>
                                        <option value="Avô/Avó">Avô/Avó</option>
                                        <option value="Tio/Tia">Tio/Tia</option>
                                        <option value="Irmão/Irmã">Irmão/Irmã</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                <Input
                                    label="Telefone"
                                    type="tel"
                                    value={formData.telefone_encarregado}
                                    onChange={(e) => setFormData({ ...formData, telefone_encarregado: e.target.value })}
                                    placeholder="+244 9XX XXX XXX"
                                />
                                <Input
                                    label="Email"
                                    type="email"
                                    value={formData.email_encarregado}
                                    onChange={(e) => setFormData({ ...formData, email_encarregado: e.target.value })}
                                    placeholder="email@exemplo.com"
                                />
                            </div>

                            <div className="mt-4">
                                <Input
                                    label="Profissão do Encarregado"
                                    type="text"
                                    value={formData.profissao_encarregado}
                                    onChange={(e) => setFormData({ ...formData, profissao_encarregado: e.target.value })}
                                    placeholder="Ex: Professor, Engenheiro, etc."
                                />
                            </div>
                        </div>
                    </div>
                )

            case 'endereco':
                return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Província"
                                type="text"
                                value={formData.provincia}
                                onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
                                placeholder="Luanda"
                            />
                            <Input
                                label="Município"
                                type="text"
                                value={formData.municipio}
                                onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                                placeholder="Talatona"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Bairro/Comuna"
                                type="text"
                                value={formData.bairro}
                                onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                                placeholder="Nome do bairro"
                            />
                            <Input
                                label="Rua/Avenida"
                                type="text"
                                value={formData.rua}
                                onChange={(e) => setFormData({ ...formData, rua: e.target.value })}
                                placeholder="Rua e número"
                            />
                        </div>

                        <div>
                            <label className="form-label">Referência/Complemento</label>
                            <textarea
                                value={formData.endereco}
                                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                                placeholder="Ponto de referência ou informações adicionais"
                                className="form-input min-h-[80px] resize-none"
                                rows={3}
                            />
                        </div>
                    </div>
                )

            case 'academico':
                return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                                label="Ano de Ingresso"
                                type="number"
                                value={formData.ano_ingresso}
                                onChange={(e) => setFormData({ ...formData, ano_ingresso: e.target.value })}
                                placeholder="2024"
                            />
                            <Input
                                label="Classe Anterior"
                                type="text"
                                value={formData.classe_anterior}
                                onChange={(e) => setFormData({ ...formData, classe_anterior: e.target.value })}
                                placeholder="5ª Classe"
                            />
                        </div>

                        <Input
                            label="Escola Anterior"
                            type="text"
                            value={formData.escola_anterior}
                            onChange={(e) => setFormData({ ...formData, escola_anterior: e.target.value })}
                            placeholder="Nome da escola de origem"
                        />

                        <div>
                            <label className="form-label">Observações Académicas</label>
                            <textarea
                                value={formData.observacoes_academicas}
                                onChange={(e) => setFormData({ ...formData, observacoes_academicas: e.target.value })}
                                placeholder="Informações relevantes sobre o histórico académico do aluno"
                                className="form-input min-h-[100px] resize-none"
                                rows={4}
                            />
                        </div>

                        {/* Frequência e Avaliação */}
                        <div className="border-t border-slate-200 pt-4 mt-4">
                            <h4 className="text-sm font-semibold text-slate-700 mb-3">Frequência e Avaliação</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Frequência Anual (%)</label>
                                    <Input
                                        type="number"
                                        value={formData.frequencia_anual}
                                        onChange={(e) => {
                                            const value = e.target.value
                                            if (value === '' || (parseFloat(value) >= 0 && parseFloat(value) <= 100)) {
                                                setFormData({ ...formData, frequencia_anual: value })
                                            }
                                        }}
                                        placeholder="0-100"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        helpText={formData.frequencia_anual && parseFloat(formData.frequencia_anual) < 66.67
                                            ? "⚠️ Frequência abaixo do mínimo (66.67%)"
                                            : formData.frequencia_anual
                                                ? "✓ Frequência adequada"
                                                : "Percentual de presença do aluno"}
                                    />
                                    {formData.frequencia_anual && (
                                        <div className="mt-2">
                                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all ${parseFloat(formData.frequencia_anual) < 66.67
                                                        ? 'bg-red-500'
                                                        : 'bg-green-500'
                                                        }`}
                                                    style={{ width: `${Math.min(parseFloat(formData.frequencia_anual), 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="form-label">Tipo de Exame</label>
                                    <select
                                        value={formData.tipo_exame}
                                        onChange={(e) => setFormData({ ...formData, tipo_exame: e.target.value })}
                                        className="form-input min-h-touch"
                                    >
                                        <option value="">Selecione</option>
                                        <option value="Nacional">Nacional</option>
                                        <option value="Extraordinário">Extraordinário</option>
                                        <option value="Recurso">Recurso</option>
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Tipo de exame que o aluno deve realizar
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )

            case 'acesso':
                return (
                    <div className="space-y-6">
                        {/* Conta do Aluno */}
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <div className="flex items-center gap-3 mb-4">
                                <input
                                    type="checkbox"
                                    id="criar_conta_aluno"
                                    checked={formData.criar_conta_aluno}
                                    onChange={(e) => setFormData({ ...formData, criar_conta_aluno: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <label htmlFor="criar_conta_aluno" className="font-semibold text-slate-800">
                                    Criar conta de acesso para o Aluno
                                </label>
                            </div>
                            <p className="text-sm text-slate-600 mb-4">
                                O aluno poderá aceder ao sistema para visualizar as suas notas.
                            </p>

                            {formData.criar_conta_aluno && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Input
                                        label="Email do Aluno"
                                        type="email"
                                        value={formData.email_aluno}
                                        onChange={(e) => setFormData({ ...formData, email_aluno: e.target.value })}
                                        placeholder="aluno@escola.ao"
                                    />
                                    <Input
                                        label="Senha"
                                        type="password"
                                        value={formData.senha_aluno}
                                        onChange={(e) => setFormData({ ...formData, senha_aluno: e.target.value })}
                                        placeholder="Mínimo 6 caracteres"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Conta do Encarregado */}
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <div className="flex items-center gap-3 mb-4">
                                <input
                                    type="checkbox"
                                    id="criar_conta_encarregado"
                                    checked={formData.criar_conta_encarregado}
                                    onChange={(e) => setFormData({ ...formData, criar_conta_encarregado: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                <label htmlFor="criar_conta_encarregado" className="font-semibold text-slate-800">
                                    Criar conta de acesso para o Encarregado
                                </label>
                            </div>
                            <p className="text-sm text-slate-600 mb-4">
                                O encarregado poderá aceder ao sistema para visualizar as notas do educando.
                            </p>

                            {formData.criar_conta_encarregado && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Input
                                        label="Email do Encarregado"
                                        type="email"
                                        value={formData.email_conta_encarregado}
                                        onChange={(e) => setFormData({ ...formData, email_conta_encarregado: e.target.value })}
                                        placeholder="encarregado@email.com"
                                    />
                                    <Input
                                        label="Senha"
                                        type="password"
                                        value={formData.senha_encarregado}
                                        onChange={(e) => setFormData({ ...formData, senha_encarregado: e.target.value })}
                                        placeholder="Mínimo 6 caracteres"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="font-medium text-slate-700 mb-2">Informação</h4>
                            <p className="text-sm text-slate-600">
                                As contas criadas terão acesso apenas de leitura. Os utilizadores poderão ver as notas
                                mas não poderão modificar nenhum dado no sistema.
                            </p>
                        </div>
                    </div>
                )
        }
    }

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in">
                {/* Header Skeleton */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <div className="skeleton h-8 w-32 mb-2 rounded-lg"></div>
                        <div className="skeleton h-4 w-48 rounded"></div>
                    </div>
                    <div className="skeleton h-10 w-28 rounded-xl"></div>
                </div>
                {/* Filter Skeleton */}
                <div className="card p-3 md:p-4">
                    <div className="flex gap-3">
                        <div className="skeleton h-10 w-36 rounded-lg"></div>
                        <div className="skeleton h-10 w-48 rounded-lg"></div>
                    </div>
                </div>
                {/* List Skeleton */}
                <div className="card">
                    <div className="border-b border-slate-100 p-4">
                        <div className="skeleton h-6 w-32 rounded"></div>
                    </div>
                    <div className="p-4 space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                                <div className="skeleton w-12 h-12 rounded-full"></div>
                                <div className="flex-1">
                                    <div className="skeleton h-4 w-40 mb-2 rounded"></div>
                                    <div className="skeleton h-3 w-24 rounded"></div>
                                </div>
                                <div className="flex gap-2">
                                    <div className="skeleton h-8 w-8 rounded-lg"></div>
                                    <div className="skeleton h-8 w-8 rounded-lg"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-900">Alunos</h2>
                    <p className="text-sm md:text-base text-slate-600 mt-1">Gerencie os alunos das suas turmas</p>
                </div>
                <Button
                    variant="primary"
                    icon={<Icons.UserPlus />}
                    onClick={() => setShowModal(true)}
                    className="w-full sm:w-auto"
                >
                    Novo Aluno
                </Button>
            </div>

            {/* Messages */}
            {error && (
                <div className="alert alert-error animate-slide-down">
                    <span className="text-sm">{error}</span>
                </div>
            )}
            {success && (
                <div className="alert alert-success animate-slide-down">
                    <Icons.Check />
                    <span className="ml-2 text-sm">{success}</span>
                </div>
            )}

            {/* Filter */}
            <Card>
                <CardBody className="p-3 md:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                        <label className="text-sm font-medium text-slate-700 flex-shrink-0">Filtrar por turma:</label>
                        <select
                            value={selectedTurma}
                            onChange={(e) => setSelectedTurma(e.target.value)}
                            className="form-input min-h-touch flex-1 sm:max-w-xs"
                        >
                            <option value="all">Todas as turmas</option>
                            {turmas.map((turma) => (
                                <option key={turma.id} value={turma.id}>
                                    {turma.nome}
                                </option>
                            ))}
                        </select>
                        <span className="text-sm text-slate-600">
                            {alunos.length} {alunos.length === 1 ? 'aluno' : 'alunos'}
                        </span>
                        <Button
                            variant="ghost"
                            onClick={() => setShowHeaderConfigModal(true)}
                            className="hidden sm:flex"
                            icon={
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            }
                        >
                            Cabeçalho
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handlePrintList}
                            loading={exporting}
                            disabled={filteredAlunos.length === 0}
                            className="ml-auto sm:ml-0"
                            icon={
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                            }
                        >
                            Imprimir Lista
                        </Button>
                    </div>
                </CardBody>
            </Card>

            {/* Alunos List */}
            {alunos.length === 0 ? (
                <Card>
                    <CardBody className="text-center py-8 md:py-12">
                        <svg className="w-12 h-12 md:w-16 md:h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <h3 className="text-base md:text-lg font-semibold text-slate-900 mb-2">Nenhum aluno encontrado</h3>
                        <p className="text-sm md:text-base text-slate-600 mb-4">Adicione alunos às suas turmas</p>
                        <Button variant="primary" onClick={() => setShowModal(true)} className="w-full sm:w-auto">
                            Adicionar Primeiro Aluno
                        </Button>
                    </CardBody>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <h3 className="text-lg font-semibold text-slate-900">Lista de Alunos</h3>
                    </CardHeader>
                    <CardBody>
                        {filteredAlunos.length === 0 ? (
                            <div className="text-center py-8">
                                <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <p className="text-slate-600">Nenhum aluno encontrado</p>
                                <p className="text-sm text-slate-500 mt-1">Tente pesquisar com outros termos</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-3">
                                    {filteredAlunos.map((aluno) => (
                                        <div
                                            key={aluno.id}
                                            className="group relative bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:border-primary-300 hover:-translate-y-0.5"
                                        >
                                            {/* Mobile: Stack layout, Desktop: Inline layout */}
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                                                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                                    <div className="flex-shrink-0">
                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-md group-hover:shadow-lg transition-shadow">
                                                            {getStudentInitials(aluno.nome_completo)}
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        {/* Nome completo - sem truncate em mobile para mostrar nome todo */}
                                                        <h4 className="font-semibold text-slate-900 text-sm sm:text-base break-words leading-snug">
                                                            {aluno.nome_completo}
                                                        </h4>
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                                            <p className="text-xs sm:text-sm text-slate-500">
                                                                Nº {aluno.numero_processo}
                                                            </p>
                                                            {aluno.turma?.nome && (
                                                                <>
                                                                    <span className="text-slate-300 hidden xs:inline">•</span>
                                                                    <p className="text-xs sm:text-sm text-slate-500">
                                                                        {aluno.turma.nome}
                                                                    </p>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Botões de ação - linha separada em mobile */}
                                                <div className="flex items-center gap-1 sm:gap-2 ml-13 sm:ml-0 flex-shrink-0">
                                                    <button
                                                        onClick={() => handleEditClick(aluno)}
                                                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all duration-200 min-h-touch min-w-touch flex items-center justify-center"
                                                        title="Editar aluno"
                                                    >
                                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopyStudentInvite(aluno)}
                                                        className="hidden xs:flex p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 min-h-touch min-w-touch items-center justify-center"
                                                        title="Copiar convite do aluno"
                                                    >
                                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopyGuardianInvite(aluno)}
                                                        className="hidden xs:flex p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all duration-200 min-h-touch min-w-touch items-center justify-center"
                                                        title="Copiar convite do encarregado"
                                                    >
                                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(aluno.id)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 min-h-touch min-w-touch flex items-center justify-center"
                                                        title="Remover aluno"
                                                    >
                                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 pt-4 border-t border-slate-200">
                                    <p className="text-sm text-slate-600">
                                        {searchQuery ? (
                                            <>
                                                Mostrando {filteredAlunos.length} de {alunos.length} {alunos.length === 1 ? 'aluno' : 'alunos'}
                                            </>
                                        ) : (
                                            <>
                                                Total: {alunos.length} {alunos.length === 1 ? 'aluno' : 'alunos'}
                                            </>
                                        )}
                                    </p>
                                </div>
                            </>
                        )}
                    </CardBody>
                </Card>
            )}

            {/* New Student Modal with Tabs */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                    <Card className="w-full md:max-w-2xl md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[95vh] overflow-hidden flex flex-col">
                        <CardHeader className="flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-slate-900">Novo Aluno</h3>
                                <button
                                    onClick={closeModal}
                                    className="text-slate-400 hover:text-slate-600 min-h-touch min-w-touch flex items-center justify-center -mr-2"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
                                <TabButton tab="pessoal" label="Pessoal" icon={<Icons.User />} />
                                <TabButton tab="encarregado" label="Encarregado" icon={<Icons.Users />} />
                                <TabButton tab="endereco" label="Endereço" icon={<Icons.Home />} />
                                <TabButton tab="academico" label="Académico" icon={<Icons.ClipboardList />} />
                                <TabButton tab="acesso" label="Acesso" icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                } />
                            </div>
                        </CardHeader>
                        <CardBody className="flex-1 overflow-y-auto">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {renderTabContent()}

                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-6">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={closeModal}
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button type="submit" variant="primary" className="flex-1">
                                        Adicionar Aluno
                                    </Button>
                                </div>
                            </form>
                        </CardBody>
                    </Card>
                </div>
            )}

            {/* Edit Student Modal with Tabs */}
            {showEditModal && selectedAluno && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                    <Card className="w-full md:max-w-2xl md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[95vh] overflow-hidden flex flex-col">
                        <CardHeader className="flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-slate-900">Editar Aluno</h3>
                                <button
                                    onClick={closeEditModal}
                                    className="text-slate-400 hover:text-slate-600 min-h-touch min-w-touch flex items-center justify-center -mr-2"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
                                <TabButton tab="pessoal" label="Pessoal" icon={<Icons.User />} />
                                <TabButton tab="encarregado" label="Encarregado" icon={<Icons.Users />} />
                                <TabButton tab="endereco" label="Endereço" icon={<Icons.Home />} />
                                <TabButton tab="academico" label="Académico" icon={<Icons.ClipboardList />} />
                                <TabButton tab="acesso" label="Acesso" icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                } />
                            </div>
                        </CardHeader>
                        <CardBody className="flex-1 overflow-y-auto">
                            <form onSubmit={handleUpdateStudent} className="space-y-4">
                                {renderTabContent()}

                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-6">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={closeEditModal}
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
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={showConfirmDelete}
                onClose={() => {
                    setShowConfirmDelete(false)
                    setAlunoToDelete(null)
                }}
                onConfirm={handleConfirmDelete}
                title="Excluir Aluno?"
                message="Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita."
                confirmText="Sim, Excluir"
                cancelText="Cancelar"
                variant="danger"
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
        </div>
    )
}
