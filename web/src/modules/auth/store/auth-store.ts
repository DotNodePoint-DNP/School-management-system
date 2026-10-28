import { create } from "zustand";
import {
  signIn as authenticate,
  refreshSession as refresh,
  signOut as logout,
  type LoginInput,
  type LoginResult,
} from "@/modules/auth/services/auth-service";
import type { CurrentUser } from "@/core/authorization/roles";

type AuthState = {
  isLoading: boolean;
  error: string | null;
  user: CurrentUser | null;
  signIn: (input: LoginInput) => Promise<LoginResult>;
  refresh: () => Promise<LoginResult>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>()(
  (set) => ({
    isLoading: false,
    error: null,
    user: null,
    async signIn(input) {
      set({ isLoading: true, error: null });
      try {
        const result = await authenticate(input);
        set({ isLoading: false, error: null, user: result.user });
        return result;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to sign in. Please try again.";
        set({ isLoading: false, error: message });
        throw error;
      }
    },
    async refresh() {
      const result = await refresh();
      set({ user: result.user, error: null });
      return result;
    },
    async signOut() {
      await logout();
      set({ user: null, error: null });
    },
    clearError() {
      set({ error: null });
    },
  }),
);
