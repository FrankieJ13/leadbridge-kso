const button = document.getElementById('showPanel');
const status = document.getElementById('status');

button.addEventListener('click', async () => {
  status.textContent = '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id || !tab.url || !tab.url.startsWith('https://web.max.ru/')) {
    status.textContent = 'Сначала открой чат на https://web.max.ru/';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'MAX_EXPORTER_SHOW' }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = 'Обнови вкладку web.max.ru и попробуй снова.';
      return;
    }
    status.textContent = response?.ok ? 'Панель открыта на странице.' : 'Не удалось открыть панель.';
  });
});
