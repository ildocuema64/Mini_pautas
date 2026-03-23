-- ============================================
-- MINI-PAUTAS SYSTEM - COMPLETE DATABASE SCHEMA
-- Supabase PostgreSQL Database
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- CORE TABLES
-- ============================================

-- Schools Table
CREATE TABLE escolas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    codigo_escola TEXT NOT NULL UNIQUE,
    provincia TEXT NOT NULL,
    municipio TEXT NOT NULL,
    endereco TEXT,
    telefone TEXT,
    email TEXT,
    configuracoes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teachers Table
CREATE TABLE professores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escola_id UUID NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome_completo TEXT NOT NULL,
    numero_agente TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT,
    especialidade TEXT,
    funcoes TEXT[] DEFAULT ARRAY['professor']::TEXT[],
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Classes Table
CREATE TABLE turmas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escola_id UUID NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
    professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    codigo_turma TEXT NOT NULL UNIQUE,
    ano_lectivo INTEGER NOT NULL,
    trimestre INTEGER NOT NULL CHECK (trimestre IN (1, 2, 3)),
    nivel_ensino TEXT NOT NULL,
    sala INTEGER,
    turno TEXT CHECK (turno IN ('manhã', 'tarde', 'noite')),
    capacidade_maxima INTEGER DEFAULT 40,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_turma_periodo UNIQUE (escola_id, codigo_turma, ano_lectivo, trimestre)
);

-- Students Table
CREATE TABLE alunos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nome_completo TEXT NOT NULL,
    numero_processo TEXT NOT NULL UNIQUE,
    data_nascimento DATE,
    genero TEXT CHECK (genero IN ('M', 'F', 'Outro')),
    nome_encarregado TEXT,
    telefone_encarregado TEXT,
    email_encarregado TEXT,
    endereco TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subjects/Disciplines Table
CREATE TABLE disciplinas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    codigo_disciplina TEXT NOT NULL,
    carga_horaria INTEGER,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_disciplina_turma UNIQUE (turma_id, codigo_disciplina)
);

-- ============================================
-- ASSESSMENT CONFIGURATION TABLES
-- ============================================

-- Evaluation Components Table
CREATE TABLE componentes_avaliacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    disciplina_id UUID NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    codigo_componente TEXT NOT NULL,
    peso_percentual NUMERIC(5,2) NOT NULL CHECK (peso_percentual > 0 AND peso_percentual <= 100),
    escala_minima NUMERIC(5,2) NOT NULL DEFAULT 0,
    escala_maxima NUMERIC(5,2) NOT NULL DEFAULT 20,
    obrigatorio BOOLEAN DEFAULT true,
    ordem INTEGER DEFAULT 1,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_escala CHECK (escala_minima < escala_maxima),
    CONSTRAINT unique_componente_disciplina UNIQUE (disciplina_id, codigo_componente)
);

-- Formulas Table
CREATE TABLE formulas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina_id UUID NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    expressao TEXT NOT NULL,
    componentes_usados JSONB NOT NULL DEFAULT '[]'::jsonb,
    validada BOOLEAN DEFAULT false,
    mensagem_validacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_formula_disciplina UNIQUE (turma_id, disciplina_id)
);

-- ============================================
-- GRADES & RESULTS TABLES
-- ============================================

-- Individual Grades Table
CREATE TABLE notas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    componente_id UUID NOT NULL REFERENCES componentes_avaliacao(id) ON DELETE CASCADE,
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    valor NUMERIC(5,2) NOT NULL,
    observacao TEXT,
    lancado_por UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    data_lancamento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_nota_aluno_componente UNIQUE (aluno_id, componente_id)
);

-- Final Grades Table
CREATE TABLE notas_finais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aluno_id UUID NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    disciplina_id UUID NOT NULL REFERENCES disciplinas(id) ON DELETE CASCADE,
    trimestre INTEGER NOT NULL CHECK (trimestre IN (1, 2, 3)),
    nota_final NUMERIC(5,2) NOT NULL,
    classificacao TEXT,
    calculo_detalhado JSONB,
    data_calculo TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_nota_final UNIQUE (aluno_id, turma_id, disciplina_id, trimestre)
);

-- ============================================
-- SYSTEM TABLES
-- ============================================

