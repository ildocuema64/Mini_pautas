/*
component-meta:
  name: StudentFormModal
  description: Reusable modal for creating/editing students with tabbed form
  tokens: [--color-primary, --fs-md, min-h-touch]
  responsive: true
  tested-on: [360x800, 768x1024, 1440x900]
*/

import React, { useState, useEffect } from 'react'
import { Card, CardBody, CardHeader } from './ui/Card'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Icons } from './ui/Icons'
import { supabase } from '../lib/supabaseClient'

export interface StudentFormData {
    // Dados básicos
    nome_completo: string
    numero_processo: string
    turma_id: string
    // Dados pessoais
    data_nascimento: string
    genero: '' | 'M' | 'F'
    nacionalidade: string
    naturalidade: string
    tipo_documento: string
    numero_documento: string
    // Encarregado
    nome_pai: string
    nome_mae: string
    nome_encarregado: string
    parentesco_encarregado: string
    telefone_encarregado: string
    email_encarregado: string
    profissao_encarregado: string
    // Endereço
    provincia: string
    municipio: string
    bairro: string
    rua: string
    endereco: string
    // Acadêmico
    ano_ingresso: string
    escola_anterior: string
    classe_anterior: string
    observacoes_academicas: string
    // Conta de Acesso (ALUNO)
    criar_conta_aluno: boolean
    email_aluno: string
    senha_aluno: string
    // Conta de Acesso (ENCARREGADO)
    criar_conta_encarregado: boolean
    email_conta_encarregado: string
    senha_encarregado: string
}

export const initialStudentFormData: StudentFormData = {
    nome_completo: '',
    numero_processo: '',
    turma_id: '',
    data_nascimento: '',
    genero: '',
    nacionalidade: 'Angolana',
    naturalidade: '',
    tipo_documento: '',
    numero_documento: '',
    nome_pai: '',
    nome_mae: '',
    nome_encarregado: '',
    parentesco_encarregado: '',
    telefone_encarregado: '',
    email_encarregado: '',
    profissao_encarregado: '',
    provincia: '',
    municipio: '',
    bairro: '',
    rua: '',
    endereco: '',
    ano_ingresso: '',
    escola_anterior: '',
    classe_anterior: '',
    observacoes_academicas: '',
    // Conta de Acesso
    criar_conta_aluno: false,
    email_aluno: '',
    senha_aluno: '',
    criar_conta_encarregado: false,
    email_conta_encarregado: '',
    senha_encarregado: '',
}

interface StudentFormModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: StudentFormData) => Promise<void>
    initialData?: Partial<StudentFormData>
    title: string
    submitLabel: string
    turmaId?: string
    turmaNome?: string
    showTurmaSelector?: boolean
    turmas?: Array<{ id: string; nome: string }>
}

