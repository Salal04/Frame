// ONE place to edit. Fill these 4 values, nothing else in the legal pages needs changing.
window.SITE = {
  app: 'Frame AI',
  owner: 'YOUR NAME OR COMPANY',          // person/company that runs Frame AI
  email: 'support@YOUR-DOMAIN.com',       // must be a real inbox: Google shows it on the consent screen
  updated: 'October 26, 2026'             // change this date whenever you edit a policy
}
document.addEventListener('DOMContentLoaded', () => {
  const S = window.SITE
  document.querySelectorAll('[data-s]').forEach(el => {
    const k = el.dataset.s
    el.textContent = S[k]
    if (k === 'email' && el.tagName === 'A') el.href = 'mailto:' + S.email
  })
})
