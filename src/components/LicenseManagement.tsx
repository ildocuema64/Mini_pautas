/**
 * @component LicenseManagement
 * @description Gestão de licenças moderna mobile-first para SUPERADMIN
 * @tokens [--color-primary, --gradient-primary, --shadow-elevation-2]
 * @responsive true
 * @tested-on [375x667, 768x1024, 1440x900]
 */

import React, { useEffect, useState } from 'react'
import {
    fetchAllLicenses,
    fetchLicenseStats,
    createManualLicense,
    suspendLicense,
    reactivateLicense,
    fetchPrices,
    updatePrice,
    fetchPendingApprovals,
    approveManualSubscription,
    rejectManualSubscription
} from '../utils/license'
import { fetchAllEscolas } from '../utils/superadmin'
import { PriceEditModal } from './PriceEditModal'
import type { Licenca, LicenseStats, PlanoLicenca, Escola, PrecoLicenca, TransacaoPagamento } from '../types'

export const LicenseManagement: React.FC = () => {
    const [licenses, setLicenses] = useState<Licenca[]>([])
    const [stats, setStats] = useState<LicenseStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterPlano, setFilterPlano] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')

    // Create Modal
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [escolas, setEscolas] = useState<Escola[]>([])
    const [selectedEscola, setSelectedEscola] = useState<string>('')
    const [selectedPlano, setSelectedPlano] = useState<PlanoLicenca>('anual')
    const [customValor, setCustomValor] = useState<string>('')
    const [createMotivo, setCreateMotivo] = useState('')
    const [creating, setCreating] = useState(false)

    // Suspend Modal
    const [showSuspendModal, setShowSuspendModal] = useState(false)
    const [suspendingLicense, setSuspendingLicense] = useState<Licenca | null>(null)
    const [suspendMotivo, setSuspendMotivo] = useState('')

    // Price Management
    const [prices, setPrices] = useState<PrecoLicenca[]>([])
    const [showPriceEditModal, setShowPriceEditModal] = useState(false)
    const [editingPrice, setEditingPrice] = useState<PrecoLicenca | null>(null)

    // Pending Approvals
    const [pendingApprovals, setPendingApprovals] = useState<TransacaoPagamento[]>([])
    const [showApprovalModal, setShowApprovalModal] = useState(false)
    const [approvingTransaction, setApprovingTransaction] = useState<TransacaoPagamento | null>(null)
    const [approvalPlano, setApprovalPlano] = useState<PlanoLicenca>('anual')
    const [approvalMotivo, setApprovalMotivo] = useState('')
    const [approving, setApproving] = useState(false)

    // Reject Modal
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [rejectingTransaction, setRejectingTransaction] = useState<TransacaoPagamento | null>(null)
    const [rejectMotivo, setRejectMotivo] = useState('')

    useEffect(() => {
        loadData()
    }, [filterStatus, filterPlano])

    const loadData = async () => {
        try {
            setLoading(true)
            setError(null)

            const filters: Record<string, string> = {}
            if (filterStatus !== 'all') filters.estado = filterStatus
            if (filterPlano !== 'all') filters.plano = filterPlano

            const [licensesData, statsData, pricesData, pendingData] = await Promise.all([
                fetchAllLicenses(filters),
                fetchLicenseStats(),
                fetchPrices(),
                fetchPendingApprovals()
            ])
            setPrices(pricesData)
            setLicenses(licensesData)
            setStats(statsData)
            setPendingApprovals(pendingData)
        } catch (err) {
            console.error('Error loading data:', err)
            setError('Erro ao carregar dados de licenciamento')
        } finally {
            setLoading(false)
        }
    }

    const handleOpenCreateModal = async () => {
        try {
            const escolasData = await fetchAllEscolas()
            setEscolas(escolasData)
            setShowCreateModal(true)
        } catch (err) {
            alert('Erro ao carregar escolas')
        }
    }

    const handleCreateLicense = async () => {
        if (!selectedEscola) {
            alert('Seleccione uma escola')
            return
        }

        try {
            setCreating(true)
            const valor = customValor ? parseFloat(customValor) : undefined
            await createManualLicense(selectedEscola, selectedPlano, valor, createMotivo)
            setShowCreateModal(false)
            setSelectedEscola('')
            setSelectedPlano('anual')
            setCustomValor('')
            setCreateMotivo('')
            await loadData()
        } catch (err) {
            alert('Erro ao criar licença')
        } finally {
            setCreating(false)
        }
    }

    const handleSuspend = async () => {
        if (!suspendingLicense || !suspendMotivo.trim()) {
            alert('Por favor, forneça um motivo')
            return
        }

        try {
            await suspendLicense(suspendingLicense.id, suspendMotivo)
            setShowSuspendModal(false)
            setSuspendingLicense(null)
            setSuspendMotivo('')
            await loadData()
        } catch (err) {
            alert('Erro ao suspender licença')
        }
    }

    const handleReactivate = async (licenca: Licenca) => {
        if (!confirm('Reactivar esta licença?')) return

        try {
            await reactivateLicense(licenca.id)
            await loadData()
        } catch (err) {
            alert('Erro ao reactivar licença')
        }
    }

    const handleApprove = async () => {
        if (!approvingTransaction) return

        try {
            setApproving(true)
            const result = await approveManualSubscription(
                approvingTransaction.id,
                approvalPlano,
                approvalMotivo
            )

            if (result.success) {
                setShowApprovalModal(false)
                setApprovingTransaction(null)
                setApprovalMotivo('')
                await loadData()
            } else {
                alert(result.error || 'Erro ao aprovar assinatura')
            }
        } catch (err) {
            alert('Erro ao aprovar assinatura')
        } finally {
            setApproving(false)
        }
    }

    const handleReject = async () => {
        if (!rejectingTransaction || !rejectMotivo.trim()) {
            alert('Por favor, forneça um motivo')
            return
        }

        try {
            await rejectManualSubscription(rejectingTransaction.id, rejectMotivo)
            setShowRejectModal(false)
            setRejectingTransaction(null)
            setRejectMotivo('')
            await loadData()
        } catch (err) {
            alert('Erro ao rejeitar solicitação')
        }
    }

    const filteredLicenses = licenses.filter(license => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        const escola = (license as any).escolas
        return (
            escola?.nome?.toLowerCase().includes(query) ||
            escola?.codigo_escola?.toLowerCase().includes(query)
        )
    })

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-AO', {
            style: 'currency',
            currency: 'AOA',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value)
    }

    const formatCurrencyShort = (value: number) => {
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(1)}M Kz`
        }
        if (value >= 1000) {
            return `${(value / 1000).toFixed(0)}K Kz`
        }
        return `${value} Kz`
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('pt-AO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-50 pb-24 md:pb-8">
                {/* Header Skeleton */}
                <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-cyan-800 text-white px-4 py-6 md:px-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <div className="h-8 w-48 bg-white/20 rounded-lg animate-pulse mb-2"></div>
                            <div className="h-4 w-32 bg-white/10 rounded animate-pulse"></div>
                        </div>
                        <div className="h-10 w-32 bg-white/20 rounded-xl animate-pulse"></div>
                    </div>
                </div>
                <div className="px-4 md:px-8 -mt-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 animate-pulse">
                                <div className="h-4 w-16 bg-neutral-200 rounded mb-2"></div>
                                <div className="h-8 w-12 bg-neutral-200 rounded"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-neutral-50 pb-24 md:pb-8">
            {/* Header with Gradient */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-cyan-800 text-white px-4 py-6 md:px-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2"></div>
                </div>

                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="animate-fade-in">
                        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
                            <span className="text-3xl">📋</span>
                            <span className="truncate">Gestão de Licenças</span>
                        </h1>
                        <p className="text-emerald-100 mt-1 text-sm md:text-base">
                            Gerir licenças e subscrições
                        </p>
                    </div>
                    <button
                        onClick={handleOpenCreateModal}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-medium transition-all touch-feedback backdrop-blur-sm self-start md:self-auto"
                    >
                        <span className="text-lg">+</span>
                        <span>Nova Licença</span>
                    </button>
                </div>
            </div>

            <div className="px-4 md:px-8 -mt-4 space-y-4">
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 animate-fade-in">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">⚠️</span>
                            <p className="text-red-800 text-sm flex-1">{error}</p>
                            <button onClick={loadData} className="text-red-600 font-medium text-sm">Retry</button>
                        </div>
                    </div>
                )}

                {/* Pending Approvals Section */}
                {pendingApprovals.length > 0 && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-5 animate-slide-up">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                                    <span className="text-2xl">⏳</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-amber-900">Aprovações Pendentes</h3>
                                    <p className="text-sm text-amber-700">{pendingApprovals.length} solicitação(ões) aguardando aprovação</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {pendingApprovals.map((trans) => {
                                const escola = (trans as any).escolas
                                return (
                                    <div key={trans.id} className="bg-white rounded-xl p-4 border border-amber-200">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                            <div className="flex-1">
                                                <p className="font-bold text-neutral-800">{escola?.nome || 'N/A'}</p>
                                                <p className="text-sm text-neutral-500 font-mono">{escola?.codigo_escola}</p>
                                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium capitalize">
                                                        {trans.metadata?.plano || 'N/A'}
                                                    </span>
                                                    <span className="px-2 py-1 bg-neutral-100 text-neutral-700 rounded-full font-mono">
                                                        {trans.metadata?.reference || 'N/A'}
                                                    </span>
                                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
                                                        {formatCurrency(trans.valor)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        setApprovingTransaction(trans)
                                                        setApprovalPlano((trans.metadata?.plano as PlanoLicenca) || 'anual')
                                                        setShowApprovalModal(true)
                                                    }}
                                                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium text-sm transition-colors"
                                                >
                                                    ✓ Aprovar
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setRejectingTransaction(trans)
                                                        setShowRejectModal(true)
                                                    }}
                                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-sm transition-colors"
                                                >
                                                    ✗ Rejeitar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Stats Dashboard - Improved Mobile Layout */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 animate-slide-up">
                        <StatCard icon="📊" title="Total" value={stats.total_licencas} color="primary" />
                        <StatCard icon="✅" title="Activas" value={stats.licencas_ativas} color="green" />
                        <StatCard icon="⏰" title="Expiradas" value={stats.licencas_expiradas} color="yellow" />
                        <StatCard icon="🚫" title="Suspensas" value={stats.licencas_suspensas} color="red" />
                        <div className="col-span-2 md:col-span-1">
                            <StatCard icon="💰" title="Receita" value={formatCurrencyShort(stats.receita_ano)} color="purple" isText />
                        </div>
                    </div>
                )}

                {/* Pricing Configuration - Improved Cards */}
                <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
                    <h2 className="text-base md:text-lg font-bold text-neutral-800 mb-3 flex items-center gap-2">
                        <span>💳</span>
                        Planos de Preços
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {prices.map((price, index) => (
                            <div
                                key={price.id}
                                className="relative bg-white rounded-2xl p-4 border-2 border-neutral-100 hover:border-emerald-200 hover:shadow-lg transition-all"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <button
                                    onClick={() => {
                                        setEditingPrice(price)
                                        setShowPriceEditModal(true)
                                    }}
                                    className="absolute top-3 right-3 p-2 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="Editar preço"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                                <h3 className="text-base font-bold text-neutral-800 capitalize">{price.plano}</h3>
                                <p className="text-xl md:text-2xl font-extrabold text-emerald-600 mt-1 truncate">{formatCurrency(price.valor)}</p>
                                {price.desconto_percentual > 0 && (
                                    <span className="inline-block mt-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                        -{price.desconto_percentual}%
                                    </span>
                                )}
                                <p className="text-xs text-neutral-500 mt-2 line-clamp-2">{price.descricao}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Filters - Improved Mobile */}
                <div className="bg-white rounded-2xl p-3 shadow-sm border border-neutral-100 animate-slide-up" style={{ animationDelay: '150ms' }}>
                    <div className="flex flex-col gap-3">
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">🔍</span>
                            <input
                                type="text"
                                placeholder="Pesquisar escola..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-11 pr-4 py-2.5 border-0 bg-neutral-50 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                            />
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="flex-1 min-w-[120px] px-3 py-2 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                            >
                                <option value="all">Todos Estados</option>
                                <option value="ativa">✅ Activas</option>
                                <option value="expirada">⏰ Expiradas</option>
                                <option value="suspensa">🚫 Suspensas</option>
                                <option value="cancelada">❌ Canceladas</option>
                            </select>
                            <select
                                value={filterPlano}
                                onChange={(e) => setFilterPlano(e.target.value)}
                                className="flex-1 min-w-[120px] px-3 py-2 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                            >
                                <option value="all">Todos Planos</option>
                                <option value="trimestral">Trimestral</option>
                                <option value="semestral">Semestral</option>
                                <option value="anual">Anual</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* License List */}
                <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
                    {/* Mobile Cards - Improved Layout */}
                    <div className="md:hidden space-y-3">
                        {filteredLicenses.map((license, index) => {
                            const escola = (license as any).escolas
                            return (
                                <div
                                    key={license.id}
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-neutral-100 animate-slide-up"
                                    style={{ animationDelay: `${index * 30}ms` }}
                                >
                                    <div className="flex justify-between items-start gap-2 mb-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-neutral-800 truncate">{escola?.nome || 'N/A'}</p>
                                            <p className="text-xs text-neutral-500 font-mono">{escola?.codigo_escola}</p>
                                        </div>
                                        <EstadoBadge estado={license.estado} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                        <div className="bg-neutral-50 rounded-lg p-2">
                                            <p className="text-neutral-500 text-xs">Plano</p>
                                            <p className="font-semibold capitalize text-sm">{license.plano}</p>
                                        </div>
                                        <div className="bg-neutral-50 rounded-lg p-2">
                                            <p className="text-neutral-500 text-xs">Valor</p>
                                            <p className="font-semibold text-sm truncate">{formatCurrencyShort(license.valor)}</p>
                                        </div>
                                    </div>
                                    <div className="bg-neutral-50 rounded-lg p-2 mb-3">
                                        <p className="text-neutral-500 text-xs">Validade</p>
                                        <p className="font-medium text-sm">{formatDate(license.data_inicio)} → {formatDate(license.data_fim)}</p>
                                    </div>
                                    <div className="flex gap-2 pt-3 border-t border-neutral-100">
                                        {license.estado === 'ativa' ? (
                                            <button
                                                onClick={() => {
                                                    setSuspendingLicense(license)
                                                    setShowSuspendModal(true)
                                                }}
                                                className="flex-1 py-2.5 text-sm text-red-600 bg-red-50 rounded-xl font-medium touch-feedback"
                                            >
                                                Suspender
                                            </button>
                                        ) : license.estado === 'suspensa' ? (
                                            <button
                                                onClick={() => handleReactivate(license)}
                                                className="flex-1 py-2.5 text-sm text-green-600 bg-green-50 rounded-xl font-medium touch-feedback"
                                            >
                                                Reactivar
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            )
                        })}

                        {filteredLicenses.length === 0 && (
                            <div className="text-center py-12 bg-white rounded-2xl shadow-sm border border-neutral-100">
                                <div className="w-16 h-16 mx-auto mb-4 bg-neutral-100 rounded-full flex items-center justify-center">
                                    <span className="text-3xl">📋</span>
                                </div>
                                <p className="text-neutral-700 font-medium">Nenhuma licença encontrada</p>
                                <p className="text-neutral-500 text-sm mt-2 px-6">
                                    {pendingApprovals.length > 0
                                        ? `Existem ${pendingApprovals.length} solicitação(ões) pendentes acima. Após aprovar, a licença aparece nesta lista.`
                                        : 'Pedidos de subscrição só criam licença depois da aprovação. Use "Nova Licença" para criar manualmente.'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="table-excel w-full">
                                <thead>
                                    <tr>
                                        <th className="text-left">Escola</th>
                                        <th className="text-center">Plano</th>
                                        <th className="text-left">Validade</th>
                                        <th className="text-right">Valor</th>
                                        <th className="text-center">Estado</th>
                                        <th className="text-right">Acções</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLicenses.map((license) => {
                                        const escola = (license as any).escolas
                                        return (
                                            <tr key={license.id} className="hover:bg-neutral-50 transition-colors">
                                                <td className="text-left">
                                                    <div className="font-medium text-neutral-800">{escola?.nome || 'N/A'}</div>
                                                    <div className="text-xs text-neutral-500 font-mono">{escola?.codigo_escola}</div>
                                                </td>
                                                <td className="text-center">
                                                    <PlanoBadge plano={license.plano} />
                                                </td>
                                                <td className="text-left text-sm text-neutral-600">
                                                    {formatDate(license.data_inicio)} - {formatDate(license.data_fim)}
                                                </td>
                                                <td className="text-right text-sm font-semibold text-neutral-800">
                                                    {formatCurrency(license.valor)}
                                                </td>
                                                <td className="text-center">
                                                    <EstadoBadge estado={license.estado} />
                                                </td>
                                                <td className="text-right">
                                                    {license.estado === 'ativa' ? (
                                                        <button
                                                            onClick={() => {
                                                                setSuspendingLicense(license)
                                                                setShowSuspendModal(true)
                                                            }}
                                                            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                                                        >
                                                            Suspender
                                                        </button>
                                                    ) : license.estado === 'suspensa' ? (
                                                        <button
                                                            onClick={() => handleReactivate(license)}
                                                            className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg font-medium transition-colors"
                                                        >
                                                            Reactivar
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {filteredLicenses.length === 0 && (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 mx-auto mb-4 bg-neutral-100 rounded-full flex items-center justify-center">
                                    <span className="text-3xl">📋</span>
                                </div>
                                <p className="text-neutral-700 font-medium">Nenhuma licença encontrada</p>
                                <p className="text-neutral-500 text-sm mt-2">
                                    {pendingApprovals.length > 0
                                        ? `Existem ${pendingApprovals.length} solicitação(ões) pendentes acima. Após aprovar, a licença aparece nesta lista.`
                                        : 'Pedidos de subscrição só criam licença depois da aprovação. Use "Nova Licença" para criar manualmente.'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Create License Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-3xl p-6 md:mx-4 animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="w-12 h-1 bg-neutral-300 rounded-full mx-auto mb-4 md:hidden" />

                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                                <span className="text-2xl">✨</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-neutral-800">Nova Licença</h2>
                                <p className="text-sm text-neutral-500">Criar licença manualmente</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-2">Escola *</label>
                                <select
                                    value={selectedEscola}
                                    onChange={(e) => setSelectedEscola(e.target.value)}
                                    className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                                >
                                    <option value="">Seleccione uma escola</option>
                                    {escolas.map(escola => (
                                        <option key={escola.id} value={escola.id}>
                                            {escola.nome} ({escola.codigo_escola})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-2">Plano *</label>
                                <select
                                    value={selectedPlano}
                                    onChange={(e) => setSelectedPlano(e.target.value as PlanoLicenca)}
                                    className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                                >
                                    {prices.length > 0 ? (
                                        prices.map(price => (
                                            <option key={price.id} value={price.plano}>
                                                {price.plano.charAt(0).toUpperCase() + price.plano.slice(1)} ({formatCurrency(price.valor)})
                                            </option>
                                        ))
                                    ) : (
                                        <>
                                            <option value="trimestral">Trimestral</option>
                                            <option value="semestral">Semestral</option>
                                            <option value="anual">Anual</option>
                                        </>
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-2">Valor Personalizado</label>
                                <input
                                    type="number"
                                    value={customValor}
                                    onChange={(e) => setCustomValor(e.target.value)}
                                    placeholder="Usar valor padrão do plano"
                                    className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-2">Motivo</label>
                                <textarea
                                    value={createMotivo}
                                    onChange={(e) => setCreateMotivo(e.target.value)}
                                    placeholder="Motivo da criação manual..."
                                    rows={2}
                                    className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="flex-1 px-4 py-3 border border-neutral-300 rounded-xl font-medium text-neutral-700 hover:bg-neutral-50 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateLicense}
                                disabled={creating || !selectedEscola}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold disabled:opacity-50 transition-all touch-feedback"
                            >
                                {creating ? 'A criar...' : '✓ Criar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Suspend Modal */}
            {showSuspendModal && suspendingLicense && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl p-6 md:mx-4 animate-slide-up">
                        <div className="w-12 h-1 bg-neutral-300 rounded-full mx-auto mb-4 md:hidden" />

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                                <span className="text-2xl">🚫</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-neutral-800">Suspender Licença</h2>
                                <p className="text-sm text-neutral-500 truncate max-w-[200px]">{(suspendingLicense as any).escolas?.nome}</p>
                            </div>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                            <p className="text-sm text-red-800">
                                ⚠️ A escola perderá acesso ao sistema até a licença ser reactivada.
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-neutral-700 mb-2">Motivo *</label>
                            <textarea
                                value={suspendMotivo}
                                onChange={(e) => setSuspendMotivo(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-red-500 text-sm"
                                placeholder="Descreva o motivo..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowSuspendModal(false)
                                    setSuspendingLicense(null)
                                    setSuspendMotivo('')
                                }}
                                className="flex-1 px-4 py-3 border border-neutral-300 rounded-xl font-medium text-neutral-700 hover:bg-neutral-50 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSuspend}
                                disabled={!suspendMotivo.trim()}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold disabled:opacity-50 transition-all touch-feedback"
                            >
                                Suspender
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Price Edit Modal */}
            <PriceEditModal
                price={editingPrice}
                isOpen={showPriceEditModal}
                onClose={() => {
                    setShowPriceEditModal(false)
                    setEditingPrice(null)
                }}
                onSave={async (id, updates) => {
                    await updatePrice(id, updates)
                    const updatedPrices = await fetchPrices()
                    setPrices(updatedPrices)
                }}
            />

            {/* Approval Modal */}
            {showApprovalModal && approvingTransaction && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl p-6 md:mx-4 animate-slide-up">
                        <div className="w-12 h-1 bg-neutral-300 rounded-full mx-auto mb-4 md:hidden" />

                        <h2 className="text-xl font-bold text-neutral-800 mb-4">✓ Aprovar Assinatura</h2>

                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-green-800 mb-2">
                                <strong>Escola:</strong> {(approvingTransaction as any).escolas?.nome}
                            </p>
                            <p className="text-sm text-green-800 mb-2">
                                <strong>Referência:</strong> {approvingTransaction.metadata?.reference}
                            </p>
                            <p className="text-sm text-green-800">
                                <strong>Valor:</strong> {formatCurrency(approvingTransaction.valor)}
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-neutral-700 mb-2">
                                Plano
                            </label>
                            <select
                                value={approvalPlano}
                                onChange={(e) => setApprovalPlano(e.target.value as PlanoLicenca)}
                                className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            >
                                <option value="trimestral">Trimestral</option>
                                <option value="semestral">Semestral</option>
                                <option value="anual">Anual</option>
                            </select>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-neutral-700 mb-2">
                                Observações (opcional)
                            </label>
                            <textarea
                                value={approvalMotivo}
                                onChange={(e) => setApprovalMotivo(e.target.value)}
                                placeholder="Ex: Pagamento confirmado via transferência bancária"
                                rows={3}
                                className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowApprovalModal(false)
                                    setApprovingTransaction(null)
                                    setApprovalMotivo('')
                                }}
                                className="flex-1 px-4 py-3 border border-neutral-300 rounded-xl font-medium text-neutral-700 hover:bg-neutral-50 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleApprove}
                                disabled={approving}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold disabled:opacity-50 transition-all"
                            >
                                {approving ? 'Aprovando...' : '✓ Aprovar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {showRejectModal && rejectingTransaction && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-3xl p-6 md:mx-4 animate-slide-up">
                        <div className="w-12 h-1 bg-neutral-300 rounded-full mx-auto mb-4 md:hidden" />

                        <h2 className="text-xl font-bold text-neutral-800 mb-4">✗ Rejeitar Solicitação</h2>

                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-red-800 mb-2">
                                <strong>Escola:</strong> {(rejectingTransaction as any).escolas?.nome}
                            </p>
                            <p className="text-sm text-red-800">
                                <strong>Referência:</strong> {rejectingTransaction.metadata?.reference}
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-neutral-700 mb-2">
                                Motivo da Rejeição *
                            </label>
                            <textarea
                                value={rejectMotivo}
                                onChange={(e) => setRejectMotivo(e.target.value)}
                                placeholder="Ex: Comprovativo inválido, valor incorreto, etc."
                                rows={3}
                                className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowRejectModal(false)
                                    setRejectingTransaction(null)
                                    setRejectMotivo('')
                                }}
                                className="flex-1 px-4 py-3 border border-neutral-300 rounded-xl font-medium text-neutral-700 hover:bg-neutral-50 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectMotivo.trim()}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold disabled:opacity-50 transition-all"
                            >
                                ✗ Rejeitar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Helper Components
const StatCard: React.FC<{ icon: string; title: string; value: number | string; color: string; isText?: boolean }> = ({ icon, title, value, color }) => {
    const colorMap: Record<string, string> = {
        primary: 'from-blue-500 to-blue-600',
        green: 'from-emerald-500 to-emerald-600',
        yellow: 'from-amber-500 to-amber-600',
        red: 'from-red-500 to-red-600',
        purple: 'from-purple-500 to-purple-600'
    }

    return (
        <div className="bg-white rounded-2xl p-3 md:p-4 shadow-sm border border-neutral-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base md:text-lg">{icon}</span>
                <span className="text-xs text-neutral-500 font-medium truncate">{title}</span>
            </div>
            <p className={`text-lg md:text-xl font-bold bg-gradient-to-r ${colorMap[color]} bg-clip-text text-transparent truncate`}>
                {value}
            </p>
        </div>
    )
}

const PlanoBadge: React.FC<{ plano: string }> = ({ plano }) => {
    const colors: Record<string, string> = {
        trimestral: 'bg-blue-100 text-blue-700',
        semestral: 'bg-purple-100 text-purple-700',
        anual: 'bg-emerald-100 text-emerald-700'
    }

    return (
        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${colors[plano] || 'bg-neutral-100 text-neutral-600'}`}>
            {plano}
        </span>
    )
}

const EstadoBadge: React.FC<{ estado: string }> = ({ estado }) => {
    const config: Record<string, { bg: string, text: string, icon: string }> = {
        ativa: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '✅' },
        expirada: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '⏰' },
        suspensa: { bg: 'bg-red-100', text: 'text-red-700', icon: '🚫' },
        cancelada: { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: '❌' }
    }

    const { bg, text, icon } = config[estado] || config.cancelada

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${bg} ${text} text-xs font-semibold rounded-full whitespace-nowrap`}>
            <span>{icon}</span>
            <span className="hidden sm:inline">{estado.charAt(0).toUpperCase() + estado.slice(1)}</span>
        </span>
    )
}

export default LicenseManagement

