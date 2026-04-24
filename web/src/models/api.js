export async function readApiResponse(response) {
    const text = await response.text();
    const trimmed = text.trim();
    const contentType = response.headers.get('content-type') || '';
    const statusHint = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;

    const tryParseJson = () => {
        if (!trimmed) return null;
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return JSON.parse(trimmed);
            } catch {
                return null;
            }
        }
        return null;
    };

    if (contentType.includes('application/json')) {
        if (!trimmed) {
            return response.ok
                ? {}
                : {
                      error: `Resposta JSON vazia (${statusHint}). O servidor Node pode estar desligado ou a rota falhou sem mensagem.`
                  };
        }
        try {
            return JSON.parse(trimmed);
        } catch {
            return {
                error: trimmed.slice(0, 300) || `JSON invalido na resposta (${statusHint}).`
            };
        }
    }

    const fallbackParsed = tryParseJson();
    if (fallbackParsed !== null) {
        return fallbackParsed;
    }

    if (!trimmed) {
        return {
            error: `Sem corpo na resposta (${statusHint}). Confirme que a API está em execução (ex.: \`npm run dev\` ou \`npm run dev:full\` na raiz), verifique os logs do servidor e valide se o proxy do Vite aponta para a porta correta (PORT no .env).`
        };
    }

    return { error: trimmed.slice(0, 500) };
}
