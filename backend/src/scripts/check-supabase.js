import 'dotenv/config';
import { verifySupabaseConnection } from '../config/supabase.js';

try {
  await verifySupabaseConnection();
  console.log('Supabase connection verified.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
