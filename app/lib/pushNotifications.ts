import webpush from "web-push";
import { supabaseAdminHeaders, supabaseRest, SUPABASE_URL } from "./supabaseServer";
import { isAdminEmail, isSiteAdminEmail } from "./contractors";
import { isAllowedPushEndpoint } from "./pushEndpoint";

type StoredSubscription = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@bavaria-seguimiento.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendAdminPush(payload: PushPayload) {
  const headers = supabaseAdminHeaders();
  if (!headers || !configureWebPush()) return { sent: 0, skipped: true };

  const params = new URLSearchParams({ select: "user_id,endpoint,p256dh,auth", is_admin: "eq.true", enabled: "eq.true" });
  const response = await fetch(supabaseRest("push_subscriptions", `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) return { sent: 0, skipped: true };
  const subscriptions = await response.json() as StoredSubscription[];
  let sent = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      if (!isAllowedPushEndpoint(subscription.endpoint) || !/^[0-9a-f-]{36}$/i.test(subscription.user_id)) return;
      // Stored is_admin/email are not proof of role: older RLS let their owner edit them.
      const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${subscription.user_id}`, { headers, cache: "no-store" });
      if (!userResponse.ok) return;
      const user = await userResponse.json() as { email?: string };
      if (!isAdminEmail(user.email) || isSiteAdminEmail(user.email)) return;
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload), { TTL: 60 * 60 });
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        const deleteParams = new URLSearchParams({ endpoint: `eq.${subscription.endpoint}` });
        await fetch(supabaseRest("push_subscriptions", `?${deleteParams}`), { method: "DELETE", headers, cache: "no-store" });
      }
    }
  }));
  return { sent, skipped: false };
}
