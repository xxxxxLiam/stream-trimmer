/**
 * File: errorResponse.ts
 * Path: src/main/features/engine/utils/errorResponse.ts
 * Description: Maps an error that reached Express to a status and a stack-free body.
 */
import { JSON_BODY_LIMIT } from "../app";

export function errorResponseFor(err: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  const e = (err ?? {}) as { type?: string; status?: number; statusCode?: number };
  switch (e.type) {
    case "entity.parse.failed":
      return {
        status: 400,
        body: {
          error:
            "The request body is not valid JSON (an object is expected).",
          code: "invalid_json",
        },
      };
    case "entity.too.large":
      return {
        status: 413,
        body: {
          error: `The request body is larger than the ${JSON_BODY_LIMIT} this server accepts.`,
          code: "body_too_large",
        },
      };
    case "encoding.unsupported":
    case "charset.unsupported":
      return {
        status: 415,
        body: {
          error: "The request body uses an encoding this server does not accept.",
          code: "unsupported_encoding",
        },
      };
    case "request.aborted":
    case "request.size.invalid":
    case "stream.encoding.set":
      return {
        status: 400,
        body: { error: "The request body could not be read.", code: "bad_body" },
      };
  }
  const status = e.status ?? e.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return {
      status,
      body: { error: "The request could not be processed.", code: "bad_request" },
    };
  }
  return {
    status: 500,
    body: {
      error: "The server hit an unexpected error. Try again.",
      code: "server_error",
    },
  };
}
