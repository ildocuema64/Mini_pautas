-- ============================================
-- MIGRATION: Aprovar/Rejeitar pagamento manual de forma atómica
-- Purpose: Garantir que a transação pendente passa a confirmada no lado da escola
-- Date: 2026-09-01
-- ============================================

CREATE OR REPLACE FUNCTION aprovar_pagamento_manual(
    p_transacao_id UUID,
    p_plano TEXT,
    p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_transacao transacoes_pagamento%ROWTYPE;
    v_licenca licencas%ROWTYPE;
    v_data_inicio DATE := CURRENT_DATE;
    v_data_fim DATE;
    v_motivo TEXT;
BEGIN
    IF NOT is_superadmin() THEN
        RAISE EXCEPTION 'Apenas SUPERADMIN pode aprovar pagamentos';
    END IF;

    SELECT * INTO v_transacao
    FROM transacoes_pagamento
    WHERE id = p_transacao_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transação não encontrada';
    END IF;

    IF v_transacao.estado <> 'pendente' THEN
        RAISE EXCEPTION 'Transação não está pendente';
    END IF;

    v_motivo := COALESCE(
        NULLIF(TRIM(p_motivo), ''),
        format('Pagamento confirmado - Ref: %s', COALESCE(v_transacao.metadata->>'reference', v_transacao.id::text))
    );

    v_data_fim := calcular_data_fim_licenca(v_data_inicio, p_plano);

    UPDATE licencas
    SET estado = 'cancelada', updated_at = NOW()
    WHERE escola_id = v_transacao.escola_id AND estado = 'ativa';

    INSERT INTO licencas (
        escola_id, plano, data_inicio, data_fim, estado, valor,
        data_ultimo_pagamento, criado_por
    ) VALUES (
        v_transacao.escola_id, p_plano, v_data_inicio, v_data_fim, 'ativa',
        v_transacao.valor, NOW(), auth.uid()
    )
    RETURNING * INTO v_licenca;

    UPDATE transacoes_pagamento
    SET
        estado = 'sucesso',
        licenca_id = v_licenca.id,
        descricao = v_motivo,
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'aprovado_em', NOW(),
            'plano_aprovado', p_plano,
            'pagamento_confirmado', true
        )
    WHERE id = p_transacao_id;

    UPDATE escolas
    SET
        bloqueado = false,
        bloqueado_motivo = NULL,
        bloqueado_em = NULL,
        bloqueado_por = NULL,
        ativo = true
    WHERE id = v_transacao.escola_id;

    INSERT INTO historico_licencas (
        licenca_id, escola_id, estado_anterior, estado_novo, motivo, alterado_por
    ) VALUES (
        v_licenca.id,
        v_transacao.escola_id,
        'pendente',
        'ativa',
        v_motivo,
        auth.uid()
    );

    RETURN jsonb_build_object(
        'success', true,
        'licenca', to_jsonb(v_licenca)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION rejeitar_pagamento_manual(
    p_transacao_id UUID,
    p_motivo TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_transacao transacoes_pagamento%ROWTYPE;
BEGIN
    IF NOT is_superadmin() THEN
        RAISE EXCEPTION 'Apenas SUPERADMIN pode rejeitar pagamentos';
    END IF;

    IF p_motivo IS NULL OR TRIM(p_motivo) = '' THEN
        RAISE EXCEPTION 'Motivo da rejeição é obrigatório';
    END IF;

    SELECT * INTO v_transacao
    FROM transacoes_pagamento
    WHERE id = p_transacao_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transação não encontrada';
    END IF;

    IF v_transacao.estado <> 'pendente' THEN
        RAISE EXCEPTION 'Transação não está pendente';
    END IF;

    UPDATE transacoes_pagamento
    SET
        estado = 'cancelado',
        descricao = format('Rejeitado: %s', p_motivo),
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'rejeitado_em', NOW(),
            'motivo_rejeicao', p_motivo,
            'pagamento_confirmado', false
        )
    WHERE id = p_transacao_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION aprovar_pagamento_manual(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rejeitar_pagamento_manual(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION aprovar_pagamento_manual IS 'Aprova pagamento manual, activa licença e marca transação como confirmada';
COMMENT ON FUNCTION rejeitar_pagamento_manual IS 'Rejeita pagamento manual pendente';
