export interface ShopSettings {
  shopName: string;
  phone: string;
  address: string;
  currency: string;
  tagline: string;
  email: string;
  invoiceMessage: string;
}

const STORAGE_KEY = "shopSettings";

const defaults: ShopSettings = {
  shopName: "Saim Mobile",
  phone: "",
  address: "",
  currency: "PKR",
  tagline: "",
  email: "",
  invoiceMessage: "Thank you for your business!",
};

export const getShopSettings = (): ShopSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
};

export const saveShopSettings = (settings: ShopSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
