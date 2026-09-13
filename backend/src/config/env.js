function requiredEnvironment(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`${name} must be set in the server environment.`);
  }

  return value.trim();
}

export function getSupabaseConfig() {
  const url = requiredEnvironment('SUPABASE_URL');

  try {
    new URL(url);
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL.');
  }

  return {
    url,
    serviceRoleKey: requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  };
}
