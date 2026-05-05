import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import packageInfo from "../../../package.json";
import { useAuth } from "../../contexts/auth_context";
import { useSSEConnection } from "../../hooks/useSSEConnection";
import { updateDeviceProperties } from "../../services/analytics";
import type { SerialStatus } from "../../types";

// セッション中の初回接続フラグ。コンポーネント再マウント時にリセットされないよう module スコープで管理
let sessionEverConnected = false;

export function useSensorConnectionToast(): void {
  const version: string = packageInfo.version;
  const { user } = useAuth();
  const [status, setStatus] = useState<SerialStatus>({
    connected: false,
    portName: null,
  });
  const prevConnectedRef = useRef(false);

  useSSEConnection((event) => {
    if (event.event === "connection-status-updated") {
      setStatus(event.data);
    }
  });

  useEffect(() => {
    const isConnected = status.connected;
    if (isConnected && !prevConnectedRef.current) {
      if (!sessionEverConnected) {
        sessionEverConnected = true;
        toast.success("センサーと接続しました");
      }
    } else if (!isConnected && prevConnectedRef.current) {
      toast.error("センサーとの接続が切れました");
    }
    prevConnectedRef.current = isConnected;
  }, [status.connected]);

  useEffect(() => {
    if (!user || !status.connected || !status.portName) return;
    updateDeviceProperties({
      app_version: version,
      device_serial_number: status.portName,
      os: navigator.userAgent,
    });
  }, [status.connected, status.portName, version, user]);
}
