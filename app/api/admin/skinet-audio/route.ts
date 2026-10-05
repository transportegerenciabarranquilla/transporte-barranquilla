import { getAuthenticatedSession } from "../../../lib/authServer";
import { skinetAudio } from "../../../lib/skinetAudio";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getAuthenticatedSession({ allowSiteAdmin: true });
  if (!session || (!session.isAdmin && !session.isSiteAdmin)) return Response.json({ error: "No autorizado." }, { status: 403 });
  const text = new URL(request.url).searchParams.get("text")?.trim() || "";
  if (!text || text.length > 700) return Response.json({ error: "El texto debe tener entre 1 y 700 caracteres." }, { status: 400 });
  try {
    const audio = skinetAudio(text);
    const headers = {
      "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    };
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = match?.[1] ? Number(match[1]) : 0;
      let end = match?.[2] ? Number(match[2]) : audio.length - 1;
      if (match && !match[1] && match[2]) {
        start = Math.max(0, audio.length - Number(match[2]));
        end = audio.length - 1;
      }
      end = Math.min(end, audio.length - 1);
      if (!match || (!match[1] && !match[2]) || start > end || start >= audio.length) {
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${audio.length}` } });
      }
      const part = audio.slice(start, end + 1);
      return new Response(new Uint8Array(part).buffer, { status: 206, headers: {
        ...headers, "Content-Length": String(part.length), "Content-Range": `bytes ${start}-${end}/${audio.length}`,
      } });
    }
    return new Response(new Uint8Array(audio).buffer, { headers: {
      ...headers, "Content-Length": String(audio.length),
    } });
  } catch {
    return Response.json({ error: "No se pudo generar el audio de Skainet. Vuelve a probar." }, { status: 500 });
  }
}