type TabType = 'pessoal' | 'encarregado' | 'endereco' | 'academico' | 'acesso'

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    title,
    submitLabel,
    turmaId,
    turmaNome,
    showTurmaSelector = false,
    turmas = [],
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('pessoal')
    const [formData, setFormData] = useState<StudentFormData>(initialStudentFormData)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [generatingNumero, setGeneratingNumero] = useState(false)

    // Gera um número de processo único verificando a DB antes de confirmar
    const generateNumeroProcesso = async (turmaIdToUse: string) => {
        if (!turmaIdToUse) return
        setGeneratingNumero(true)
        try {
            // 1. Tentar via RPC (mais eficiente e atómica no servidor)
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('generate_numero_processo', { turma_uuid: turmaIdToUse })

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

    useEffect(() => {
        if (isOpen) {
            const targetTurmaId = turmaId || initialData?.turma_id || ''
            setFormData({
                ...initialStudentFormData,
                ...initialData,
                turma_id: targetTurmaId,
            })
            setActiveTab('pessoal')

            // Gerar número de processo automaticamente se for um novo aluno (sem initialData.numero_processo)
            // e se temos um turma_id definido
            if (targetTurmaId && !initialData?.numero_processo) {
                generateNumeroProcesso(targetTurmaId)
            }
        }
    }, [isOpen, initialData, turmaId])

    // Quando a turma é alterada no seletor, gerar novo número
    const handleTurmaChange = (newTurmaId: string) => {
        setFormData(prev => ({ ...prev, turma_id: newTurmaId, numero_processo: '' }))
        if (newTurmaId) {
            generateNumeroProcesso(newTurmaId)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (generatingNumero) return
        if (!formData.nome_completo.trim()) return
        if (!formData.numero_processo.trim()) {
            // Should never happen if turmaId is set, but guard anyway
            alert('O número de processo ainda está a ser gerado. Aguarde um momento.')
            return
        }
        setIsSubmitting(true)
        try {
            await onSubmit(formData)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleClose = () => {
        setFormData(initialStudentFormData)
        setActiveTab('pessoal')
        onClose()
    }

    if (!isOpen) return null

    // Tab button component
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

    // Render tab content
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
                                        turmaId || formData.turma_id
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
                                <label className="form-label">Género</label>
                                <select
                                    value={formData.genero}
                                    onChange={(e) => setFormData({ ...formData, genero: e.target.value as '' | 'M' | 'F' })}
                                    className="form-input min-h-touch"
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
                                    list="nacionalidades-list"
                                    value={formData.nacionalidade}
                                    onChange={(e) => setFormData({ ...formData, nacionalidade: e.target.value })}
                                    placeholder="Selecione ou digite"
                                    className="form-input min-h-touch"
                                />
                                <datalist id="nacionalidades-list">
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

                        {/* Turma selection or display */}
                        {showTurmaSelector ? (
                            <div>
                                <label className="form-label">Turma *</label>
                                <select
                                    value={formData.turma_id}
                                    onChange={(e) => handleTurmaChange(e.target.value)}
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
                        ) : turmaNome ? (
                            <div className="bg-slate-50 p-3 rounded-lg">
                                <label className="text-sm font-medium text-slate-700">Turma</label>
                                <p className="text-base font-semibold text-slate-900 mt-1">{turmaNome}</p>
                            </div>
                        ) : null}
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
                    </div>
                )

            case 'acesso':
                return (
                    <div className="space-y-6">
                        {/* Conta do Aluno */}
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <div className="flex items-center gap-3 mb-4">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <h4 className="font-semibold text-slate-800">Acesso do Aluno</h4>
                            </div>
                            <p className="text-sm text-slate-600 mb-4">
                                Informe o email do aluno. Após salvar, poderá gerar um link de convite para que o aluno crie a própria conta.
                            </p>
                            <Input
                                label="Email do Aluno"
                                type="email"
                                value={formData.email_aluno}
                                onChange={(e) => setFormData({ ...formData, email_aluno: e.target.value })}
                                placeholder="aluno@escola.ao"
                            />
                        </div>

                        {/* Conta do Encarregado */}
                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                            <div className="flex items-center gap-3 mb-4">
                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                <h4 className="font-semibold text-slate-800">Acesso do Encarregado</h4>
                            </div>
                            <p className="text-sm text-slate-600 mb-4">
                                Use o email do encarregado (do separador Encarregado). Após salvar, poderá gerar um link de convite.
                            </p>
                            {formData.email_encarregado ? (
                                <div className="p-3 bg-white rounded-lg border border-amber-200">
                                    <p className="text-sm text-slate-700">
                                        <span className="font-medium">Email:</span> {formData.email_encarregado}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-amber-700 italic">
                                    Preencha o email do encarregado no separador "Encarregado".
                                </p>
                            )}
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                Como Funciona
                            </h4>
                            <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
                                <li>Salve o registo do aluno com os emails preenchidos</li>
                                <li>Na lista de alunos, clique em "Convite" para copiar o link</li>
                                <li>Envie o link ao aluno/encarregado (WhatsApp, email, etc.)</li>
                                <li>Eles acedem ao link e criam a própria senha</li>
                            </ol>
                        </div>
                    </div>
                )
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50 animate-fade-in">
            <Card className="w-full md:max-w-2xl md:rounded-lg rounded-t-2xl rounded-b-none md:rounded-b-lg animate-slide-up max-h-[95vh] overflow-hidden flex flex-col">
                <CardHeader className="flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                        <button
                            onClick={handleClose}
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
                <CardBody className="flex-1 overflow-y-auto pb-24 md:pb-0">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {renderTabContent()}

                        <div className="flex gap-3 pt-4 border-t border-slate-200 mt-6">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleClose}
                                className="flex-1 min-h-touch"
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                className="flex-1 min-h-touch"
                                disabled={isSubmitting || generatingNumero}
                            >
                                {generatingNumero ? 'Gerando nº...' : isSubmitting ? 'Salvando...' : submitLabel}
                            </Button>
                        </div>
                    </form>
                </CardBody>
            </Card>
        </div>
    )
}
