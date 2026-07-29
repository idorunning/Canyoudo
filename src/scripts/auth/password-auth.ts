// Password-based authentication for members. Replaces magic link OTP.
// Handles sign-up (with email confirmation), sign-in, and password reset.

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

interface AuthState {
  mode: 'initial' | 'signin' | 'signup' | 'reset' | 'confirm-email';
  email?: string;
  loading?: boolean;
}

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = /^(?=.*[0-9])(?=.*[a-zA-Z])/; // numbers + letters

function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `At least ${PASSWORD_MIN_LENGTH} characters` };
  }
  if (!PASSWORD_PATTERN.test(password)) {
    return { valid: false, message: 'Must include numbers and letters' };
  }
  return { valid: true, message: 'Strong password' };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function initPasswordAuth(supabase: any, container: HTMLElement): Promise<void> {
  let state: AuthState = { mode: 'initial' };
  const redirectTo = location.origin + location.pathname + location.search;

  const styles = {
    primary: 'font-sans text-sm uppercase tracking-[0.12em] bg-accent text-paper-50 px-5 py-2.5 rounded-2 hover:bg-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto',
    secondary: 'font-sans text-sm uppercase tracking-[0.12em] border border-ink-300 text-ink-700 px-5 py-2.5 rounded-2 hover:text-ink-900 hover:border-ink-500 transition-colors w-full sm:w-auto',
    textLink: 'font-sans text-xs underline underline-offset-2 text-ink-600 hover:text-accent cursor-pointer',
    input: 'w-full border border-ink-300 rounded-2 px-4 py-2.5 font-sans text-sm text-ink-900 bg-paper-50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20',
    error: 'text-flag text-xs mt-1',
    success: 'text-chart-green text-xs mt-1',
    label: 'block font-sans text-sm font-medium text-ink-900 mb-1.5',
  };

  function showInitial() {
    state = { mode: 'initial' };
    container.replaceChildren();

    const row = el('div', 'flex flex-col gap-3 max-w-md');

    const signin = el('button', styles.primary, 'Sign in with password');
    signin.type = 'button';
    signin.addEventListener('click', showSignIn);
    row.appendChild(signin);

    const signup = el('button', styles.secondary, 'Create account');
    signup.type = 'button';
    signup.addEventListener('click', showSignUp);
    row.appendChild(signup);

    const google = el('button', styles.secondary, 'Continue with Google');
    google.type = 'button';
    google.addEventListener('click', () => {
      supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    });
    row.appendChild(google);

    container.appendChild(row);
    container.appendChild(
      el('p', 'font-sans text-xs text-ink-500 mt-3', 'Secure password-based login. Confirm your email on sign-up.')
    );
  }

  function showSignIn() {
    state = { mode: 'signin' };
    container.replaceChildren();

    const form = el('form', 'flex flex-col gap-4 max-w-md');

    // Email
    form.appendChild(el('label', styles.label, 'Email'));
    const email = el('input', styles.input) as HTMLInputElement;
    email.type = 'email';
    email.placeholder = 'you@example.com';
    email.autocomplete = 'email';
    email.required = true;
    form.appendChild(email);

    // Password
    form.appendChild(el('label', styles.label, 'Password'));
    const password = el('input', styles.input) as HTMLInputElement;
    password.type = 'password';
    password.placeholder = '••••••••';
    password.autocomplete = 'current-password';
    password.required = true;
    form.appendChild(password);

    // Remember me
    const rememberWrap = el('label', 'flex items-center gap-2 cursor-pointer');
    const rememberBox = el('input', '') as HTMLInputElement;
    rememberBox.type = 'checkbox';
    rememberBox.checked = true;
    rememberWrap.appendChild(rememberBox);
    rememberWrap.appendChild(el('span', 'font-sans text-sm text-ink-700', 'Remember me'));
    form.appendChild(rememberWrap);

    // Submit
    const submit = el('button', styles.primary, 'Sign in');
    submit.type = 'submit';
    form.appendChild(submit);

    // Error message
    const error = el('div', '');
    form.appendChild(error);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateEmail(email.value)) {
        error.innerHTML = `<p class="${styles.error}">Invalid email</p>`;
        return;
      }

      submit.disabled = true;
      error.innerHTML = '';

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      });

      if (signInError) {
        submit.disabled = false;
        error.innerHTML = `<p class="${styles.error}">Invalid email or password</p>`;
        return;
      }

      // Success — gate will detect the session and unlock
    });

    container.appendChild(form);

    // Links
    const links = el('div', 'flex flex-col gap-2 mt-4 max-w-md');

    const forgotLink = el('button', styles.textLink, 'Forgot password?');
    forgotLink.type = 'button';
    forgotLink.addEventListener('click', showReset);
    links.appendChild(forgotLink);

    const backLink = el('button', styles.textLink, 'Back');
    backLink.type = 'button';
    backLink.addEventListener('click', showInitial);
    links.appendChild(backLink);

    container.appendChild(links);
    email.focus();
  }

  function showSignUp() {
    state = { mode: 'signup' };
    container.replaceChildren();

    const form = el('form', 'flex flex-col gap-4 max-w-md');

    // Email
    form.appendChild(el('label', styles.label, 'Email'));
    const email = el('input', styles.input) as HTMLInputElement;
    email.type = 'email';
    email.placeholder = 'you@example.com';
    email.autocomplete = 'email';
    email.required = true;
    form.appendChild(email);

    // Password
    form.appendChild(el('label', styles.label, 'Password'));
    const password = el('input', styles.input) as HTMLInputElement;
    password.type = 'password';
    password.placeholder = '••••••••';
    password.autocomplete = 'new-password';
    password.required = true;

    const passwordHint = el('div', '');
    form.appendChild(password);
    form.appendChild(passwordHint);

    password.addEventListener('input', () => {
      const validation = validatePassword(password.value);
      passwordHint.innerHTML = `<p class="${validation.valid ? styles.success : styles.error}">${validation.message}</p>`;
    });

    // Confirm password
    form.appendChild(el('label', styles.label, 'Confirm password'));
    const confirm = el('input', styles.input) as HTMLInputElement;
    confirm.type = 'password';
    confirm.placeholder = '••••••••';
    confirm.autocomplete = 'new-password';
    confirm.required = true;
    form.appendChild(confirm);

    // Submit
    const submit = el('button', styles.primary, 'Create account');
    submit.type = 'submit';
    form.appendChild(submit);

    // Error/status
    const status = el('div', '');
    form.appendChild(status);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validation
      if (!validateEmail(email.value)) {
        status.innerHTML = `<p class="${styles.error}">Invalid email</p>`;
        return;
      }

      const passValidation = validatePassword(password.value);
      if (!passValidation.valid) {
        status.innerHTML = `<p class="${styles.error}">${passValidation.message}</p>`;
        return;
      }

      if (password.value !== confirm.value) {
        status.innerHTML = `<p class="${styles.error}">Passwords don't match</p>`;
        return;
      }

      submit.disabled = true;
      status.innerHTML = '';

      const { error: signUpError } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (signUpError) {
        submit.disabled = false;
        status.innerHTML = `<p class="${styles.error}">That email is already in use</p>`;
        return;
      }

      // Success — show confirmation prompt
      state = { mode: 'confirm-email', email: email.value };
      container.replaceChildren();

      container.appendChild(
        el('p', 'font-sans text-sm text-ink-700 max-w-md', `Account created! Check ${email.value} for a confirmation link.`)
      );
      container.appendChild(
        el(
          'p',
          'font-sans text-xs text-ink-500 mt-3 max-w-md',
          'Click the link in the email to activate your account, then sign in here.'
        )
      );

      const back = el('button', `mt-4 ${styles.textLink}`, 'Back to sign in');
      back.type = 'button';
      back.addEventListener('click', showInitial);
      container.appendChild(back);
    });

    container.appendChild(form);

    const back = el('button', `mt-4 ${styles.textLink}`, 'Back');
    back.type = 'button';
    back.addEventListener('click', showInitial);
    container.appendChild(back);

    email.focus();
  }

  function showReset() {
    state = { mode: 'reset' };
    container.replaceChildren();

    const form = el('form', 'flex flex-col gap-4 max-w-md');

    form.appendChild(el('p', 'font-sans text-sm text-ink-700', "Enter your email and we'll send a reset link."));

    form.appendChild(el('label', styles.label, 'Email'));
    const email = el('input', styles.input) as HTMLInputElement;
    email.type = 'email';
    email.placeholder = 'you@example.com';
    email.autocomplete = 'email';
    email.required = true;
    form.appendChild(email);

    const submit = el('button', styles.primary, 'Send reset link');
    submit.type = 'submit';
    form.appendChild(submit);

    const status = el('div', '');
    form.appendChild(status);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateEmail(email.value)) {
        status.innerHTML = `<p class="${styles.error}">Invalid email</p>`;
        return;
      }

      submit.disabled = true;
      status.innerHTML = '';

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.value, {
        redirectTo: `${location.origin}/auth/reset-password`,
      });

      if (resetError) {
        submit.disabled = false;
        status.innerHTML = `<p class="${styles.error}">Couldn't send reset link — try again in a minute</p>`;
        return;
      }

      status.innerHTML = `<p class="${styles.success}">Reset link sent to ${email.value}</p>`;
      const back = el('button', `mt-3 ${styles.textLink}`, 'Back');
      back.type = 'button';
      back.addEventListener('click', showInitial);
      status.appendChild(back);
    });

    container.appendChild(form);

    const back = el('button', `mt-4 ${styles.textLink}`, 'Back');
    back.type = 'button';
    back.addEventListener('click', showInitial);
    container.appendChild(back);

    email.focus();
  }

  showInitial();
}
