import { useState, useCallback, useEffect, useRef } from "react";

export type MicrophoneStatus = "idle" | "requesting" | "granted" | "denied" | "error";

export const useMicrophone = (autoRequest = false) => {
  const [status, setStatus] = useState<MicrophoneStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  const requestAccess = useCallback(async () => {
    console.log("🎤 Requesting microphone access...");
    setStatus("requesting");
    setError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("API microphone non disponible");
      }

      // Demande simple sans contraintes complexes
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      console.log("✅ Microphone granted!", mediaStream);
      setStream(mediaStream);
      setStatus("granted");
      return mediaStream;
    } catch (err: any) {
      console.error("❌ Microphone error:", err.name, err.message);

      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Accès refusé");
        setStatus("denied");
      } else if (err.name === "NotFoundError") {
        setError("Aucun microphone");
        setStatus("error");
      } else {
        setError(err.message || "Erreur microphone");
        setStatus("error");
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (autoRequest && !requested.current && status === "idle") {
      requested.current = true;
      // Attendre 500ms avant la demande auto
      setTimeout(() => requestAccess(), 500);
    }
  }, [autoRequest, status, requestAccess]);

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  return {
    status,
    stream,
    error,
    requestAccess,
    stopStream,
    isGranted: status === "granted",
    isDenied: status === "denied",
    isRequesting: status === "requesting",
  };
};
