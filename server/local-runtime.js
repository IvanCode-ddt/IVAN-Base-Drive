import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const projectId=createHash('sha256').update(fileURLToPath(new URL('../',import.meta.url)).toLowerCase()).digest('hex');
export const runtimeIdentity={app:'ivan-base-drive',launcherVersion:6,authMode:'google',projectId};
