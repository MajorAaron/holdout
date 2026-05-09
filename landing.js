/* Holdout — landing page form */

(() => {
  const form = document.getElementById('signup-form');
  const status = document.getElementById('signup-status');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) return;

    status.className = 'signup-status';
    status.textContent = 'Adding you to the list…';

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'landing' })
      });
      if (!res.ok) throw new Error();

      status.classList.add('ok');
      status.textContent = "You're in. Look for one note this summer when alerts ship.";
      form.reset();

      if (window.posthog) posthog.capture('waitlist_signup', { source: 'landing' });

      setTimeout(() => {
        window.location.href = '/tool.html';
      }, 1800);
    } catch {
      status.classList.add('err');
      status.textContent = 'Could not save your email. Try again in a minute.';
    }
  });
})();
