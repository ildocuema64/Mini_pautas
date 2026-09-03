import { supabase } from '../lib/supabaseClient'
import type {
    Licenca,
    TransacaoPagamento,
    PrecoLicenca,
    LicenseStatus,
    LicenseStats,
    PlanoLicenca,
    CreatePaymentRequest,
    CreatePaymentResponse
} from '../types'

/**
 * License Management Utility Functions
 * Provides API functions for license and payment operations
 */

// ============================================
// LICENSE STATUS & QUERIES
// ============================================

/**
 * Check license status for a school
 */
export async function checkLicenseStatus(escolaId: string): Promise<LicenseStatus> {
    try {
        // Try Edge Function first for consistent logic
        const { data, error } = await supabase.functions.invoke('check-license-status', {
            body: { escola_id: escolaId }
        })

        if (error) {
            console.warn('Edge function failed, falling back to direct query:', error)
            return await checkLicenseStatusDirect(escolaId)
        }

        return data as LicenseStatus
    } catch (error) {
        console.error('Error checking license status:', error)
        return await checkLicenseStatusDirect(escolaId)
    }
}

/**
 * Direct database query for license status (fallback)
 */
async function checkLicenseStatusDirect(escolaId: string): Promise<LicenseStatus> {
    const { data: licenca, error } = await supabase
        .from('licencas')
        .select('*')
        .eq('escola_id', escolaId)
        .eq('estado', 'ativa')
        .order('data_fim', { ascending: false })
        .limit(1)
        .single()

    if (error || !licenca) {
        return {
            valid: false,
            dias_restantes: -1
        }
    }

    const dataFim = new Date(licenca.data_fim)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    dataFim.setHours(0, 0, 0, 0)

    const diasRestantes = Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

    return {
        valid: diasRestantes >= 0,
        dias_restantes: diasRestantes,
        estado: licenca.estado,
        plano: licenca.plano,
        data_fim: licenca.data_fim,
        licenca: licenca
    }
}

/**
 * Fetch all licenses (SUPERADMIN only)
 * Prefer RPC SECURITY DEFINER to avoid empty lists caused by RLS/role_cache issues.
 */
export async function fetchAllLicenses(filters?: {
    estado?: string
    plano?: string
    escolaId?: string
}): Promise<Licenca[]> {
    try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('listar_licencas_admin', {
            p_estado: filters?.estado || null,
            p_plano: filters?.plano || null,
            p_escola_id: filters?.escolaId || null
        })

        if (!rpcError && Array.isArray(rpcData)) {
            return rpcData as Licenca[]
        }

        if (rpcError) {
            console.warn('listar_licencas_admin RPC unavailable, falling back to direct query:', rpcError.message)
        }

        let query = supabase
            .from('licencas')
            .select('*, escolas(id, nome, codigo_escola, provincia, municipio)')
            .order('created_at', { ascending: false })

        if (filters?.estado) {
            query = query.eq('estado', filters.estado)
        }
        if (filters?.plano) {
            query = query.eq('plano', filters.plano)
        }
        if (filters?.escolaId) {
            query = query.eq('escola_id', filters.escolaId)
        }

        const { data, error } = await query

        if (error) throw error
        return data || []
    } catch (error) {
        console.error('Error fetching licenses:', error)
        throw error
    }
}

/**
 * Fetch license for a specific school
 */
