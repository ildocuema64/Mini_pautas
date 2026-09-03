/**
 * @component PublicPaymentPage
 * @description Public payment page for blocked schools to make subscription payments
 * without being authenticated
 */

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { PrecoLicenca, PlanoLicenca } from '../types'

interface SchoolInfo {
    id: string
    nome: string
    codigo_escola: string
    email?: string
    bloqueado: boolean
    bloqueado_motivo?: string
    provincia?: string
    municipio?: string
}

export const PublicPaymentPage: React.FC = () => {
    // Step management
    const [step, setStep] = useState<'lookup' | 'payment' | 'result'>('lookup')

    // Lookup state
    const [identifier, setIdentifier] = useState('')
    const [lookupLoading, setLookupLoading] = useState(false)
    const [lookupError, setLookupError] = useState<string | null>(null)
    const [school, setSchool] = useState<SchoolInfo | null>(null)

    // Payment state
    const [prices, setPrices] = useState<PrecoLicenca[]>([])
    const [selectedPlano, setSelectedPlano] = useState<PlanoLicenca>('anual')
    const [processing, setProcessing] = useState(false)
    const [paymentResult, setPaymentResult] = useState<{
        success: boolean
        payment_url?: string
        reference?: string
        message?: string
    } | null>(null)

    // Load prices on mount
    useEffect(() => {
        loadPrices()
    }, [])

    const loadPrices = async () => {
        try {
            const { data, error } = await supabase
                .from('precos_licenca')
                .select('*')
                .eq('ativo', true)
                .order('valor', { ascending: true })

            if (error) throw error
            setPrices(data || [])
        } catch (error) {
            console.error('Error loading prices:', error)
        }
    }

    const handleLookup = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!identifier.trim()) {
            setLookupError('Por favor, insira o código ou email da escola')
            return
        }

        try {
            setLookupLoading(true)
            setLookupError(null)
            setSchool(null)

            const searchValue = identifier.trim()

            // Try to find school by codigo_escola first (requires public RLS policy)
            let { data, error } = await supabase
                .from('escolas')
                .select('id, nome, codigo_escola, email, bloqueado, bloqueado_motivo, provincia, municipio')
                .ilike('codigo_escola', searchValue)
                .limit(1)
                .maybeSingle()

            // If not found by codigo_escola, try by email
            if (!data && !error) {
                const emailResult = await supabase
                    .from('escolas')
                    .select('id, nome, codigo_escola, email, bloqueado, bloqueado_motivo, provincia, municipio')
                    .ilike('email', searchValue)
                    .limit(1)
                    .maybeSingle()

                data = emailResult.data
                error = emailResult.error
            }

            if (error) {
                console.error('Lookup error:', error)
                setLookupError('Erro ao procurar escola. Tente novamente.')
                return
            }

            if (!data) {
                setLookupError('Escola não encontrada. Verifique o código ou email inserido.')
                return
            }

            setSchool(data as SchoolInfo)
            setStep('payment')
        } catch (error) {
            console.error('Error in lookup:', error)
            setLookupError('Erro ao procurar escola. Tente novamente.')
        } finally {
            setLookupLoading(false)
        }
    }

    const handlePayment = async () => {
        if (!school) return

        try {
            setProcessing(true)
            setPaymentResult(null)

            // Get the selected price
            const selectedPrice = getSelectedPrice()
            if (!selectedPrice) {
                setPaymentResult({
                    success: false,
                    message: 'Plano não encontrado. Seleccione um plano válido.'
                })
                setStep('result')
                return
            }

            // Generate a unique payment reference
            const reference = `PAG-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`

            // Calculate license dates
            const dataInicio = new Date()
            let dataFim = new Date()
            switch (selectedPlano) {
                case 'trimestral':
                    dataFim.setMonth(dataFim.getMonth() + 3)
                    break
                case 'semestral':
                    dataFim.setMonth(dataFim.getMonth() + 6)
                    break
                case 'anual':
                    dataFim.setFullYear(dataFim.getFullYear() + 1)
                    break
            }

            // Create payment transaction record (public insert may need RLS policy)
            const { data: transacao, error: transacaoError } = await supabase
                .from('transacoes_pagamento')
                .insert({
                    escola_id: school.id,
                    provider: 'manual',
                    provider_transaction_id: reference,
                    valor: selectedPrice.valor,
                    estado: 'pendente',
                    moeda: 'AOA',
                    descricao: `Licença ${selectedPlano} - ${school.nome} (${school.codigo_escola})`,
                    metadata: {
                    plano: selectedPlano,
                    reference: reference,
                    public_payment: true,
                    tipo: 'manual_subscription_request',
                    solicitado_em: new Date().toISOString(),
                    data_inicio: dataInicio.toISOString().split('T')[0],
                    data_fim: dataFim.toISOString().split('T')[0]
                }
                })
                .select('id')
                .single()

            if (transacaoError) {
                console.error('Payment creation error:', transacaoError)

                // Fallback: Show payment info without creating record
                // This allows user to contact support with payment details
                setPaymentResult({
                    success: true,
                    reference: reference,
                    message: 'Utilize a referência abaixo para efectuar o pagamento. Após confirmação, contacte o suporte para activação.'
                })
                setStep('result')
                return
            }

            // Success with database record
            setPaymentResult({
                success: true,
                reference: reference,
                message: 'Pagamento registado com sucesso! Utilize a referência abaixo para efectuar o pagamento.'
            })

            setStep('result')
        } catch (error) {
            console.error('Error creating payment:', error)

            // Even on error, provide reference for manual follow-up
            const fallbackRef = `REF-${Date.now()}`
            setPaymentResult({
                success: false,
                reference: fallbackRef,
                message: 'Ocorreu um erro ao processar. Utilize esta referência para contactar o suporte.'
            })
            setStep('result')
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

    const getSelectedPrice = () => {
        return prices.find(p => p.plano === selectedPlano)
    }

    const resetForm = () => {
        setStep('lookup')
        setIdentifier('')
        setSchool(null)
        setPaymentResult(null)
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header */}
            <header className="bg-white/5 backdrop-blur-sm border-b border-white/10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center">
                            <span className="text-white font-bold text-lg">E</span>
                        </div>
                        <div>
                            <h1 className="text-white font-bold text-lg">EduGest Angola</h1>
                            <p className="text-white/60 text-xs">Pagamento de Subscrição</p>
                        </div>
                    </div>
                    <a
                        href="/"
                        className="text-white/70 hover:text-white text-sm transition-colors"
                    >
                        ← Voltar ao Login
                    </a>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-8 md:py-12">
                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-4 mb-8">
                    {['lookup', 'payment', 'result'].map((s, i) => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${step === s
                                ? 'bg-primary-500 text-white scale-110'
                                : ['lookup', 'payment', 'result'].indexOf(step) > i
                                    ? 'bg-green-500 text-white'
                                    : 'bg-white/10 text-white/50'
                                }`}>
                                {['lookup', 'payment', 'result'].indexOf(step) > i ? '✓' : i + 1}
                            </div>
                            {i < 2 && (
                                <div className={`w-12 h-0.5 ${['lookup', 'payment', 'result'].indexOf(step) > i
                                    ? 'bg-green-500'
                                    : 'bg-white/10'
                                    }`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step 1: School Lookup */}
                {step === 'lookup' && (
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">
                        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white">
                            <h2 className="text-2xl font-bold">🏫 Identificar Escola</h2>
                            <p className="text-primary-100 mt-1">
                                Insira o código ou email da sua escola para continuar o pagamento
                            </p>
                        </div>

                        <form onSubmit={handleLookup} className="p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Código da Escola ou Email
                                </label>
                                <input
                                    type="text"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    placeholder="Ex: ESC001 ou escola@email.ao"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-lg"
                                    autoFocus
                                />
                            </div>

                            {lookupError && (
                                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                    {lookupError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={lookupLoading}
                                className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-semibold hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {lookupLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        A procurar...
                                    </span>
                                ) : (
                                    '🔍 Procurar Escola'
                                )}
                            </button>
                        </form>

                        <div className="bg-gray-50 px-6 py-4 border-t">
                            <p className="text-sm text-gray-500 text-center">
                                Precisa de ajuda? Contacte: <strong>+244 921 923 232</strong>
                            </p>
                        </div>
                    </div>
                )}

                {/* Step 2: Payment Selection */}
                {step === 'payment' && school && (
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">
                        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-6 text-white">
                            <h2 className="text-2xl font-bold">💳 Seleccionar Plano</h2>
                            <p className="text-primary-100 mt-1">
                                Escolha o plano de subscrição para a sua escola
                            </p>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* School Info Card */}
                            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <span className="text-2xl">🏫</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-800 truncate">{school.nome}</h3>
                                        <p className="text-sm text-gray-500">
                                            Código: <span className="font-mono">{school.codigo_escola}</span>
                                        </p>
                                        {school.provincia && (
                                            <p className="text-sm text-gray-500">
                                                {school.municipio && `${school.municipio}, `}{school.provincia}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {school.bloqueado && school.bloqueado_motivo && (
                                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <p className="text-sm text-amber-800">
                                            <strong>⚠️ Estado:</strong> {school.bloqueado_motivo}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Plan Selection */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-700">
                                    Seleccione o Plano
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {prices.map((price) => (
                                        <button
                                            key={price.id}
                                            type="button"
                                            onClick={() => setSelectedPlano(price.plano)}
                                            className={`relative p-4 rounded-xl border-2 transition-all text-left ${selectedPlano === price.plano
                                                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                                                : 'border-gray-200 hover:border-primary-200 bg-white'
                                                }`}
                                        >
                                            {price.plano === 'anual' && (
                                                <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                                                    ⭐ Popular
                                                </span>
                                            )}
                                            <p className="font-bold text-gray-800 capitalize">{price.plano}</p>
                                            <p className="text-2xl font-extrabold text-primary-600 mt-1">
                                                {formatCurrency(price.valor)}
                                            </p>
                                            {price.desconto_percentual > 0 && (
                                                <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                                    -{price.desconto_percentual}%
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-4 border border-primary-200">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600">Total a Pagar</span>
                                    <span className="text-2xl font-bold text-primary-600">
                                        {getSelectedPrice() ? formatCurrency(getSelectedPrice()!.valor) : '-'}
                                    </span>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setStep('lookup')}
                                    className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    ← Voltar
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePayment}
                                    disabled={processing}
                                    className="flex-1 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-semibold hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50"
                                >
                                    {processing ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Processando...
                                        </span>
                                    ) : (
                                        '💳 Pagar Agora'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Result */}
                {step === 'result' && (
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">
                        <div className={`p-6 text-white ${paymentResult?.success
                            ? 'bg-gradient-to-r from-green-600 to-green-700'
                            : 'bg-gradient-to-r from-red-600 to-red-700'
                            }`}>
                            <h2 className="text-2xl font-bold">
                                {paymentResult?.success ? '✅ Pagamento Iniciado' : '❌ Erro no Pagamento'}
                            </h2>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className={`p-4 rounded-xl border ${paymentResult?.success
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                                }`}>
                                <p className="font-medium">{paymentResult?.message}</p>
                            </div>

                            {paymentResult?.reference && (
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                    <p className="text-sm text-gray-500 mb-1">Referência de Pagamento</p>
                                    <p className="text-xl font-mono font-bold text-gray-800">
                                        {paymentResult.reference}
                                    </p>
                                </div>
                            )}

                            {paymentResult?.payment_url && (
                                <a
                                    href={paymentResult.payment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl font-semibold text-center hover:from-primary-600 hover:to-primary-700 transition-all"
                                >
                                    🔗 Abrir Página de Pagamento
                                </a>
                            )}

                            {paymentResult?.success && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                    <h4 className="font-semibold text-blue-800 mb-2">📋 Próximos Passos:</h4>
                                    <ul className="text-sm text-blue-700 space-y-1">
                                        <li>1. Complete o pagamento usando a referência acima</li>
                                        <li>2. Aguarde a confirmação (pode levar alguns minutos)</li>
                                        <li>3. Após confirmação, a sua escola será desbloqueada automaticamente</li>
                                        <li>4. Volte ao login para aceder ao sistema</li>
                                    </ul>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={resetForm}
                                    className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Novo Pagamento
                                </button>
                                <a
                                    href="/"
                                    className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-semibold text-center hover:bg-gray-900 transition-colors"
                                >
                                    Voltar ao Login
                                </a>
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 border-t">
                            <p className="text-sm text-gray-500 text-center">
                                Dúvidas? Contacte: <strong>+244 921 923 232</strong> | <a href="https://wa.me/244921923232" className="text-green-600 hover:underline">WhatsApp</a>
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="text-center py-6 text-white/40 text-sm">
                © 2024 EduGest Angola - Todos os direitos reservados
            </footer>
        </div>
    )
}

export default PublicPaymentPage
