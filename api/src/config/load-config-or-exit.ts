import { type AppConfig, loadConfig } from './app-config';
import { InvalidEnvironmentError } from './invalid-environment.error';

// For process entry points: an invalid environment ends the process with one line per problem and
// exit code 1, before anything starts.
export function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
