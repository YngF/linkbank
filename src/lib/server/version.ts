// Bundled at build time from package.json, so the running container always
// reports the version it was actually built from.
import { version } from '../../../package.json';

export const APP_VERSION: string = version;