export async function fetchSchoolLicense(escolaId: string): Promise<Licenca | null> {
    try {
        const { data, error } = await supabase
            .from('licencas')
            .select('*')
            .eq('escola_id', escolaId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (error && error.code !== 'PGRST116') throw error
        return data
    } catch (error) {
        console.error('Error fetching school license:', error)
        return null
    }
}

// ============================================
// LICENSE MANAGEMENT (SUPERADMIN)
// ============================================

/**
 * Create a manual license (SUPERADMIN only)
 */
export async function createManualLicense(
    escolaId: string,
    plano: PlanoLicenca,
    valor?: number,
    motivo?: string
): Promise<Licenca> {
    try {
        const { data, error } = await supabase.rpc('criar_licenca_manual', {
            p_escola_id: escolaId,
            p_plano: plano,
            p_valor: valor || null,
            p_motivo: motivo || 'Licença criada manualmente pelo SUPERADMIN'
        })

        if (error) throw error
        return data as Licenca
    } catch (error) {
        console.error('Error creating manual license:', error)
        throw error
    }
}

/**
 * Suspend a license (SUPERADMIN only)
 */
export async function suspendLicense(
    licencaId: string,
    motivo?: string
): Promise<Licenca> {
    try {
        const { data, error } = await supabase.rpc('suspender_licenca', {
            p_licenca_id: licencaId,
            p_motivo: motivo || 'Suspensa pelo SUPERADMIN'
        })

        if (error) throw error
        return data as Licenca
    } catch (error) {
        console.error('Error suspending license:', error)
        throw error
    }
}

/**
 * Reactivate a suspended license (SUPERADMIN only)
 */
export async function reactivateLicense(licencaId: string): Promise<void> {
    try {
        const { error } = await supabase
            .from('licencas')
            .update({
                estado: 'ativa',
                updated_at: new Date().toISOString()
            })
            .eq('id', licencaId)

        if (error) throw error

        // Unblock the school
        const { data: licenca } = await supabase
            .from('licencas')
            .select('escola_id')
            .eq('id', licencaId)
            .single()

        if (licenca) {
            await supabase
                .from('escolas')
                .update({
                    bloqueado: false,
                    bloqueado_motivo: null,
                    bloqueado_em: null,
                    bloqueado_por: null
                })
                .eq('id', licenca.escola_id)
        }
    } catch (error) {
        console.error('Error reactivating license:', error)
        throw error
    }
}

// ============================================
// PAYMENT OPERATIONS
// ============================================

/**
 * Create a new payment
 */
export async function createPayment(
    request: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
    try {
        const { data, error } = await supabase.functions.invoke('create-payment', {
            body: request
        })

        if (error) throw error
        return data as CreatePaymentResponse
    } catch (error) {
        console.error('Error creating payment:', error)
        throw error
    }
}

/**
 * Fetch payment transactions for a school
 */
export async function fetchTransactions(escolaId?: string): Promise<TransacaoPagamento[]> {
    try {
        let query = supabase
            .from('transacoes_pagamento')
            .select('*, licencas(*), escolas(id, nome, codigo_escola)')
            .order('created_at', { ascending: false })

        if (escolaId) {
            query = query.eq('escola_id', escolaId)
        }

        const { data, error } = await query

        if (error) throw error
        return data || []
    } catch (error) {
        console.error('Error fetching transactions:', error)
        throw error
    }
}

// ============================================
// PRICING
// ============================================

/**
 * Fetch license prices
 */
export async function fetchPrices(): Promise<PrecoLicenca[]> {
    try {
        const { data, error } = await supabase
            .from('precos_licenca')
            .select('*')
            .eq('ativo', true)
            .order('valor', { ascending: true })

        if (error) throw error
        return data || []
    } catch (error) {
        console.error('Error fetching prices:', error)
        throw error
    }
}

/**
 * Update a license price (SUPERADMIN only)
 */
export async function updatePrice(
    priceId: string,
    updates: {
        valor?: number
        desconto_percentual?: number
        descricao?: string
        ativo?: boolean
    }
): Promise<PrecoLicenca> {
    try {
        const { data, error } = await supabase
            .from('precos_licenca')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', priceId)
            .select()
            .single()

        if (error) throw error
        return data as PrecoLicenca
    } catch (error) {
        console.error('Error updating price:', error)
        throw error
    }
}

// ============================================
// STATISTICS (SUPERADMIN)
// ============================================

/**
 * Fetch license statistics for SUPERADMIN dashboard
 */
export async function fetchLicenseStats(): Promise<LicenseStats> {
    try {
        // Fetch all licenses
        const { data: licencas, error: licError } = await supabase
            .from('licencas')
            .select('id, estado, valor, plano, created_at')

        if (licError) throw licError

        // Fetch blocked schools count
        const { count: escolasBloqueadas, error: bloqError } = await supabase
            .from('escolas')
            .select('id', { count: 'exact' })
            .eq('bloqueado', true)

        if (bloqError) throw bloqError

        // Fetch successful transactions for revenue
        const { data: transacoes, error: transError } = await supabase
            .from('transacoes_pagamento')
            .select('valor, created_at')
            .eq('estado', 'sucesso')

        if (transError) throw transError

        // Calculate statistics
        const total_licencas = licencas?.length || 0
        const licencas_ativas = licencas?.filter(l => l.estado === 'ativa').length || 0
        const licencas_expiradas = licencas?.filter(l => l.estado === 'expirada').length || 0
        const licencas_suspensas = licencas?.filter(l => l.estado === 'suspensa').length || 0

        const receita_total = transacoes?.reduce((sum, t) => sum + (t.valor || 0), 0) || 0

        // Calculate revenue by period
        const now = new Date()
        const trimestre = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        const semestre = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
        const ano = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())

        const receita_trimestre = transacoes?.filter(t => new Date(t.created_at) >= trimestre)
            .reduce((sum, t) => sum + (t.valor || 0), 0) || 0
        const receita_semestre = transacoes?.filter(t => new Date(t.created_at) >= semestre)
            .reduce((sum, t) => sum + (t.valor || 0), 0) || 0
        const receita_ano = transacoes?.filter(t => new Date(t.created_at) >= ano)
            .reduce((sum, t) => sum + (t.valor || 0), 0) || 0

        // Calculate monthly revenue
        const receitas_por_mes: Array<{ mes: string; ano: number; total: number }> = []
        for (let i = 11; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const mes = date.toLocaleString('pt-AO', { month: 'short' })
            const anoNum = date.getFullYear()
            const mesNum = date.getMonth()

            const total = transacoes?.filter(t => {
                const tDate = new Date(t.created_at)
                return tDate.getFullYear() === anoNum && tDate.getMonth() === mesNum
            }).reduce((sum, t) => sum + (t.valor || 0), 0) || 0

            receitas_por_mes.push({ mes, ano: anoNum, total })
        }

        return {
            total_licencas,
            licencas_ativas,
            licencas_expiradas,
            licencas_suspensas,
            escolas_bloqueadas_por_falta_pagamento: escolasBloqueadas || 0,
            receita_total,
            receita_trimestre,
            receita_semestre,
            receita_ano,
            receitas_por_mes
        }
    } catch (error) {
        console.error('Error fetching license stats:', error)
        throw error
    }
}

