-- ============================================
-- MIGRATION: Fix sync_new_componente_template trigger
-- Problem: trigger used ON CONFLICT (disciplina_id, turma_id, codigo_componente, trimestre)
--          but the real constraint is UNIQUE (disciplina_id, codigo_componente, trimestre)
--          without turma_id, causing error 42P10.
-- Fix: replace ON CONFLICT with IF NOT EXISTS including trimestre in the check
--      so components for trimestre 3 are also correctly synced.
-- ============================================

CREATE OR REPLACE FUNCTION sync_new_componente_template()
RETURNS TRIGGER AS $$
DECLARE
    v_link RECORD;
    v_escola_id UUID;
    v_componente_catalogo_id UUID;
BEGIN
    FOR v_link IN
        SELECT ttl.disciplina_id, ttl.turma_id, t.escola_id
        FROM turma_template_link ttl
        JOIN turmas t ON ttl.turma_id = t.id
        WHERE ttl.disciplina_template_id = NEW.disciplina_template_id
    LOOP
        -- Get or create in catalog
        v_componente_catalogo_id := get_or_create_componente_catalogo(
            v_link.escola_id,
            NEW.codigo_componente,
            NEW.nome,
            NEW.peso_percentual,
            NEW.escala_minima,
            NEW.escala_maxima,
            NEW.is_calculated,
            NEW.formula_expression,
            COALESCE(
                (
                    SELECT array_agg(ct2.codigo_componente)
                    FROM componentes_template ct2
                    WHERE ct2.id::text IN (
                        SELECT jsonb_array_elements_text(
                            CASE
                                WHEN NEW.depends_on_components IS NULL THEN '[]'::jsonb
                                WHEN jsonb_typeof(NEW.depends_on_components) = 'array' THEN NEW.depends_on_components
                                ELSE '[]'::jsonb
                            END
                        )
                    )
                ),
                '{}'::text[]
            ),
            NEW.tipo_calculo,
            NEW.descricao
        );

        -- Associate to disciplina (handles duplicate via upsert logic inside)
        PERFORM associate_componente_to_disciplina(
            v_link.disciplina_id,
            v_componente_catalogo_id,
            NEW.trimestre,
            NEW.peso_percentual,
            NEW.ordem,
            NEW.obrigatorio
        );

        -- Sync to componentes_avaliacao (backwards compatibility)
        -- Check includes trimestre so the same component in different trimesters is inserted correctly.
        -- No ON CONFLICT used to avoid constraint mismatch errors (42P10).
        IF NOT EXISTS (
            SELECT 1 FROM componentes_avaliacao
            WHERE disciplina_id = v_link.disciplina_id
              AND codigo_componente = NEW.codigo_componente
              AND trimestre = NEW.trimestre
        ) THEN
            INSERT INTO componentes_avaliacao (
                disciplina_id,
                turma_id,
                nome,
                codigo_componente,
                peso_percentual,
                escala_minima,
                escala_maxima,
                obrigatorio,
                ordem,
                descricao,
                trimestre,
                is_calculated,
                formula_expression,
                depends_on_components,
                tipo_calculo
            ) VALUES (
                v_link.disciplina_id,
                v_link.turma_id,
                NEW.nome,
                NEW.codigo_componente,
                NEW.peso_percentual,
                NEW.escala_minima,
                NEW.escala_maxima,
                NEW.obrigatorio,
                NEW.ordem,
                NEW.descricao,
                NEW.trimestre,
                NEW.is_calculated,
                NEW.formula_expression,
                NEW.depends_on_components,
                NEW.tipo_calculo
            );
        END IF;
    END LOOP;

    UPDATE turma_template_link
    SET sincronizado_em = NOW()
    WHERE disciplina_template_id = NEW.disciplina_template_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it points to the updated function
DROP TRIGGER IF EXISTS trigger_sync_new_componente_template ON componentes_template;

CREATE TRIGGER trigger_sync_new_componente_template
    AFTER INSERT ON componentes_template
    FOR EACH ROW
    EXECUTE FUNCTION sync_new_componente_template();

COMMENT ON FUNCTION sync_new_componente_template IS
'Syncs a new component from a template to all linked turmas.
Fixed: no ON CONFLICT used; IF NOT EXISTS includes trimestre so
components added to trimestre 3 are correctly propagated.';
