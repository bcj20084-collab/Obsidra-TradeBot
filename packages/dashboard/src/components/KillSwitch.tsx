import { useState } from "react";
import { trpc } from "../lib/api";

export function KillSwitch({ onDone }: { onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const kill = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await trpc.mutation("control.setStatus", { status: "STOPPED", reason: "Dashboard kill switch" });
    setConfirming(false);
    onDone();
  };
  return (
    <button className="w-full rounded-2xl border border-rose-500/50 bg-rose-500/10 px-6 py-5 text-lg font-bold text-rose-300 transition hover:bg-rose-500/20" onClick={kill}>
      {confirming ? "Confirm: close positions & stop" : "KILL SWITCH"}
    </button>
  );
}
