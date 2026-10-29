"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { UserRole, ROLE_NAMES } from "./roles";
import { User } from "./user";
import { fetchUser, telegramAuth } from "./supabase/dto";
import {
  useTelegram,
  TelegramInitData,
  isInsideTelegramContext,
} from "../components/TelegramBridge";

export type UserProfile = User & {
  avatar?: string;
  badge: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  birthDate?: string;
  nationality?: string;
  residence?: string;
  status?: string;
  profileCompleted?: boolean;
};

export type AuthStatus =
  | "loading"
  | "demo"
  | "authenticated"
  | "needs_linking"
  | "unauthenticated";

export const MOCK_PROFILES: Record<UserRole, UserProfile> = {
  VOLUNTEER: {
    id: "MOL-00015",
    name: "سارة محمد",
    role: "VOLUNTEER",
    department: "البحث",
    badge: "متطوعة",
    email: "sara.m@molim.org",
    phone: "+966500000015",
    countryCode: "+967",
    birthDate: "2007-10-23",
    nationality: "يمنية",
    residence: "اليمن",
    status: "active",
  },
  DEPARTMENT_HEAD: {
    id: "MOL-00010",
    name: "أحمد خالد",
    role: "DEPARTMENT_HEAD",
    department: "الإعلام",
    badge: "رئيس قسم الإعلام",
    email: "ahmed.k@molim.org",
    phone: "+966500000010",
    countryCode: "+966",
    birthDate: "1998-05-12",
    nationality: "سعودي",
    residence: "المملكة العربية السعودية",
    status: "active",
  },
  HR: {
    id: "MOL-00008",
    name: "خالد علي",
    role: "HR",
    department: "الموارد البشرية",
    badge: "مسؤول الموارد البشرية",
    email: "khaled.a@molim.org",
    phone: "+966500000008",
    countryCode: "+966",
    birthDate: "1995-11-20",
    nationality: "يمني",
    residence: "المملكة العربية السعودية",
    status: "active",
  },
  ADMIN: {
    id: "MOL-00003",
    name: "محمد أحمد",
    role: "ADMIN",
    department: "الإدارة",
    badge: "الإدارة العليا",
    email: "mohammed.a@molim.org",
    phone: "+966500000003",
    countryCode: "+966",
    birthDate: "1994-08-15",
    nationality: "سعودي",
    residence: "المملكة العربية السعودية",
    status: "active",
  },
  SUPER_ADMIN: {
    id: "MOL-00001",
    name: "أصيل",
    role: "SUPER_ADMIN",
    department: "الإدارة العامة",
    badge: "الرئيس العام",
    email: "aseel@molim.org",
    phone: "+966500000001",
    countryCode: "+966",
    birthDate: "2008-04-03",
    nationality: "يمني",
    residence: "المملكة العربية السعودية",
    status: "active",
  },
};

const GUEST_PROFILE: UserProfile = {
  id: "",
  name: "زائر",
  role: "VOLUNTEER",
  department: "غير محدد",
  badge: "زائر",
  status: "unauthenticated",
};

type AuthContextType = {
  user: UserProfile;
  role: UserRole;
  roleName: string;
  status: AuthStatus;
  telegram: TelegramInitData | null;
  switchRole: (role: UserRole) => void;
  switchUser: (profile: UserProfile) => void;
  refreshAuth: () => void;
  isReady: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "molim_active_role";

function readSavedRole(): UserRole | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY) as UserRole | null;
    return saved && MOCK_PROFILES[saved] ? saved : null;
  } catch {
    return null;
  }
}

function isDemoEnabled(): boolean {
  // لا يُفعّل وضع العرض إلا في بيئة التطوير development إذا كان NEXT_PUBLIC_DEMO=1.
  // مطابق لسياسة الخادم الصارمة في server-auth.ts.
  return (
    process.env.NEXT_PUBLIC_DEMO === "1" &&
    process.env.NODE_ENV === "development"
  );
}

function initialStatus(): AuthStatus {
  if (typeof window === "undefined") {
    return isDemoEnabled() ? "demo" : "unauthenticated";
  }

  if (window.Telegram?.WebApp?.initData || isInsideTelegramContext()) {
    return "loading";
  }

  return isDemoEnabled() ? "demo" : "unauthenticated";
}

