import { useStore } from './store.ts';
/** Whether easy mode is on (Settings > Appearance). Components that have a simpler version of themselves check this. */
export const useEasy = (): boolean => useStore((s) => s.settings.easyMode);
