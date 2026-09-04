import webpush from "web-push";
import { supabaseAdminHeaders, supabaseRest } from "./supabaseServer";

type StoredSubscription = {
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
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@bavaria-seguimiento.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendAdminPush(payload: PushPayload) {
  const headers = supabaseAdminHeaders();
  if (!headers || !configureWebPush()) return { sent: 0, skipped: true };

  const params = new URLSearchParams({ select: "endpoint,p256dh,auth", is_admin: "eq.true", enabled: "eq.true" });
  const response = await fetch(supabaseRest("push_subscriptions", `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) return { sent: 0, skipped: true };
  const subscriptions = await response.json() as StoredSubscription[];
  let sent = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
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
