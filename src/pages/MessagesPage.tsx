import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  created_at: string;
}

const MessagesPage = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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
          last_message: msg.content || "🎤 Voice",
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !selectedUser) return;
    await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: selectedUser,
      content: newMessage.trim(),
    } as any);
    setNewMessage("");
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

  const selectConversation = (userId: string, name: string) => {
    setSelectedUser(userId);
    setSelectedName(name);
    setSearchQuery("");
    setSearchResults([]);
  };

  if (selectedUser) {
    return (
      <div className="min-h-screen pb-24 flex flex-col">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-3 flex items-center gap-3 border-b border-border/50">
          <button onClick={() => setSelectedUser(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={22} />
          </button>
          <div className="w-8 h-8 rounded-full gradient-coral flex items-center justify-center text-xs font-bold text-primary-foreground">
            {selectedName.slice(0, 2).toUpperCase()}
          </div>
          <span className="font-medium text-foreground">{selectedName}</span>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.sender_id === user?.id
                    ? "gradient-coral text-primary-foreground rounded-br-md"
                    : "bg-secondary text-foreground rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="sticky bottom-20 px-4 py-3 bg-background/80 backdrop-blur-xl border-t border-border/50">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              className="flex-1 bg-secondary rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="w-11 h-11 rounded-xl gradient-coral flex items-center justify-center text-primary-foreground shadow-coral disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-display text-gradient-red">Messages</h1>
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
                onClick={() => selectConversation(u.id, u.display_name || "User")}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full gradient-coral flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {(u.display_name || "U").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm text-foreground">{u.display_name || "User"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {conversations.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-12">
            No conversations yet. Search for a user to start chatting!
          </p>
        )}
        {conversations.map((conv) => (
          <motion.button
            key={conv.user_id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => selectConversation(conv.user_id, conv.display_name)}
            className="w-full flex items-center gap-3 bg-card rounded-xl p-4 hover:bg-card-hover transition-colors text-left"
          >
            <div className="w-11 h-11 rounded-full gradient-coral flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">
              {conv.display_name.slice(0, 2).toUpperCase()}
            </div>
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
