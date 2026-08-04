const readyKey = 'borajogar_game_alert_prompt_ready';
const dismissedKey = 'borajogar_game_alert_prompt_dismissed';

export function gameAlertPromptReady() {
  return localStorage.getItem(readyKey) === 'true' && localStorage.getItem(dismissedKey) !== 'true';
}

export function dismissGameAlertPrompt() {
  localStorage.setItem(dismissedKey, 'true');
}

export function markGameAlertPromptReady() {
  localStorage.setItem(readyKey, 'true');
  window.dispatchEvent(new Event('borajogar-game-alert-ready'));
}
