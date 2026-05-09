/* Holdout — tool client logic */

const form = document.getElementById('postmortem-form');
const submitBtn = document.getElementById('submit-btn');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error');
const result = document.getElementById('result');

const resultSpecies = document.getElementById('result-species');
const resultRegion = document.getElementById('result-region');
const resultEssay = document.getElementById('result-essay');
const resultSuggestions = document.getElementById('result-suggestions');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.add('hidden');
  result.classList.add('hidden');
  loading.classList.remove('hidden');
  submitBtn.disabled = true;

  const data = {
    species: document.getElementById('species').value.trim(),
    region: document.getElementById('region').value.trim(),
    saga: document.getElementById('saga').value.trim()
  };

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Service error (${res.status}): ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    if (!json.essay) throw new Error('No essay returned. Try again with a touch more detail.');

    resultSpecies.textContent = data.species;
    resultRegion.textContent = data.region;
    resultEssay.innerHTML = '';
    json.essay.split(/\n\n+/).forEach(p => {
      const para = document.createElement('p');
      para.textContent = p.trim();
      if (para.textContent) resultEssay.appendChild(para);
    });
    resultSuggestions.innerHTML = '';
    (json.suggestions || []).forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      resultSuggestions.appendChild(li);
    });

    loading.classList.add('hidden');
    result.classList.remove('hidden');

    if (window.posthog) {
      posthog.capture('postmortem_generated', { species: data.species, region: data.region });
    }

    setTimeout(() => result.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  } catch (err) {
    loading.classList.add('hidden');
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('copy-btn').addEventListener('click', async () => {
  const card = document.getElementById('essay-card');
  const text = card.innerText;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('copy-btn');
    const was = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => btn.textContent = was, 1800);
    if (window.posthog) posthog.capture('postmortem_copied');
  } catch {
    alert('Could not copy. Select the card text and copy manually.');
  }
});

document.getElementById('new-btn').addEventListener('click', () => {
  form.reset();
  result.classList.add('hidden');
  errorBox.classList.add('hidden');
  document.getElementById('species').focus();
});

const signupForm = document.getElementById('signup-form');
const signupStatus = document.getElementById('signup-status');
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  if (!email) return;
  signupStatus.textContent = 'Adding you to the list…';
  signupStatus.style.color = '';
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'tool' })
    });
    if (!res.ok) throw new Error('Server error');
    signupStatus.textContent = "You're in. We'll let you know when alerts ship.";
    signupStatus.style.color = 'var(--primary)';
    signupForm.reset();
    if (window.posthog) posthog.capture('waitlist_signup', { source: 'tool' });
  } catch {
    signupStatus.textContent = 'Could not save your email. Try again in a minute.';
    signupStatus.style.color = 'var(--error)';
  }
});

(async () => {
  const list = document.getElementById('recent-list');
  try {
    const res = await fetch('/api/history?limit=5');
    if (!res.ok) throw new Error();
    const data = await res.json();
    list.innerHTML = '';
    if (!data.recent || !data.recent.length) {
      const li = document.createElement('li');
      li.className = 'loading-sm';
      li.textContent = 'No post-mortems yet. Be the first.';
      list.appendChild(li);
      return;
    }
    data.recent.forEach(r => {
      const li = document.createElement('li');
      const sp = document.createElement('span');
      sp.className = 'species';
      sp.textContent = r.species;
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = r.when || 'recently';
      li.appendChild(sp);
      li.appendChild(when);
      list.appendChild(li);
    });
  } catch {
    list.innerHTML = '<li class="loading-sm">No post-mortems yet. Be the first.</li>';
  }
})();
