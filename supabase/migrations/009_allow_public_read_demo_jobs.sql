-- Allow anyone (including anon) to read jobs flagged as demo
CREATE POLICY "Anyone can view demo jobs"
  ON public.jobs FOR SELECT
  USING (is_demo = true);
