import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Mic, Square, Play, Pause, Send, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { playExclusive, releaseAudio } from "@/lib/audioManager";

interface Conversation {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  last_message: string;
  last_at: string;
  unread: number;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  voice_url: string | null;
  created_at: string;
}

/** Mini voice player for a voice DM bubble */
const VoiceMessageBubble = ({ url, isMe }: { url: string; isMe: boolean }) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barsRef = useRef(Array.from({ length: 14 }, () => 6 + Math.random() * 12));

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => { setPlaying(false); releaseAudio(audioRef.current); };
      audioRef.current.onpause = () => setPlaying(false);
      audioRef.current.onplay = () => setPlaying(true);
    }
    if (playing) {
      audioRef.current.pause();
      releaseAudio(audioRef.current);
    } else {
      playExclusive(audioRef.current);
    }
  };

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl ${
        isMe
          ? "gradient-coral text-primary-foreground rounded-br-md"
          : "bg-secondary text-foreground rounded-bl-md"
      }`}
    >
      {playing ? <Pause size={16} /> : <Play size={16} className={isMe ? "" : "ml-0.5"} />}
      <div className="flex gap-[3px] items-center h-5">
        {barsRef.current.map((h, i) => (
          <div
            key={i}
            className={`w-[2.5px] rounded-full ${
              playing
                ? isMe ? "bg-primary-foreground/80 animate-pulse" : "bg-primary animate-pulse"
                : isMe ? "bg-primary-foreground/50" : "bg-muted-foreground/40"
            }`}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </button>
  );
};

const MessagesPage = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(searchParams.get("user"));
  const [selectedName, setSelectedName] = useState(searchParams.get("name") || "");
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [sending, setSending] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user]);

  const loadConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (!data) return;

    const convMap = new Map<string, any>();
    for (const msg of data) {
      const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      if (!convMap.has(otherId)) {
        convMap.set(otherId, {
          user_id: otherId,
          last_message: (msg as any).voice_url ? "🎤 Voice message" : (msg.content || "🎤 Voice message"),
          last_at: msg.created_at,
          unread: msg.receiver_id === user.id && !msg.read ? 1 : 0,
        });
      } else if (msg.receiver_id === user.id && !msg.read) {
        convMap.get(otherId).unread++;
      }
    }

    const ids = Array.from(convMap.keys());
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      
      const convs: Conversation[] = ids.map((id) => {
        const c = convMap.get(id);
        const p = profiles?.find((pr: any) => pr.id === id);
        return { ...c, display_name: p?.display_name || "User", avatar_url: p?.avatar_url };
      });
      setConversations(convs);
    }
  };

  useEffect(() => {
    if (!user || !selectedUser) return;
    const load = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser}),and(sender_id.eq.${selectedUser},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });
      setMessages((data as Message[]) || []);

      await supabase
        .from("messages")
        .update({ read: true } as any)
        .eq("sender_id", selectedUser)
        .eq("receiver_id", user.id)
        .eq("read", false);
    };
    load();

    const channel = supabase
      .channel(`messages-${selectedUser}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message;
        if (
          (msg.sender_id === user.id && msg.receiver_id === selectedUser) ||
          (msg.sender_id === selectedUser && msg.receiver_id === user.id)
        ) {
          setMessages((prev) => [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, selectedUser]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        setRecordingBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const sendVoiceMessage = async () => {
    if (!recordingBlob || !user || !selectedUser) return;
    setSending(true);
    try {
      const fileName = `${user.id}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("voice_messages")
        .upload(fileName, recordingBlob, { contentType: "audio/webm" });
      if (uploadError) throw uploadError;

      const voiceUrl = supabase.storage.from("voice_messages").getPublicUrl(fileName).data.publicUrl;

      const { error } = await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: selectedUser,
        content: null,
        voice_url: voiceUrl,
      } as any);

      if (error) throw error;
      setRecordingBlob(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to send voice message");
    } finally {
      setSending(false);
    }
  };

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .neq("id", user?.id)
      .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
      .limit(10);
    setSearchResults(data || []);
  };

  const selectConversation = (userId: string, name: string, avatarUrl?: string | null) => {
    setSelectedUser(userId);
    setSelectedName(name);
    setSelectedAvatarUrl(avatarUrl || null);
    setSearchQuery("");
    setSearchResults([]);
  };

  if (selectedUser) {
    const initials = (selectedName || "U").slice(0, 2).toUpperCase();
    return (
      <div
        className="flex flex-col bg-background"
        style={{ height: "100%", paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <header className="shrink-0 bg-background px-4 py-2.5 flex items-center gap-3 border-b border-border/50">
          <button onClick={() => { setSelectedUser(null); loadConversations(); }} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={22} />
          </button>
          {selectedAvatarUrl ? (
            <img src={selectedAvatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-border/30" />
          ) : (
            <div className="w-9 h-9 rounded-full gradient-coral flex items-center justify-center text-xs font-bold text-primary-foreground">
              {initials}
            </div>
          )}
          <span className="font-medium text-foreground">{selectedName}</span>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-3">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <Mic size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Send your first voice message!<br />
                <span className="text-xs">Tap the mic to record 🎤</span>
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}
              >
                {!isMe && (
                  selectedAvatarUrl ? (
                    <img src={selectedAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-border/30 shrink-0 mb-0.5" />
                  ) : (
                    <div className="w-7 h-7 rounded-full gradient-coral flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0 mb-0.5">
                      {initials}
                    </div>
                  )
                )}
                {(msg as any).voice_url ? (
                  <VoiceMessageBubble url={(msg as any).voice_url} isMe={isMe} />
                ) : msg.content ? (
                  <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm break-words ${isMe ? "gradient-coral text-primary-foreground rounded-br-md" : "bg-secondary text-foreground rounded-bl-md"}`}>
                    {msg.content}
                  </div>
                ) : null}
              </motion.div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Voice-only input bar */}
        <div
          className="shrink-0 px-4 py-3 bg-background border-t border-border/50 mb-16 flex items-center gap-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          {recordingBlob ? (
            <div className="flex-1 flex items-center gap-2 bg-secondary rounded-2xl px-4 py-2.5">
              <Mic size={16} className="text-primary shrink-0" />
              <div className="flex gap-[2px] flex-1 items-center h-5">
                {Array.from({ length: 20 }, (_, i) => (
                  <div key={i} className="w-[2px] rounded-full bg-primary" style={{ height: `${6 + Math.random() * 10}px` }} />
                ))}
              </div>
              <span className="text-xs text-primary font-medium">Ready</span>
              <button onClick={() => setRecordingBlob(null)} className="text-xs text-destructive ml-1">✕</button>
            </div>
          ) : (
            <div className={`flex-1 flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 ${recording ? "bg-primary/10 border border-primary/30" : "bg-secondary"}`}>
              <Mic size={16} className={recording ? "text-primary" : "text-muted-foreground"} />
              <span className={`text-sm ${recording ? "text-primary font-medium animate-pulse" : "text-muted-foreground"}`}>
                {recording ? "Recording… tap ■ to stop" : "Tap the mic to record a voice message"}
              </span>
            </div>
          )}

          <button
            onPointerDown={!recordingBlob && !recording ? startRecording : undefined}
            onClick={recording ? stopRecording : undefined}
            className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all shadow-sm ${
              recording ? "bg-destructive scale-110" : recordingBlob ? "bg-secondary" : "gradient-coral"
            }`}
          >
            {recording ? <Square size={16} className="text-white" /> : <Mic size={20} className={recordingBlob ? "text-muted-foreground" : "text-primary-foreground"} />}
          </button>

          {recordingBlob && (
            <button
              onClick={sendVoiceMessage}
              disabled={sending}
              className="w-12 h-12 rounded-full gradient-coral flex items-center justify-center shrink-0 shadow-coral disabled:opacity-50"
            >
              {sending ? <Loader2 size={18} className="text-primary-foreground animate-spin" /> : <Send size={18} className="text-primary-foreground" />}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-display text-gradient-red">Messages</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Voice messages only 🎤</p>
      </header>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => searchUsers(e.target.value)}
          className="w-full bg-secondary rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
        />
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card rounded-xl shadow-elevated z-50 overflow-hidden">
            {searchResults.map((u: any) => (
              <button
                key={u.id}
                onClick={() => selectConversation(u.id, u.display_name || "User", u.avatar_url)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
              >
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border/30" />
                ) : (
                  <div className="w-8 h-8 rounded-full gradient-coral flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {(u.display_name || "U").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-foreground">{u.display_name || "User"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <Mic size={28} className="text-muted-foreground" />
            </div>
            <p className="text-center text-muted-foreground text-sm">
              No conversations yet.<br />Search for a user to start a voice chat!
            </p>
          </div>
        )}
        {conversations.map((conv) => (
          <motion.button
            key={conv.user_id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => selectConversation(conv.user_id, conv.display_name, conv.avatar_url)}
            className="w-full flex items-center gap-3 bg-card rounded-xl p-4 hover:bg-card-hover transition-colors text-left"
          >
            {conv.avatar_url ? (
              <img src={conv.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border border-border/30 shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-full gradient-coral flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">
                {conv.display_name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-foreground">{conv.display_name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(conv.last_at).toLocaleDateString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{conv.last_message}</p>
            </div>
            {conv.unread > 0 && (
              <span className="w-5 h-5 rounded-full gradient-coral flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                {conv.unread}
              </span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default MessagesPage;
