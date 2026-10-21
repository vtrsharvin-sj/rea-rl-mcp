import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { z } from "zod";
import { pointer, record, type StoredResult } from "./results.js";
import type { CallToolResult } from "@modelcontextprotocol/server";

export const cropSchema = z.strictObject({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Crop = z.infer<typeof cropSchema>;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export async function pngFrom(
  path: string | undefined,
  item: StoredResult | undefined,
  jsonPointer = "",
) {
  if (path) {
    if ((await stat(path)).size > 32 * 1024 * 1024)
      throw new Error("PNG exceeds the 32 MiB encoded input budget");
    return await readFile(path);
  }
  if (!item) throw new Error("Provide a PNG path or a retained result");
  const value = pointer(
    item.evidence?.normalized_result ?? item.json,
    jsonPointer,
  );
  const artifact =
    record(value) && record(value.artifact) ? value.artifact : value;
  if (record(artifact) && typeof artifact.data_base64 === "string") {
    const bytes = Buffer.from(artifact.data_base64, "base64");
    if (
      typeof artifact.sha256 === "string" &&
      createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
    )
      throw new Error("Image digest mismatch");
    return bytes;
  }
  const image = item.raw.content.find(
    (c) => c.type === "image" && c.mimeType === "image/png",
  );
  if (image?.type === "image") return Buffer.from(image.data, "base64");
  throw new Error(
    "No PNG found at that result pointer. Capture a screenshot first or select its artifact.",
  );
}
export function visualResult(
  bytes: Buffer,
  reason: string,
  maxDimension = 1280,
  crop?: Crop,
): CallToolResult {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature))
    throw new Error("Visual fallback accepts PNG only");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (!width || !height || BigInt(width) * BigInt(height) > 16n * 1024n * 1024n)
    throw new Error("PNG exceeds the 16 megapixel decode budget");
  const region = crop ?? { x: 0, y: 0, width, height };
  if (region.x + region.width > width || region.y + region.height > height)
    throw new Error("Crop lies outside the screenshot");
  const original = PNG.sync.read(bytes),
    scale = Math.min(1, maxDimension / Math.max(region.width, region.height));
  const outWidth = Math.max(1, Math.round(region.width * scale)),
    outHeight = Math.max(1, Math.round(region.height * scale));
  const output = new PNG({ width: outWidth, height: outHeight });
  for (let y = 0; y < outHeight; y++)
    for (let x = 0; x < outWidth; x++) {
      const source =
        ((region.y + Math.min(region.height - 1, Math.floor(y / scale))) *
          width +
          region.x +
          Math.min(region.width - 1, Math.floor(x / scale))) *
        4;
      original.data.copy(
        output.data,
        (y * outWidth + x) * 4,
        source,
        source + 4,
      );
    }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          reason,
          original: { width, height },
          crop: region,
          delivered: { width: outWidth, height: outHeight },
          resized: scale < 1,
          source_sha256: createHash("sha256").update(bytes).digest("hex"),
          token_count: "not measured",
        }),
      },
      {
        type: "image",
        mimeType: "image/png",
        data: PNG.sync.write(output).toString("base64"),
      },
    ],
  };
}
