import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  moderationApi,
  type PublicProfile,
  type ReportInput,
  userApi,
} from '../../api/client';
import { skillLabel, styleLabels } from '../../i18n/pt-BR';
import { useOnlineStatus } from '../../platform/useOnlineStatus';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const reportCategories: Array<{ value: ReportInput['category']; label: string }> = [
  { value: 'harassment', label: 'Assédio ou importunação' },
  { value: 'unsafe_behavior', label: 'Comportamento inseguro' },
  { value: 'repeated_no_show', label: 'Faltas repetidas' },
  { value: 'false_profile', label: 'Perfil falso' },
  { value: 'inappropriate_content', label: 'Conteúdo inadequado' },
  { value: 'other', label: 'Outro' },
];

export function PublicProfilePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const isOnline = useOnlineStatus();

  const load = useCallback(() => {
    setError('');
    return userApi
      .publicProfile(id)
      .then(setProfile)
      .catch((cause: unknown) =>
        setError(
          cause instanceof ApiError && cause.status === 404
            ? 'Este perfil não está disponível.'
            : 'Não foi possível carregar este perfil. Tente novamente.',
        ),
      );
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleBlock = async () => {
    if (busy || !isOnline) return;
    setBusy(true);
    setError('');
    try {
      if (blocked) {
        await userApi.unblock(id);
        setBlocked(false);
        setMessage('Jogador desbloqueado.');
      } else {
        await userApi.block(id);
        setBlocked(true);
        setMessage('Jogador bloqueado. Ele não aparecerá em novas combinações.');
      }
    } catch {
      setError('Não foi possível atualizar o bloqueio. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const report = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !isOnline) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await moderationApi.report({
        reportedUserId: id,
        gameId: params.get('gameId') ?? undefined,
        category: String(form.get('category')) as ReportInput['category'],
        description: String(form.get('description')),
        blockReportedUser: form.get('block') === 'on',
      });
      setMessage('Relato enviado. Nossa equipe vai analisar a situação.');
      setReportOpen(false);
    } catch {
      setError('Não foi possível enviar o relato. Verifique os campos e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell">
      <button className="text-button back-button" type="button" onClick={() => navigate(-1)}>
        ← Voltar
      </button>
      <p className="eyebrow">Perfil do jogador</p>
      {error && (
        <div className="feedback-error" role="alert">
          <p className="error">{error}</p>
          <button className="text-button" type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      {!profile && !error && <p role="status">Carregando perfil...</p>}
      {profile && (
        <>
          <h1>{profile.displayName}</h1>
          <section className="card public-profile-card">
            <p className="lead">{skillLabel(profile.skillLevel)}</p>
            <p>{profile.bio || 'Este jogador ainda não adicionou uma biografia.'}</p>
            <p>
              {profile.styles.map((style) => styleLabels[style]).join(', ') ||
                'Sem preferência de estilo'}
            </p>
            <p>{profile.completedGames} partidas concluídas</p>
            {profile.playedTogether && <p className="hint">Vocês já jogaram juntos.</p>}
          </section>
          <div className="actions">
            <button
              className="text-button danger"
              type="button"
              onClick={() => (blocked ? void toggleBlock() : setConfirmBlock(true))}
              disabled={busy || !isOnline}
            >
              {blocked ? 'Desbloquear jogador' : 'Bloquear jogador'}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setReportOpen((open) => !open)}
            >
              {reportOpen ? 'Fechar relato' : 'Relatar problema'}
            </button>
          </div>
          {reportOpen && (
            <form className="card" onSubmit={report}>
              <h2>Relatar problema</h2>
              <p className="hint">Relatos são privados e ajudam a manter a comunidade segura.</p>
              <label>
                Motivo
                <select name="category" defaultValue="other" required>
                  {reportCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descreva o que aconteceu
                <textarea name="description" minLength={1} maxLength={2000} required />
              </label>
              <label className="checks">
                <span>
                  <input name="block" type="checkbox" /> Bloquear este jogador também
                </span>
              </label>
              <button className="button" type="submit" disabled={busy || !isOnline}>
                {busy ? 'Enviando...' : 'Enviar relato'}
              </button>
            </form>
          )}
          {message && (
            <p className="hint" role="status">
              {message}
            </p>
          )}
          {confirmBlock && (
            <ConfirmDialog
              title="Bloquear jogador?"
              message="Este jogador não aparecerá em novas combinações com você."
              confirmLabel="Bloquear jogador"
              onConfirm={() => {
                setConfirmBlock(false);
                void toggleBlock();
              }}
              onCancel={() => setConfirmBlock(false)}
            />
          )}
        </>
      )}
    </main>
  );
}
