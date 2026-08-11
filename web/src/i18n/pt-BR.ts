import type { GameSkillLevel, GameVisibility, PlayingStyle, SkillLevel } from '../api/client';

export const locale = 'pt-BR';

export const skillLabels: Record<SkillLevel, string> = {
  learning: 'Estou aprendendo',
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
  competitive: 'Competitivo',
};

export const skillDescriptions: Record<SkillLevel, string> = {
  learning: 'Ainda estou aprendendo os fundamentos.',
  beginner: 'Entendo o jogo, mas ainda sou inconsistente.',
  intermediate: 'Consigo passar, levantar, atacar e me posicionar com regularidade.',
  advanced: 'Jogo com consistência e entendo bem as táticas.',
  competitive: 'Jogo regularmente partidas competitivas ou torneios.',
};

export const styleLabels: Record<PlayingStyle, string> = {
  casual: 'Casual',
  competitive: 'Competitivo',
  training_focused: 'Focado em treino',
  mixed: 'Sem preferência',
};

export const gameVisibilityLabels: Record<GameVisibility, string> = {
  'link-only': 'Somente com link',
  public: 'Público',
  private: 'Privado',
};

export const weekdayLabels = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export const weekdayShortLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const apiErrorMessages: Record<string, string> = {
  player_removed: 'O organizador removeu você desta partida.',
  player_not_removable: 'Este jogador não pode ser removido.',
  game_remove_forbidden: 'Somente o organizador pode remover jogadores.',
  game_cancel_forbidden: 'Somente o organizador pode excluir esta partida.',
  game_not_cancellable: 'Esta partida já foi encerrada.',
  unauthorized: 'Entre para continuar.',
  forbidden: 'Você não tem permissão para realizar esta ação.',
  invalid_credentials: 'E-mail ou senha inválidos.',
  email_already_registered: 'Este e-mail já está cadastrado.',
  invalid_invitation: 'O convite não é válido ou expirou.',
  profile_missing: 'Complete seu perfil antes de continuar.',
  game_full: 'Esta partida está lotada.',
  game_not_found: 'Partida não encontrada.',
  game_not_joinable: 'Esta partida não está disponível para entrada.',
  blocked_user: 'Você não pode entrar nesta partida.',
  profile_required: 'Complete seu perfil antes de entrar.',
  skill_out_of_range: 'Seu nível está fora da faixa desta partida.',
  already_joined: 'Você já está nesta partida.',
  already_waitlisted: 'Você já está na lista de espera.',
  conflicting_game: 'Você já tem uma partida nesse horário.',
  venue_inactive: 'Esta quadra não está disponível.',
  venue_not_found: 'Quadra não encontrada.',
  invalid_game: 'Os dados da partida são inválidos.',
  invalid_location: 'Os dados do local são inválidos.',
  invalid_preferred_area: 'Os dados da área são inválidos.',
  preferred_area_limit: 'Você atingiu o limite de áreas salvas.',
  availability_rule_conflict: 'Esse horário se sobrepõe a outro horário salvo.',
  availability_rule_not_found: 'Horário disponível não encontrado.',
  invalid_availability_rule: 'Os dados do horário disponível são inválidos.',
};

export function apiErrorMessage(code: string) {
  return apiErrorMessages[code] ?? 'Não foi possível concluir a solicitação.';
}

const googleAuthErrorMessages: Record<string, string> = {
  google_state_invalid: 'A sessão de acesso expirou. Inicie o login novamente.',
  google_cancelled: 'O acesso com Google foi cancelado.',
  google_provider_failed: 'O Google não conseguiu validar esta conta. Tente novamente.',
  invalid_invitation: 'O convite não é válido ou expirou.',
  google_email_already_registered:
    'Este e-mail já possui uma conta criada com e-mail e senha. Entre usando e-mail e senha.',
  google_internal_error: 'Não foi possível criar sua conta agora. Tente novamente.',
};

export function googleAuthErrorMessage(code: string) {
  return googleAuthErrorMessages[code] ?? 'Não foi possível concluir o acesso. Tente novamente.';
}

const readinessLabels: Record<string, string> = {
  profile: 'perfil',
  location: 'local',
  availability: 'disponibilidade',
};

export function readinessLabel(value: string) {
  return readinessLabels[value] ?? 'etapa pendente';
}

const notificationMessages: Record<string, { title: string; body: string }> = {
  attendance_requested: {
    title: 'Registre a presença',
    body: 'Sua partida terminou. Registre a presença dos jogadores.',
  },
};

export function notificationMessage(type: string) {
  return notificationMessages[type];
}

export function skillLabel(value: GameSkillLevel | SkillLevel) {
  return skillLabels[value];
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleString(locale, options);
}

export function formatDateOnly(value: string, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString(locale, options);
}
