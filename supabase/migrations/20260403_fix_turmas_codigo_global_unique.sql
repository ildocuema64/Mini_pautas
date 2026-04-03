-- ============================================================
-- FIX: Remover restrição de unicidade global em codigo_turma
-- Data: 2026-04-03
-- Problema: A constraint "turmas_codigo_turma_key" (gerada pela
--   declaração `codigo_turma TEXT NOT NULL UNIQUE` no schema
--   inicial) impedia que duas escolas distintas criassem turmas
--   com o mesmo código gerado (ex: "1ClasseA-2025-2026-T1").
-- Solução: Remover a constraint global. A unicidade correcta
--   já é garantida pela constraint "unique_turma_periodo" que
--   abrange (escola_id, codigo_turma, ano_lectivo, trimestre),
--   ou seja, o mesmo código só é proibido dentro da MESMA escola
--   no mesmo período lectivo, que é o comportamento esperado.
-- ============================================================

DO $$
BEGIN
    -- Remover a constraint de unicidade global em codigo_turma
    -- gerada implicitamente pela definição da coluna como UNIQUE
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'turmas_codigo_turma_key'
          AND conrelid = 'turmas'::regclass
    ) THEN
        ALTER TABLE turmas DROP CONSTRAINT turmas_codigo_turma_key;
        RAISE NOTICE 'Constraint turmas_codigo_turma_key removida com sucesso.';
    ELSE
        RAISE NOTICE 'Constraint turmas_codigo_turma_key não encontrada (já foi removida anteriormente).';
    END IF;

    -- Garantir que a constraint por escola já existe (criá-la se não existir)
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'unique_turma_periodo'
          AND conrelid = 'turmas'::regclass
    ) THEN
        ALTER TABLE turmas
            ADD CONSTRAINT unique_turma_periodo
            UNIQUE (escola_id, codigo_turma, ano_lectivo, trimestre);
        RAISE NOTICE 'Constraint unique_turma_periodo criada.';
    ELSE
        RAISE NOTICE 'Constraint unique_turma_periodo já existe — sem alteração.';
    END IF;
END $$;
