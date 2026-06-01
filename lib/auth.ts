import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

export const ADMIN_EMAIL = "geoklar@gmail.com";

export type AppSession = Session & {
  user?: Session["user"] & {
    isAdmin?: boolean;
  };
};

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
};

function getGoogleProviders() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return [];
  }

  return [
    GoogleProvider({
      clientId,
      clientSecret,
    }),
  ];
}

export function isAdminEmail(email?: string | null) {
  return email?.toLocaleLowerCase("en-US") === ADMIN_EMAIL;
}

export function isAdminSession(session: AppSession | null) {
  return isAdminEmail(session?.user?.email);
}

export const authOptions: NextAuthOptions = {
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const googleProfile = profile as GoogleProfile | undefined;

      return Boolean(googleProfile?.email && googleProfile.email_verified !== false);
    },
    async jwt({ token }) {
      const appToken = token as JWT & { isAdmin?: boolean };
      appToken.isAdmin = isAdminEmail(token.email);

      return appToken;
    },
    async session({ session, token }) {
      const appSession = session as AppSession;

      if (appSession.user) {
        appSession.user.isAdmin = Boolean((token as JWT & { isAdmin?: boolean }).isAdmin);
      }

      return appSession;
    },
  },
  pages: {
    signIn: "/",
  },
  providers: getGoogleProviders(),
  session: {
    strategy: "jwt",
  },
};
