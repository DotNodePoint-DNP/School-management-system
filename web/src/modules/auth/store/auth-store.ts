import { create } from "zustand";
import {
  signIn as authenticate,
  type LoginInput,
  type LoginResult,
} from "@/modules/auth/services/auth-service";

type AuthState = {
  isLoading: boolean;
  error: string | null;
  signIn: (input: LoginInput) => Promise<LoginResult>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>()(
    (set) => ({
      isLoading: false,
      error: null,
      async signIn(input) {
        set({ isLoading: true, error: null });
        try {
          const result = await authenticate(input);
          set({ isLoading: false, error: null });
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
      clearError() {
        set({ error: null });
      },
    }),
);
