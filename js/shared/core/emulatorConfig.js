/**
 * Wires Firebase compat SDKs to the local Emulator Suite when the page is
 * loaded with `?emulator=1` (or hostname is localhost AND ?emulator!=0).
 *
 * Must be called BEFORE any Firestore/Auth/Functions calls.
 *
 * @returns {boolean} true if emulators were configured
 */
export function configureEmulators() {
  const params = new URLSearchParams(location.search);
  const flag = params.get('emulator');
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const enabled = flag === '1' || (isLocal && flag !== '0');
  if (!enabled) return false;

  // eslint-disable-next-line no-undef
  firebase.firestore().useEmulator('localhost', 8080);
  // eslint-disable-next-line no-undef
  firebase.auth().useEmulator('http://localhost:9099', { disableWarnings: true });
  // eslint-disable-next-line no-undef
  firebase.app().functions('europe-west1').useEmulator('localhost', 5001);

  console.log('🔧 Firebase Emulator Suite tilkoblet (auth/firestore/functions)');
  return true;
}
