import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { validateOfflineLogin } from "@/lib/offlineAuth";

interface OfflineUser {
  email: string;
  uid: string;
  displayName: string | null;
}

type AuthUser = User | OfflineUser | null;

interface AuthContextType {
  user: AuthUser;
  loading: boolean;
  isOffline: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

const OFFLINE_SESSION_KEY = "offlineSession";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Restore offline session
  useEffect(() => {
    const saved = localStorage.getItem(OFFLINE_SESSION_KEY);
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        localStorage.removeItem(OFFLINE_SESSION_KEY);
      } else if (!localStorage.getItem(OFFLINE_SESSION_KEY)) {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    if (navigator.onLine) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
        return;
      } catch (err) {
        // If online but Firebase fails, don't fallback - throw
        throw err;
      }
    }
    // Offline login
    if (validateOfflineLogin(email, password)) {
      const offlineUser: OfflineUser = {
        email,
        uid: "offline-user",
        displayName: "Offline User",
      };
      setUser(offlineUser);
      localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(offlineUser));
    } else {
      throw new Error("Invalid offline credentials");
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {}
    localStorage.removeItem(OFFLINE_SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isOffline, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
