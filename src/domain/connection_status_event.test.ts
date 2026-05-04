import { describe, expect, it } from "vitest";
import type { ConnectionStatusEvent } from "./connection_status_event";

describe("ConnectionStatusEvent", () => {
  it("接続中のイベントを表現できる", () => {
    const event: ConnectionStatusEvent = {
      isConnected: true,
      deviceSerialNumber: "SN-12345678",
    };

    expect(event.isConnected).toBe(true);
    expect(event.deviceSerialNumber).toBe("SN-12345678");
  });

  it("未接続のイベントを表現できる (deviceSerialNumber は null)", () => {
    const event: ConnectionStatusEvent = {
      isConnected: false,
      deviceSerialNumber: null,
    };

    expect(event.isConnected).toBe(false);
    expect(event.deviceSerialNumber).toBeNull();
  });

  it("接続中でも deviceSerialNumber が null になりうる", () => {
    const event: ConnectionStatusEvent = {
      isConnected: true,
      deviceSerialNumber: null,
    };

    expect(event.isConnected).toBe(true);
    expect(event.deviceSerialNumber).toBeNull();
  });
});