/**
 * Run expired license check (triggers blocking)
 */
export async function runExpirationCheck(): Promise<void> {
    try {
        const { error } = await supabase.rpc('verificar_licencas_expiradas')
        if (error) throw error
    } catch (error) {
        console.error('Error running expiration check:', error)
        throw error
    }
}

// ============================================
// MANUAL SUBSCRIPTION WORKFLOW
// ============================================

export interface SuperAdminContact {
    numero: string
    nome: string
    mensagem_padrao?: string
}

export interface DadosBancarios {
    banco: string
    conta: string
    iban: string
    titular: string
    instrucoes?: string
}

export interface PaymentModeConfig {
    modo_atual: 'manual' | 'online'
    pagamento_online_habilitado: boolean
    providers_configurados: string[]
    mensagem_modo_manual?: string
}

/**
 * Get SuperAdmin WhatsApp contact for payment proofs
 */
export async function getSuperAdminContact(): Promise<SuperAdminContact | null> {
    try {
        const { data, error } = await supabase
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', 'superadmin_whatsapp')
            .single()

        if (error) {
            console.warn('Error fetching SuperAdmin contact:', error)
            return null
        }

        return data?.valor as SuperAdminContact
    } catch (error) {
        console.error('Error fetching SuperAdmin contact:', error)
        return null
    }
}

/**
 * Get bank details for manual transfers
 */
export async function getDadosBancarios(): Promise<DadosBancarios | null> {
    try {
        const { data, error } = await supabase
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', 'dados_bancarios')
            .single()

        if (error) {
            console.warn('Error fetching bank details:', error)
            return null
        }

        return data?.valor as DadosBancarios
    } catch (error) {
        console.error('Error fetching bank details:', error)
        return null
    }
}

/**
 * Get payment mode configuration
 */
export async function getPaymentModeConfig(): Promise<PaymentModeConfig | null> {
    try {
        const { data, error } = await supabase
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', 'modo_pagamento')
            .single()

        if (error) {
            console.warn('Error fetching payment mode:', error)
            return null
        }

        return data?.valor as PaymentModeConfig
    } catch (error) {
        console.error('Error fetching payment mode:', error)
        return null
    }
}

/**
 * Check if online payment is enabled
 */
export async function isOnlinePaymentEnabled(): Promise<boolean> {
    const config = await getPaymentModeConfig()
    return config?.pagamento_online_habilitado ?? false
}

/**
 * Generate a unique reference code for manual subscription request
 */
function generateReferenceCode(escolaCode: string): string {
    const timestamp = Date.now().toString(36).toUpperCase()
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `${escolaCode}-${timestamp}-${random}`
}

/**
 * Request a manual subscription (creates pending transaction)
 */
