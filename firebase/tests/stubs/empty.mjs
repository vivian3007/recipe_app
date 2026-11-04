// What the behaviour test doesn't need: picking photos and the phone's own storage.
export const launchImageLibraryAsync = async () => ({ canceled: true });
export const Platform = { OS: 'web' };
export default {};
