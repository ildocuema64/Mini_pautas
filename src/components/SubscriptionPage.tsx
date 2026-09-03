/**
 * @component SubscriptionPage
 * @description Modern mobile-first subscription page for schools with manual payment flow
 * @updated 2025-12-29 - Added WhatsApp-based manual subscription workflow
 */

import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import {
    checkLicenseStatus,
    fetchTransactions,
    fetchPrices,
    updatePrice,
    getSuperAdminContact,
    getDadosBancarios,
    requestManualSubscription,
    generateWhatsAppLink,
    getTransactionStatusLabel,
    type SuperAdminContact,
    type DadosBancarios
} from '../utils/license'
import { PriceEditModal } from './PriceEditModal'
import type { LicenseStatus, TransacaoPagamento, PrecoLicenca, PlanoLicenca } from '../types'

export const SubscriptionPage: React.FC = () => {
    const { escolaProfile, profile } = useAuth()
    const isSuperAdmin = profile?.tipo_perfil === 'SUPERADMIN'
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
    const [transactions, setTransactions] = useState<TransacaoPagamento[]>([])
    const [prices, setPrices] = useState<PrecoLicenca[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Manual subscription flow
    const [superAdminContact, setSuperAdminContact] = useState<SuperAdminContact | null>(null)
    const [dadosBancarios, setDadosBancarios] = useState<DadosBancarios | null>(null)

    // Payment modal
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedPlano, setSelectedPlano] = useState<PlanoLicenca>('anual')
    const [processing, setProcessing] = useState(false)
    const [subscriptionResult, setSubscriptionResult] = useState<{
        success: boolean
        reference?: string
        whatsappLink?: string
        message?: string
    } | null>(null)

    // Price editing (SUPERADMIN only)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingPrice, setEditingPrice] = useState<PrecoLicenca | null>(null)

    const escolaId = escolaProfile?.id
    const escolaCodigo = escolaProfile?.codigo_escola || ''
    const escolaNome = escolaProfile?.nome || ''

    // Check for pending/confirmed subscription payment
    const subscriptionTransactions = transactions.filter(t =>
        t.provider === 'manual' ||
        t.metadata?.tipo === 'manual_subscription_request' ||
        t.metadata?.public_payment
    )

    const pendingTransaction = subscriptionTransactions.find(t => t.estado === 'pendente')

    const confirmedTransaction = !pendingTransaction
        ? subscriptionTransactions.find(t => t.estado === 'sucesso')
        : undefined

    useEffect(() => {
        loadData()
    }, [escolaId])

    useEffect(() => {
        if (!escolaId) return

        const channel = supabase
            .channel(`subscription-payments-${escolaId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'transacoes_pagamento',
                    filter: `escola_id=eq.${escolaId}`
                },
                () => {
                    loadData()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [escolaId])

    const loadData = async () => {
        try {
            setLoading(true)
            setError(null)

            const [statusData, transData, pricesData, contactData, bankData] = await Promise.all([
                escolaId ? checkLicenseStatus(escolaId) : Promise.resolve(null),
                escolaId ? fetchTransactions(escolaId) : Promise.resolve([]),
                fetchPrices(),
                getSuperAdminContact(),
                getDadosBancarios()
            ])

            if (statusData) setLicenseStatus(statusData)
            setTransactions(transData)
            setPrices(pricesData)
            setSuperAdminContact(contactData)
            setDadosBancarios(bankData)
        } catch (err) {
            console.error('Error loading subscription data:', err)
            setError('Erro ao carregar dados da subscrição')
        } finally {
            setLoading(false)
        }
    }

    const handleManualSubscription = async () => {
        if (!escolaId || !escolaCodigo) return

        try {
            setProcessing(true)
            setSubscriptionResult(null)

            const result = await requestManualSubscription(escolaId, escolaCodigo, selectedPlano)

            if (result.success && superAdminContact) {
                const whatsappLink = generateWhatsAppLink(
                    superAdminContact.numero,
                    escolaNome,
                    escolaCodigo,
                    selectedPlano,
                    result.reference
                )

                setSubscriptionResult({
                    success: true,
                    reference: result.reference,
                    whatsappLink,
                    message: 'Solicitação criada! Envie o comprovativo pelo WhatsApp.'
                })
            } else {
                setSubscriptionResult({
                    success: false,
                    message: result.error || 'Erro ao criar solicitação'
                })
            }
        } catch (err) {
            setSubscriptionResult({
                success: false,
                message: 'Erro ao processar solicitação. Tente novamente.'
            })
        } finally {
            setProcessing(false)
        }
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-AO', {
            style: 'currency',
            currency: 'AOA'
        }).format(value)
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('pt-AO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    const getSelectedPrice = () => {
        return prices.find(p => p.plano === selectedPlano)
    }

    const getDaysProgress = () => {
        if (!licenseStatus?.licenca) return 0
        const totalDays = licenseStatus.plano === 'trimestral' ? 90 : licenseStatus.plano === 'semestral' ? 180 : 365
        const remaining = licenseStatus.dias_restantes
        return Math.max(0, Math.min(100, ((totalDays - remaining) / totalDays) * 100))
    }

    // Check if can request new subscription
    const canRequestSubscription = () => {
        // Has pending transaction
        if (pendingTransaction) return false
        // Has active license with more than 30 days remaining
        if (licenseStatus?.valid && licenseStatus.dias_restantes > 30) return false
        return true
    }

    const getSubscriptionBlockReason = () => {
        if (pendingTransaction) {
            return 'Você já tem uma solicitação pendente de aprovação'
        }
        if (licenseStatus?.valid && licenseStatus.dias_restantes > 30) {
            return `Sua licença está activa e expira em ${licenseStatus.dias_restantes} dias`
        }
        return ''
    }

    const getStatusConfig = () => {
        if (!licenseStatus?.licenca) {
            return { color: 'gray', icon: '📋', text: 'Sem Licença', bg: 'bg-gray-50', border: 'border-gray-200' }
        }
        if (licenseStatus.valid && licenseStatus.dias_restantes > 30) {
            return { color: 'green', icon: '✅', text: 'Activa', bg: 'bg-gradient-to-br from-green-50 to-emerald-50', border: 'border-green-200' }
        }
        if (licenseStatus.valid && licenseStatus.dias_restantes <= 30) {
            return { color: 'yellow', icon: '⚠️', text: 'A Expirar', bg: 'bg-gradient-to-br from-yellow-50 to-amber-50', border: 'border-yellow-300' }
        }
        if (licenseStatus.estado === 'suspensa') {
            return { color: 'orange', icon: '🚫', text: 'Suspensa', bg: 'bg-gradient-to-br from-orange-50 to-amber-50', border: 'border-orange-300' }
        }
        return { color: 'red', icon: '❌', text: 'Expirada', bg: 'bg-gradient-to-br from-red-50 to-rose-50', border: 'border-red-300' }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
                    <p className="mt-4 text-neutral-600">A carregar subscrição...</p>
                </div>
            </div>
        )
    }

    const statusConfig = getStatusConfig()

    return (
        <div className="min-h-screen bg-neutral-50 pb-24 md:pb-8">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-6 md:px-8">
                <h1 className="text-2xl md:text-3xl font-bold">Minha Subscrição</h1>
                <p className="text-primary-100 mt-1 text-sm md:text-base">Gerir a licença de uso do EduGest Angola</p>
            </div>

            <div className="px-4 md:px-8 -mt-4 space-y-6">
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 animate-fade-in">
                        <p className="text-red-800 text-sm">{error}</p>
                    </div>
                )}

                {/* Pending Transaction Alert */}
                {pendingTransaction && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 animate-slide-up">
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <span className="text-2xl">⏳</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-amber-800">Aguardando Confirmação</h3>
                                <p className="text-sm text-amber-700 mt-1">
                                    O seu pagamento foi registado e está a aguardar confirmação pelo administrador.
                                </p>
                                <div className="mt-3 p-3 bg-white rounded-lg border border-amber-200">
                                    <p className="text-xs text-neutral-500">Referência</p>
                                    <p className="font-mono font-bold text-neutral-800">{pendingTransaction.metadata?.reference}</p>
                                </div>
                                {superAdminContact && (
                                    <a
                                        href={generateWhatsAppLink(
                                            superAdminContact.numero,
                                            escolaNome,
                                            escolaCodigo,
                                            pendingTransaction.metadata?.plano || 'N/A',
                                            pendingTransaction.metadata?.reference || ''
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                        </svg>
                                        Enviar Comprovativo
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirmed Payment Alert */}
                {confirmedTransaction && (
                    <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-5 animate-slide-up">
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <span className="text-2xl">✅</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-green-800">Pagamento Confirmado</h3>
                                <p className="text-sm text-green-700 mt-1">
                                    O administrador confirmou o seu pagamento. A licença foi activada com sucesso.
                                </p>
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="p-3 bg-white rounded-lg border border-green-200">
                                        <p className="text-xs text-neutral-500">Referência</p>
                                        <p className="font-mono font-bold text-neutral-800">
                                            {confirmedTransaction.metadata?.reference || confirmedTransaction.provider_transaction_id || '-'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-white rounded-lg border border-green-200">
                                        <p className="text-xs text-neutral-500">Confirmado em</p>
                                        <p className="font-semibold text-neutral-800">
                                            {confirmedTransaction.metadata?.aprovado_em
                                                ? formatDate(confirmedTransaction.metadata.aprovado_em)
                                                : formatDate(confirmedTransaction.updated_at)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* License Status Hero Card */}
                <div className={`rounded-2xl shadow-lg overflow-hidden ${statusConfig.bg} border-2 ${statusConfig.border} animate-slide-up`}>
                    <div className="p-5 md:p-6">
                        {licenseStatus?.licenca ? (
                            <>
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <span className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Estado da Licença</span>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-2xl">{statusConfig.icon}</span>
                                            <span className={`text-xl font-bold text-${statusConfig.color}-700`}>
                                                {statusConfig.text}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`px-4 py-2 rounded-full bg-${statusConfig.color}-100 border border-${statusConfig.color}-200`}>
                                        <span className={`text-lg font-bold text-${statusConfig.color}-700 capitalize`}>
                                            {licenseStatus.plano}
                                        </span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-xs text-neutral-500 mb-1">
                                        <span>Progresso do plano</span>
                                        <span>{licenseStatus.dias_restantes} dias restantes</span>
                                    </div>
                                    <div className="h-2 bg-white rounded-full overflow-hidden shadow-inner">
                                        <div
                                            className={`h-full bg-gradient-to-r from-${statusConfig.color}-400 to-${statusConfig.color}-600 transition-all duration-500`}
                                            style={{ width: `${getDaysProgress()}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/60 rounded-xl p-3">
                                        <p className="text-xs text-neutral-500">Início</p>
                                        <p className="text-sm font-semibold text-neutral-800">
                                            {licenseStatus.licenca.data_inicio ? formatDate(licenseStatus.licenca.data_inicio) : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="bg-white/60 rounded-xl p-3">
                                        <p className="text-xs text-neutral-500">Expira em</p>
                                        <p className="text-sm font-semibold text-neutral-800">
                                            {licenseStatus.data_fim ? formatDate(licenseStatus.data_fim) : 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                {/* Renewal Alert */}
                                {licenseStatus.valid && licenseStatus.dias_restantes <= 30 && (
                                    <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-xl animate-pulse-soft">
                                        <p className="text-yellow-800 text-sm font-medium">
                                            ⚠️ Renove agora para evitar interrupções no serviço!
                                        </p>
                                    </div>
                                )}

                                {/* CTA Button */}
                                <button
                                    onClick={() => setShowPaymentModal(true)}
                                    disabled={!canRequestSubscription()}
                                    className={`mt-4 w-full py-3 rounded-xl font-semibold text-white transition-all touch-feedback disabled:opacity-50 disabled:cursor-not-allowed ${!licenseStatus.valid
                                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                                        : licenseStatus.dias_restantes <= 30
                                            ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700'
                                            : 'bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700'
                                        }`}
                                >
                                    {pendingTransaction
                                        ? '⏳ Aguardando Confirmação'
                                        : !licenseStatus.valid
                                            ? '🔄 Renovar Licença'
                                            : licenseStatus.dias_restantes <= 30
                                                ? '⏰ Renovar Agora'
                                                : '✓ Licença Activa'}
                                </button>
                                {!canRequestSubscription() && !pendingTransaction && (
                                    <p className="mt-2 text-sm text-green-700 text-center">
                                        ℹ️ {getSubscriptionBlockReason()}
                                    </p>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-6">
                                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center">
                                    <span className="text-4xl">📋</span>
                                </div>
                                <h3 className="text-xl font-bold text-neutral-800 mb-2">Sem Licença Activa</h3>
                                <p className="text-neutral-600 mb-4">
                                    Adquira uma licença para desbloquear todas as funcionalidades.
                                </p>
                                <button
                                    onClick={() => setShowPaymentModal(true)}
                                    disabled={!canRequestSubscription()}
                                    className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-semibold touch-feedback hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {pendingTransaction ? '⏳ Aguardando Confirmação' : '✨ Adquirir Licença'}
                                </button>
                                {!canRequestSubscription() && !pendingTransaction && (
                                    <p className="mt-2 text-sm text-neutral-600 text-center">
                                        ℹ️ {getSubscriptionBlockReason()}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Manual Payment Instructions */}
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100 animate-slide-up" style={{ animationDelay: '50ms' }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                            <span className="text-xl">📱</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-neutral-800">Como Subscrever</h3>
                            <p className="text-xs text-neutral-500">Pagamento por transferência bancária</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex gap-3">
                            <div className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                            <p className="text-sm text-neutral-600">Seleccione o plano desejado e clique em "Solicitar Assinatura"</p>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                            <p className="text-sm text-neutral-600">Efectue a transferência bancária com os dados fornecidos</p>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                            <p className="text-sm text-neutral-600">Envie o comprovativo pelo WhatsApp com a referência</p>
                        </div>
                        <div className="flex gap-3">
                            <div className="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">✓</div>
                            <p className="text-sm text-neutral-600">Aguarde a confirmação e sua licença será activada!</p>
                        </div>
                    </div>

                    {/* Bank Details */}
                    {dadosBancarios && (
                        <div className="mt-5 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                            <h4 className="font-semibold text-neutral-800 mb-3 flex items-center gap-2 text-sm md:text-base">
                                <span>🏦</span> Dados para Transferência
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-neutral-500 text-xs mb-1">Banco</p>
                                    <p className="font-medium text-neutral-800 break-words">{dadosBancarios.banco}</p>
                                </div>
                                <div>
                                    <p className="text-neutral-500 text-xs mb-1">Titular</p>
                                    <p className="font-medium text-neutral-800 break-words">{dadosBancarios.titular}</p>
                                </div>
                                <div>
                                    <p className="text-neutral-500 text-xs mb-1">Conta</p>
                                    <p className="font-mono font-medium text-neutral-800 break-all">{dadosBancarios.conta}</p>
                                </div>
                                <div>
                                    <p className="text-neutral-500 text-xs mb-1">IBAN</p>
                                    <p className="font-mono font-medium text-neutral-800 text-xs break-all">{dadosBancarios.iban}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* WhatsApp Contact */}
                    {superAdminContact && (
                        <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-green-800 flex items-center gap-2 text-sm md:text-base mb-2">
                                        <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                        </svg>
                                        <span className="truncate">{superAdminContact.nome}</span>
                                    </h4>
                                    <p className="text-green-700 font-mono text-sm break-all">{superAdminContact.numero}</p>
                                </div>
                                <a
                                    href={`https://wa.me/${superAdminContact.numero.replace(/[^\d+]/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full md:w-auto px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium text-sm transition-colors text-center flex-shrink-0"
                                >
                                    Contactar
                                </a>
                            </div>
                        </div>
                    )}
                </div>

                {/* Plan Comparison Cards */}
                <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-neutral-800">Planos Disponíveis</h2>
                        {isSuperAdmin && (
                            <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded-lg">
                                ✏️ Editar
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {prices.map((price, index) => (
                            <div
                                key={price.id}
                                onClick={() => setSelectedPlano(price.plano)}
                                className={`relative rounded-2xl p-5 cursor-pointer transition-all duration-300 touch-feedback ${selectedPlano === price.plano
                                    ? 'bg-gradient-to-br from-primary-50 to-blue-50 border-2 border-primary-400 shadow-lg scale-[1.02]'
                                    : 'bg-white border-2 border-neutral-200 hover:border-primary-200 hover:shadow-md'
                                    }`}
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                {/* Popular Badge */}
                                {price.plano === 'anual' && (
                                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                                        <span className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold rounded-full shadow-md">
                                            ⭐ POPULAR
                                        </span>
                                    </div>
                                )}

                                {/* SUPERADMIN Edit Button */}
                                {isSuperAdmin && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setEditingPrice(price)
                                            setShowEditModal(true)
                                        }}
                                        className="absolute top-3 right-3 p-2 text-neutral-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                        title="Editar preço"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                )}

                                {/* Selected Indicator */}
                                {selectedPlano === price.plano && (
                                    <div className="absolute top-3 right-3">
                                        <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </div>
                                )}

                                <h3 className="text-lg font-bold text-neutral-800 capitalize mt-2">{price.plano}</h3>
                                <p className="text-3xl font-extrabold text-primary-600 mt-2">
                                    {formatCurrency(price.valor)}
                                </p>

                                {price.desconto_percentual > 0 && (
                                    <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                        💰 {price.desconto_percentual}% desconto
                                    </span>
                                )}

                                <p className="text-sm text-neutral-500 mt-3">{price.descricao}</p>

                                <div className="mt-4 pt-4 border-t border-neutral-100">
                                    <ul className="space-y-2 text-sm text-neutral-600">
                                        <li className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span> Acesso completo
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span> Suporte prioritário
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span> Actualizações gratuitas
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => setShowPaymentModal(true)}
                        disabled={!canRequestSubscription()}
                        className="mt-4 w-full md:w-auto px-8 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-semibold touch-feedback hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {pendingTransaction
                            ? '⏳ Solicitação Pendente'
                            : licenseStatus?.valid
                                ? '📋 Renovar com este plano'
                                : '✨ Solicitar Assinatura'}
                    </button>
                </div>

                {/* Transaction History */}
                <div className="animate-slide-up" style={{ animationDelay: '200ms' }}>
                    <h2 className="text-lg font-bold text-neutral-800 mb-4">Histórico de Pagamentos</h2>

                    {transactions.length > 0 ? (
                        <>
                            {/* Mobile Cards */}
                            <div className="md:hidden space-y-3">
                                {transactions.map((trans) => (
                                    <div key={trans.id} className="bg-white rounded-xl p-4 shadow-sm border border-neutral-100">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-sm text-neutral-500">{formatDate(trans.created_at)}</p>
                                                <p className="text-lg font-bold text-neutral-800">{formatCurrency(trans.valor)}</p>
                                            </div>
                                            <TransactionStatusBadge estado={trans.estado} />
                                        </div>
                                        <div className="flex justify-between text-sm text-neutral-500 pt-3 border-t border-neutral-100">
                                            <span className="capitalize">{trans.metodo_pagamento || trans.provider}</span>
                                            <span className="font-mono text-xs">{trans.metadata?.reference || trans.provider_transaction_id || '-'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop Table */}
                            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-neutral-100 overflow-hidden">
                                <table className="min-w-full">
                                    <thead className="bg-neutral-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Data</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Valor</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Método</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Estado</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Referência</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                        {transactions.map((trans) => (
                                            <tr key={trans.id} className="hover:bg-neutral-50 transition-colors">
                                                <td className="px-6 py-4 text-sm text-neutral-800">{formatDate(trans.created_at)}</td>
                                                <td className="px-6 py-4 text-sm font-semibold text-neutral-800">{formatCurrency(trans.valor)}</td>
                                                <td className="px-6 py-4 text-sm text-neutral-600 capitalize">{trans.metodo_pagamento || trans.provider}</td>
                                                <td className="px-6 py-4"><TransactionStatusBadge estado={trans.estado} /></td>
                                                <td className="px-6 py-4 text-sm text-neutral-500 font-mono">{trans.metadata?.reference || trans.provider_transaction_id || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-xl p-8 text-center border border-neutral-100">
                            <div className="w-16 h-16 mx-auto mb-4 bg-neutral-100 rounded-full flex items-center justify-center">
                                <span className="text-2xl">💳</span>
                            </div>
                            <p className="text-neutral-500">Nenhum pagamento encontrado</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Manual Subscription Modal - Full Screen on Mobile */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 animate-fade-in">
                    <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-3xl p-6 md:mx-4 animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="w-12 h-1 bg-neutral-300 rounded-full mx-auto mb-4 md:hidden" />

                        <h2 className="text-xl font-bold text-neutral-800 mb-6">
                            {licenseStatus?.valid ? '🔄 Renovar Licença' : '✨ Adquirir Licença'}
                        </h2>

                        {!subscriptionResult ? (
                            <>
                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                                        Plano Selecionado
                                    </label>
                                    <select
                                        value={selectedPlano}
                                        onChange={(e) => setSelectedPlano(e.target.value as PlanoLicenca)}
                                        className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                                    >
                                        {prices.map((price) => (
                                            <option key={price.id} value={price.plano}>
                                                {price.plano.charAt(0).toUpperCase() + price.plano.slice(1)} - {formatCurrency(price.valor)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-4 mb-6">
                                    <div className="flex justify-between items-center">
                                        <span className="text-neutral-600">Total a Pagar</span>
                                        <span className="text-2xl font-bold text-primary-600">
                                            {getSelectedPrice() ? formatCurrency(getSelectedPrice()!.valor) : '-'}
                                        </span>
                                    </div>
                                </div>

                                {/* Bank Details in Modal */}
                                {dadosBancarios && (
                                    <div className="bg-neutral-50 rounded-xl p-4 mb-6 border border-neutral-200">
                                        <h4 className="font-semibold text-neutral-800 mb-3 text-sm">Dados para Transferência:</h4>
                                        <div className="text-sm space-y-2">
                                            <p><span className="text-neutral-500">Banco:</span> <span className="font-medium break-words">{dadosBancarios.banco}</span></p>
                                            <p><span className="text-neutral-500">Conta:</span> <span className="font-mono font-medium break-all">{dadosBancarios.conta}</span></p>
                                            <p><span className="text-neutral-500">IBAN:</span> <span className="font-mono font-medium text-xs break-all">{dadosBancarios.iban}</span></p>
                                            <p><span className="text-neutral-500">Titular:</span> <span className="font-medium break-words">{dadosBancarios.titular}</span></p>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                                    <p className="text-amber-800 text-sm">
                                        📱 Após efectuar a transferência, envie o comprovativo pelo WhatsApp com a referência que será gerada.
                                    </p>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowPaymentModal(false)}
                                        className="flex-1 px-4 py-3 border border-neutral-300 rounded-xl font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleManualSubscription}
                                        disabled={processing}
                                        className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-semibold disabled:opacity-50 transition-all"
                                    >
                                        {processing ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Processando...
                                            </span>
                                        ) : '📋 Solicitar Assinatura'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={`p-4 rounded-xl mb-6 ${subscriptionResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                    <p className={`font-medium ${subscriptionResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                        {subscriptionResult.message}
                                    </p>

                                    {subscriptionResult.reference && (
                                        <div className="mt-4 p-3 bg-white rounded-lg border">
                                            <p className="text-xs text-neutral-500">Referência de Pagamento</p>
                                            <p className="text-lg font-mono font-bold text-neutral-800">{subscriptionResult.reference}</p>
                                        </div>
                                    )}

                                    {subscriptionResult.whatsappLink && (
                                        <a
                                            href={subscriptionResult.whatsappLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                            </svg>
                                            Enviar Comprovativo pelo WhatsApp
                                        </a>
                                    )}
                                </div>

                                <button
                                    onClick={() => {
                                        setShowPaymentModal(false)
                                        setSubscriptionResult(null)
                                        loadData()
                                    }}
                                    className="w-full px-4 py-3 border border-neutral-300 rounded-xl font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                                >
                                    Fechar
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Price Edit Modal (SUPERADMIN only) */}
            <PriceEditModal
                price={editingPrice}
                isOpen={showEditModal}
                onClose={() => {
                    setShowEditModal(false)
                    setEditingPrice(null)
                }}
                onSave={async (id, updates) => {
                    await updatePrice(id, updates)
                    const updatedPrices = await fetchPrices()
                    setPrices(updatedPrices)
                }}
            />
        </div>
    )
}

// Helper Components
const TransactionStatusBadge: React.FC<{ estado: string }> = ({ estado }) => {
    const config: Record<string, { bg: string, text: string, icon: string }> = {
        sucesso: { bg: 'bg-green-100', text: 'text-green-700', icon: '✓' },
        pendente: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '⏳' },
        processando: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '⚙️' },
        falha: { bg: 'bg-red-100', text: 'text-red-700', icon: '✗' },
        cancelado: { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: '—' }
    }

    const { bg, text, icon } = config[estado] || config.cancelado

    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 ${bg} ${text} text-xs font-semibold rounded-full`}>
            <span>{icon}</span>
            {getTransactionStatusLabel(estado)}
        </span>
    )
}

export default SubscriptionPage
