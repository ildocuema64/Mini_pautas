-- ============================================
-- MIGRATION: Listar licenças para SUPERADMIN (bypass RLS seguro)
-- Purpose: Corrigir lista vazia "Nenhuma licença encontrada" no painel de licenças
-- Date: 2026-09-03
-- ============================================

-- Garantir colunas usadas pelo cache (idempotente)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'role_cache') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'role_cache' AND column_name = 'tipo_perfil') THEN
            ALTER TABLE role_cache ADD COLUMN tipo_perfil TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'role_cache' AND column_name = 'is_superadmin') THEN
            ALTER TABLE role_cache ADD COLUMN is_superadmin BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'role_cache' AND column_name = 'ativo') THEN
            ALTER TABLE role_cache ADD COLUMN ativo BOOLEAN DEFAULT true;
        END IF;
    END IF;
END $$;

-- Sincronizar SUPERADMINs no role_cache
INSERT INTO role_cache (user_id, tipo_perfil, is_superadmin, ativo, updated_at)
SELECT
    up.user_id,
    up.tipo_perfil,
    true,
    up.ativo,
    NOW()
FROM user_profiles up
WHERE up.tipo_perfil = 'SUPERADMIN'
ON CONFLICT (user_id) DO UPDATE SET
    tipo_perfil = 'SUPERADMIN',
    is_superadmin = true,
    ativo = EXCLUDED.ativo,
    updated_at = NOW();

-- Confirma SUPERADMIN via user_profiles (SECURITY DEFINER ignora RLS)
CREATE OR REPLACE FUNCTION assert_is_superadmin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ok BOOLEAN := false;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM user_profiles
        WHERE user_id = auth.uid()
          AND tipo_perfil = 'SUPERADMIN'
          AND ativo = true
    ) INTO v_ok;

    IF NOT v_ok THEN
        SELECT COALESCE(
            (SELECT tipo_perfil = 'SUPERADMIN' AND COALESCE(ativo, true)
             FROM role_cache WHERE user_id = auth.uid()),
            false
        ) INTO v_ok;
    END IF;

    IF NOT v_ok THEN
        RAISE EXCEPTION 'Acesso negado: apenas SUPERADMIN';
    END IF;
END;
$$;

-- Lista licenças com dados da escola
CREATE OR REPLACE FUNCTION listar_licencas_admin(
    p_estado TEXT DEFAULT NULL,
    p_plano TEXT DEFAULT NULL,
    p_escola_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    PERFORM assert_is_superadmin();

    SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            jsonb_build_object(
                'id', l.id,
                'escola_id', l.escola_id,
                'plano', l.plano,
                'data_inicio', l.data_inicio,
                'data_fim', l.data_fim,
                'estado', l.estado,
                'valor', l.valor,
                'data_ultimo_pagamento', l.data_ultimo_pagamento,
                'criado_por', l.criado_por,
                'created_at', l.created_at,
                'updated_at', l.updated_at,
                'escolas', CASE
                    WHEN e.id IS NULL THEN NULL
                    ELSE jsonb_build_object(
                        'id', e.id,
                        'nome', e.nome,
                        'codigo_escola', e.codigo_escola,
                        'provincia', e.provincia,
                        'municipio', e.municipio
                    )
                END
            ) AS row_data,
            l.created_at AS sort_at
        FROM licencas l
        LEFT JOIN escolas e ON e.id = l.escola_id
        WHERE (p_estado IS NULL OR l.estado = p_estado)
          AND (p_plano IS NULL OR l.plano = p_plano)
          AND (p_escola_id IS NULL OR l.escola_id = p_escola_id)
    ) sub;

    RETURN v_result;
END;
$$;

-- Lista aprovações pendentes
CREATE OR REPLACE FUNCTION listar_aprovacoes_pendentes_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    PERFORM assert_is_superadmin();

    SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            jsonb_build_object(
                'id', t.id,
                'licenca_id', t.licenca_id,
                'escola_id', t.escola_id,
                'provider', t.provider,
                'provider_transaction_id', t.provider_transaction_id,
                'valor', t.valor,
                'estado', t.estado,
                'metodo_pagamento', t.metodo_pagamento,
                'moeda', t.moeda,
                'descricao', t.descricao,
                'metadata', t.metadata,
                'created_at', t.created_at,
                'updated_at', t.updated_at,
                'escolas', CASE
                    WHEN e.id IS NULL THEN NULL
                    ELSE jsonb_build_object(
                        'id', e.id,
                        'nome', e.nome,
                        'codigo_escola', e.codigo_escola,
                        'provincia', e.provincia,
                        'municipio', e.municipio
                    )
                END
            ) AS row_data,
            t.created_at AS sort_at
        FROM transacoes_pagamento t
        LEFT JOIN escolas e ON e.id = t.escola_id
        WHERE t.provider = 'manual'
          AND t.estado = 'pendente'
    ) sub;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION assert_is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION listar_licencas_admin(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION listar_aprovacoes_pendentes_admin() TO authenticated;

COMMENT ON FUNCTION listar_licencas_admin IS 'Lista todas as licenças para SUPERADMIN, ignorando falhas de RLS no cliente';
COMMENT ON FUNCTION listar_aprovacoes_pendentes_admin IS 'Lista pagamentos manuais pendentes para SUPERADMIN';
