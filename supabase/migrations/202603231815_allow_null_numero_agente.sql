-- Permite cadastrar professor sem numero_agente e evita conflito com string vazia.
-- Regra desejada: numero_agente vazio => NULL; UNIQUE so deve bloquear valores preenchidos duplicados.

UPDATE professores
SET numero_agente = NULL
WHERE numero_agente IS NOT NULL
  AND btrim(numero_agente) = '';

ALTER TABLE professores
ALTER COLUMN numero_agente DROP NOT NULL;

CREATE OR REPLACE FUNCTION normalize_professor_numero_agente()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.numero_agente := NULLIF(btrim(NEW.numero_agente), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_professor_numero_agente ON professores;

CREATE TRIGGER trg_normalize_professor_numero_agente
BEFORE INSERT OR UPDATE ON professores
FOR EACH ROW
EXECUTE FUNCTION normalize_professor_numero_agente();