function initialUser(): UserProfile {
  if (typeof window === "undefined") {
    return isDemoEnabled() ? MOCK_PROFILES.SUPER_ADMIN : GUEST_PROFILE;
  }

  if (window.Telegram?.WebApp?.initData || isInsideTelegramContext()) {
    return GUEST_PROFILE;
  }

  if (isDemoEnabled()) {
    const saved = readSavedRole();
    return saved ? MOCK_PROFILES[saved] : MOCK_PROFILES.SUPER_ADMIN;
  }

  return GUEST_PROFILE;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(initialStatus);
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [telegram, setTelegram] = useState<TelegramInitData | null>(null);
  const [authNonce, setAuthNonce] = useState(0);
  const telegramState = useTelegram();

  useEffect(() => {
    if (telegramState.status !== "ready") return;

    const tg = telegramState.telegram;

    let cancelled = false;

    const timeout = setTimeout(async () => {
      if (cancelled) return;

      if (isDemoEnabled()) {
        const saved = readSavedRole();
        setUser(saved ? MOCK_PROFILES[saved] : MOCK_PROFILES.SUPER_ADMIN);
        setTelegram(tg);
        setStatus("demo");
        return;
      }

      if (!tg) {
        if (isDemoEnabled()) {
          const saved = readSavedRole();
          setUser(saved ? MOCK_PROFILES[saved] : MOCK_PROFILES.SUPER_ADMIN);
        } else {
          setUser(GUEST_PROFILE);
        }
        setStatus(isDemoEnabled() ? "demo" : "unauthenticated");
        return;
      }

      if (!tg.initData) {
        if (isDemoEnabled()) {
          const saved = readSavedRole();
          setUser(saved ? MOCK_PROFILES[saved] : MOCK_PROFILES.SUPER_ADMIN);
        } else {
          setUser(GUEST_PROFILE);
        }
        setStatus(isDemoEnabled() ? "demo" : "unauthenticated");
        return;
      }

      setTelegram(tg);
      setStatus("loading");

      const result = await telegramAuth(tg.initData);
      if (cancelled) return;

      if (result.hasLinkedUser && result.userId) {
        const real = await fetchUser(result.userId);
        if (cancelled) return;

        if (real) {
          setUser({
            id: real.id,
            name: real.name,
            role: real.role as UserRole,
            department: real.department,
            badge: ROLE_NAMES[real.role as UserRole] || "عضو",
            email: real.email ?? undefined,
            phone: real.phone ?? undefined,
            countryCode: real.countryCode ?? undefined,
            birthDate: real.birthDate ?? undefined,
            nationality: real.nationality ?? undefined,
            residence: real.residence ?? undefined,
            status: real.status,
            profileCompleted: real.profileCompleted,
          });
          setStatus("authenticated");
          return;
        }
      }

      setUser(GUEST_PROFILE);
      setStatus(
        result.notLinked || !result.error ? "needs_linking" : "unauthenticated"
      );
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [telegramState, authNonce]);

  const roleOverride = user?.role ?? "VOLUNTEER";

  const switchRole = (newRole: UserRole) => {
    const profile = MOCK_PROFILES[newRole];
    if (profile) {
      setUser(profile);
      setStatus("demo");
      try {
        localStorage.setItem(STORAGE_KEY, newRole);
      } catch {
        // ignore
      }
    }
  };

  const switchUser = (newProfile: UserProfile) => {
    setUser(newProfile);
    setStatus("demo");
    try {
      localStorage.setItem(STORAGE_KEY, newProfile.role);
    } catch {
      // ignore
    }
  };

  const refreshAuth = () => {
    setAuthNonce((current) => current + 1);
  };

  const roleName = ROLE_NAMES[roleOverride] || roleOverride;

  return (
    <AuthContext.Provider
      value={{
        user,
        role: roleOverride,
        roleName,
        status,
        telegram,
        switchRole,
        switchUser,
        refreshAuth,
        isReady: status !== "loading",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: isDemoEnabled() ? MOCK_PROFILES.SUPER_ADMIN : GUEST_PROFILE,
      role: (isDemoEnabled() ? "SUPER_ADMIN" : "VOLUNTEER") as UserRole,
      roleName: isDemoEnabled() ? ROLE_NAMES.SUPER_ADMIN : ROLE_NAMES.VOLUNTEER,
      status: isDemoEnabled() ? ("demo" as AuthStatus) : ("unauthenticated" as AuthStatus),
      telegram: null,
      switchRole: () => {},
      switchUser: () => {},
      refreshAuth: () => {},
      isReady: true,
    };
  }
  return context;
}