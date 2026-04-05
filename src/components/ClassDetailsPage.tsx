/*
component-meta:
  name: ClassDetailsPage
  description: Page showing details of a specific class/turma
  tokens: [--color-primary, --fs-md, min-h-touch]
  responsive: true
  tested-on: [360x800, 768x1024, 1440x900]
*/

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Card, CardBody, CardHeader } from './ui/Card'
import { Button } from './ui/Button'
import { Icons } from './ui/Icons'
import { translateError } from '../utils/translations'
import { StudentFormModal, StudentFormData, initialStudentFormData } from './StudentFormModal'
import { DisciplinesManagement } from './DisciplinesManagement'
import { useAuth } from '../contexts/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface ClassDetailsPageProps {
    turmaId: string
    onNavigate?: (page: string) => void
}

interface TurmaDetails {
    id: string
    nome: string
    ano_lectivo: string
    trimestre: number
    nivel_ensino: string
    codigo_turma: string
    capacidade_maxima: number
    total_alunos?: number
}

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
}

export const ClassDetailsPage: React.FC<ClassDetailsPageProps> = ({ turmaId, onNavigate }) => {
    const { isProfessor, isEscola } = useAuth()
    const [turma, setTurma] = useState<TurmaDetails | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Disciplines management state
    const [showDisciplinesManagement, setShowDisciplinesManagement] = useState(false)

    // Student management state
    const [showAddStudentModal, setShowAddStudentModal] = useState(false)
    const [showEditStudentModal, setShowEditStudentModal] = useState(false)
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
    const [showStudentsList, setShowStudentsList] = useState(false)
    const [students, setStudents] = useState<Aluno[]>([])
    const [loadingStudents, setLoadingStudents] = useState(false)
    const [selectedStudent, setSelectedStudent] = useState<Aluno | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [studentFormData, setStudentFormData] = useState<Partial<StudentFormData>>({})


    // Capacity editing state
    const [isEditingCapacity, setIsEditingCapacity] = useState(false)
    const [newCapacity, setNewCapacity] = useState<number>(40)
    const [savingCapacity, setSavingCapacity] = useState(false)

    // Export state
    const [exporting, setExporting] = useState(false)

    // Print config modal state
    const [showPrintConfigModal, setShowPrintConfigModal] = useState(false)
    const [printConfig, setPrintConfig] = useState({
        escolaEstatal: false,
        nivelEscola: '' as 'primario' | 'ii_ciclo' | '',
        nomeEscola: '',
        enderecoEscola: '',
        municipio: '',
        provincia: '',
        nomeDirPedagogico: '',
        nomeDirEscola: '',
        logoData: '' as string,
        logoType: 'PNG' as 'PNG' | 'JPEG',
    })

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const isPng = file.type === 'image/png'
        const isJpeg = file.type === 'image/jpeg'
        if (!isPng && !isJpeg) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const result = ev.target?.result as string
            setPrintConfig(c => ({ ...c, logoData: result, logoType: isPng ? 'PNG' : 'JPEG' }))
        }
        reader.readAsDataURL(file)
    }

    useEffect(() => {
        loadTurmaDetails()
    }, [turmaId])

    const loadTurmaDetails = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('turmas')
                .select(`
                    id,
                    nome,
                    ano_lectivo,
                    trimestre,
                    nivel_ensino,
                    codigo_turma,
                    capacidade_maxima,
                    alunos(count)
                `)
                .eq('id', turmaId)
                .single()

            if (error) throw error

            setTurma({
                ...data,
                total_alunos: data.alunos?.[0]?.count || 0
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes da turma')
        } finally {
            setLoading(false)
        }
    }

    const handleBack = () => {
        if (onNavigate) {
            onNavigate('classes')
        }
    }

    const handlePrintStudentList = () => {
        if (!turma || students.length === 0) return
        setShowPrintConfigModal(true)
    }

    const handleGeneratePDF = () => {
        if (!turma || students.length === 0) return
        setShowPrintConfigModal(false)
        setExporting(true)
        try {
            const doc = new jsPDF()
            const turmaNome = turma.nome
            const anoLectivo = turma.ano_lectivo || ''
            const date = new Date().toLocaleDateString('pt-AO')
            const pageWidth = doc.internal.pageSize.getWidth()
            let y = 15

            // Logo + School header
            const hasLogo = !!printConfig.logoData
            const logoSize = 24
            const logoX = 14
            const textX = hasLogo ? logoX + logoSize + 5 : pageWidth / 2
            const textAlign = hasLogo ? 'left' : 'center'

            if (hasLogo) {
                doc.addImage(printConfig.logoData, printConfig.logoType, logoX, y - 2, logoSize, logoSize)
            }

            if (printConfig.escolaEstatal) {
                // State school header hierarchy
                doc.setFontSize(11)
                doc.setFont('helvetica', 'bold')
                doc.text('REPÚBLICA DE ANGOLA', textX, y, { align: textAlign })
                y += 6

                // Governo Provincial — always for state schools
                if (printConfig.provincia) {
                    doc.setFontSize(9)
                    doc.setFont('helvetica', 'normal')
                    doc.text(`Governo Provincial de ${printConfig.provincia}`, textX, y, { align: textAlign })
                    y += 5
                }

                if (printConfig.nivelEscola === 'primario') {
                    if (printConfig.municipio) {
                        doc.setFontSize(9)
                        doc.setFont('helvetica', 'normal')
                        doc.text(`Administração Municipal de ${printConfig.municipio}`, textX, y, { align: textAlign })
                        y += 5
                    }
                } else if (printConfig.nivelEscola === 'ii_ciclo') {
                    if (printConfig.provincia) {
                        doc.setFontSize(9)
                        doc.setFont('helvetica', 'normal')
                        doc.text(`Direcção Provincial de Educação de ${printConfig.provincia}`, textX, y, { align: textAlign })
                        y += 5
                    }
                }

                if (printConfig.nomeEscola) {
                    doc.setFontSize(12)
                    doc.setFont('helvetica', 'bold')
                    doc.text(printConfig.nomeEscola, textX, y, { align: textAlign })
                    y += 6
                }
            } else {
                // Private / other school header
                if (printConfig.nomeEscola) {
                    doc.setFontSize(14)
                    doc.setFont('helvetica', 'bold')
                    doc.text(printConfig.nomeEscola.toUpperCase(), textX, y, { align: textAlign })
                    y += 7
                }
                if (printConfig.enderecoEscola) {
                    doc.setFontSize(9)
                    doc.setFont('helvetica', 'normal')
                    doc.text(printConfig.enderecoEscola, textX, y, { align: textAlign })
                    y += 5
                }
                if (printConfig.municipio || printConfig.provincia) {
                    doc.setFontSize(9)
                    doc.setFont('helvetica', 'normal')
                    const localidade = [printConfig.municipio, printConfig.provincia].filter(Boolean).join(' — ')
                    doc.text(localidade, textX, y, { align: textAlign })
                    y += 5
                }
            }

            // Ensure y clears the logo if it's taller than the text block
            if (hasLogo) {
                y = Math.max(y, 15 + logoSize + 3)
            }

            // Divider
            const hasHeader = !!(printConfig.nomeEscola || hasLogo || printConfig.escolaEstatal)
            if (hasHeader) {
                doc.setDrawColor(79, 70, 229)
                doc.setLineWidth(0.5)
                doc.line(14, y, pageWidth - 14, y)
                y += 8
            }

            // Document title
            doc.setFontSize(15)
            doc.setFont('helvetica', 'bold')
            doc.text('Lista de Alunos', pageWidth / 2, y, { align: 'center' })
            y += 9

            // Class info
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.text(`Turma: ${turmaNome}`, 14, y)
            if (anoLectivo) {
                doc.text(`Ano Lectivo: ${anoLectivo}`, pageWidth / 2, y, { align: 'center' })
            }
            doc.text(`Data de emissão: ${date}`, pageWidth - 14, y, { align: 'right' })
            y += 6
            doc.text(`Total de alunos: ${students.length}`, 14, y)
            y += 8

            // Table
            const tableData = students.map((aluno, index) => [
                String(index + 1),
                aluno.nome_completo,
                aluno.numero_processo,
            ])

            autoTable(doc, {
                startY: y,
                head: [['Nº', 'Nome Completo', 'Nº de Processo']],
                body: tableData,
                headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [248, 247, 255] },
                styles: { fontSize: 10, cellPadding: 3 },
                columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 40 } },
            })

            // Signatures
            const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
            const signatureY = Math.min(finalY + 20, doc.internal.pageSize.getHeight() - 45)

            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            doc.setDrawColor(100, 100, 100)
            doc.setLineWidth(0.3)

            // Signature block — Director Pedagógico / Director Administrativo
            const sig1X = 20
            const sig1Width = 75
            doc.line(sig1X, signatureY, sig1X + sig1Width, signatureY)
            doc.setFont('helvetica', 'bold')
            doc.text('Director Pedagógico / Director Administrativo', sig1X + sig1Width / 2, signatureY + 5, { align: 'center' })
            if (printConfig.nomeDirPedagogico) {
                doc.setFont('helvetica', 'normal')
                doc.text(printConfig.nomeDirPedagogico, sig1X + sig1Width / 2, signatureY + 10, { align: 'center' })
            }

            // Signature block — Director da Escola
            const sig2X = pageWidth - 20 - sig1Width
            doc.line(sig2X, signatureY, sig2X + sig1Width, signatureY)
            doc.setFont('helvetica', 'bold')
            doc.text('Director da Escola', sig2X + sig1Width / 2, signatureY + 5, { align: 'center' })
            if (printConfig.nomeDirEscola) {
                doc.setFont('helvetica', 'normal')
                doc.text(printConfig.nomeDirEscola, sig2X + sig1Width / 2, signatureY + 10, { align: 'center' })
            }

            const filename = `lista-alunos-${turmaNome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}_${date.replace(/\//g, '-')}.pdf`
            doc.save(filename)
        } catch (err) {
            console.error('Erro ao exportar PDF:', err)
        } finally {
            setExporting(false)
        }
    }

    const loadStudents = async () => {
        try {
            setLoadingStudents(true)
            const { data, error } = await supabase
                .from('alunos')
                .select('id, nome_completo, numero_processo, turma_id')
                .eq('turma_id', turmaId)
                .order('nome_completo')

            if (error) throw error
            setStudents(data || [])
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar alunos'
            setError(translateError(errorMessage))
        } finally {
            setLoadingStudents(false)
        }
    }

    const handleAddStudent = async (data: StudentFormData) => {
        setError(null)
        setSuccess(null)

        if (!data.nome_completo?.trim()) {
            setError('Por favor, preencha o nome completo do aluno.')
            throw new Error('Nome completo obrigatório')
        }
        if (!data.numero_processo?.trim()) {
            setError('O número de processo não foi gerado. Feche o modal e tente novamente.')
            throw new Error('Número de processo obrigatório')
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
            } = data

            const dataToSubmit = {
                ...studentData,
                turma_id: turmaId,
                genero: data.genero || null,
                data_nascimento: data.data_nascimento || null,
                tipo_documento: data.tipo_documento || null,
                numero_documento: data.numero_documento || null,
                nome_pai: data.nome_pai || null,
                nome_mae: data.nome_mae || null,
                nome_encarregado: data.nome_encarregado || null,
                parentesco_encarregado: data.parentesco_encarregado || null,
                telefone_encarregado: data.telefone_encarregado || null,
                email_encarregado: data.email_encarregado || null,
                profissao_encarregado: data.profissao_encarregado || null,
                provincia: data.provincia || null,
                municipio: data.municipio || null,
                bairro: data.bairro || null,
                rua: data.rua || null,
                endereco: data.endereco || null,
                naturalidade: data.naturalidade || null,
                nacionalidade: data.nacionalidade || null,
                escola_anterior: data.escola_anterior || null,
                classe_anterior: data.classe_anterior || null,
                observacoes_academicas: data.observacoes_academicas || null,
                ano_ingresso: data.ano_ingresso ? parseInt(data.ano_ingresso) : null,
                frequencia_anual: data.frequencia_anual ? parseFloat(data.frequencia_anual as string) : null,
                tipo_exame: data.tipo_exame || null,
            }

            // Insert the student record
            const { error: insertError } = await supabase
                .from('alunos')
                .insert(dataToSubmit)

            if (insertError) throw insertError

            // Build success message
            let successMsg = 'Aluno adicionado com sucesso!'
            if (email_aluno || data.email_encarregado) {
                successMsg += ' Use os botões de convite para gerar links de acesso.'
            }

            setSuccess(successMsg)
            setShowAddStudentModal(false)
            setStudentFormData({})

            // Reload turma details to update student count
            loadTurmaDetails()

            // If students list is visible, reload it
            if (showStudentsList) {
                loadStudents()
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao adicionar aluno'
            setError(translateError(errorMessage))
            throw err // Re-throw to keep modal open
        }
    }

    const handleListStudents = () => {
        const newShowState = !showStudentsList
        setShowStudentsList(newShowState)

        if (newShowState && students.length === 0) {
            loadStudents()
        }
    }

    const handleViewGrades = () => {
        if (onNavigate) {
            // Navigate to grades page - will need to be handled by parent component
            onNavigate('grades')
        }
    }

    const handleGenerateReport = () => {
        if (onNavigate) {
            // Navigate to reports page - will need to be handled by parent component
            onNavigate('reports')
        }
    }

    const handleEditStudent = (student: Aluno) => {
        setSelectedStudent(student)
        setStudentFormData({
            nome_completo: student.nome_completo || '',
            numero_processo: student.numero_processo || '',
            turma_id: student.turma_id || '',
            data_nascimento: student.data_nascimento || '',
            genero: (student.genero as '' | 'M' | 'F') || '',
            nacionalidade: student.nacionalidade || '',
            naturalidade: student.naturalidade || '',
            tipo_documento: student.tipo_documento || '',
            numero_documento: student.numero_documento || '',
            nome_pai: student.nome_pai || '',
            nome_mae: student.nome_mae || '',
            nome_encarregado: student.nome_encarregado || '',
            parentesco_encarregado: student.parentesco_encarregado || '',
            telefone_encarregado: student.telefone_encarregado || '',
            email_encarregado: student.email_encarregado || '',
            profissao_encarregado: student.profissao_encarregado || '',
            provincia: student.provincia || '',
            municipio: student.municipio || '',
            bairro: student.bairro || '',
            rua: student.rua || '',
            endereco: student.endereco || '',
            ano_ingresso: student.ano_ingresso?.toString() || '',
            escola_anterior: student.escola_anterior || '',
            classe_anterior: student.classe_anterior || '',
            observacoes_academicas: student.observacoes_academicas || '',
        })
        setShowEditStudentModal(true)
    }

    const handleUpdateStudent = async (data: StudentFormData) => {
        if (!selectedStudent) return

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
            } = data

            const dataToUpdate = {
                ...studentData,
                genero: data.genero || null,
                ano_ingresso: data.ano_ingresso ? parseInt(data.ano_ingresso) : null,
            }

            const { error: updateError } = await supabase
                .from('alunos')
                .update(dataToUpdate)
                .eq('id', selectedStudent.id)

            if (updateError) throw updateError

            setSuccess('Aluno atualizado com sucesso!')
            setShowEditStudentModal(false)
            setSelectedStudent(null)
            setStudentFormData({})

            // Reload students list
            loadStudents()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar aluno'
            setError(translateError(errorMessage))
            throw err // Re-throw to keep modal open
        }
    }

    const handleDeleteClick = (student: Aluno) => {
        setSelectedStudent(student)
        setShowDeleteConfirmModal(true)
    }

    const handleConfirmDelete = async () => {
        if (!selectedStudent) return

        setError(null)
        setSuccess(null)

        try {
            const { error: deleteError } = await supabase
                .from('alunos')
                .delete()
                .eq('id', selectedStudent.id)

            if (deleteError) throw deleteError

            setSuccess('Aluno removido com sucesso!')
            setShowDeleteConfirmModal(false)
            setSelectedStudent(null)

            // Reload turma details to update student count
            loadTurmaDetails()

            // Reload students list
            loadStudents()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao remover aluno'
            setError(translateError(errorMessage))
            setShowDeleteConfirmModal(false)
        }
    }

    const getStudentInitials = (name: string) => {
        const names = name.trim().split(' ')
        if (names.length === 1) return names[0].substring(0, 2).toUpperCase()
        return (names[0][0] + names[names.length - 1][0]).toUpperCase()
    }

    const handleUpdateCapacity = async () => {
        if (!turma || newCapacity < 1) return

        setError(null)
        setSuccess(null)
        setSavingCapacity(true)

        try {
            const { error: updateError } = await supabase
                .from('turmas')
                .update({ capacidade_maxima: newCapacity })
                .eq('id', turmaId)

            if (updateError) throw updateError

            setSuccess('Capacidade da turma atualizada com sucesso!')
            setIsEditingCapacity(false)

            // Reload turma details to reflect the change
            await loadTurmaDetails()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar capacidade'
            setError(translateError(errorMessage))
        } finally {
            setSavingCapacity(false)
        }
    }

    const handleStartEditCapacity = () => {
        if (turma) {
            setNewCapacity(turma.capacidade_maxima)
            setIsEditingCapacity(true)
        }
    }

    const handleCancelEditCapacity = () => {
        setIsEditingCapacity(false)
        if (turma) {
            setNewCapacity(turma.capacidade_maxima)
        }
    }

    // Filter students based on search query
    const filteredStudents = students.filter(student =>
        student.nome_completo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.numero_processo.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center animate-fade-in">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-primary-600"></div>
                    <p className="mt-4 text-slate-500 font-medium animate-pulse">Carregando detalhes...</p>
                </div>
            </div>
        )
    }

    if (error || !turma) {
        return (
            <div className="space-y-4 animate-fade-in">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-slate-500 hover:text-primary-600 font-medium transition-colors min-h-touch"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Voltar
                </button>
                <Card className="border-red-100 shadow-red-100/50">
                    <CardBody className="text-center py-12">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Erro ao carregar turma</h3>
                        <p className="text-slate-500 mb-6 max-w-md mx-auto">{error}</p>
                        <Button variant="primary" onClick={handleBack}>
                            Voltar para Turmas
                        </Button>
                    </CardBody>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6 md:space-y-8 pb-8 animate-fade-in">
            {/* Header with Back Button */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleBack}
                    className="min-h-touch min-w-touch flex items-center justify-center text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-primary-600 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-indigo-500/20 flex-shrink-0">
                        {turma.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight truncate">{turma.nome}</h2>
                        <p className="text-slate-500 text-sm md:text-base">Detalhes e gestão da turma</p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center shadow-sm animate-slide-down">
                    <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{error}</span>
                </div>
            )}
            {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center shadow-sm animate-slide-down">
                    <Icons.Check />
                    <span className="ml-2 font-medium">{success}</span>
                </div>
            )}

            {/* Turma Information Card */}
            <Card className="border-0 shadow-md shadow-slate-200/50 overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">Informações Gerais</h3>
                    </div>
                </CardHeader>
                <CardBody className="p-5 md:p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Código</label>
                            <p className="text-base font-bold text-slate-900 mt-1.5">{turma.codigo_turma}</p>
                        </div>
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ano Lectivo</label>
                            <p className="text-base font-bold text-slate-900 mt-1.5">{turma.ano_lectivo}</p>
                        </div>
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Trimestre</label>
                            <p className="text-base font-bold text-slate-900 mt-1.5">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-sm font-bold bg-primary-100 text-primary-700">
                                    {turma.trimestre}º Trimestre
                                </span>
                            </p>
                        </div>
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nível</label>
                            <p className="text-base font-bold text-slate-900 mt-1.5">{turma.nivel_ensino}</p>
                        </div>
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Alunos</label>
                            <p className="text-base font-bold text-slate-900 mt-1.5">
                                <span className="text-2xl">{turma.total_alunos}</span>
                                <span className="text-slate-400 text-sm ml-1">/ {turma.capacidade_maxima}</span>
                            </p>
                        </div>
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 col-span-2 md:col-span-1">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Capacidade</label>
                                {!isProfessor && !isEditingCapacity && (
                                    <button
                                        onClick={handleStartEditCapacity}
                                        className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all duration-200"
                                        title="Editar capacidade"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {isEditingCapacity && !isProfessor ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            max="200"
                                            value={newCapacity}
                                            onChange={(e) => setNewCapacity(parseInt(e.target.value) || 1)}
                                            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                            disabled={savingCapacity}
                                        />
                                        <span className="text-sm text-slate-600">alunos</span>
                                    </div>
                                    {newCapacity < (turma.total_alunos || 0) && (
                                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                            <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <p className="text-xs text-amber-800">
                                                A capacidade não pode ser menor que o número atual de alunos ({turma.total_alunos})
                                            </p>
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            onClick={handleUpdateCapacity}
                                            disabled={savingCapacity || newCapacity < (turma.total_alunos || 0) || newCapacity < 1}
                                            className="flex-1"
                                        >
                                            {savingCapacity ? 'Salvando...' : 'Salvar'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCancelEditCapacity}
                                            disabled={savingCapacity}
                                            className="flex-1"
                                        >
                                            Cancelar
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-2">
                                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${(turma.total_alunos || 0) / turma.capacidade_maxima > 0.9
                                                ? 'bg-gradient-to-r from-red-500 to-orange-500'
                                                : 'bg-gradient-to-r from-primary-500 to-indigo-500'
                                                }`}
                                            style={{ width: `${Math.min((turma.total_alunos || 0) / turma.capacidade_maxima * 100, 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">
                                        {turma.capacidade_maxima} vagas no total • {turma.capacidade_maxima - (turma.total_alunos || 0)} disponíveis
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </CardBody>
            </Card>

            {/* Quick Actions */}
            <Card className="border-0 shadow-md shadow-slate-200/50 overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">Ações Rápidas</h3>
                    </div>
                </CardHeader>
                <CardBody className="p-5 md:p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                        {!isProfessor && (
                            <button
                                onClick={() => setShowAddStudentModal(true)}
                                className="group p-4 bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-primary-500/10 rounded-2xl text-center transition-all duration-300 hover:-translate-y-1"
                            >
                                <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-500/30 group-hover:scale-110 transition-transform">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <span className="text-sm font-bold text-slate-700 group-hover:text-primary-600">Adicionar Aluno</span>
                            </button>
                        )}
                        <button
                            onClick={handleViewGrades}
                            className="group p-4 bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-green-500/10 rounded-2xl text-center transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-500/30 group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                            </div>
                            <span className="text-sm font-bold text-slate-700 group-hover:text-green-600">Ver Notas</span>
                        </button>
                        <button
                            onClick={handleListStudents}
                            className="group p-4 bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-violet-500/10 rounded-2xl text-center transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-500/30 group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            </div>
                            <span className="text-sm font-bold text-slate-700 group-hover:text-violet-600">
                                {showStudentsList ? 'Ocultar' : 'Alunos'}
                            </span>
                        </button>
                        <button
                            onClick={handleGenerateReport}
                            className="group p-4 bg-white border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-rose-500/10 rounded-2xl text-center transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-500/30 group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <span className="text-sm font-bold text-slate-700 group-hover:text-rose-600">Relatório</span>
                        </button>

                        {/* Disciplines Management — escola only */}
                        {isEscola && (
                            <button
                                onClick={() => setShowDisciplinesManagement(prev => !prev)}
                                className={`group p-4 border shadow-sm hover:shadow-lg rounded-2xl text-center transition-all duration-300 hover:-translate-y-1 ${showDisciplinesManagement ? 'bg-cyan-50 border-cyan-200 shadow-cyan-500/10' : 'bg-white border-slate-100 hover:shadow-cyan-500/10'}`}
                            >
                                <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 group-hover:scale-110 transition-transform">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                </div>
                                <span className="text-sm font-bold text-slate-700 group-hover:text-cyan-600">
                                    {showDisciplinesManagement ? 'Ocultar' : 'Disciplinas'}
                                </span>
                            </button>
                        )}
                    </div>
                </CardBody>
            </Card>


            {/* Disciplines Management - Conditionally shown for escola */}
            {showDisciplinesManagement && isEscola && turma && (
                <div className="animate-slide-up">
                    <DisciplinesManagement
                        turmaId={turmaId}
                        turmaNome={turma.nome}
                        nivelEnsino={turma.nivel_ensino}
                        onClose={() => setShowDisciplinesManagement(false)}
                    />
                </div>
            )}

            {/* Students List - Conditionally shown */}
            {showStudentsList && (
                <Card className="border-0 shadow-md shadow-slate-200/50 overflow-hidden animate-slide-up">
                    <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-violet-500/20">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Alunos da Turma</h3>
                                    <p className="text-sm text-slate-500">{students.length} aluno{students.length !== 1 && 's'} matriculado{students.length !== 1 && 's'}</p>
                                </div>
                            </div>
                            {students.length > 0 && (
                                <div className="flex items-center gap-2 flex-1 sm:justify-end">
                                    <div className="relative flex-1 sm:max-w-xs">
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Pesquisar aluno..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all bg-white shadow-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={handlePrintStudentList}
                                        disabled={exporting}
                                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm disabled:opacity-50"
                                        title="Imprimir lista de alunos"
                                    >
                                        {exporting ? (
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-600" />
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                            </svg>
                                        )}
                                        <span className="hidden sm:inline">{exporting ? 'Exportando...' : 'Imprimir'}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardBody className="p-5 md:p-6">
                        {loadingStudents ? (
                            <div className="text-center py-12">
                                <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-primary-600"></div>
                                <p className="mt-3 text-slate-500 font-medium">Carregando alunos...</p>
                            </div>
                        ) : students.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                </div>
                                <h4 className="text-lg font-bold text-slate-800 mb-2">Nenhum aluno nesta turma</h4>
                                <p className="text-slate-500 mb-6">Adicione o primeiro aluno para começar</p>
                                {!isProfessor && (
                                    <Button variant="primary" onClick={() => setShowAddStudentModal(true)}>
                                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Adicionar Primeiro Aluno
                                    </Button>
                                )}
                            </div>
                        ) : filteredStudents.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <h4 className="text-lg font-bold text-slate-800 mb-2">Nenhum aluno encontrado</h4>
                                <p className="text-slate-500">Tente pesquisar com outros termos</p>
                            </div>
                        ) : (
                            <>
                                {/* Premium Card View for All Screens */}
                                <div className="space-y-3">
                                    {filteredStudents.map((aluno) => (
                                        <div
                                            key={aluno.id}
                                            className="group relative bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-xl p-4 transition-all duration-200 hover:shadow-md hover:border-primary-300 hover:-translate-y-0.5"
                                        >
                                            <div className="flex items-center gap-4">
                                                {/* Avatar with Initials */}
                                                <div className="flex-shrink-0">
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:shadow-lg transition-shadow">
                                                        {getStudentInitials(aluno.nome_completo)}
                                                    </div>
                                                </div>

                                                {/* Student Info */}
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-slate-900 text-base truncate">
                                                        {aluno.nome_completo}
                                                    </h4>
                                                    <p className="text-sm text-slate-500 mt-0.5">
                                                        Nº {aluno.numero_processo}
                                                    </p>
                                                </div>

                                                {/* Action Buttons */}
                                                {!isProfessor && (
                                                    <div className="flex-shrink-0 flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleEditStudent(aluno)}
                                                            className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all duration-200 min-h-touch min-w-touch flex items-center justify-center"
                                                            title="Editar aluno"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteClick(aluno)}
                                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 min-h-touch min-w-touch flex items-center justify-center"
                                                            title="Remover aluno"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 pt-4 border-t border-slate-200">
                                    <p className="text-sm text-slate-600">
                                        {searchQuery ? (
                                            <>
                                                Mostrando {filteredStudents.length} de {students.length} {students.length === 1 ? 'aluno' : 'alunos'}
                                            </>
                                        ) : (
                                            <>
                                                Total: {students.length} {students.length === 1 ? 'aluno' : 'alunos'}
                                            </>
                                        )}
                                    </p>
                                </div>
                            </>
                        )}
                    </CardBody>
                </Card>
            )}

            {/* Add Student Modal */}
            <StudentFormModal
                isOpen={showAddStudentModal}
                onClose={() => {
                    setShowAddStudentModal(false)
                    setStudentFormData({})
                }}
                onSubmit={handleAddStudent}
                title="Adicionar Aluno"
                submitLabel="Adicionar Aluno"
                turmaId={turmaId}
                turmaNome={turma.nome}
            />

            {/* Edit Student Modal */}
            <StudentFormModal
                isOpen={showEditStudentModal && selectedStudent !== null}
                onClose={() => {
                    setShowEditStudentModal(false)
                    setSelectedStudent(null)
                    setStudentFormData({})
                }}
                onSubmit={handleUpdateStudent}
                initialData={studentFormData}
                title="Editar Aluno"
                submitLabel="Salvar Alterações"
                turmaId={turmaId}
                turmaNome={turma.nome}
            />

            {/* Print Configuration Modal */}
            {showPrintConfigModal && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                    <Card className="w-full md:max-w-lg md:rounded-2xl rounded-t-2xl rounded-b-none md:rounded-b-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
                        <CardHeader className="border-b border-slate-100 p-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Configurar Cabeçalho do Documento</h3>
                                    <p className="text-sm text-slate-500 mt-0.5">Preencha os dados que aparecerão no documento impresso</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardBody className="p-5 space-y-5">
                            {/* School Info */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dados da Escola</h4>

                                {/* Logo upload */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Logomarca da Instituição</label>
                                    <div className="flex items-center gap-4">
                                        {printConfig.logoData ? (
                                            <div className="relative flex-shrink-0">
                                                <img
                                                    src={printConfig.logoData}
                                                    alt="Logomarca"
                                                    className="w-16 h-16 object-contain rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setPrintConfig(c => ({ ...c, logoData: '', logoType: 'PNG' }))}
                                                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow"
                                                    title="Remover logomarca"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                                {printConfig.logoData ? 'Alterar imagem' : 'Carregar logomarca'}
                                                <input
                                                    type="file"
                                                    accept="image/png,image/jpeg"
                                                    className="hidden"
                                                    onChange={handleLogoUpload}
                                                />
                                            </label>
                                            <p className="text-xs text-slate-400 mt-1.5">PNG ou JPEG · Recomendado: fundo transparente</p>
                                        </div>
                                    </div>
                                </div>

                                {/* School type toggle */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Escola</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPrintConfig(c => ({ ...c, escolaEstatal: false, nivelEscola: '' }))}
                                            className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${!printConfig.escolaEstatal
                                                ? 'bg-primary-600 text-white border-primary-600 shadow-md shadow-primary-500/20'
                                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                        >
                                            Escola Privada
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPrintConfig(c => ({ ...c, escolaEstatal: true }))}
                                            className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${printConfig.escolaEstatal
                                                ? 'bg-primary-600 text-white border-primary-600 shadow-md shadow-primary-500/20'
                                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                        >
                                            Escola Estatal
                                        </button>
                                    </div>
                                </div>

                                {/* Level selector — state schools only */}
                                {printConfig.escolaEstatal && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Nível de Ensino</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setPrintConfig(c => ({ ...c, nivelEscola: 'primario' }))}
                                                className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${printConfig.nivelEscola === 'primario'
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                            >
                                                Ensino Primário
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPrintConfig(c => ({ ...c, nivelEscola: 'ii_ciclo' }))}
                                                className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-all ${printConfig.nivelEscola === 'ii_ciclo'
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                            >
                                                II Ciclo
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Header preview */}
                                {(printConfig.escolaEstatal || printConfig.nomeEscola) && (
                                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pré-visualização do Cabeçalho</p>
                                        <div className="text-center space-y-0.5 font-mono text-xs text-slate-700 leading-relaxed">
                                            {printConfig.escolaEstatal && (
                                                <p className="font-bold text-slate-900">REPÚBLICA DE ANGOLA</p>
                                            )}
                                            {printConfig.escolaEstatal && printConfig.provincia && (
                                                <p>Governo Provincial de {printConfig.provincia}</p>
                                            )}
                                            {printConfig.escolaEstatal && printConfig.nivelEscola === 'primario' && printConfig.municipio && (
                                                <p>Administração Municipal de {printConfig.municipio}</p>
                                            )}
                                            {printConfig.escolaEstatal && printConfig.nivelEscola === 'ii_ciclo' && printConfig.provincia && (
                                                <p>Direcção Provincial de Educação de {printConfig.provincia}</p>
                                            )}
                                            {printConfig.nomeEscola && (
                                                <p className={printConfig.escolaEstatal ? 'font-semibold' : 'font-bold uppercase'}>
                                                    {printConfig.nomeEscola}
                                                </p>
                                            )}
                                            {!printConfig.escolaEstatal && printConfig.enderecoEscola && (
                                                <p className="text-slate-500">{printConfig.enderecoEscola}</p>
                                            )}
                                            {!printConfig.escolaEstatal && (printConfig.municipio || printConfig.provincia) && (
                                                <p className="text-slate-500">
                                                    {[printConfig.municipio, printConfig.provincia].filter(Boolean).join(' — ')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Province — shown for all state schools and private */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Província</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Luanda"
                                        value={printConfig.provincia}
                                        onChange={(e) => setPrintConfig(c => ({ ...c, provincia: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                    />
                                </div>

                                {/* Municipality — shown for Primário and private */}
                                {(!printConfig.escolaEstatal || printConfig.nivelEscola === 'primario') && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Município
                                            {printConfig.escolaEstatal && <span className="ml-1 text-slate-400 font-normal">(obrigatório para Ensino Primário)</span>}
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Viana"
                                            value={printConfig.municipio}
                                            onChange={(e) => setPrintConfig(c => ({ ...c, municipio: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                        />
                                    </div>
                                )}

                                {/* School name */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Escola</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Escola Primária do Sambizanga..."
                                        value={printConfig.nomeEscola}
                                        onChange={(e) => setPrintConfig(c => ({ ...c, nomeEscola: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                    />
                                </div>

                                {/* Address — private only */}
                                {!printConfig.escolaEstatal && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Endereço / Localização <span className="text-slate-400 font-normal">(opcional)</span></label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Rua Principal, nº 123"
                                            value={printConfig.enderecoEscola}
                                            onChange={(e) => setPrintConfig(c => ({ ...c, enderecoEscola: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Signatures */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assinaturas</h4>
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                    <p className="text-xs text-slate-500 mb-3">Os campos de nome são opcionais. Caso preenchidos, aparecerão abaixo da linha de assinatura.</p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Nome do Director Pedagógico / Director Administrativo
                                                <span className="ml-1 text-slate-400 font-normal">(opcional)</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: João da Silva"
                                                value={printConfig.nomeDirPedagogico}
                                                onChange={(e) => setPrintConfig(c => ({ ...c, nomeDirPedagogico: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                                Nome do Director da Escola
                                                <span className="ml-1 text-slate-400 font-normal">(opcional)</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ex: Maria Fernandes"
                                                value={printConfig.nomeDirEscola}
                                                onChange={(e) => setPrintConfig(c => ({ ...c, nomeDirEscola: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all bg-white"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowPrintConfigModal(false)}
                                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleGeneratePDF}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-primary-600 rounded-xl hover:from-indigo-700 hover:to-primary-700 transition-all shadow-md shadow-indigo-500/20"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    Gerar PDF
                                </button>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirmModal && selectedStudent && (
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
                                    <h3 className="text-lg font-semibold text-slate-900">Remover Aluno</h3>
                                    <p className="text-sm text-slate-600 mt-0.5">Esta ação não pode ser desfeita</p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardBody>
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <p className="text-sm text-slate-600 mb-2">Você está prestes a remover:</p>
                                    <p className="font-semibold text-slate-900">{selectedStudent.nome_completo}</p>
                                    <p className="text-sm text-slate-600 mt-1">Nº {selectedStudent.numero_processo}</p>
                                </div>

                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex gap-2">
                                        <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p className="text-sm text-amber-800">
                                            Todos os dados do aluno, incluindo notas e histórico, serão permanentemente removidos.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            setShowDeleteConfirmModal(false)
                                            setSelectedStudent(null)
                                        }}
                                        className="flex-1"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        onClick={handleConfirmDelete}
                                        className="flex-1"
                                    >
                                        Remover Aluno
                                    </Button>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            )}
        </div>
    )
}
