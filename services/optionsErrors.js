class OptionsError extends Error {
  constructor(message, code, statusCode = 400, details = {}) {
    super(message);
    Object.assign(this, { code, statusCode, ...details });
  }
}

function databaseError(error) {
  const missing = ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error?.code);
  return new OptionsError(missing
    ? 'Options database setup is incomplete. Apply migrations/20261002_options_accounts.sql to the configured Supabase project.'
    : 'The Options database is unavailable. Check backend database access and retry.',
  missing ? 'DATABASE_MIGRATION_REQUIRED' : 'DATABASE_UNAVAILABLE', 503);
}

module.exports = { OptionsError, databaseError };
