# Privacidade

Bora Jogar usa dados necessários para autenticação, organização de partidas, segurança e melhoria operacional.

- Não solicitamos nem exibimos endereço residencial.
- Áreas preferidas são privadas; outros jogadores recebem apenas local público da partida.
- E-mails não são exibidos a outros jogadores.
- Endereço IP bruto não é armazenado; logs usam correlação limitada quando necessário.
- Assinaturas de push são armazenadas cifradas.
- Dados de presença, cancelamento e denúncias ficam restritos ao participante relevante, organizador autorizado e administração.

Usuário pode solicitar exclusão em `POST /api/v1/me/delete`. Sessões são revogadas, matchmaking é desativado e dados de segurança/operacionais necessários permanecem anonimizados.
