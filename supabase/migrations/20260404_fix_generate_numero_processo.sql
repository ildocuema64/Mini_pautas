-- ============================================================
-- FIX: generate_numero_processo — número de 5 dígitos único
-- Data: 2026-04-04
-- Problema: função anterior usava ano_lectivo INTEGER (era TEXT)
--   e formato longo TURMA-ANO-XXXX. Agora gera apenas 5 dígitos.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_numero_processo(turma_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    v_numero TEXT;
BEGIN
    -- Gerar número aleatório de 5 dígitos (10000–99999) único globalmente
    LOOP
        v_numero := LPAD((FLOOR(RANDOM() * 90000) + 10000)::TEXT, 5, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM alunos WHERE numero_processo = v_numero
        );
    END LOOP;

    RETURN v_numero;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION generate_numero_processo(UUID) TO authenticated;
