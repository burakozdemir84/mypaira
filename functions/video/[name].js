// Cloudflare Pages Function: GET /video/<dosya>.mp4
//
// Pages statik varlıkları Range isteklerini desteklemiyor; bu yüzden tarayıcı
// videoda ileri ya da geri atlayamıyor. Bu uç nokta videoyu /assets/mc/ altından
// okuyup "206 Partial Content" yanıtıyla parça parça sunar.
// Yalnızca /assets/mc/ içindeki .mp4 dosyaları servis edilir.

const SAFE = /^[a-z0-9-]+\.mp4$/;

export async function onRequest({ request, env, params }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const name = String(params.name || "");
  if (!SAFE.test(name)) return new Response("Not found", { status: 404 });

  const assetUrl = new URL("/assets/mc/" + name, request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString()));
  if (!asset.ok) return new Response("Not found", { status: 404 });

  const buf = await asset.arrayBuffer();
  const size = buf.byteLength;
  const base = {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
  };

  const range = request.headers.get("Range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(request.method === "HEAD" ? null : buf, {
      status: 200,
      headers: { ...base, "Content-Length": String(size) },
    });
  }

  let start, end;
  if (m[1] === "") {
    const suffix = Math.min(Number(m[2]), size);
    start = size - suffix;
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  }

  const chunk = buf.slice(start, end + 1);
  return new Response(request.method === "HEAD" ? null : chunk, {
    status: 206,
    headers: {
      ...base,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(chunk.byteLength),
    },
  });
}
