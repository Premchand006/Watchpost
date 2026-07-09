import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useEvents } from "../hooks/useEvents";
import { usePeople } from "../hooks/usePeople";
import { useCameras } from "../hooks/useCameras";
import { useTelemetry } from "../hooks/useTelemetry";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { CAN_ACK } from "../lib/constants";

/* Opens the realtime subscriptions once for the signed-in app so every page
   reads the same data. Also wraps acknowledge() with a role check and a toast,
   so a server rejection is shown instead of failing silently. The audit row
   for an ack is written by a database trigger. */
const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { role } = useAuth();
  const { toast } = useToast();

  const eventsApi = useEvents({ limit: 150 });
  const peopleApi = usePeople({ limit: 200 });
  const camerasApi = useCameras();
  const telemetry = useTelemetry();

  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const canAck = CAN_ACK.includes(role);
  const ackRaw = eventsApi.acknowledge;

  const acknowledge = useCallback(async (id) => {
    if (!canAck) {
      toast("Your role cannot acknowledge alerts.", "error");
      return;
    }
    const { error } = await ackRaw(id);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Alert acknowledged.", "success");
  }, [canAck, ackRaw, toast]);

  const value = {
    events: eventsApi.events,
    loading: eventsApi.loading,
    error: eventsApi.error,
    acknowledge,
    canAck,
    people: peopleApi.people,
    peopleLoading: peopleApi.loading,
    peopleError: peopleApi.error,
    cameras: camerasApi.cameras,
    camerasLoading: camerasApi.loading,
    camerasError: camerasApi.error,
    telemetry,
    nowMs,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
