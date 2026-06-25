import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, REMEMBER_COOKIE } from "../../../lib/authServer";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(REMEMBER_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
