import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/auth/forgot-password") ||
    path.startsWith("/auth/reset-password");
  const isVerifyPage = path.startsWith("/login/verify");
  const isProtected =
    path.startsWith("/dashboard") || path.startsWith("/training");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!user && isVerifyPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const otpOk = request.cookies.get("orzu_otp_ok")?.value;
  const otpUid = request.cookies.get("orzu_otp_uid")?.value;
  const otpPurpose = request.cookies.get("orzu_otp_purpose")?.value;
  /** Email OTP is required only for signup (explicit purpose cookie) */
  const otpPending = Boolean(
    user &&
      otpOk === "0" &&
      otpUid === user.id &&
      otpPurpose === "signup",
  );

  if (user && otpPending && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login/verify";
    url.searchParams.set("mode", "signup");
    return NextResponse.redirect(url);
  }

  if (user && isVerifyPage && !otpPending) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage && !isVerifyPage && !otpPending) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