export async function requestManualSubscription(
    escolaId: string,
    escolaCodigo: string,
    plano: PlanoLicenca
): Promise<{ success: boolean; reference: string; transaction_id?: string; error?: string }> {
    try {
        // Check if school has an active license
        const { data: activeLicense, error: licenseError } = await supabase
            .from('licencas')
            .select('id, estado, data_fim')
            .eq('escola_id', escolaId)
            .eq('estado', 'ativa')
            .single()

        if (activeLicense && !licenseError) {
            return {
                success: false,
                reference: '',
                error: 'Você já possui uma licença activa. Aguarde a expiração para renovar.'
            }
        }

        // Check if school has a pending manual subscription request
        const { data: pendingTransaction, error: pendingError } = await supabase
            .from('transacoes_pagamento')
            .select('id, metadata')
            .eq('escola_id', escolaId)
            .eq('provider', 'manual')
            .eq('estado', 'pendente')
            .single()

        if (pendingTransaction && !pendingError) {
            return {
                success: false,
                reference: '',
                error: 'Você já tem uma solicitação pendente. Aguarde a aprovação ou entre em contacto com o suporte.'
            }
        }

        // Get price for the plan
        const { data: priceData, error: priceError } = await supabase
            .from('precos_licenca')
            .select('valor')
            .eq('plano', plano)
            .eq('ativo', true)
            .single()

        if (priceError || !priceData) {
            throw new Error('Plano não encontrado')
        }

        const reference = generateReferenceCode(escolaCodigo)

        // Create pending transaction
        const { data: transaction, error: transError } = await supabase
            .from('transacoes_pagamento')
            .insert({
                escola_id: escolaId,
                provider: 'manual',
                valor: priceData.valor,
                estado: 'pendente',
                metodo_pagamento: 'transferencia',
                descricao: `Solicitação de assinatura ${plano} - Aguardando comprovativo`,
                metadata: {
                    plano,
                    reference,
                    solicitado_em: new Date().toISOString(),
                    tipo: 'manual_subscription_request'
                }
            })
            .select()
            .single()

        if (transError) {
            throw transError
        }

        return {
            success: true,
            reference,
            transaction_id: transaction.id
        }
    } catch (error) {
        console.error('Error requesting manual subscription:', error)
        return {
            success: false,
            reference: '',
            error: error instanceof Error ? error.message : 'Erro ao solicitar assinatura'
        }
    }
}

/**
 * Fetch pending subscription approvals (SUPERADMIN only)
 */
export async function fetchPendingApprovals(): Promise<TransacaoPagamento[]> {
    try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('listar_aprovacoes_pendentes_admin')

        if (!rpcError && Array.isArray(rpcData)) {
            return rpcData as TransacaoPagamento[]
        }

        if (rpcError) {
            console.warn('listar_aprovacoes_pendentes_admin RPC unavailable, falling back:', rpcError.message)
        }

        const { data, error } = await supabase
            .from('transacoes_pagamento')
            .select('*, escolas(id, nome, codigo_escola, provincia, municipio)')
            .eq('provider', 'manual')
            .eq('estado', 'pendente')
            .order('created_at', { ascending: false })

        if (error) throw error
        return data || []
    } catch (error) {
        console.error('Error fetching pending approvals:', error)
        throw error
    }
}

/**
 * Human-readable label for payment transaction status
 */
export function getTransactionStatusLabel(estado: string): string {
    const labels: Record<string, string> = {
        sucesso: 'Pagamento Confirmado',
        pendente: 'Aguardando Confirmação',
        processando: 'Em Processamento',
        falha: 'Pagamento Falhou',
        cancelado: 'Pagamento Cancelado',
        reembolsado: 'Reembolsado'
    }

    return labels[estado] || estado.charAt(0).toUpperCase() + estado.slice(1)
}

/**
 * Approve a manual subscription request (SUPERADMIN only)
 */
export async function approveManualSubscription(
    transactionId: string,
    plano: PlanoLicenca,
    motivo?: string
): Promise<{ success: boolean; licenca?: Licenca; error?: string }> {
    try {
        const { data, error } = await supabase.rpc('aprovar_pagamento_manual', {
            p_transacao_id: transactionId,
            p_plano: plano,
            p_motivo: motivo || null
        })

        if (error) {
            throw error
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Erro ao aprovar assinatura')
        }

        return {
            success: true,
            licenca: data.licenca as Licenca
        }
    } catch (error) {
        console.error('Error approving manual subscription:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Erro ao aprovar assinatura'
        }
    }
}

/**
 * Reject a manual subscription request (SUPERADMIN only)
 */
export async function rejectManualSubscription(
    transactionId: string,
    motivo: string
): Promise<void> {
    try {
        const { data, error } = await supabase.rpc('rejeitar_pagamento_manual', {
            p_transacao_id: transactionId,
            p_motivo: motivo
        })

        if (error) throw error
        if (!data?.success) {
            throw new Error(data?.error || 'Erro ao rejeitar solicitação')
        }
    } catch (error) {
        console.error('Error rejecting manual subscription:', error)
        throw error
    }
}

/**
 * Generate WhatsApp link with pre-filled message
 */
export function generateWhatsAppLink(
    phoneNumber: string,
    escolaNome: string,
    escolaCodigo: string,
    plano: string,
    reference: string
): string {
    const message = encodeURIComponent(
        `Olá! Gostaria de enviar o comprovativo de pagamento.\n\n` +
        `📋 Escola: ${escolaNome}\n` +
        `🔢 Código: ${escolaCodigo}\n` +
        `📦 Plano: ${plano}\n` +
        `🔖 Referência: ${reference}\n\n` +
        `Segue em anexo o comprovativo de pagamento.`
    )

    // Clean phone number (remove spaces, dashes, etc)
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '')

    return `https://wa.me/${cleanPhone}?text=${message}`
}
