import kpiHandler from "../api/kpi.mjs";

type LegacyRequest = {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
};

function adaptRequest(request: Request): Promise<LegacyRequest> {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());

  // Cloudflare provides the connecting IP using CF-Connecting-IP.
  // Preserve the header shape expected by the existing KPI throttle logic.
  if (!headers["x-real-ip"] && headers["cf-connecting-ip"]) {
    headers["x-real-ip"] = headers["cf-connecting-ip"];
  }

  if (!headers["x-forwarded-proto"]) {
    headers["x-forwarded-proto"] = url.protocol.replace(":", "");
  }

  const adapted: LegacyRequest = {
    method: request.method,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
  };

  if (request.method === "GET" || request.method === "HEAD") {
    return Promise.resolve(adapted);
  }

  return request.text().then((body) => ({
    ...adapted,
    body,
  }));
}

function adaptResponse(request: Request) {
  const requestUrl = new URL(request.url);
  const headers = new Headers();
  let statusCode = 200;
  let completedResponse: Response | null = null;

  const res = {
    setHeader(name: string, rawValue: string | number | readonly string[]) {
      let value = Array.isArray(rawValue)
        ? rawValue.join(", ")
        : String(rawValue);

      // The existing Vercel handler adds Secure only when VERCEL=1.
      // Add it here for HTTPS Cloudflare requests while leaving local HTTP
      // development usable.
      if (
        name.toLowerCase() === "set-cookie" &&
        requestUrl.protocol === "https:" &&
        !/;\s*secure(?:;|$)/i.test(value)
      ) {
        value += "; Secure";
      }

      headers.set(name, value);
      return res;
    },

    status(code: number) {
      statusCode = code;
      return res;
    },

    json(payload: unknown) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json; charset=utf-8");
      }

      completedResponse = new Response(JSON.stringify(payload), {
        status: statusCode,
        headers,
      });

      return completedResponse;
    },

    send(payload: unknown) {
      completedResponse = new Response(
        typeof payload === "string" ? payload : String(payload ?? ""),
        {
          status: statusCode,
          headers,
        },
      );

      return completedResponse;
    },
  };

  return {
    res,
    response() {
      return (
        completedResponse ??
        new Response(null, {
          status: statusCode,
          headers,
        })
      );
    },
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/kpi") {
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: "api_route_not_found",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const req = await adaptRequest(request);
    const { res, response } = adaptResponse(request);

    const result = await kpiHandler(req, res);

    return result instanceof Response ? result : response();
  },
};