-- Audit Trail Table
CREATE TABLE auditoria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tabela TEXT NOT NULL,
    operacao TEXT NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
    dados_antigos JSONB,
    dados_novos JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE notificacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    destinatario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    dados_adicionais JSONB DEFAULT '{}'::jsonb,
    lida BOOLEAN DEFAULT false,
    lida_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System Configuration Table
CREATE TABLE configuracoes_sistema (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chave TEXT NOT NULL UNIQUE,
    valor JSONB NOT NULL,
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Escolas indexes
CREATE INDEX idx_escolas_provincia ON escolas(provincia);
CREATE INDEX idx_escolas_municipio ON escolas(municipio);

-- Professores indexes
CREATE INDEX idx_professores_escola ON professores(escola_id);
CREATE INDEX idx_professores_user ON professores(user_id);
CREATE INDEX idx_professores_numero_agente ON professores(numero_agente);

-- Turmas indexes
CREATE INDEX idx_turmas_escola ON turmas(escola_id);
CREATE INDEX idx_turmas_professor ON turmas(professor_id);
CREATE INDEX idx_turmas_ano_trimestre ON turmas(ano_lectivo, trimestre);
CREATE INDEX idx_turmas_professor_trimestre ON turmas(professor_id, ano_lectivo, trimestre);

-- Alunos indexes
CREATE INDEX idx_alunos_turma ON alunos(turma_id);
CREATE INDEX idx_alunos_numero_processo ON alunos(numero_processo);
CREATE INDEX idx_alunos_nome ON alunos(nome_completo);
CREATE INDEX idx_alunos_turma_ativo ON alunos(turma_id, ativo);

-- Disciplinas indexes
CREATE INDEX idx_disciplinas_professor ON disciplinas(professor_id);
CREATE INDEX idx_disciplinas_turma ON disciplinas(turma_id);
CREATE INDEX idx_disciplinas_codigo ON disciplinas(codigo_disciplina);

-- Componentes indexes
CREATE INDEX idx_componentes_disciplina ON componentes_avaliacao(disciplina_id);
CREATE INDEX idx_componentes_turma ON componentes_avaliacao(turma_id);

-- Formulas indexes
CREATE INDEX idx_formulas_turma ON formulas(turma_id);
CREATE INDEX idx_formulas_disciplina ON formulas(disciplina_id);

-- Notas indexes
CREATE INDEX idx_notas_aluno ON notas(aluno_id);
CREATE INDEX idx_notas_componente ON notas(componente_id);
CREATE INDEX idx_notas_turma ON notas(turma_id);
CREATE INDEX idx_notas_aluno_componente ON notas(aluno_id, componente_id);

-- Notas Finais indexes
CREATE INDEX idx_notas_finais_aluno ON notas_finais(aluno_id);
CREATE INDEX idx_notas_finais_turma ON notas_finais(turma_id);
CREATE INDEX idx_notas_finais_disciplina ON notas_finais(disciplina_id);
CREATE INDEX idx_notas_finais_lookup ON notas_finais(aluno_id, turma_id, trimestre);

-- Auditoria indexes
CREATE INDEX idx_auditoria_user ON auditoria(user_id);
CREATE INDEX idx_auditoria_tabela ON auditoria(tabela);
CREATE INDEX idx_auditoria_created ON auditoria(created_at DESC);
CREATE INDEX idx_auditoria_user_date ON auditoria(user_id, created_at DESC);

-- Notificacoes indexes
CREATE INDEX idx_notificacoes_destinatario ON notificacoes(destinatario_id);
CREATE INDEX idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX idx_notificacoes_created ON notificacoes(created_at DESC);
CREATE INDEX idx_notificacoes_destinatario_lida ON notificacoes(destinatario_id, lida, created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Function for audit trail
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO auditoria (user_id, tabela, operacao, dados_antigos, ip_address)
        VALUES (
            auth.uid(), 
            TG_TABLE_NAME, 
            TG_OP, 
            row_to_json(OLD),
            COALESCE(current_setting('request.headers', true)::json->>'x-real-ip', 'unknown')
        );
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO auditoria (user_id, tabela, operacao, dados_antigos, dados_novos, ip_address)
        VALUES (
            auth.uid(), 
            TG_TABLE_NAME, 
            TG_OP, 
            row_to_json(OLD), 
            row_to_json(NEW),
            COALESCE(current_setting('request.headers', true)::json->>'x-real-ip', 'unknown')
        );
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO auditoria (user_id, tabela, operacao, dados_novos, ip_address)
        VALUES (
            auth.uid(), 
            TG_TABLE_NAME, 
            TG_OP, 
            row_to_json(NEW),
            COALESCE(current_setting('request.headers', true)::json->>'x-real-ip', 'unknown')
        );
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to all main tables
CREATE TRIGGER audit_escolas AFTER INSERT OR UPDATE OR DELETE ON escolas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_professores AFTER INSERT OR UPDATE OR DELETE ON professores
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_turmas AFTER INSERT OR UPDATE OR DELETE ON turmas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_alunos AFTER INSERT OR UPDATE OR DELETE ON alunos
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_disciplinas AFTER INSERT OR UPDATE OR DELETE ON disciplinas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_componentes AFTER INSERT OR UPDATE OR DELETE ON componentes_avaliacao
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_formulas AFTER INSERT OR UPDATE OR DELETE ON formulas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_notas AFTER INSERT OR UPDATE OR DELETE ON notas
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_notas_finais AFTER INSERT OR UPDATE OR DELETE ON notas_finais
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Function for grade entry notification
CREATE OR REPLACE FUNCTION notify_grade_entry()
RETURNS TRIGGER AS $$
DECLARE
    componente_nome TEXT;
    aluno_user_id UUID;
BEGIN
    -- Get component name
    SELECT nome INTO componente_nome
    FROM componentes_avaliacao
    WHERE id = NEW.componente_id;
    
    -- Get student's user_id if exists
    SELECT user_id INTO aluno_user_id
    FROM alunos
    WHERE id = NEW.aluno_id;
    
    -- Create notification if student has user account
    IF aluno_user_id IS NOT NULL THEN
        INSERT INTO notificacoes (destinatario_id, tipo, titulo, mensagem, dados_adicionais)
        VALUES (
            aluno_user_id,
            'nota_lancada',
            'Nova nota lançada',
            'Foi lançada uma nota de ' || NEW.valor || ' para ' || componente_nome,
            jsonb_build_object(
                'nota_id', NEW.id, 
                'valor', NEW.valor, 
                'componente', componente_nome,
                'componente_id', NEW.componente_id
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER notify_on_grade_entry AFTER INSERT ON notas
    FOR EACH ROW EXECUTE FUNCTION notify_grade_entry();

-- Function for final grade notification
CREATE OR REPLACE FUNCTION notify_final_grade()
RETURNS TRIGGER AS $$
DECLARE
    disciplina_nome TEXT;
    aluno_user_id UUID;
BEGIN
    -- Get discipline name
    SELECT nome INTO disciplina_nome
    FROM disciplinas
    WHERE id = NEW.disciplina_id;
    
    -- Get student's user_id if exists
    SELECT user_id INTO aluno_user_id
    FROM alunos
    WHERE id = NEW.aluno_id;
    
    -- Create notification if student has user account
    IF aluno_user_id IS NOT NULL THEN
        INSERT INTO notificacoes (destinatario_id, tipo, titulo, mensagem, dados_adicionais)
        VALUES (
            aluno_user_id,
            'nota_final_calculada',
            'Nota final calculada',
            'Sua nota final em ' || disciplina_nome || ' é ' || NEW.nota_final || ' (' || NEW.classificacao || ')',
            jsonb_build_object(
                'nota_final_id', NEW.id,
                'nota_final', NEW.nota_final,
                'classificacao', NEW.classificacao,
                'disciplina', disciplina_nome,
                'trimestre', NEW.trimestre
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER notify_on_final_grade AFTER INSERT OR UPDATE ON notas_finais
    FOR EACH ROW EXECUTE FUNCTION notify_final_grade();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_escolas_updated_at BEFORE UPDATE ON escolas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_professores_updated_at BEFORE UPDATE ON professores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_turmas_updated_at BEFORE UPDATE ON turmas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alunos_updated_at BEFORE UPDATE ON alunos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disciplinas_updated_at BEFORE UPDATE ON disciplinas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_componentes_updated_at BEFORE UPDATE ON componentes_avaliacao
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_formulas_updated_at BEFORE UPDATE ON formulas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notas_updated_at BEFORE UPDATE ON notas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notas_finais_updated_at BEFORE UPDATE ON notas_finais
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuracoes_updated_at BEFORE UPDATE ON configuracoes_sistema
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE escolas ENABLE ROW LEVEL SECURITY;
ALTER TABLE professores ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciplinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE componentes_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_finais ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- Professores policies
CREATE POLICY "Professors can view own profile"
    ON professores FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Professors can update own profile"
    ON professores FOR UPDATE
    USING (auth.uid() = user_id);

-- Turmas policies
CREATE POLICY "Professors can view own classes"
    ON turmas FOR SELECT
    USING (professor_id IN (SELECT id FROM professores WHERE user_id = auth.uid()));

CREATE POLICY "Professors can create classes"
    ON turmas FOR INSERT
    WITH CHECK (professor_id IN (SELECT id FROM professores WHERE user_id = auth.uid()));

CREATE POLICY "Professors can update own classes"
    ON turmas FOR UPDATE
    USING (professor_id IN (SELECT id FROM professores WHERE user_id = auth.uid()));

-- Alunos policies
CREATE POLICY "Professors can view students in their classes"
    ON alunos FOR SELECT
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Students can view own profile"
    ON alunos FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Professors can manage students in their classes"
    ON alunos FOR ALL
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

-- Disciplinas policies
CREATE POLICY "Professors can view own disciplines"
    ON disciplinas FOR SELECT
    USING (professor_id IN (SELECT id FROM professores WHERE user_id = auth.uid()));

CREATE POLICY "Professors can manage own disciplines"
    ON disciplinas FOR ALL
    USING (professor_id IN (SELECT id FROM professores WHERE user_id = auth.uid()));

-- Componentes policies
CREATE POLICY "Professors can view components for their disciplines"
    ON componentes_avaliacao FOR SELECT
    USING (disciplina_id IN (
        SELECT id FROM disciplinas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Professors can manage components for their disciplines"
    ON componentes_avaliacao FOR ALL
    USING (disciplina_id IN (
        SELECT id FROM disciplinas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

-- Formulas policies
CREATE POLICY "Professors can view formulas for their classes"
    ON formulas FOR SELECT
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Professors can manage formulas for their classes"
    ON formulas FOR ALL
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

-- Notas policies
CREATE POLICY "Professors can view grades for their classes"
    ON notas FOR SELECT
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Professors can insert grades for their classes"
    ON notas FOR INSERT
    WITH CHECK (
        turma_id IN (
            SELECT id FROM turmas WHERE professor_id IN (
                SELECT id FROM professores WHERE user_id = auth.uid()
            )
        )
        AND lancado_por IN (SELECT id FROM professores WHERE user_id = auth.uid())
    );

CREATE POLICY "Professors can update grades for their classes"
    ON notas FOR UPDATE
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Students can view own grades"
    ON notas FOR SELECT
    USING (aluno_id IN (SELECT id FROM alunos WHERE user_id = auth.uid()));

-- Notas Finais policies
CREATE POLICY "Professors can view final grades for their classes"
    ON notas_finais FOR SELECT
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Professors can manage final grades for their classes"
    ON notas_finais FOR ALL
    USING (turma_id IN (
        SELECT id FROM turmas WHERE professor_id IN (
            SELECT id FROM professores WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Students can view own final grades"
    ON notas_finais FOR SELECT
    USING (aluno_id IN (SELECT id FROM alunos WHERE user_id = auth.uid()));

-- Auditoria policies
CREATE POLICY "Users can view own audit trail"
    ON auditoria FOR SELECT
    USING (user_id = auth.uid());

-- Notificacoes policies
CREATE POLICY "Users can view own notifications"
    ON notificacoes FOR SELECT
    USING (destinatario_id = auth.uid());

CREATE POLICY "Users can update own notifications"
    ON notificacoes FOR UPDATE
    USING (destinatario_id = auth.uid());

-- Configuracoes policies (admin only - implement based on custom claims)
CREATE POLICY "Admins can manage system configuration"
    ON configuracoes_sistema FOR ALL
    USING (auth.jwt() ->> 'role' = 'admin');

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Mini-Pauta View
CREATE OR REPLACE VIEW vw_mini_pauta AS
SELECT 
    t.id as turma_id,
    t.nome as turma_nome,
    t.codigo_turma,
    t.ano_lectivo,
    t.trimestre,
    d.id as disciplina_id,
    d.nome as disciplina_nome,
    a.id as aluno_id,
    a.nome_completo as aluno_nome,
    a.numero_processo,
    nf.nota_final,
    nf.classificacao,
    nf.calculo_detalhado,
    nf.data_calculo,
    p.nome_completo as professor_nome,
    e.nome as escola_nome
FROM turmas t
JOIN escolas e ON e.id = t.escola_id
JOIN alunos a ON a.turma_id = t.id
JOIN notas_finais nf ON nf.aluno_id = a.id AND nf.turma_id = t.id
JOIN disciplinas d ON d.id = nf.disciplina_id
JOIN professores p ON p.id = t.professor_id
WHERE a.ativo = true
ORDER BY t.nome, a.nome_completo;

-- Class Statistics View
CREATE OR REPLACE VIEW vw_estatisticas_turma AS
SELECT 
    t.id as turma_id,
    t.nome as turma_nome,
    t.codigo_turma,
    d.id as disciplina_id,
    d.nome as disciplina_nome,
    t.trimestre,
    t.ano_lectivo,
    COUNT(DISTINCT a.id) as total_alunos,
    ROUND(AVG(nf.nota_final), 2) as media_turma,
    ROUND(MIN(nf.nota_final), 2) as nota_minima,
    ROUND(MAX(nf.nota_final), 2) as nota_maxima,
    COUNT(CASE WHEN nf.nota_final >= 10 THEN 1 END) as aprovados,
    COUNT(CASE WHEN nf.nota_final < 10 THEN 1 END) as reprovados,
    ROUND(COUNT(CASE WHEN nf.nota_final >= 10 THEN 1 END)::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) as taxa_aprovacao
FROM turmas t
JOIN disciplinas d ON d.turma_id = t.id
JOIN alunos a ON a.turma_id = t.id
LEFT JOIN notas_finais nf ON nf.aluno_id = a.id AND nf.turma_id = t.id AND nf.disciplina_id = d.id
WHERE a.ativo = true
GROUP BY t.id, t.nome, t.codigo_turma, d.id, d.nome, t.trimestre, t.ano_lectivo;

-- Student Performance View
CREATE OR REPLACE VIEW vw_desempenho_aluno AS
SELECT 
    a.id as aluno_id,
    a.nome_completo as aluno_nome,
    a.numero_processo,
    t.id as turma_id,
    t.nome as turma_nome,
    d.id as disciplina_id,
    d.nome as disciplina_nome,
    ca.nome as componente_nome,
    n.valor as nota_componente,
    nf.nota_final,
    nf.classificacao,
    t.trimestre,
    t.ano_lectivo
FROM alunos a
JOIN turmas t ON t.id = a.turma_id
JOIN disciplinas d ON d.turma_id = t.id
LEFT JOIN componentes_avaliacao ca ON ca.disciplina_id = d.id
LEFT JOIN notas n ON n.aluno_id = a.id AND n.componente_id = ca.id
LEFT JOIN notas_finais nf ON nf.aluno_id = a.id AND nf.disciplina_id = d.id AND nf.turma_id = t.id
WHERE a.ativo = true
ORDER BY a.nome_completo, d.nome, ca.ordem;

-- ============================================
-- INITIAL CONFIGURATION DATA
-- ============================================

-- Insert default system configurations
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('classificacao_escala', 
 '{"0-9": "Insuficiente", "10-13": "Suficiente", "14-16": "Bom", "17-20": "Excelente"}'::jsonb,
 'Escala de classificação padrão'),
('trimestres', 
 '{"1": {"inicio": "01-02", "fim": "30-04"}, "2": {"inicio": "01-05", "fim": "31-07"}, "3": {"inicio": "01-08", "fim": "30-11"}}'::jsonb,
 'Datas dos trimestres'),
('nota_minima_aprovacao', 
 '{"valor": 10}'::jsonb,
 'Nota mínima para aprovação');

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get classification from grade
CREATE OR REPLACE FUNCTION get_classificacao(nota NUMERIC)
RETURNS TEXT AS $$
BEGIN
    IF nota >= 17 THEN
        RETURN 'Excelente';
    ELSIF nota >= 14 THEN
        RETURN 'Bom';
    ELSIF nota >= 10 THEN
        RETURN 'Suficiente';
    ELSE
        RETURN 'Insuficiente';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to validate component weights sum to 100%
CREATE OR REPLACE FUNCTION validate_component_weights(disciplina_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    total_peso NUMERIC;
BEGIN
    SELECT SUM(peso_percentual) INTO total_peso
    FROM componentes_avaliacao
    WHERE disciplina_id = disciplina_uuid;
    
    RETURN (total_peso = 100);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant access to tables for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant access to sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- ============================================
-- END OF SCHEMA
-- ============================================
