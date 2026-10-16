try {
  const theme = localStorage.getItem('velora-theme') || 'dark';
  document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.reduceMotion = localStorage.getItem('velora-reduce-motion') || 'false';
  if (!localStorage.getItem('velora-lime-migrated-v1')) {
    if (localStorage.getItem('velora-accent') === 'blue') localStorage.setItem('velora-accent', 'lime');
    localStorage.setItem('velora-lime-migrated-v1', 'true');
  }
  document.documentElement.dataset.accent = localStorage.getItem('velora-accent') || 'lime';
} catch { document.documentElement.dataset.theme = 'dark'; }
