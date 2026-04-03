/**
 * Traduz mensagens de erro do Supabase para português
 */
export const translateError = (error: string): string => {
    const translations: Record<string, string> = {
        // Auth errors
        'Invalid login credentials': 'Email ou senha incorretos',
        'Email not confirmed': 'Email não confirmado. Verifique sua caixa de entrada',
        'User already registered': 'Este email já está cadastrado',
        'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres',
        'Unable to validate email address: invalid format': 'Formato de email inválido',
        'Email rate limit exceeded': 'Muitas tentativas. Tente novamente mais tarde',
        'Invalid email or password': 'Email ou senha incorretos',
        'Email link is invalid or has expired': 'Link de email inválido ou expirado',
        'Token has expired or is invalid': 'Sessão expirada. Faça login novamente',
        'User not found': 'Usuário não encontrado',
        'New password should be different from the old password': 'A nova senha deve ser diferente da anterior',
        'Password is too weak': 'Senha muito fraca. Use letras, números e símbolos',
        'Signup requires a valid password': 'É necessária uma senha válida',
        'User already exists': 'Usuário já existe',
        'Email address is invalid': 'Endereço de email inválido',
        'Only an email address or phone number should be provided': 'Forneça apenas email ou telefone',
        'User not authenticated': 'Utilizador não autenticado. Por favor, faça login',
        'Session expired': 'Sessão expirada. Faça login novamente',
        'Not authenticated': 'Não autenticado. Por favor, faça login',
        'Unauthorized': 'Não autorizado. Verifique suas permissões',
        'Forbidden': 'Acesso negado. Você não tem permissão para esta ação',
        'Access denied': 'Acesso negado',

        // Network errors
        'Failed to fetch': 'Erro de conexão. Verifique sua internet',
        'Network request failed': 'Falha na conexão. Tente novamente',
        'timeout': 'Tempo esgotado. Tente novamente',
        'Load failed': 'Falha ao carregar. Verifique sua conexão',
        'NetworkError': 'Erro de rede. Verifique sua conexão com a internet',
        'CORS error': 'Erro de conexão com o servidor',
        'Request aborted': 'Requisição cancelada. Tente novamente',

        // Database errors
        'duplicate key value': 'Este registo já existe no sistema',
        'violates foreign key constraint': 'Não é possível completar esta ação. Existem registros dependentes',
        'violates not-null constraint': 'Campo obrigatório não preenchido',
        'violates check constraint': 'Valor inválido. Verifique os dados informados',
        'violates unique constraint': 'Este valor já está em uso. Por favor, escolha outro',
        'Row level security': 'Você não tem permissão para esta operação',
        'new row violates row-level security policy': 'Você não tem permissão para esta operação',
        'permission denied': 'Permissão negada para esta operação',
        'PGRST301': 'Recurso não encontrado',
        'PGRST204': 'Nenhum resultado encontrado',

        // Generic errors
        'An error occurred': 'Ocorreu um erro',
        'Something went wrong': 'Algo deu errado',
        'Internal server error': 'Erro interno do servidor',
        'Service unavailable': 'Serviço temporariamente indisponível',
        'Bad request': 'Requisição inválida. Verifique os dados informados',
        'Not found': 'Recurso não encontrado',
        '404': 'Página não encontrada',
        '500': 'Erro interno do servidor. Tente novamente mais tarde',
        '502': 'Servidor temporariamente indisponível',
        '503': 'Serviço indisponível. Tente novamente mais tarde',

        // File upload errors
        'File too large': 'Arquivo muito grande. O tamanho máximo é 2MB',
        'Invalid file type': 'Tipo de arquivo não permitido',
        'Upload failed': 'Falha ao enviar arquivo. Tente novamente',
        'Storage quota exceeded': 'Espaço de armazenamento esgotado',

        // Application specific errors
        'Professor not found': 'Professor não encontrado',
        'Turma not found': 'Turma não encontrada',
        'Aluno not found': 'Aluno não encontrado',
        'Disciplina not found': 'Disciplina não encontrada',
        'Escola not found': 'Escola não encontrada',
        'No data found': 'Nenhum dado encontrado',
        'Invalid data': 'Dados inválidos',
        'Required field missing': 'Campo obrigatório não preenchido',
        'Invalid format': 'Formato inválido',
    }

    // Check for PostgreSQL error codes
    if (error.includes('23505') || error.includes('duplicate key')) {
        if (error.includes('alunos_numero_processo_key') || error.includes('numero_processo')) {
            return 'Este número de processo já está em uso. Por favor, use um número diferente ou deixe o campo vazio para gerar automaticamente.'
        }
        if (error.includes('unique_turma_periodo') || error.includes('codigo_turma')) {
            return 'A sua escola já possui uma turma com este nome para o mesmo ano lectivo e trimestre. Por favor, escolha um nome diferente ou altere o período.'
        }
        return 'Este valor já existe no sistema. Por favor, use um valor único.'
    }

    // Procura por correspondência exata
    if (translations[error]) {
        return translations[error]
    }

    // Procura por correspondência parcial
    for (const [key, value] of Object.entries(translations)) {
        if (error.toLowerCase().includes(key.toLowerCase())) {
            return value
        }
    }

    // Se não encontrar tradução, retorna a mensagem original
    return error
}

/**
 * Traduz mensagens de sucesso
 */
export const translateSuccess = (message: string): string => {
    const translations: Record<string, string> = {
        'Check your email for the confirmation link': 'Verifique seu email para confirmar sua conta',
        'Password updated successfully': 'Senha atualizada com sucesso',
        'Email updated successfully': 'Email atualizado com sucesso',
        'User updated successfully': 'Usuário atualizado com sucesso',
    }

    return translations[message] || message
}
