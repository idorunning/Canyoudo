// Guard destructive dashboard forms with a native confirm() dialog. Any
// <form data-confirm="…message…"> asks before it submits; declining cancels
// the submit. Progressive enhancement — with JS off the form still posts, and
// the server action is itself idempotent and admin-gated, so the confirm is a
// safety net rather than the only defence.

document.querySelectorAll<HTMLFormElement>('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    const message = form.getAttribute('data-confirm') || 'Are you sure?';
    if (!window.confirm(message)) event.preventDefault();
  });
});
