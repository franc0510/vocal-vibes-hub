import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchIllustrations,
  requestIllustration,
  type IllustrationPanel,
  type IllustrationStatus,
} from "@/services/illustrationService";

/**
 * Loads a post's illustration panels and follows the generation job.
 *
 * The Edge Function returns immediately and finishes in the background, so the
 * status arrives over realtime rather than from the original call.
 */
const KNOWN_STATUSES: IllustrationStatus[] = ["none", "pending", "ready", "failed"];

/** The column is a plain text column, so narrow whatever the row carries. */
function toStatus(value: string | null | undefined): IllustrationStatus | undefined {
  if (value == null) return undefined;
  return KNOWN_STATUSES.includes(value as IllustrationStatus)
    ? (value as IllustrationStatus)
    : "none";
}

export function useIllustrations(postId: string | undefined, rawStatus?: string | null) {
  const initialStatus = toStatus(rawStatus);
  const [panels, setPanels] = useState<IllustrationPanel[]>([]);
  const [status, setStatus] = useState<IllustrationStatus>(initialStatus ?? "none");
  const [requesting, setRequesting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (initialStatus) setStatus(initialStatus);
  }, [initialStatus]);

  const load = useCallback(async () => {
    if (!postId) return;
    const rows = await fetchIllustrations(postId);
    if (mountedRef.current) setPanels(rows);
  }, [postId]);

  useEffect(() => {
    setPanels([]);
    if (postId && (initialStatus === "ready" || initialStatus === undefined)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // Follow the job to completion. Only worth a subscription while it runs.
  useEffect(() => {
    if (!postId || status !== "pending") return;

    const channel = supabase
      .channel(`illustrations:${postId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "voice_posts", filter: `id=eq.${postId}` },
        (payload) => {
          const row = payload.new as { illustration_status?: string | null };
          const next = toStatus(row?.illustration_status);
          if (!next || !mountedRef.current) return;
          setStatus(next);
          if (next === "ready") load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, status, load]);

  const illustrate = useCallback(async () => {
    if (!postId || requesting) return;
    setRequesting(true);
    try {
      const next = await requestIllustration(postId);
      if (mountedRef.current) setStatus(next);
      if (next === "ready") await load();
    } finally {
      if (mountedRef.current) setRequesting(false);
    }
  }, [postId, requesting, load]);

  return { panels, status, requesting, illustrate, reload: load };
}
