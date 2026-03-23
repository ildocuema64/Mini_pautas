/*
component-meta:
  name: TeachersPage
  description: Page for managing teachers/professores
  tokens: [--color-primary, --fs-md, min-h-touch]
  responsive: true
  tested-on: [360x800, 768x1024, 1440x900]
*/

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Card, CardBody, CardHeader } from './ui/Card'
import { Input } from './ui/Input'
import { Icons } from './ui/Icons'
import { translateError } from '../utils/translations'
import { ConfirmModal } from './ui/ConfirmModal'
import { useAuth } from '../contexts/AuthContext'
import { Professor } from '../types'


interface TeachersPageProps {
    onNavigate?: (page: string) => void
    searchQuery?: string
}
export const TeachersPage: React.FC<TeachersPageProps> = ({ onNavigate: _onNavigate, searchQuery = '' }) => {

    const { escolaProfile } = useAuth()
    const [professores, setProfessores] = useState<Professor[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showConfirmDelete, setShowConfirmDelete] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [selectedProfessorId, setSelectedProfessorId] = useState<string | null>(null)
    const [professorToDelete, setProfessorToDelete] = useState<string | null>(null)

    const [activeTab, setActiveTab] = useState<'pessoal' | 'profissional' | 'endereco'>('pessoal')

    // Form data
    const [formData, setFormData] = useState({
        // Pessoal
        nome_completo: '',
        data_nascimento: '',
        genero: '' as '' | 'M' | 'F',
        estado_civil: '',
        numero_bi: '',
        nome_pai: '',
        nome_mae: '',
        nacionalidade: 'Angolana',
        naturalidade: '',

        // Profissional
        email: '',
        telefone: '',
        numero_agente: '',
        categoria_docente: '',
        grau_academico: '',
        area_formacao: '',
        especialidade: '',
        data_inicio_funcoes: '',
        categoria_laboral: '',
        numero_seguranca_social: '',

        // Endereço e Bancários
        provincia_residencia: '',
        municipio_residencia: '',
        bairro_residencia: '',
        endereco_completo: '',
        iban: '',
        banco: '',
    })

    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (escolaProfile) {
            loadProfessores()
        }
    }, [escolaProfile])

    const optionalTextOrNull = (value: string) => {
        const trimmed = value.trim()
        return trimmed.length ? trimmed : null
    }

    const handleCopyInvite = (professor: Professor) => {
        const origin = window.location.origin
        const inviteLink = `${origin}/register-professor?email=${encodeURIComponent(professor.email)}`

        navigator.clipboard.writeText(inviteLink).then(() => {
            setSuccess('Link de convite copiado para a área de transferência!')
            setTimeout(() => setSuccess(null), 3000)
        }).catch(() => {
            setError('Erro ao copiar link. Tente manualmente.')
        })
    }

    const loadProfessores = async () => {
        if (!escolaProfile) return

        try {
            setLoading(true)
            setError(null)

            const { data, error } = await supabase
                .from('professores')
                .select('*')
                .eq('escola_id', escolaProfile.id)
                .order('nome_completo', { ascending: true })

            if (error) throw error

            setProfessores(data || [])
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar professores'
            setError(translateError(errorMessage))
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!escolaProfile) return

        setError(null)
        setSuccess(null)
        setSubmitting(true)

        try {
            // Validate required fields
            if (!formData.nome_completo) {
                throw new Error('Nome é obrigatório')
            }

            const professorData = {
                // Pessoal
                nome_completo: formData.nome_completo.trim(),
                data_nascimento: optionalTextOrNull(formData.data_nascimento),
                genero: optionalTextOrNull(formData.genero),
                estado_civil: optionalTextOrNull(formData.estado_civil),
                numero_bi: optionalTextOrNull(formData.numero_bi),
                nome_pai: optionalTextOrNull(formData.nome_pai),
                nome_mae: optionalTextOrNull(formData.nome_mae),
                nacionalidade: optionalTextOrNull(formData.nacionalidade),
                naturalidade: optionalTextOrNull(formData.naturalidade),

                // Profissional
                email: formData.email.trim(),
                telefone: optionalTextOrNull(formData.telefone),
                numero_agente: optionalTextOrNull(formData.numero_agente),
                categoria_docente: optionalTextOrNull(formData.categoria_docente),
                grau_academico: optionalTextOrNull(formData.grau_academico),
                area_formacao: optionalTextOrNull(formData.area_formacao),
                especialidade: optionalTextOrNull(formData.especialidade),
                data_inicio_funcoes: optionalTextOrNull(formData.data_inicio_funcoes),
                categoria_laboral: optionalTextOrNull(formData.categoria_laboral),
                numero_seguranca_social: optionalTextOrNull(formData.numero_seguranca_social),

                // Endereço e Bancários
                provincia_residencia: optionalTextOrNull(formData.provincia_residencia),
                municipio_residencia: optionalTextOrNull(formData.municipio_residencia),
                bairro_residencia: optionalTextOrNull(formData.bairro_residencia),
                endereco_completo: optionalTextOrNull(formData.endereco_completo),
                iban: optionalTextOrNull(formData.iban),
                banco: optionalTextOrNull(formData.banco),
            }

            if (editMode && selectedProfessorId) {
                // Update existing professor
                const { error: updateError } = await supabase
                    .from('professores')
                    .update(professorData)
                    .eq('id', selectedProfessorId)

                if (updateError) throw updateError
                setSuccess('Professor atualizado com sucesso!')
            } else {
                // Create new professor
                const { error: insertError } = await supabase
                    .from('professores')
                    .insert({
                        escola_id: escolaProfile.id,
                        ativo: true,
                        funcoes: ['Docente'],
                        ...professorData
                    })

                if (insertError) {
                    throw insertError
                }

                setSuccess('Professor cadastrado com sucesso!')
            }

            setShowModal(false)
            resetForm()
            loadProfessores()
        } catch (err) {
            console.error('Erro ao salvar professor:', err)
            const errorMessage = err instanceof Error ? err.message : 'Erro ao salvar professor'
            setError(translateError(errorMessage))
        } finally {
            setSubmitting(false)
        }
    }

    const resetForm = () => {
        setEditMode(false)
        setSelectedProfessorId(null)
        setActiveTab('pessoal')
        setFormData({
            nome_completo: '',
            data_nascimento: '',
            genero: '',
            estado_civil: '',
            numero_bi: '',
            nome_pai: '',
            nome_mae: '',
            nacionalidade: 'Angolana',
            naturalidade: '',
            email: '',
            telefone: '',
            numero_agente: '',
            categoria_docente: '',
            grau_academico: '',
            area_formacao: '',
            especialidade: '',
            data_inicio_funcoes: '',
            categoria_laboral: '',
            numero_seguranca_social: '',
            provincia_residencia: '',
            municipio_residencia: '',
            bairro_residencia: '',
            endereco_completo: '',
            iban: '',
            banco: '',
        })
    }

    const handleEdit = (professor: Professor) => {
        setEditMode(true)
        setSelectedProfessorId(professor.id)
        setFormData({
            nome_completo: professor.nome_completo,
            data_nascimento: professor.data_nascimento || '',
            genero: professor.genero || '',
            estado_civil: professor.estado_civil || '',
            numero_bi: professor.numero_bi || '',
            nome_pai: professor.nome_pai || '',
            nome_mae: professor.nome_mae || '',
            nacionalidade: professor.nacionalidade || 'Angolana',
            naturalidade: professor.naturalidade || '',
            email: professor.email,
            telefone: professor.telefone || '',
            numero_agente: professor.numero_agente || '',
            categoria_docente: professor.categoria_docente || '',
            grau_academico: professor.grau_academico || '',
            area_formacao: professor.area_formacao || '',
            especialidade: professor.especialidade || '',
            data_inicio_funcoes: professor.data_inicio_funcoes || '',
            categoria_laboral: professor.categoria_laboral || '',
            numero_seguranca_social: professor.numero_seguranca_social || '',
            provincia_residencia: professor.provincia_residencia || '',
            municipio_residencia: professor.municipio_residencia || '',
            bairro_residencia: professor.bairro_residencia || '',
            endereco_completo: professor.endereco_completo || '',
            iban: professor.iban || '',
            banco: professor.banco || '',
        })
        setShowModal(true)
    }

    const handleDeleteClick = (id: string) => {
        setProfessorToDelete(id)
        setShowConfirmDelete(true)
    }

    const handleConfirmDelete = async () => {
        if (!professorToDelete) return

        try {
            const { error } = await supabase
                .from('professores')
                .delete()
                .eq('id', professorToDelete)

            if (error) throw error

            setSuccess('Professor removido com sucesso!')
            setShowConfirmDelete(false)
            setProfessorToDelete(null)
            loadProfessores()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Erro ao remover professor'
            setError(translateError(errorMessage))
            setShowConfirmDelete(false)
            setProfessorToDelete(null)
        }
    }

    // Filter professores based on search query
    const filteredProfessores = professores.filter(prof =>
        prof.nome_completo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prof.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        prof.especialidade?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (loading) {
        return (
            <div className="space-y-6 animate-fade-in pb-24 md:pb-6">
                {/* Header Skeleton */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="skeleton w-12 h-12 rounded-xl"></div>
                        <div>
                            <div className="skeleton h-7 w-32 mb-2 rounded-lg"></div>
                            <div className="skeleton h-4 w-48 rounded"></div>
                        </div>
                    </div>
                    <div className="skeleton h-10 w-36 rounded-xl"></div>
                </div>
                {/* Grid Skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="card p-4">
                            <div className="flex items-start gap-3 mb-4">
                                <div className="skeleton w-12 h-12 rounded-xl"></div>
                                <div className="flex-1">
                                    <div className="skeleton h-5 w-32 mb-2 rounded"></div>
                                    <div className="skeleton h-3 w-40 rounded"></div>
                                </div>
                            </div>
                            <div className="space-y-2 mb-4">
                                <div className="skeleton h-10 w-full rounded-lg"></div>
                                <div className="skeleton h-10 w-full rounded-lg"></div>
                            </div>
                            <div className="flex gap-2">
                                <div className="skeleton h-10 flex-1 rounded-xl"></div>
                                <div className="skeleton h-10 w-10 rounded-xl"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4 md:space-y-6 pb-24 md:pb-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Icons.User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold text-slate-900">Professores</h2>
                        <p className="text-sm text-slate-500">Gerencie o corpo docente da escola</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        resetForm()
                        setShowModal(true)
                    }}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-xl transition-all duration-200 shadow-md shadow-blue-500/25 min-h-touch touch-feedback w-full sm:w-auto"
                >
                    <Icons.UserPlus className="w-5 h-5" />
                    <span>Novo Professor</span>
                </button>
            </div>

            {/* Messages */}
            {success && (
                <div className="alert alert-success animate-slide-down">
                    <Icons.Check />
                    <span className="ml-2 text-sm">{success}</span>
                </div>
            )}

            {error && (
                <div className="alert alert-error animate-slide-down">
                    <span className="ml-2 text-sm">{error}</span>
                </div>
            )}

            {/* Empty State */}
            {!loading && filteredProfessores.length === 0 && !error ? (
                <Card>
                    <CardBody className="text-center py-12 md:py-16 px-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Icons.User className="w-10 h-10 text-slate-400" />
                        </div>
                        <h3 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">
                            {searchQuery ? 'Nenhum professor encontrado' : 'Nenhum professor cadastrado'}
                        </h3>
                        <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                            {searchQuery ? 'Tente pesquisar com outros termos' : 'Cadastre os professores para vinculá-los às turmas e disciplinas'}
                        </p>
                        {!searchQuery && (
                            <button
                                onClick={() => setShowModal(true)}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-xl transition-all duration-200 shadow-md shadow-blue-500/25 min-h-touch touch-feedback"
                            >
                                <Icons.UserPlus className="w-5 h-5" />
                                Cadastrar Professor
                            </button>
                        )}
                    </CardBody>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
                    {filteredProfessores.map((prof, index) => (
                        <Card key={prof.id} className="hover:shadow-lg transition-all duration-300 touch-feedback">
                            <CardBody className="p-4">
                                {/* Header with Avatar and Status */}
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center text-lg font-bold text-slate-600 flex-shrink-0">
                                        {prof.nome_completo.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-semibold text-slate-900 truncate">{prof.nome_completo}</h3>
                                        <p className="text-xs text-slate-500 truncate">{prof.email}</p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${prof.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {prof.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${prof.user_id ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {prof.user_id ? 'Registado' : 'Pendente'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="space-y-2 mb-4">
                                    {prof.categoria_docente && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                                            <Icons.Award className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                            <span className="text-sm text-slate-700 truncate">{prof.categoria_docente.replace(/_/g, ' ')}</span>
                                        </div>
                                    )}
                                    {prof.especialidade && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                                            <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                            </svg>
                                            <span className="text-sm text-slate-700 truncate">{prof.especialidade}</span>
                                        </div>
                                    )}
                                    {prof.telefone && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                                            <Icons.Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                            <span className="text-sm text-slate-700">{prof.telefone}</span>
                                        </div>
                                    )}
                                    {prof.numero_agente && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                                            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                                            </svg>
                                            <span className="text-sm text-slate-700">Nº {prof.numero_agente}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 pt-3 border-t border-slate-100">
                                    <button
                                        onClick={() => handleEdit(prof)}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all duration-200 touch-feedback min-h-touch"
                                    >
                                        <Icons.Edit className="w-4 h-4" />
                                        <span>Editar</span>
                                    </button>

                                    {!prof.user_id && (
                                        <button
                                            onClick={() => handleCopyInvite(prof)}
                                            className="flex items-center justify-center px-3 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl transition-all duration-200 touch-feedback min-h-touch"
                                            title="Copiar link de convite"
                                        >
                                            <Icons.Link className="w-4 h-4" />
                                        </button>
                                    )}

                                    <button
                                        onClick={() => handleDeleteClick(prof.id)}
                                        className="flex items-center justify-center px-3 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl transition-all duration-200 touch-feedback min-h-touch"
                                    >
                                        <Icons.Trash className="w-4 h-4" />
                                    </button>
                                </div>
                            </CardBody>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
                    <Card className="w-full md:max-w-md md:rounded-2xl rounded-t-2xl rounded-b-none md:rounded-b-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
                        {/* Drag Handle - Mobile Only */}
                        <div className="md:hidden flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 bg-slate-300 rounded-full" />
                        </div>
                        <CardHeader className="border-b border-slate-100">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                                        {editMode ? (
                                            <Icons.Edit className="w-5 h-5 text-white" />
                                        ) : (
                                            <Icons.UserPlus className="w-5 h-5 text-white" />
                                        )}
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-900">{editMode ? 'Editar Professor' : 'Novo Professor'}</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowModal(false)
                                        resetForm()
                                    }}
                                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors touch-feedback"
                                >
                                    <Icons.X className="w-5 h-5" />
                                </button>
                            </div>
                        </CardHeader>
                        <CardBody className="p-0">
                            <div className="flex border-b border-slate-100">
                                <button
                                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'pessoal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                    onClick={() => setActiveTab('pessoal')}
                                >
                                    Pessoal
                                </button>
                                <button
                                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'profissional' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                    onClick={() => setActiveTab('profissional')}
                                >
                                    Profissional
                                </button>
                                <button
                                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'endereco' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                                    onClick={() => setActiveTab('endereco')}
                                >
                                    Endereço & Banco
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-4 space-y-4">
                                {activeTab === 'pessoal' && (
                                    <div className="space-y-4 animate-fade-in">
                                        <Input
                                            label="Nome Completo *"
                                            type="text"
                                            value={formData.nome_completo}
                                            onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                                            placeholder="Ex: João da Silva"
                                            required
                                        />

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
                                            <Input
                                                label="Número do BI"
                                                type="text"
                                                value={formData.numero_bi}
                                                onChange={(e) => setFormData({ ...formData, numero_bi: e.target.value })}
                                                placeholder="000000000PO000"
                                            />
                                            <div>
                                                <label className="form-label">Estado Civil</label>
                                                <select
                                                    value={formData.estado_civil}
                                                    onChange={(e) => setFormData({ ...formData, estado_civil: e.target.value })}
                                                    className="form-input min-h-touch"
                                                >
                                                    <option value="">Selecione</option>
                                                    <option value="Solteiro">Solteiro(a)</option>
                                                    <option value="Casado">Casado(a)</option>
                                                    <option value="Divorciado">Divorciado(a)</option>
                                                    <option value="Viúvo">Viúvo(a)</option>
                                                    <option value="União de Facto">União de Facto</option>
                                                </select>
                                            </div>
                                        </div>

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

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Input
                                                label="Nacionalidade"
                                                type="text"
                                                value={formData.nacionalidade}
                                                onChange={(e) => setFormData({ ...formData, nacionalidade: e.target.value })}
                                            />
                                            <Input
                                                label="Naturalidade"
                                                type="text"
                                                value={formData.naturalidade}
                                                onChange={(e) => setFormData({ ...formData, naturalidade: e.target.value })}
                                                placeholder="Província de nascimento"
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'profissional' && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="form-label">Categoria Docente</label>
                                                <select
                                                    value={formData.categoria_docente}
                                                    onChange={(e) => setFormData({ ...formData, categoria_docente: e.target.value })}
                                                    className="form-input min-h-touch"
                                                >
                                                    <option value="">Selecione</option>
                                                    <option value="PROFESSOR_TITULAR">Professor Titular</option>
                                                    <option value="PROFESSOR_AUXILIAR">Professor Auxiliar</option>
                                                    <option value="PROFESSOR_ESTAGIARIO">Professor Estagiário</option>
                                                    <option value="PROFESSOR_CONTRATADO">Professor Contratado</option>
                                                    <option value="MONITOR">Monitor</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Categoria Laboral</label>
                                                <select
                                                    value={formData.categoria_laboral}
                                                    onChange={(e) => setFormData({ ...formData, categoria_laboral: e.target.value })}
                                                    className="form-input min-h-touch"
                                                >
                                                    <option value="">Selecione</option>
                                                    <option value="Quadro Definitivo">Quadro Definitivo</option>
                                                    <option value="Contratado">Contratado</option>
                                                    <option value="Colaborador">Colaborador</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Input
                                                label="Número de Agente"
                                                type="text"
                                                value={formData.numero_agente}
                                                onChange={(e) => setFormData({ ...formData, numero_agente: e.target.value })}
                                                placeholder="Nº Agente"
                                            />
                                            <Input
                                                label="Número INSS"
                                                type="text"
                                                value={formData.numero_seguranca_social}
                                                onChange={(e) => setFormData({ ...formData, numero_seguranca_social: e.target.value })}
                                                placeholder="Nº Segurança Social"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Input
                                                label="Email"
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                placeholder="email@exemplo.com"
                                                required
                                            />
                                            <Input
                                                label="Telefone"
                                                type="tel"
                                                value={formData.telefone}
                                                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                                                placeholder="+244 9..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="form-label">Grau Académico</label>
                                                <select
                                                    value={formData.grau_academico}
                                                    onChange={(e) => setFormData({ ...formData, grau_academico: e.target.value })}
                                                    className="form-input min-h-touch"
                                                >
                                                    <option value="">Selecione</option>
                                                    <option value="DOUTORADO">Doutoramento</option>
                                                    <option value="MESTRADO">Mestrado</option>
                                                    <option value="LICENCIATURA">Licenciatura</option>
                                                    <option value="BACHARELATO">Bacharelato</option>
                                                    <option value="TECNICO_MEDIO">Técnico Médio</option>
                                                    <option value="TECNICO_BASICO">Técnico Básico</option>
                                                    <option value="SEM_FORMACAO">Sem Formação Superior</option>
                                                </select>
                                            </div>
                                            <Input
                                                label="Data Início Funções"
                                                type="date"
                                                value={formData.data_inicio_funcoes}
                                                onChange={(e) => setFormData({ ...formData, data_inicio_funcoes: e.target.value })}
                                            />
                                        </div>

                                        <Input
                                            label="Área de Formação"
                                            type="text"
                                            value={formData.area_formacao}
                                            onChange={(e) => setFormData({ ...formData, area_formacao: e.target.value })}
                                            placeholder="Ex: Matemática"
                                            list="areas-formacao-list"
                                        />
                                        <Input
                                            label="Especialidade (Disciplinas)"
                                            type="text"
                                            value={formData.especialidade}
                                            onChange={(e) => setFormData({ ...formData, especialidade: e.target.value })}
                                            placeholder="Ex: Matemática, Física"
                                        />
                                    </div>
                                )}

                                {activeTab === 'endereco' && (
                                    <div className="space-y-4 animate-fade-in">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Input
                                                label="Província"
                                                type="text"
                                                value={formData.provincia_residencia}
                                                onChange={(e) => setFormData({ ...formData, provincia_residencia: e.target.value })}
                                            />
                                            <Input
                                                label="Município"
                                                type="text"
                                                value={formData.municipio_residencia}
                                                onChange={(e) => setFormData({ ...formData, municipio_residencia: e.target.value })}
                                            />
                                        </div>
                                        <Input
                                            label="Bairro"
                                            type="text"
                                            value={formData.bairro_residencia}
                                            onChange={(e) => setFormData({ ...formData, bairro_residencia: e.target.value })}
                                        />
                                        <Input
                                            label="Endereço Completo"
                                            type="text"
                                            value={formData.endereco_completo}
                                            onChange={(e) => setFormData({ ...formData, endereco_completo: e.target.value })}
                                            placeholder="Rua, Nº Casa, Ponto de ref."
                                        />

                                        <div className="border-t border-slate-100 pt-4 mt-2">
                                            <h4 className="text-sm font-medium text-slate-900 mb-3">Dados Bancários</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <Input
                                                    label="Banco"
                                                    type="text"
                                                    value={formData.banco}
                                                    onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                                                    placeholder="Nome do Banco"
                                                />
                                                <Input
                                                    label="IBAN"
                                                    type="text"
                                                    value={formData.iban}
                                                    onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                                                    placeholder="AO06..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowModal(false)
                                            resetForm()
                                        }}
                                        className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-all duration-200 touch-feedback min-h-touch"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-xl transition-all duration-200 shadow-md shadow-blue-500/25 disabled:opacity-50 touch-feedback min-h-touch"
                                    >
                                        {submitting ? (
                                            <>
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                A guardar...
                                            </>
                                        ) : (
                                            editMode ? 'Salvar' : 'Cadastrar'
                                        )}
                                    </button>
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
                    setProfessorToDelete(null)
                }}
                onConfirm={handleConfirmDelete}
                title="Remover Professor?"
                message="Tem certeza que deseja remover este professor? Isso pode afetar turmas e histórico."
                confirmText="Sim, Remover"
                cancelText="Cancelar"
                variant="danger"
            />
        </div>
    )
}
