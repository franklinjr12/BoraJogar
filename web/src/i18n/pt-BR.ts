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
  profile_required: 'Complete seu perfil para continuar.',
  skill_out_of_range: 'Seu nível está fora da faixa desta partida.',
  already_joined: 'Você já está nesta partida.',
  already_waitlisted: 'Você já está na lista de espera.',
  waitlist_full: 'A lista de espera está cheia.',
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
  game_chat_closed: 'O chat desta partida foi encerrado.',
  game_chat_not_found: 'Chat da partida não encontrado.',
  invalid_chat_message: 'A mensagem deve ter entre 1 e 2.000 caracteres.',
  invalid_chat_cursor: 'O histórico do chat não pôde ser carregado.',
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
  welcome: {
    title: 'Bem-vindo ao Bora Jogar',
    body: 'Seu perfil está pronto para encontrar partidas compatíveis.',
  },
  match_proposal: {
    title: 'Nova proposta de partida',
    body: 'Você recebeu uma proposta de partida. Confira os detalhes e responda.',
  },
  proposal_confirmed: {
    title: 'Partida confirmada',
    body: 'Sua proposta foi confirmada. Confira data, horário e local.',
  },
  proposal_expired: {
    title: 'Proposta expirada',
    body: 'Uma proposta de partida expirou sem confirmação.',
  },
  manual_game_invitation: {
    title: 'Convite para uma partida',
    body: 'Você recebeu um convite para participar de uma partida.',
  },
  user_joined_game: {
    title: 'Novo jogador na partida',
    body: 'Um jogador entrou em uma partida que você organiza.',
  },
  user_left_game: {
    title: 'Jogador saiu da partida',
    body: 'Uma vaga foi liberada em uma partida que você organiza.',
  },
  waitlist_promotion: {
    title: 'Você saiu da lista de espera',
    body: 'Uma vaga abriu e você foi confirmado na partida.',
  },
  waitlist_open: {
    title: 'Vaga disponível',
    body: 'Uma vaga abriu. Entre agora; a primeira pessoa a confirmar fica com a vaga.',
  },
  game_changed: {
    title: 'Partida atualizada',
    body: 'Data, horário, local ou participantes da partida mudaram.',
  },
  game_cancelled: {
    title: 'Partida cancelada',
    body: 'Uma partida da sua agenda foi cancelada.',
  },
  game_reminder: {
    title: 'Lembrete de partida',
    body: 'Sua partida está chegando. Confira os detalhes antes de sair.',
  },
  report_received: {
    title: 'Relato recebido',
    body: 'Recebemos seu relato e vamos analisar a situação.',
  },
  attendance_requested: {
    title: 'Registre a presença',
    body: 'Sua partida terminou. Registre a presença dos jogadores.',
  },
  game_chat_message: {
    title: 'Nova mensagem na partida',
    body: 'Uma nova mensagem foi enviada no chat da sua partida.',
  },
};

export function notificationMessage(type: string) {
  return notificationMessages[type];
}

export function skillLabel(value: GameSkillLevel | SkillLevel) {
  return skillLabels[value];
}

function preferredTimeZone() {
  if (typeof globalThis.window === 'undefined') return undefined;
  const value = globalThis.window.localStorage.getItem('borajogar_timezone');
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat(locale, { timeZone: value }).format();
    return value;
  } catch {
    return undefined;
  }
}

function localizedOptions(options: Intl.DateTimeFormatOptions) {
  if (options.timeZone) return options;
  const timeZone = preferredTimeZone();
  return timeZone ? { ...options, timeZone } : options;
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleString(locale, localizedOptions(options));
}

export function formatDateOnly(value: string, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString(locale, localizedOptions(options));
}
