export interface OfflineCredentials {
  email: string;
  password: string;
}

const STORAGE_KEY = "offlineCredentials";

const defaults: OfflineCredentials = {
  email: "saimmobile@gmail.com",
  password: "admin123",
};

export const getOfflineCredentials = (): OfflineCredentials => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
};

export const saveOfflineCredentials = (creds: OfflineCredentials) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
};

export const validateOfflineLogin = (email: string, password: string): boolean => {
  const creds = getOfflineCredentials();
  return email.trim().toLowerCase() === creds.email.trim().toLowerCase() && password === creds.password;
};
