'use strict';

(() => {
  // No third-party scripts, fonts, analytics or Firebase SDK on this exchange page.
  let token = new URLSearchParams(window.location.hash.slice(1)).get('access');
  window.history.replaceState(null, '', window.location.pathname);
  const button = document.getElementById('verify-access');
  const status = document.getElementById('link-status');
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    status.textContent = 'This link is incomplete. Request a new email link to continue.';
    button.disabled = true;
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Verifying your access…';
    try {
      const response = await fetch('/api/payment-access', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'exchange', token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The link could not be verified. Request a new one.');
      token = null;
      window.location.replace('/my-payments?mode=reservation');
    } catch (error) {
      token = null;
      status.textContent = `${error.message || 'Verification did not finish.'} If the connection was interrupted, request a new link.`;
    }
  });
})();
