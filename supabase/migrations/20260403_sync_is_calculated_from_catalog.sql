-- ============================================================
-- MIGRATION: Sync is_calculated and formula fields from catalog
-- Data: 2026-04-03
-- Problema: A migração add_calculated_fields_migration_safe.sql
--   adicionou a coluna is_calculated com DEFAULT false, o que
--   fez com que todos os registos existentes em componentes_avaliacao
--   ficassem com is_calculated = false, incluindo os componentes
--   calculáveis definidos no catálogo (componentes_catalogo).
--   Adicionalmente, o ComponenteSelectorModal.tsx usava
--   ON CONFLICT DO NOTHING, impedindo a actualização do campo
--   quando o registo já existia.
-- Solução:
--   1. Actualizar is_calculated, formula_expression e tipo_calculo
--      em componentes_avaliacao com base nos dados do catálogo
--      para todos os registos onde o catálogo marca is_calculated = true
--      mas componentes_avaliacao tem false ou null.
--   2. Criar um trigger para manter a sincronização automática
--      quando o catálogo for actualizado no futuro.
-- ============================================================

-- ============================================================
-- PASSO 1: Actualizar registos existentes com dados do catálogo
-- ============================================================
-- Nota: Em PostgreSQL, UPDATE ... FROM não permite referenciar a
-- tabela alvo dentro de cláusulas JOIN do FROM — a ligação faz-se
-- exclusivamente no WHERE. Por isso usamos FROM com vírgula e o
-- JOIN move-se para o WHERE.
DO $$
DECLARE
    v_count INT;
BEGIN
    UPDATE componentes_avaliacao ca
    SET
        is_calculated    = true,
        formula_expression = CASE
            WHEN ca.formula_expression IS NOT NULL AND ca.formula_expression != ''
                THEN ca.formula_expression
            ELSE cc.formula_expression
        END,
        tipo_calculo     = CASE
            WHEN ca.tipo_calculo IS NOT NULL AND ca.tipo_calculo != ''
                THEN ca.tipo_calculo
            ELSE COALESCE(cc.tipo_calculo, 'trimestral')
        END
    FROM componentes_catalogo cc,
         turmas t
    WHERE t.id                = ca.turma_id
      AND cc.escola_id        = t.escola_id
      AND cc.codigo_componente = ca.codigo_componente
      AND cc.is_calculated    = true
      AND (ca.is_calculated IS NULL OR ca.is_calculated = false);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Sync concluído: % registo(s) de componentes_avaliacao actualizados com is_calculated = true a partir do catálogo.', v_count;
END $$;

-- ============================================================
-- PASSO 2: Trigger para manter sincronização futura
--   Quando is_calculated, formula_expression ou tipo_calculo
--   forem alterados no catálogo, os registos operacionais
--   em componentes_avaliacao são actualizados automaticamente.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_catalogo_calculated_to_avaliacao()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        OLD.is_calculated       IS DISTINCT FROM NEW.is_calculated OR
        OLD.formula_expression  IS DISTINCT FROM NEW.formula_expression OR
        OLD.tipo_calculo        IS DISTINCT FROM NEW.tipo_calculo
    ) THEN
        UPDATE componentes_avaliacao ca
        SET
            is_calculated    = NEW.is_calculated,
            formula_expression = NEW.formula_expression,
            tipo_calculo     = COALESCE(NEW.tipo_calculo, 'trimestral')
        FROM turmas t
        WHERE ca.turma_id        = t.id
          AND t.escola_id        = NEW.escola_id
          AND ca.codigo_componente = NEW.codigo_componente;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sync_catalogo_calculated_to_avaliacao IS
'Mantém is_calculated, formula_expression e tipo_calculo em
componentes_avaliacao sincronizados com componentes_catalogo
quando o catálogo for actualizado.';

DROP TRIGGER IF EXISTS trigger_sync_catalogo_calculated_to_avaliacao
    ON componentes_catalogo;

CREATE TRIGGER trigger_sync_catalogo_calculated_to_avaliacao
    AFTER UPDATE ON componentes_catalogo
    FOR EACH ROW
    EXECUTE FUNCTION sync_catalogo_calculated_to_avaliacao();
