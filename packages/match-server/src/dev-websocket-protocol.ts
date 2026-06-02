import { createHash } from "node:crypto";

export const websocketAccept = (key: string): string =>
  createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

export const websocketTextFrame = (payload: string): Buffer => {
  const body = Buffer.from(payload, "utf8");
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }
  if (body.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  if (body.length > Number.MAX_SAFE_INTEGER) {
    throw new Error("WebSocket payload is too large to frame safely.");
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeUInt32BE(Math.floor(body.length / 0x100000000), 2);
  header.writeUInt32BE(body.length >>> 0, 6);
  return Buffer.concat([header, body]);
};

export const parseWebSocketFrames = (
  buffer: Buffer,
): {
  messages: string[];
  remaining: Buffer;
  close: boolean;
} => {
  const messages: string[] = [];
  let offset = 0;
  let close = false;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    if (first === undefined || second === undefined) break;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      close = true;
      break;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    if (opcode === 0x8) {
      close = true;
      offset = frameEnd;
      break;
    }
    if (opcode === 0x1) {
      const payloadStart = offset + headerLength + maskLength;
      const payload = Buffer.from(buffer.subarray(payloadStart, frameEnd));
      if (masked) {
        const mask = buffer.subarray(offset + headerLength, payloadStart);
        for (let index = 0; index < payload.length; index += 1) {
          const key = mask[index % 4];
          if (key !== undefined) {
            payload.writeUInt8(payload.readUInt8(index) ^ key, index);
          }
        }
      }
      messages.push(payload.toString("utf8"));
    }
    offset = frameEnd;
  }
  return { messages, remaining: Buffer.from(buffer.subarray(offset)), close };
};
