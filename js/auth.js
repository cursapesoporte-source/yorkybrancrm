document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');

  const LICENSE_CHECK_URL = 'https://qthfmtwwvivscqankscx.supabase.co/functions/v1/license-check-proxy';

  function setMessage(text, color = '#555') {
    if (!loginMessage) return;
    loginMessage.textContent = text;
    loginMessage.style.color = color;
  }

  async function checkLicense() {
    const response = await fetch(LICENSE_CHECK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const data = await response.json().catch(() => ({}));

    return {
      status: response.status,
      data
    };
  }

  console.log('auth.js cargado');
  console.log('loginForm =>', loginForm);
  console.log('loginMessage =>', loginMessage);

  if (!loginForm) {
    console.error('No se encontró #loginForm');
    return;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const supabase = window.supabaseClient;
    console.log('supabaseClient al enviar =>', supabase);

    if (!supabase) {
      setMessage('Error: el cliente Supabase no está disponible.', 'crimson');
      console.error('window.supabaseClient no existe.');
      return;
    }

    const email = document.getElementById('email')?.value.trim() || '';
    const password = document.getElementById('password')?.value.trim() || '';

    if (!email || !password) {
      setMessage('Completa correo y contraseña.', 'crimson');
      return;
    }

    setMessage('Ingresando...', '#555');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      console.log('Respuesta login:', { data, error });

      if (error) {
        setMessage(`Error: ${error.message}`, 'crimson');
        return;
      }

      if (!data?.user) {
        setMessage('No se recibió un usuario válido.', 'crimson');
        return;
      }

      setMessage('Validando licencia...', '#555');

      const licenseResult = await checkLicense();
      const license = licenseResult.data;

      console.log('Resultado license-check-proxy:', licenseResult);

      if (licenseResult.status >= 500) {
        await supabase.auth.signOut();
        setMessage('No se pudo validar la licencia. Intenta nuevamente.', 'crimson');
        return;
      }

      if (!license?.ok) {
        await supabase.auth.signOut();
        setMessage('La validación de licencia falló.', 'crimson');
        return;
      }

      if (!license?.license_found) {
        await supabase.auth.signOut();
        setMessage('No se encontró una licencia para NICO.', 'crimson');
        return;
      }

      if (license?.is_active !== true) {
        await supabase.auth.signOut();

        if (license?.status === 'revoked') {
          setMessage('La licencia está revocada. Contacta al administrador.', 'crimson');
          return;
        }

        if (license?.expired === true || Number(license?.days_remaining || 0) <= 0) {
          setMessage('La licencia está vencida o sin días disponibles.', 'crimson');
          return;
        }

        if (license?.expires_today === true) {
          setMessage('La licencia vence hoy y no está activa.', 'crimson');
          return;
        }

        setMessage('La licencia no está activa.', 'crimson');
        return;
      }

      setMessage('Acceso correcto. Redirigiendo...', 'green');

      setTimeout(() => {
        window.location.href = './dashboard.html';
      }, 800);
    } catch (err) {
      console.error('Fallo inesperado en login:', err);
      setMessage(`Fallo: ${err.message}`, 'crimson');
    }
  });
});