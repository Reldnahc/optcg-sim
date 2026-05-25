import type { ClientStorage } from "../session.js";

export const createBrowserSessionStorage = (): ClientStorage => ({
  getItem(key) {
    return window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    window.sessionStorage.setItem(key, value);
  },
  removeItem(key) {
    window.sessionStorage.removeItem(key);
  },
});
