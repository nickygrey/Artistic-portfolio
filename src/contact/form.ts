/**
 * Submits the contact form in place. Without JS the same form posts natively
 * to Formspree, which shows its own confirmation page.
 */
export function mountContactForm(form: HTMLFormElement): () => void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-form-status]')!;
  const label = button.textContent ?? '';

  function say(message: string, withEmail = false) {
    status.replaceChildren(message);
    if (withEmail) {
      const a = document.createElement('a');
      a.href = 'mailto:pv@nickygrey.com';
      a.textContent = 'pv@nickygrey.com';
      status.append(' ', a);
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    button.disabled = true;
    button.textContent = form.dataset.sending ?? label;
    status.replaceChildren();
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Formspree answered ${response.status}`);
      form.reset();
      say(form.dataset.success ?? '');
    } catch {
      say(form.dataset.error ?? '', true);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  form.addEventListener('submit', onSubmit);
  return () => form.removeEventListener('submit', onSubmit);
}
