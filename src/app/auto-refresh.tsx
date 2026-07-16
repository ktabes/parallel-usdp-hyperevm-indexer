"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

export function AutoRefresh({
  generatedAt,
  intervalSeconds = 60,
}: {
  generatedAt: string;
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(
    () =>
      startTransition(() => {
        router.refresh();
      }),
    [router],
  );

  useEffect(() => {
    const refreshVisiblePage = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(
      refreshVisiblePage,
      intervalSeconds * 1000,
    );
    document.addEventListener("visibilitychange", refreshVisiblePage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisiblePage);
    };
  }, [intervalSeconds, refresh]);

  return (
    <button
      className="auto-refresh"
      type="button"
      onClick={refresh}
      title={`Dashboard refreshes from PostgreSQL every ${intervalSeconds} seconds`}
    >
      <i className={isPending ? "refreshing" : ""} aria-hidden="true" />
      <span>
        {isPending ? "Refreshing" : `Auto-refresh ${intervalSeconds}s`}
      </span>
      <small>
        Data generated{" "}
        {new Date(generatedAt).toLocaleTimeString("en-US", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}{" "}
        UTC
      </small>
    </button>
  );
}
