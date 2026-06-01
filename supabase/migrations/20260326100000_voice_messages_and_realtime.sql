-- Enable realtime for group_members so members instantly see groups they're added to
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;

-- Voice messages storage bucket (for voice-only DMs)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('voice_messages', 'voice_messages', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view voice messages" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice_messages');

CREATE POLICY "Authenticated users can upload voice messages" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice_messages' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete own voice messages" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'voice_messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Also make sure listened_posts is in realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.listened_posts;
