import { supabase } from './supabaseClient';

function Login() {
  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('Google login failed:', error);
      alert(error.message);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f5f7fb',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '32px',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          textAlign: 'center',
        }}
      >
        <h1>Connectly</h1>

        <p style={{ marginBottom: '24px' }}>
          Customer Engagement Platform
        </p>

        <button
          type="button"
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            background: '#ffffff',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}

export default Login;