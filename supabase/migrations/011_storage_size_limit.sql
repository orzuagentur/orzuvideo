-- Raise short-previews size limit (60s CRF17 Shorts often exceeded 50–100 MB → 413)
update storage.buckets
set
  file_size_limit = 209715200, -- 200 MB
  public = true,
  allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm']::text[]
where id = 'short-previews';
